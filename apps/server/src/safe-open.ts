import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createBackup, verifyBackup } from './backup.js';
import { hasPendingMigrations, openDataDatabase, type SqliteDatabase } from './database.js';

export interface SafeOpenResult {
  database: SqliteDatabase;
  preMigrationBackupPath: string | null;
}

export async function openDataDatabaseSafely(dataDirectory: string): Promise<SafeOpenResult> {
  if (!isAbsolute(dataDirectory)) {
    throw new Error('DATA_DIR must be an absolute path');
  }
  const root = resolve(dataDirectory);
  const databasePath = join(root, 'db', 'knowledge.sqlite3');
  let preMigrationBackupPath: string | null = null;

  if (existsSync(databasePath)) {
    const existingDatabase = openDataDatabase(root, { migrate: false, enableWal: false });
    try {
      if (hasPendingMigrations(existingDatabase)) {
        const userCount = (existingDatabase.prepare('SELECT COUNT(*) AS count FROM users').get() as {
          count: number;
        }).count;
        if (userCount > 0) {
          const backup = await createBackup({
            database: existingDatabase,
            backupDirectory: process.env.BACKUP_DIR ?? join(root, 'backups'),
            dataDirectory: root,
            prune: false,
          });
          const verification = await verifyBackup(backup.path);
          if (!verification.ok) {
            throw new Error(`Pre-migration backup failed verification: ${verification.problems.join('; ')}`);
          }
          preMigrationBackupPath = backup.path;
        }
      }
    } finally {
      existingDatabase.close();
    }
  }

  return {
    database: openDataDatabase(root),
    preMigrationBackupPath,
  };
}
