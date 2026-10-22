/**
 * Command-line entry point for database backup and restore.
 *
 *   npm run backup:create  [--keep N]
 *   npm run backup:list
 *   npm run backup:verify  -- <file> [--no-manifest]
 *   npm run backup:restore -- <file> --yes [--force]
 *
 * Environment:
 *   DATA_DIR    required, absolute path to the data directory
 *   BACKUP_DIR  optional, absolute; defaults to <DATA_DIR>/backups
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  DEFAULT_DATABASE_FILENAME,
  DEFAULT_RETENTION,
  createBackup,
  listBackups,
  restoreBackup,
  verifyBackup,
} from './backup.js';
import { comparePhysicalDisks, type DiskComparison } from './backup-disk.js';
import { inspectBackupConfiguration, type PreflightReport } from './backup-preflight.js';
import { openDataDatabase } from './database.js';
import { inspectStaging } from './staging.js';

function requireAbsolute(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set`);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return resolve(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatDate(epochMs: number | null): string {
  return epochMs === null ? 'unknown time' : new Date(epochMs).toISOString();
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function printPreflight(report: PreflightReport): void {
  console.log(`DATA_DIR   : ${report.dataDirectory}`);
  console.log(`BACKUP_DIR : ${report.backupDirectory}`);
  console.log(`Same dir   : ${report.sameDirectory ? 'YES (invalid)' : 'no'}`);
  console.log(`Nested     : ${report.nested ? 'yes' : 'no'}`);
  console.log(`Same volume: ${report.sameVolume ? 'YES' : 'no'}`);
  console.log(`Data bytes : ${formatBytes(report.dataBytes)}`);
  console.log(`Required   : ${formatBytes(report.requiredBytes)}`);
  console.log(`Free space : ${formatBytes(report.backupFreeBytes)}`);
  console.log(
    `Encryption : ${report.encryptionRequired ? 'required' : 'optional'}, key ${
      report.encryptionKeyConfigured ? 'configured' : 'missing'
    }`,
  );
  for (const warning of report.warnings) console.log(`  warning: ${warning}`);
  for (const error of report.errors) console.error(`  error  : ${error}`);
  console.log(`Physical disk separation: ${report.physicalDiskSeparation}`);
}

function printDiskComparison(comparison: DiskComparison): void {
  const describe = (mapping: DiskComparison['data']) =>
    `${mapping.volume ?? '?'} -> ${mapping.physicalDisk ?? 'UNKNOWN'} (${mapping.method}${
      mapping.reason ? `: ${mapping.reason}` : ''
    })`;
  console.log(`DATA_DIR disk  : ${describe(comparison.data)}`);
  console.log(`BACKUP_DIR disk: ${describe(comparison.backup)}`);
  if (comparison.sameDisk === true) {
    console.log('Disk evidence  : SAME PHYSICAL DISK (BK-08 not satisfied)');
  } else if (comparison.sameDisk === false) {
    console.log('Disk evidence  : DIFFERENT PHYSICAL DISKS');
  } else {
    console.log('Disk evidence  : UNKNOWN / NOT VERIFIED');
  }
  for (const line of comparison.evidence) console.log(`  evidence: ${line}`);
}

function takeOption(args: string[], option: string): string | null {
  const index = args.indexOf(option);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}

function requireFileArgument(args: string[]): string {
  const file = args.shift();
  if (!file) throw new Error('A backup file path is required');
  const resolved = resolve(file);
  if (!existsSync(resolved)) throw new Error(`Backup file not found: ${resolved}`);
  return resolved;
}

async function commandCreate(args: string[]): Promise<void> {
  const verifyAfterCreate = takeFlag(args, '--verify');
  const keepText = takeOption(args, '--keep');
  const keep = keepText === null ? DEFAULT_RETENTION : Number(keepText);
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer');

  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const backupDirectory = requireAbsolute(
    'BACKUP_DIR',
    process.env.BACKUP_DIR ?? join(dataDirectory, 'backups'),
  );

  const preflight = inspectBackupConfiguration({ dataDirectory, backupDirectory });
  if (preflight.errors.length > 0) {
    for (const error of preflight.errors) console.error(`Preflight error: ${error}`);
    throw new Error('Backup preflight failed; nothing was written');
  }
  for (const warning of preflight.warnings) console.warn(`Warning: ${warning}`);
  const disks = await comparePhysicalDisks(dataDirectory, backupDirectory);
  if (disks.sameDisk === true) {
    console.warn(
      `Warning: DATA_DIR and BACKUP_DIR are on the same physical disk (${
        disks.data.physicalDisk ?? 'unknown'
      }); this does not satisfy BK-08`,
    );
  } else if (disks.sameDisk === null) {
    console.warn('Warning: physical disk separation is UNKNOWN; BK-08 remains NOT VERIFIED');
  }

  const databasePath = join(dataDirectory, 'db', DEFAULT_DATABASE_FILENAME);
  if (!existsSync(databasePath)) {
    throw new Error(`No database found at ${databasePath}. Nothing to back up.`);
  }

  const database = openDataDatabase(dataDirectory, { migrate: false, enableWal: false });
  try {
    const result = await createBackup({ database, backupDirectory, keep, dataDirectory });
    console.log(`Backup created: ${result.path}`);
    console.log(`  size       : ${formatBytes(result.manifest.sizeBytes)}`);
    console.log(`  sha256     : ${result.manifest.sha256}`);
    console.log(`  schema     : [${result.manifest.schemaVersions.join(', ')}]`);
    console.log(`  integrity  : ${result.manifest.integrityCheck}`);
    if (result.manifest.objects) {
      console.log(
        `  files      : ${result.manifest.objects.fileCount} object(s), ${formatBytes(result.manifest.objects.totalBytes)}`,
      );
      console.log(`  object dir : ${result.objectsPath}`);
      console.log(
        `  obj crypto : ${result.manifest.objects.encryption ? 'AES-256-GCM' : 'PLAINTEXT'}`,
      );
    } else {
      console.log('  files      : no stored objects to include');
    }
    if (result.pruned.length > 0) {
      console.log(`  pruned     : ${result.pruned.length} old backup(s)`);
      for (const name of result.pruned) console.log(`               - ${name}`);
    }
    if (verifyAfterCreate) {
      const verification = await verifyBackup(result.path);
      if (!verification.ok) {
        for (const problem of verification.problems) console.error(`  verify     : ${problem}`);
        throw new Error('Backup verification failed');
      }
      for (const warning of verification.warnings) console.warn(`  verify warn: ${warning}`);
      console.log('  verified   : yes');
    }
  } finally {
    database.close();
  }
}

function commandList(): void {
  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const backupDirectory = requireAbsolute(
    'BACKUP_DIR',
    process.env.BACKUP_DIR ?? join(dataDirectory, 'backups'),
  );
  const backups = listBackups(backupDirectory);

  if (backups.length === 0) {
    console.log(`No backups in ${backupDirectory}`);
    return;
  }

  console.log(`Backups in ${backupDirectory}`);
  for (const backup of backups) {
    const manifestLabel = backup.hasManifest ? 'manifest ok' : 'MANIFEST MISSING';
    const objectsLabel = backup.objectFiles === null ? '' : `  ${backup.objectFiles} file(s)`;
    console.log(
      `  ${backup.file}  ${formatBytes(backup.sizeBytes).padStart(10)}  ${formatDate(backup.createdAtMs)}  ${manifestLabel}${objectsLabel}`,
    );
  }
}

async function commandVerify(args: string[]): Promise<void> {
  const requireManifest = !takeFlag(args, '--no-manifest');
  const file = requireFileArgument(args);
  const result = await verifyBackup(file, { requireManifest });

  if (result.ok) {
    console.log(`Backup verified: ${result.path}`);
    if (result.manifest) {
      console.log(`  createdAt : ${result.manifest.createdAt}`);
      console.log(`  schema    : [${result.manifest.schemaVersions.join(', ')}]`);
      console.log(`  sha256    : ${result.manifest.sha256}`);
      if (result.manifest.objects) {
        console.log(
          `  objects   : ${result.manifest.objects.fileCount} file(s), ${
            result.manifest.objects.encryption ? 'AES-256-GCM' : 'PLAINTEXT'
          }`,
        );
      }
    }
    for (const warning of result.warnings) console.warn(`  warning   : ${warning}`);
    return;
  }

  console.error(`Backup FAILED verification: ${result.path}`);
  for (const problem of result.problems) console.error(`  - ${problem}`);
  for (const warning of result.warnings) console.error(`  warning: ${warning}`);
  process.exitCode = 1;
}

async function commandRestore(args: string[]): Promise<void> {
  const confirmed = takeFlag(args, '--yes');
  const force = takeFlag(args, '--force');
  const file = requireFileArgument(args);

  if (!confirmed) {
    throw new Error(
      'Restore replaces the live database. Stop the server, then re-run with --yes to confirm.',
    );
  }

  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const result = await restoreBackup({ backupPath: file, dataDirectory, force });

  console.log(`Database restored from: ${file}`);
  console.log(`  target      : ${result.databasePath}`);
  console.log(`  schema      : [${result.schemaVersions.join(', ')}]`);
  if (result.objectsRestored > 0) {
    console.log(`  files       : ${result.objectsRestored} object(s) restored`);
  }
  if (result.objectsSafetyPath) {
    console.log(`  objects prev: ${result.objectsSafetyPath}`);
    console.log('                (previous object store; it is part of the safety copy above)');
  }
  if (result.safetyCopyPath) {
    console.log(`  safety copy : ${result.safetyCopyPath}`);
    console.log('                (roll back with: backup:restore -- <that path> --yes)');
  } else {
    console.log('  safety copy : none (no previous database existed)');
  }
  console.log('Start the server and confirm GET /api/health before resuming normal use.');
}

function commandStaging(args: string[]): void {
  const hoursText = takeOption(args, '--stale-hours');
  const staleHours = hoursText === null ? 12 : Number(hoursText);
  if (!Number.isFinite(staleHours) || staleHours <= 0) {
    throw new Error('--stale-hours must be a positive number');
  }
  const entries = inspectStaging({ staleMs: staleHours * 60 * 60 * 1000 });
  if (entries.length === 0) {
    console.log('No backup/restore staging directories found in the OS temp folder.');
    return;
  }
  console.log(`Staging directories (stale threshold: ${staleHours} h)`);
  for (const entry of entries) {
    const ageHours = (entry.ageMs / 3600000).toFixed(1);
    console.log(
      `  ${entry.stale ? 'STALE ' : 'active'}  ${entry.kind.padEnd(14)}  ${formatBytes(entry.sizeBytes).padStart(10)}  ${ageHours.padStart(6)} h  ${entry.path}`,
    );
  }
  const staleCount = entries.filter((entry) => entry.stale).length;
  console.log(`  ${staleCount} stale, ${entries.length - staleCount} active.`);
  console.log('Nothing was deleted. Confirm no backup or restore is running before removing a directory.');
}

async function commandPreflight(): Promise<void> {
  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const backupDirectory = requireAbsolute(
    'BACKUP_DIR',
    process.env.BACKUP_DIR ?? join(dataDirectory, 'backups'),
  );
  const report = inspectBackupConfiguration({ dataDirectory, backupDirectory });
  printPreflight(report);
  printDiskComparison(await comparePhysicalDisks(dataDirectory, backupDirectory));
  if (report.errors.length > 0) process.exitCode = 1;
}

function printUsage(): void {
  console.log(`Usage:
  backup:create    [--keep N] [--verify]
  backup:list
  backup:verify    -- <file> [--no-manifest]
  backup:restore   -- <file> --yes [--force]
  backup:preflight

Environment:
  DATA_DIR    required, absolute
  BACKUP_DIR  optional, absolute (default: <DATA_DIR>/backups)`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'create':
      await commandCreate(args);
      break;
    case 'list':
      commandList();
      break;
    case 'verify':
      await commandVerify(args);
      break;
    case 'restore':
      await commandRestore(args);
      break;
    case 'preflight':
      await commandPreflight();
      break;
    case 'staging':
      commandStaging(args);
      break;
    case 'help':
    case '--help':
    case undefined:
      printUsage();
      break;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Backup command failed');
  process.exitCode = 1;
});
