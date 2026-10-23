// Enforce the first-load JS budget against the real entry graph.
//
// Vite prints the entry <script> plus a <link rel="modulepreload"> for every
// chunk that is imported statically by the entry. Lazy chunks (feature views,
// the Firebase SDK) are intentionally absent and must never be counted here.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, posix } from 'node:path';

const dist = 'apps/web/dist';
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8'));
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const refs = new Set();

// <script type="module" src="/assets/index-*.js">
for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)) {
  refs.add(match[1]);
}

// <link rel="modulepreload" href="/assets/*.js">
for (const match of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"[^>]*>/g)) {
  refs.add(match[1]);
}

if (refs.size === 0) {
  console.error('Could not find any entry scripts in dist/index.html. Run the build first.');
  process.exit(1);
}

let totalGzip = 0;
const rows = [];

for (const ref of [...refs].sort()) {
  const name = posix.basename(ref);
  const bytes = readFileSync(join(dist, ref.replace(/^\//, '')));
  const gzipKb = gzipSync(bytes, { level: 9 }).length / 1024;
  totalGzip += gzipKb;
  rows.push({ name, gzipKb, rawKb: bytes.length / 1024 });
}

for (const row of rows) {
  console.log(`${row.name.padEnd(42)} ${row.gzipKb.toFixed(1).padStart(6)} KB gzip  (${row.rawKb.toFixed(1)} KB raw)`);
}

const rounded = Number(totalGzip.toFixed(1));
console.log(`\nFirst-load JS: ${rounded} KB gzip (budget ${budget.firstLoadGzipKb} KB, target ${budget.targetGzipKb} KB)`);

if (rounded > budget.firstLoadGzipKb) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}

if (rounded > budget.targetGzipKb) {
  console.warn(`Still above the ${budget.targetGzipKb} KB target.`);
}

// Every other JS chunk is lazy, but a runaway dependency still needs a ceiling.
if (budget.maxChunkGzipKb) {
  const { readdirSync } = await import('node:fs');
  const entryNames = new Set(rows.map((row) => row.name));
  let worst = { name: '', gzipKb: 0 };
  for (const name of readdirSync(join(dist, 'assets')).filter((file) => file.endsWith('.js'))) {
    if (entryNames.has(name)) continue;
    const bytes = readFileSync(join(dist, 'assets', name));
    const gzipKb = gzipSync(bytes, { level: 9 }).length / 1024;
    if (gzipKb > worst.gzipKb) worst = { name, gzipKb };
  }
  if (worst.name) {
    console.log(`Largest lazy chunk: ${worst.name} ${worst.gzipKb.toFixed(1)} KB gzip (limit ${budget.maxChunkGzipKb} KB)`);
    if (worst.gzipKb > budget.maxChunkGzipKb) {
      console.error('Lazy chunk budget exceeded.');
      process.exit(1);
    }
  }
}
