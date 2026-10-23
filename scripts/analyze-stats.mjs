// Summarise dist/stats.json: bytes per chunk and per npm package.
// Usage: node scripts/analyze-stats.mjs [apps/web/dist/stats.json]
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'apps/web/dist/stats.json';
const stats = JSON.parse(readFileSync(file, 'utf8'));

const pkgOf = (id) => {
  const norm = id.replace(/\\/g, '/');
  const m = norm.match(/node_modules\/(?:\.pnpm\/)?((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  if (norm.includes('/src/')) return 'app-src';
  if (norm.startsWith('\0')) return 'virtual/rollup';
  return norm.split('/').slice(-2).join('/');
};

const rows = [];
for (const meta of Object.values(stats.nodeMetas)) {
  const id = meta.id ?? '';
  for (const [chunk, partUid] of Object.entries(meta.moduleParts ?? {})) {
    const part = stats.nodeParts[partUid];
    if (!part) continue;
    rows.push({
      chunk: chunk.replace(/^assets\//, ''),
      pkg: pkgOf(id),
      id,
      rendered: part.renderedLength ?? 0,
      gzip: part.gzipLength ?? 0,
    });
  }
}

const byChunk = new Map();
for (const row of rows) {
  const entry = byChunk.get(row.chunk) ?? { rendered: 0, gzip: 0, pkgs: new Map() };
  entry.rendered += row.rendered;
  entry.gzip += row.gzip;
  const p = entry.pkgs.get(row.pkg) ?? { rendered: 0, gzip: 0 };
  p.rendered += row.rendered;
  p.gzip += row.gzip;
  entry.pkgs.set(row.pkg, p);
  byChunk.set(row.chunk, entry);
}

const kb = (n) => (n / 1024).toFixed(1);
const chunks = [...byChunk.entries()].sort((a, b) => b[1].gzip - a[1].gzip);

console.log('=== chunks by gzip ===');
for (const [name, data] of chunks) {
  console.log(`${name.padEnd(40)} ${kb(data.gzip).padStart(8)} KB gz  (${kb(data.rendered)} KB raw)`);
}

const wanted = process.argv[3] ? [process.argv[3]] : ['firebase-vendor', 'index', 'react-vendor', 'vendor'];
for (const target of wanted) {
  const match = chunks.find(([name]) => name.startsWith(target));
  if (!match) continue;
  console.log(`\n=== ${match[0]} by package ===`);
  for (const [pkg, data] of [...match[1].pkgs.entries()].sort((a, b) => b[1].gzip - a[1].gzip).slice(0, 20)) {
    console.log(`  ${pkg.padEnd(38)} ${kb(data.gzip).padStart(8)} KB gz  (${kb(data.rendered)} KB raw)`);
  }
}

const fb = rows.filter((r) => r.chunk.startsWith('firebase-vendor')).sort((a, b) => b.gzip - a.gzip);
if (fb.length) {
  console.log('\n=== firebase-vendor: heaviest modules ===');
  for (const row of fb.slice(0, 15)) {
    console.log(`  ${kb(row.gzip).padStart(7)} KB gz  ${row.id.replace(/\\/g, '/').split('node_modules/').pop()}`);
  }
}
