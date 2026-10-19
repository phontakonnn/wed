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
import { openDataDatabase } from './database.js';

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
  const keepText = takeOption(args, '--keep');
  const keep = keepText === null ? DEFAULT_RETENTION : Number(keepText);
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer');

  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const backupDirectory = requireAbsolute(
    'BACKUP_DIR',
    process.env.BACKUP_DIR ?? join(dataDirectory, 'backups'),
  );

  const databasePath = join(dataDirectory, 'db', DEFAULT_DATABASE_FILENAME);
  if (!existsSync(databasePath)) {
    throw new Error(`No database found at ${databasePath}. Nothing to back up.`);
  }

  const database = openDataDatabase(dataDirectory);
  try {
    const result = await createBackup({ database, backupDirectory, keep });
    console.log(`Backup created: ${result.path}`);
    console.log(`  size       : ${formatBytes(result.manifest.sizeBytes)}`);
    console.log(`  sha256     : ${result.manifest.sha256}`);
    console.log(`  schema     : [${result.manifest.schemaVersions.join(', ')}]`);
    console.log(`  integrity  : ${result.manifest.integrityCheck}`);
    if (result.pruned.length > 0) {
      console.log(`  pruned     : ${result.pruned.length} old backup(s)`);
      for (const name of result.pruned) console.log(`               - ${name}`);
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
    console.log(
      `  ${backup.file}  ${formatBytes(backup.sizeBytes).padStart(10)}  ${formatDate(backup.createdAtMs)}  ${manifestLabel}`,
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
    }
    return;
  }

  console.error(`Backup FAILED verification: ${result.path}`);
  for (const problem of result.problems) console.error(`  - ${problem}`);
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
  if (result.safetyCopyPath) {
    console.log(`  safety copy : ${result.safetyCopyPath}`);
    console.log('                (roll back with: backup:restore -- <that path> --yes)');
  } else {
    console.log('  safety copy : none (no previous database existed)');
  }
  console.log('Start the server and confirm GET /api/health before resuming normal use.');
}

function printUsage(): void {
  console.log(`Usage:
  backup:create  [--keep N]
  backup:list
  backup:verify  -- <file> [--no-manifest]
  backup:restore -- <file> --yes [--force]

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
