import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectStaging } from './staging.js';

const directories: string[] = [];
const HOUR = 60 * 60 * 1000;

function createRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pkh-staging-test-'));
  directories.push(directory);
  return directory;
}

function createStagingDirectory(root: string, name: string, ageMs: number, bytes = 10): string {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'stage.bin'), Buffer.alloc(bytes));
  const seconds = (Date.now() - ageMs) / 1000;
  utimesSync(path, seconds, seconds);
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('staging inspection', () => {
  it('reports all three staging kinds with size and age', () => {
    const root = createRoot();
    createStagingDirectory(root, 'pkh-backup-create-aaa', 13 * HOUR, 100);
    createStagingDirectory(root, 'pkh-backup-verify-bbb', 1 * HOUR, 50);
    createStagingDirectory(root, 'pkh-restore-safety-ccc', 20 * HOUR, 25);

    const entries = inspectStaging({ root, staleMs: 12 * HOUR });

    expect(entries).toHaveLength(3);
    const byKind = Object.fromEntries(entries.map((entry) => [entry.kind, entry]));
    expect(byKind['backup-create']).toMatchObject({ sizeBytes: 100, stale: true });
    expect(byKind['backup-verify']).toMatchObject({ sizeBytes: 50, stale: false });
    expect(byKind['restore-safety']).toMatchObject({ sizeBytes: 25, stale: true });
  });

  it('sorts oldest first and ignores unrelated entries', () => {
    const root = createRoot();
    createStagingDirectory(root, 'pkh-backup-create-young', 1 * HOUR);
    createStagingDirectory(root, 'pkh-backup-create-old', 30 * HOUR);
    mkdirSync(join(root, 'unrelated-directory'));
    writeFileSync(join(root, 'pkh-backup-create-file.txt'), 'not a directory');

    const entries = inspectStaging({ root, staleMs: 12 * HOUR });

    expect(entries.map((entry) => entry.name)).toEqual([
      'pkh-backup-create-old',
      'pkh-backup-create-young',
    ]);
  });

  it('returns an empty list for a missing root', () => {
    expect(inspectStaging({ root: join(createRoot(), 'missing') })).toEqual([]);
  });

  it('uses the injected clock for the stale decision', () => {
    const root = createRoot();
    createStagingDirectory(root, 'pkh-backup-verify-clock', 5 * HOUR);

    const early = inspectStaging({ root, now: Date.now() + 1 * HOUR, staleMs: 12 * HOUR });
    const late = inspectStaging({ root, now: Date.now() + 20 * HOUR, staleMs: 12 * HOUR });

    expect(early[0]?.stale).toBe(false);
    expect(late[0]?.stale).toBe(true);
  });
});
