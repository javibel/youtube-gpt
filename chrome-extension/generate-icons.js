/**
 * Genera los iconos PNG de la extensión sin dependencias externas.
 * Uso: node generate-icons.js
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR);

// ── PNG builder ──────────────────────────────────────────────

function crc32(buf) {
  if (!crc32._t) {
    crc32._t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32._t[i] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crc32._t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return ((c ^ 0xFFFFFFFF) >>> 0);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4);
  const lenBuf  = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined));
  lenBuf.writeUInt32BE(data.length);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePNG(pixels, size) {
  // pixels: Uint8Array of RGBA values, row-major
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8]  = 8;  // bit depth
  ihdrData[9]  = 2;  // color type RGB
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  // Build raw scanlines (filter byte 0 + RGB per pixel)
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // None filter
    for (let x = 0; x < size; x++) {
      const pi = (y * size + x) * 4;
      const ri = y * rowLen + 1 + x * 3;
      raw[ri]     = pixels[pi];
      raw[ri + 1] = pixels[pi + 1];
      raw[ri + 2] = pixels[pi + 2];
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon drawing ─────────────────────────────────────────────

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Helper: set pixel RGBA
  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]     = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }

  // Fill with red background (rounded corners approximated)
  const cornerR = Math.round(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded corner check
      let inCorner = false;
      if (x < cornerR && y < cornerR) {
        const dx = cornerR - x, dy = cornerR - y;
        inCorner = dx * dx + dy * dy > cornerR * cornerR;
      } else if (x >= size - cornerR && y < cornerR) {
        const dx = x - (size - cornerR - 1), dy = cornerR - y;
        inCorner = dx * dx + dy * dy > cornerR * cornerR;
      } else if (x < cornerR && y >= size - cornerR) {
        const dx = cornerR - x, dy = y - (size - cornerR - 1);
        inCorner = dx * dx + dy * dy > cornerR * cornerR;
      } else if (x >= size - cornerR && y >= size - cornerR) {
        const dx = x - (size - cornerR - 1), dy = y - (size - cornerR - 1);
        inCorner = dx * dx + dy * dy > cornerR * cornerR;
      }
      if (!inCorner) setPixel(x, y, 220, 0, 0);
    }
  }

  // Draw white "Y" using filled lines
  // Y is drawn as three thick segments meeting at center
  const thick = Math.max(1, Math.round(size * 0.13));
  const cx    = size / 2;
  const topY  = size * 0.12;
  const midY  = size * 0.48;
  const botY  = size * 0.88;
  const leftX = size * 0.18;
  const rightX = size * 1 - size * 0.18;

  function drawLine(x1, y1, x2, y2, t) {
    const steps = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2);
    for (let i = 0; i <= steps; i++) {
      const tx = x1 + (x2 - x1) * (i / steps);
      const ty = y1 + (y2 - y1) * (i / steps);
      for (let dy = -t; dy <= t; dy++) {
        for (let dx = -t; dx <= t; dx++) {
          if (dx * dx + dy * dy <= t * t) {
            setPixel(Math.round(tx + dx), Math.round(ty + dy), 255, 255, 255);
          }
        }
      }
    }
  }

  // Left arm: top-left → center
  drawLine(leftX, topY, cx, midY, thick);
  // Right arm: top-right → center
  drawLine(rightX, topY, cx, midY, thick);
  // Stem: center → bottom
  drawLine(cx, midY, cx, botY, thick);

  return pixels;
}

// ── Generate & save ──────────────────────────────────────────

[16, 48, 128].forEach(size => {
  const pixels = drawIcon(size);
  const png    = makePNG(pixels, size);
  const out    = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✅ ${out} (${png.length} bytes)`);
});

console.log('\nIconos generados en icons/');
