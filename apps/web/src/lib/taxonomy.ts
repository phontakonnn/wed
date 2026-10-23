export const MAX_TAXONOMY_IDS = 50;
export const MAX_TAXONOMY_NAME_LENGTH = 80;

export function sanitizeIds(value: unknown, max = MAX_TAXONOMY_IDS): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || id.length > 200) continue;
    seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

export function normalizeTaxonomyName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > MAX_TAXONOMY_NAME_LENGTH) return null;
  return name;
}
