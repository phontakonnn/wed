import { z } from 'zod';

/**
 * Zod schemas for the values that enter the app from outside the type system:
 * an imported JSON backup and the criteria stored in a saved search filter.
 * Everything else is already typed at the module boundary.
 */

/** A profile backup is a few MB of JSON at most; anything larger is not ours. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const MAX_ROWS = 20_000;

const rowArray = z.array(z.unknown()).max(MAX_ROWS);

const COLLECTION_KEYS = [
  'notes',
  'bookmarks',
  'files',
  'people',
  'reminders',
  'tasks',
  'projects',
  'goals',
  'habits',
  'vaultItems',
  'libraryItems',
  'customRecords',
  'categories',
  'tags',
] as const;

export const importPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 200, {
    message: 'ไฟล์มีจำนวนคีย์มากเกินไป',
  })
  .refine(
    (value) =>
      COLLECTION_KEYS.every((key) => {
        const rows = value[key];
        return rows === undefined || rowArray.safeParse(rows).success;
      }),
    { message: 'ไฟล์มีรายการมากเกินกว่าที่ระบบรองรับ' },
  );

export type ImportPayload = z.infer<typeof importPayloadSchema>;

/** Criteria written by `saveFilter` and read back when a filter is applied. */
export const savedFilterCriteriaSchema = z.object({
  query: z.string().max(500).optional(),
  from: z.string().max(32).optional(),
  to: z.string().max(32).optional(),
  sortOrder: z.enum(['newest', 'oldest', 'az']).optional(),
  types: z.array(z.string().max(40)).max(20).optional(),
});

export type SavedFilterCriteria = z.infer<typeof savedFilterCriteriaSchema>;

/** Parses an imported backup, rejecting oversized or malformed files. */
export function parseImportPayload(text: string): ImportPayload {
  if (text.length > MAX_IMPORT_BYTES) {
    throw new Error('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5 MB)');
  }
  const json: unknown = JSON.parse(text);
  const result = importPayloadSchema.safeParse(json);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'รูปแบบไฟล์ไม่ถูกต้อง');
  }
  return result.data;
}

/** Parses saved-filter criteria, returning null instead of throwing. */
export function parseSavedFilterCriteria(raw: string): SavedFilterCriteria | null {
  try {
    const json: unknown = JSON.parse(raw);
    const result = savedFilterCriteriaSchema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
