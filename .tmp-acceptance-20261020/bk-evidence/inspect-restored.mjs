// Read-only inspection of a restored DATA_DIR. Prints counts, link rows and object checksums.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Resolve from the server workspace: ESM ignores NODE_PATH, and this script lives outside it.
const require = createRequire('C:/Users/_phontakonnn/Documents/Wed_Phontakon/apps/server/package.json');
const Database = require('better-sqlite3');

const dataDir = process.argv[2];
if (!dataDir) throw new Error('usage: inspect-restored.mjs <DATA_DIR>');
const dbPath = join(dataDir, 'db', 'knowledge.sqlite3');
if (!existsSync(dbPath)) throw new Error(`no database at ${dbPath}`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
const files = db.prepare('SELECT id, display_name, size_bytes, sha256 FROM files').all();
const links = db.prepare('SELECT entity_type, entity_id, file_id FROM entity_files ORDER BY entity_type').all();

const objectReport = files.map((file) => {
  const path = join(dataDir, 'objects', file.id.slice(0, 2), file.id);
  const exists = existsSync(path);
  const actual = exists ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
  return {
    id: file.id,
    name: file.display_name,
    sizeBytes: file.size_bytes,
    expectedSha256: file.sha256,
    objectExists: exists,
    sha256Matches: actual === file.sha256,
  };
});

console.log(JSON.stringify({
  dataDir,
  schemaVersion: db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v,
  counts: {
    users: count('users'),
    notes: count('notes'),
    vault: count('vault_items'),
    library: count('library_items'),
    files: count('files'),
    entityFiles: count('entity_files'),
    reminders: count('reminders'),
  },
  vaultTitles: db.prepare('SELECT title, key_value FROM vault_items').all(),
  libraryTitles: db.prepare('SELECT title, status FROM library_items').all(),
  links,
  objects: objectReport,
}, null, 2));
db.close();
