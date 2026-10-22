import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectBackupConfiguration } from './backup-preflight.js';

const directories: string[] = [];

function createDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pkh-preflight-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('backup preflight', () => {
  it('accepts distinct directories and never claims physical disk separation', () => {
    const dataDirectory = createDirectory();
    const backupDirectory = createDirectory();
    mkdirSync(join(dataDirectory, 'db'), { recursive: true });
    writeFileSync(join(dataDirectory, 'db', 'knowledge.sqlite3'), Buffer.alloc(1024));
    mkdirSync(join(dataDirectory, 'objects', 'aa'), { recursive: true });
    writeFileSync(join(dataDirectory, 'objects', 'aa', 'object'), Buffer.alloc(2048));

    const report = inspectBackupConfiguration({
      dataDirectory,
      backupDirectory,
      encryptionKeyConfigured: true,
      encryptionRequired: true,
    });

    expect(report.sameDirectory).toBe(false);
    expect(report.nested).toBe(false);
    expect(report.dataBytes).toBe(3072);
    expect(report.enoughSpace).toBe(true);
    expect(report.errors).toEqual([]);
    // Both temp directories are on the same volume, which is exactly what this gate cannot exceed.
    expect(report.sameVolume).toBe(true);
    expect(report.physicalDiskSeparation).toBe('NOT VERIFIED');
    expect(report.warnings.join(' ')).toMatch(/same volume/i);
  });

  it('rejects BACKUP_DIR equal to DATA_DIR', () => {
    const directory = createDirectory();
    const report = inspectBackupConfiguration({
      dataDirectory: directory,
      backupDirectory: directory,
      encryptionKeyConfigured: true,
      encryptionRequired: true,
    });

    expect(report.sameDirectory).toBe(true);
    expect(report.errors.join(' ')).toMatch(/must not be the DATA_DIR/);
  });

  it('warns when BACKUP_DIR is nested inside DATA_DIR', () => {
    const dataDirectory = createDirectory();
    const report = inspectBackupConfiguration({
      dataDirectory,
      backupDirectory: join(dataDirectory, 'backups'),
      encryptionKeyConfigured: true,
      encryptionRequired: true,
    });

    expect(report.nested).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toMatch(/inside DATA_DIR/);
  });

  it('fails when encryption is required but no key is configured', () => {
    const dataDirectory = createDirectory();
    const report = inspectBackupConfiguration({
      dataDirectory,
      backupDirectory: createDirectory(),
      encryptionKeyConfigured: false,
      encryptionRequired: true,
    });

    expect(report.errors.join(' ')).toMatch(/BACKUP_ENCRYPTION_KEY is not configured/);
  });

  it('warns when encryption is optional', () => {
    const report = inspectBackupConfiguration({
      dataDirectory: createDirectory(),
      backupDirectory: createDirectory(),
      encryptionKeyConfigured: false,
      encryptionRequired: false,
    });

    expect(report.warnings.join(' ')).toMatch(/plaintext backups/i);
  });
});
