'use strict';

const { execSync } = require('child_process');
const zlib = require('zlib');

// ── PNG / ICO generator ───────────────────────────────────────────────────────

function makePNG(r, g, b, size = 16) {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([lenBuf, t, data, crcBuf]);
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeICO(r, g, b) {
  const png = makePNG(r, g, b);
  const header = Buffer.allocUnsafe(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image
  const dir = Buffer.allocUnsafe(16);
  dir[0] = 16; dir[1] = 16; dir[2] = 0; dir[3] = 0;
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(22, 12); // offset = 6 + 16
  return Buffer.concat([header, dir, png]);
}

const ICONS = {
  red:    makeICO(220, 50,  50).toString('base64'),  // activo
  yellow: makeICO(240, 180, 0).toString('base64'),   // ejecutando
  gray:   makeICO(120, 120, 120).toString('base64'), // pausado
};

// ── State ─────────────────────────────────────────────────────────────────────

let tray = null;
let paused = false;
let lastAction = 'Iniciando...';

const ITEMS = {
  LOGS:   0,
  SEP:    1,
  TOGGLE: 2,
  FORCE:  3,
  SEP2:   4,
  EXIT:   5,
};

// ── Init ──────────────────────────────────────────────────────────────────────

function init(callbacks) {
  let SysTray;
  try {
    SysTray = require('systray2').default;
  } catch {
    console.warn('[tray] systray2 not available — running headless');
    return;
  }

  tray = new SysTray({
    menu: {
      icon: ICONS.red,
      title: '',
      tooltip: 'YTubViral Agent — activo',
      items: [
        { title: 'Ver logs', tooltip: 'Abrir carpeta de logs', checked: false, enabled: true },
        { title: '<SEPARATOR>', tooltip: '', checked: false, enabled: false },
        { title: 'Pausar agente', tooltip: 'Pausa los crons', checked: false, enabled: true },
        { title: 'Forzar ejecucion', tooltip: 'Ejecuta LinkedIn ahora', checked: false, enabled: true },
        { title: '<SEPARATOR>', tooltip: '', checked: false, enabled: false },
        { title: 'Salir', tooltip: 'Cierra el agente', checked: false, enabled: true },
      ],
    },
    debug: false,
    copyDir: true,
  });

  tray.onClick(action => {
    switch (action.seq_id) {
      case ITEMS.LOGS:
        try { execSync('explorer logs', { cwd: __dirname }); } catch {}
        break;

      case ITEMS.TOGGLE:
        paused = !paused;
        updateStatus(paused ? 'gray' : 'red', paused ? 'Pausado' : 'Activo');
        tray.sendAction({
          type: 'update-item',
          seq_id: ITEMS.TOGGLE,
          item: { title: paused ? 'Reanudar agente' : 'Pausar agente', enabled: true, checked: false },
        });
        if (callbacks?.onTogglePause) callbacks.onTogglePause(paused);
        break;

      case ITEMS.FORCE:
        if (!paused && callbacks?.onForce) {
          setExecuting('Forzando ejecucion...');
          callbacks.onForce();
        }
        break;

      case ITEMS.EXIT:
        tray.kill(true);
        process.exit(0);
        break;
    }
  });

  tray.onError(err => console.error('[tray] error:', err));
  console.log('[tray] System tray icon initialized');
}

// ── Public helpers ─────────────────────────────────────────────────────────────

function updateStatus(color, label) {
  if (!tray) return;
  lastAction = `${label} — ${new Date().toLocaleTimeString('es-ES')}`;
  tray.sendAction({
    type: 'update-menu',
    menu: { icon: ICONS[color], title: '', tooltip: `YTubViral Agent — ${lastAction}` },
  });
}

function setExecuting(label = 'Ejecutando...') {
  updateStatus('yellow', label);
}

function setActive(label = 'Activo') {
  if (!paused) updateStatus('red', label);
}

function isPaused() {
  return paused;
}

module.exports = { init, setExecuting, setActive, isPaused };
