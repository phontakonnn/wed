/**
 * Read-only preflight for backup configuration.
 *
 * It can prove that two paths are on different volumes; it cannot prove that they are on different
 * physical disks, so that gate stays NOT VERIFIED no matter what this module reports.
 */
import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DEFAULT_DATABASE_FILENAME } from './backup.js';

export interface PreflightReport {
  dataDirectory: string;
  backupDirectory: string;
  sameDirectory: boolean;
  nested: boolean;
  sameVolume: boolean;
  dataBytes: number;
  requiredBytes: number;
  backupFreeBytes: number;
  enoughSpace: boolean;
  encryptionKeyConfigured: boolean;
  encryptionRequired: boolean;
  errors: string[];
  warnings: string[];
  physicalDiskSeparation: 'NOT VERIFIED';
}

function treeBytes(root: string): number {
  if (!existsSync(root)) return 0;
  let total = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) total += treeBytes(path);
    else if (entry.isFile()) total += statSync(path).size;
  }
  return total;
}

/** Nearest existing ancestor, so a not-yet-created BACKUP_DIR can still be measured. */
function existingAncestor(path: string): string {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path !== '' && !path.startsWith('..') && !isAbsolute(path) && !path.split(sep).includes('..');
}

export function inspectBackupConfiguration(options: {
  dataDirectory: string;
  backupDirectory: string;
  encryptionKeyConfigured?: boolean;
  encryptionRequired?: boolean;
}): PreflightReport {
  const dataDirectory = resolve(options.dataDirectory);
  const backupDirectory = resolve(options.backupDirectory);
  const errors: string[] = [];
  const warnings: string[] = [];

  const sameDirectory = dataDirectory === backupDirectory;
  const nested = !sameDirectory && (isInside(dataDirectory, backupDirectory) || isInside(backupDirectory, dataDirectory));
  if (sameDirectory) errors.push('BACKUP_DIR must not be the DATA_DIR itself');
  if (isInside(dataDirectory, backupDirectory)) {
    warnings.push('BACKUP_DIR is inside DATA_DIR; a lost or corrupted volume would take both copies');
  }
  if (isInside(backupDirectory, dataDirectory)) {
    warnings.push('DATA_DIR is inside BACKUP_DIR; retention could affect live data if paths are misused');
  }

  const databasePath = join(dataDirectory, 'db', DEFAULT_DATABASE_FILENAME);
  const dataBytes = (existsSync(databasePath) ? statSync(databasePath).size : 0)
    + treeBytes(join(dataDirectory, 'objects'));
  const requiredBytes = Math.ceil(dataBytes * 1.2) + 16 * 1024 * 1024;

  const backupProbe = existingAncestor(backupDirectory);
  let backupFreeBytes = 0;
  try {
    const stats = statfsSync(backupProbe);
    backupFreeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    warnings.push(`Cannot read free space for ${backupProbe}`);
  }
  const enoughSpace = backupFreeBytes >= requiredBytes;
  if (!enoughSpace) {
    errors.push(
      `Backup volume has ${backupFreeBytes} free bytes but approximately ${requiredBytes} are required`,
    );
  }

  let sameVolume = false;
  try {
    const dataProbe = existingAncestor(dataDirectory);
    sameVolume = statSync(dataProbe).dev === statSync(backupProbe).dev;
  } catch {
    warnings.push('Cannot compare volumes for DATA_DIR and BACKUP_DIR');
  }
  if (sameVolume) {
    warnings.push(
      'DATA_DIR and BACKUP_DIR are on the same volume; physical disk separation is NOT VERIFIED (BK-08)',
    );
  }

  const encryptionKeyConfigured = options.encryptionKeyConfigured ?? Boolean(process.env.BACKUP_ENCRYPTION_KEY);
  const encryptionRequired = options.encryptionRequired ?? process.env.BACKUP_ENCRYPTION_REQUIRED === 'true';
  if (encryptionRequired && !encryptionKeyConfigured) {
    errors.push('BACKUP_ENCRYPTION_REQUIRED=true but BACKUP_ENCRYPTION_KEY is not configured');
  }
  if (!encryptionRequired) {
    warnings.push('Encryption is not required; plaintext backups (including object snapshots) are possible');
  }

  return {
    dataDirectory,
    backupDirectory,
    sameDirectory,
    nested,
    sameVolume,
    dataBytes,
    requiredBytes,
    backupFreeBytes,
    enoughSpace,
    encryptionKeyConfigured,
    encryptionRequired,
    errors,
    warnings,
    physicalDiskSeparation: 'NOT VERIFIED',
  };
}
