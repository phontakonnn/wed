import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = 'apps/web/dist/assets';
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8'));
const entryNames = ['index-', 'react-vendor-', 'firebase-vendor-', 'vendor-'];

const files = readdirSync(dist).filter((name) => name.endsWith('.js'));
const entryFiles = files.filter((name) => entryNames.some((prefix) => name.startsWith(prefix)));

let totalGzip = 0;
for (const name of entryFiles) {
  const bytes = readFileSync(join(dist, name));
  const gzipKb = gzipSync(bytes, { level: 9 }).length / 1024;
  totalGzip += gzipKb;
  console.log(`${name.padEnd(42)} ${gzipKb.toFixed(1)} KB gzip`);
}

const rounded = Number(totalGzip.toFixed(1));
console.log(`\nFirst-load JS: ${rounded} KB gzip (budget ${budget.firstLoadGzipKb} KB)`);

if (rounded > budget.firstLoadGzipKb) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}
