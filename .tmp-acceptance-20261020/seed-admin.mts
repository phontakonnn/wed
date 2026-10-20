// Temporary acceptance helper: creates a local admin in a throwaway DATA_DIR.
// Not part of the application; lives under the acceptance temp folder only.
import { bootstrapUser } from '../apps/server/src/auth.ts';
import { openDataDatabaseSafely } from '../apps/server/src/safe-open.ts';

async function main() {
  const dataDirectory = process.env.DATA_DIR;
  const username = process.env.SEED_USER;
  const password = process.env.SEED_PASS;
  if (!dataDirectory || !username || !password) throw new Error('DATA_DIR, SEED_USER, SEED_PASS required');

  const { database, preMigrationBackupPath } = await openDataDatabaseSafely(dataDirectory);
  try {
    if (preMigrationBackupPath) console.log('pre-migration backup:', preMigrationBackupPath);
    await bootstrapUser(database, username, password);
    const row = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    console.log('admin created; users =', row.count);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
