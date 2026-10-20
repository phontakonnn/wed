/**
 * Read-only report of backup/restore plaintext staging directories left in the OS temp folder.
 *
 * The tool never deletes them: a directory may belong to a running backup, and an operator must
 * decide. Tests inject a synthetic root so no real temp directory is inspected.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type StagingKind = 'backup-create' | 'backup-verify' | 'restore-safety';

export interface StagingEntry {
  path: string;
  name: string;
  kind: StagingKind;
  ageMs: number;
  sizeBytes: number;
  stale: boolean;
}

export interface InspectStagingOptions {
  root?: string;
  now?: number;
  staleMs?: number;
}

const PREFIXES: Array<{ prefix: string; kind: StagingKind }> = [
  { prefix: 'pkh-backup-create-', kind: 'backup-create' },
  { prefix: 'pkh-backup-verify-', kind: 'backup-verify' },
  { prefix: 'pkh-restore-safety-', kind: 'restore-safety' },
];

const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000;

function treeBytes(path: string): number {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    try {
      total += entry.isDirectory() ? treeBytes(child) : statSync(child).size;
    } catch {
      // A file that vanished mid-scan is simply not counted.
    }
  }
  return total;
}

export function inspectStaging(options: InspectStagingOptions = {}): StagingEntry[] {
  const root = options.root ?? tmpdir();
  const now = options.now ?? Date.now();
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  if (!existsSync(root)) return [];

  const entries: StagingEntry[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = PREFIXES.find((candidate) => entry.name.startsWith(candidate.prefix));
    if (!match) continue;
    const path = join(root, entry.name);
    try {
      const stats = statSync(path);
      const ageMs = Math.max(0, now - stats.mtimeMs);
      entries.push({
        path,
        name: entry.name,
        kind: match.kind,
        ageMs,
        sizeBytes: treeBytes(path),
        stale: stats.mtimeMs < now - staleMs,
      });
    } catch {
      // Directory disappeared between listing and stat; ignore it.
    }
  }

  return entries.sort((left, right) => right.ageMs - left.ageMs);
}
