/**
 * Storage reconciliation CLI.
 *
 *   npm run storage:check        [--json] [--skip-hash]
 *   npm run storage:quarantine   [--yes] [--skip-hash]
 *
 * `check` is read-only. `quarantine` moves orphan objects and stale temporary files into
 * `DATA_DIR/quarantine/<stamp>/`; without `--yes` it only reports what it would move.
 * Nothing is ever deleted by this tool.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { DEFAULT_DATABASE_FILENAME } from './backup.js';
import { inspectStorage, quarantineStorage, reportHasProblems, type StorageReport } from './storage.js';

function requireAbsolute(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set`);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return resolve(value);
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function printReport(report: StorageReport): void {
  console.log(`Data directory : ${report.dataDirectory}`);
  console.log(`Metadata rows  : ${report.filesRows}`);
  console.log(`Object files   : ${report.objectFiles}`);
  console.log(`Hashes checked : ${report.hashVerified ? 'yes' : 'no (--skip-hash)'}`);
  console.log(`Missing objects: ${report.missingObjects.length}`);
  for (const item of report.missingObjects.slice(0, 20)) {
    console.log(`  - ${item.id} (expected objects/${item.expectedPath})`);
  }
  console.log(`Orphan objects : ${report.orphanObjects.length}`);
  for (const item of report.orphanObjects.slice(0, 20)) {
    console.log(`  - ${item.path} (${formatBytes(item.sizeBytes)})`);
  }
  console.log(`Unexpected     : ${report.unexpectedFiles.length}`);
  for (const item of report.unexpectedFiles.slice(0, 20)) console.log(`  - ${item}`);
  console.log(`Size mismatches: ${report.sizeMismatches.length}`);
  for (const item of report.sizeMismatches.slice(0, 20)) {
    console.log(`  - ${item.id}: metadata ${item.expected}, file ${item.actual}`);
  }
  console.log(`Hash mismatches: ${report.invalidHashes.length}`);
  for (const item of report.invalidHashes.slice(0, 20)) {
    console.log(`  - ${item.id}: metadata ${item.expected.slice(0, 12)}…, file ${item.actual.slice(0, 12)}…`);
  }
  console.log(`Duplicate keys : ${report.duplicateObjectKeys.length}`);
  console.log(`Stale temp     : ${report.staleTempFiles.length}`);
  for (const item of report.staleTempFiles.slice(0, 20)) {
    console.log(`  - ${item.path} (${formatBytes(item.sizeBytes)}, ${Math.round(item.ageMs / 3600000)} h old)`);
  }
  console.log(`Active temp    : ${report.activeTempFiles.length} (younger than the stale threshold)`);
  console.log(`Result         : ${reportHasProblems(report) ? 'PROBLEMS FOUND' : 'clean'}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const json = takeFlag(args, '--json');
  const skipHashes = takeFlag(args, '--skip-hash');
  const confirmed = takeFlag(args, '--yes');

  const dataDirectory = requireAbsolute('DATA_DIR', process.env.DATA_DIR);
  const databasePath = join(dataDirectory, 'db', DEFAULT_DATABASE_FILENAME);
  if (!existsSync(databasePath)) throw new Error(`No database found at ${databasePath}`);

  const database = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    const report = await inspectStorage(database, dataDirectory, { skipHashes });
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    if (command === 'check') {
      if (reportHasProblems(report)) process.exitCode = 1;
      return;
    }

    if (command === 'quarantine') {
      if (!reportHasProblems(report)) {
        if (!json) console.log('Nothing to quarantine.');
        return;
      }
      if (!confirmed) {
        if (!json) {
          console.log('Dry run only. Re-run with --yes to move the items listed above into quarantine.');
        }
        return;
      }
      const result = await quarantineStorage(dataDirectory, report, { database });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Quarantined into: ${result.quarantineDirectory}`);
        console.log(`  objects moved : ${result.movedObjects.length}`);
        console.log(`  temp moved    : ${result.movedTempFiles.length}`);
        console.log(`  skipped       : ${result.skipped.length}`);
        console.log('Nothing was deleted. Review the quarantine directory before removing it.');
      }
      return;
    }

    console.log(`Unknown command: ${command ?? '(none)'}`);
    console.log('Usage: storage-cli check|quarantine [--json] [--skip-hash] [--yes]');
    process.exitCode = 2;
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Storage command failed');
  process.exitCode = 1;
});
