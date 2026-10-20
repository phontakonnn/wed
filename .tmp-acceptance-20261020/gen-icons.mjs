// Dependency-free PNG icon generator: gradient square with a blocky white "P".
// Writes apps/web/public/icon-192.png and icon-512.png.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const from = [47, 125, 90];
  const to = [47, 158, 118];
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  // Blocky "P": stem + top bar + right bowl + middle bar.
  const shapes = [
    [0.34, 0.24, 0.45, 0.76],
    [0.45, 0.24, 0.66, 0.34],
    [0.60, 0.32, 0.70, 0.50],
    [0.45, 0.44, 0.66, 0.54],
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x / size + y / size) / 2;
      let r = Math.round(from[0] + (to[0] - from[0]) * t);
      let g = Math.round(from[1] + (to[1] - from[1]) * t);
      let b = Math.round(from[2] + (to[2] - from[2]) * t);
      const nx = x / size;
      const ny = y / size;
      if (shapes.some(([x0, y0, x1, y1]) => inRect(nx, ny, x0, y0, x1, y1))) {
        r = 255;
        g = 255;
        b = 255;
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }
  }
  return png(size, pixels);
}

for (const size of [192, 512]) {
  const path = `apps/web/public/icon-${size}.png`;
  const buffer = render(size);
  writeFileSync(path, buffer);
  console.log(`${path} ${buffer.length} bytes`);
}
