/**
 * Crea el ZIP listo para subir a Chrome Web Store.
 * Uso: node pack.js
 * Output: ytubviral-extension.zip (en el directorio padre)
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// Tiny ZIP builder (sin dependencias externas)
// Spec: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

const SRC = __dirname;
const OUT = path.join(__dirname, '..', 'ytubviral-extension.zip');

// Files to include (exclude make-icons.html, pack.js, README, .DS_Store, etc.)
const INCLUDE_EXTENSIONS = ['.json', '.js', '.css', '.html', '.png'];
const EXCLUDE_FILES = ['make-icons.html', 'pack.js', 'pack.bat', 'generate-icons.js'];
const EXCLUDE_DIRS = ['store-assets'];

function getAllFiles(dir, base) {
  const files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel  = base ? `${base}/${entry}` : entry;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry)) continue;
      files.push(...getAllFiles(full, rel));
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (INCLUDE_EXTENSIONS.includes(ext) && !EXCLUDE_FILES.includes(entry)) {
        files.push({ full, rel });
      }
    }
  }
  return files;
}

function uint16LE(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function uint32LE(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const files = getAllFiles(SRC, '');
const localHeaders = [];
const centralHeaders = [];
let offset = 0;

for (const { full, rel } of files) {
  const data     = fs.readFileSync(full);
  const nameBytes = Buffer.from(rel, 'utf8');
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const crc     = crc32(data);
  const modTime = 0x5400; // 10:00
  const modDate = 0x5765; // 2023-11-05

  const local = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // sig
    uint16LE(20),          // version needed
    uint16LE(0),           // flags
    uint16LE(8),           // deflate
    uint16LE(modTime),
    uint16LE(modDate),
    uint32LE(crc),
    uint32LE(compressed.length),
    uint32LE(data.length),
    uint16LE(nameBytes.length),
    uint16LE(0),           // extra field length
    nameBytes,
    compressed,
  ]);

  localHeaders.push(local);

  centralHeaders.push(Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x01, 0x02]), // sig
    uint16LE(20),          // version made by
    uint16LE(20),          // version needed
    uint16LE(0),           // flags
    uint16LE(8),           // deflate
    uint16LE(modTime),
    uint16LE(modDate),
    uint32LE(crc),
    uint32LE(compressed.length),
    uint32LE(data.length),
    uint16LE(nameBytes.length),
    uint16LE(0),           // extra
    uint16LE(0),           // comment
    uint16LE(0),           // disk start
    uint16LE(0),           // internal attr
    uint32LE(0),           // external attr
    uint32LE(offset),      // local header offset
    nameBytes,
  ]));

  offset += local.length;
}

const centralDir = Buffer.concat(centralHeaders);
const eocd = Buffer.concat([
  Buffer.from([0x50, 0x4B, 0x05, 0x06]), // sig
  uint16LE(0),             // disk number
  uint16LE(0),             // central dir disk
  uint16LE(files.length),
  uint16LE(files.length),
  uint32LE(centralDir.length),
  uint32LE(offset),
  uint16LE(0),             // comment length
]);

fs.writeFileSync(OUT, Buffer.concat([...localHeaders, centralDir, eocd]));
console.log(`✅ Creado: ${OUT}`);
console.log(`   Archivos incluidos: ${files.length}`);
files.forEach(f => console.log(`   - ${f.rel}`));
console.log('\n📦 Sube este ZIP en: https://chrome.google.com/webstore/devconsole');
