import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDataDatabaseSafely } from '../../server/src/safe-open.js';
import { bootstrapUser } from '../../server/src/auth.js';
import { createApp } from '../../server/src/index.js';

const tempDir = mkdtempSync(join(tmpdir(), 'pkh-e2e-data-'));
console.log('E2E Test Server starting with temporary DATA_DIR:', tempDir);

const cleanup = () => {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      console.log('Cleaned up temporary DATA_DIR:', tempDir);
    }
  } catch (err) {
    console.warn('Warning: Failed to remove temporary DATA_DIR:', err);
  }
};

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

const { database } = await openDataDatabaseSafely(tempDir);
await bootstrapUser(database, 'admin', 'TestPassword123!');

const webRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist');
const port = Number(process.env.PORT || 3100);
const expectedOrigin = `http://127.0.0.1:${port}`;

const app = createApp(database, {
  webRoot,
  dataDirectory: tempDir,
  expectedOrigin,
  logger: false,
});

app.addHook('onClose', async () => {
  database.close();
});

await app.listen({ port, host: '127.0.0.1' });
console.log(`E2E Test Server ready at ${expectedOrigin}`);
