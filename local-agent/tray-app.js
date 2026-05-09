'use strict';

/**
 * tray-app.js — System tray icon para YTubViral Agent
 * Corre SEPARADO de pm2 (no via pm2).
 * Controla el agente ejecutando comandos pm2.
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
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
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const dir = Buffer.allocUnsafe(16);
  dir[0] = 16; dir[1] = 16; dir[2] = 0; dir[3] = 0;
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(png.length, 8); dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, png]);
}

const ICONS = {
  red:    makeICO(220, 50,  50).toString('base64'),
  yellow: makeICO(240, 180, 0).toString('base64'),
  gray:   makeICO(120, 120, 120).toString('base64'),
};

// ── pm2 helpers ───────────────────────────────────────────────────────────────

function pm2Cmd(cmd) {
  try { execSync(`pm2 ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function isAgentOnline() {
  try {
    const out = execSync('pm2 jlist', { encoding: 'utf8' });
    const list = JSON.parse(out);
    const app = list.find(p => p.name === 'ytubviral-agent');
    return app?.pm2_env?.status === 'online';
  } catch { return false; }
}

function getLastLog() {
  try {
    const logPath = path.join(__dirname, 'logs', 'out.log');
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] ?? '';
    // Remove pm2 timestamp prefix: "0|ytubvira | 2026-04-26 13:07:06: "
    return last.replace(/^[^|]+\|\s*[^:]+:\s*/, '').slice(0, 60);
  } catch { return 'Sin logs'; }
}

// ── Tray ──────────────────────────────────────────────────────────────────────

const SysTray = require('systray2').default;

const ITEMS = { LOGS: 0, SEP1: 1, TOGGLE: 2, FORCE: 3, SEP2: 4, EXIT: 5 };

let paused = !isAgentOnline();

const tray = new SysTray({
  menu: {
    icon: paused ? ICONS.gray : ICONS.red,
    title: '',
    tooltip: `YTubViral — ${paused ? 'pausado' : 'activo'}`,
    items: [
      { title: 'Ver logs', tooltip: 'Abrir carpeta de logs', checked: false, enabled: true },
      { title: '<SEPARATOR>', tooltip: '', checked: false, enabled: false },
      { title: paused ? 'Reanudar agente' : 'Pausar agente', tooltip: '', checked: false, enabled: true },
      { title: 'Forzar ejecucion', tooltip: 'Reinicia el agente ahora', checked: false, enabled: true },
      { title: '<SEPARATOR>', tooltip: '', checked: false, enabled: false },
      { title: 'Salir', tooltip: 'Cierra el tray (agente sigue en pm2)', checked: false, enabled: true },
    ],
  },
  debug: false,
  copyDir: true,
});

function updateIcon() {
  const online = isAgentOnline();
  const icon = online ? ICONS.red : ICONS.gray;
  const status = online ? 'activo' : 'pausado';
  const last = getLastLog();
  tray.sendAction({
    type: 'update-menu',
    menu: { icon, title: '', tooltip: `YTubViral — ${status}\n${last}` },
  });
}

tray.onClick(action => {
  switch (action.seq_id) {
    case ITEMS.LOGS:
      exec(`explorer "${path.join(__dirname, 'logs')}"`);
      break;

    case ITEMS.TOGGLE:
      if (isAgentOnline()) {
        pm2Cmd('stop ytubviral-agent');
        paused = true;
        tray.sendAction({ type: 'update-item', seq_id: ITEMS.TOGGLE, item: { title: 'Reanudar agente', enabled: true, checked: false } });
      } else {
        pm2Cmd('start ytubviral-agent');
        paused = false;
        tray.sendAction({ type: 'update-item', seq_id: ITEMS.TOGGLE, item: { title: 'Pausar agente', enabled: true, checked: false } });
      }
      setTimeout(updateIcon, 1500);
      break;

    case ITEMS.FORCE:
      tray.sendAction({
        type: 'update-menu',
        menu: { icon: ICONS.yellow, title: '', tooltip: 'YTubViral — reiniciando...' },
      });
      pm2Cmd('restart ytubviral-agent');
      setTimeout(updateIcon, 3000);
      break;

    case ITEMS.EXIT:
      tray.kill(true);
      process.exit(0);
      break;
  }
});

tray.onError(err => console.error('[tray] error:', err));

// Actualizar icono cada 30s
setInterval(updateIcon, 30000);

console.log('[tray-app] System tray running. Press Ctrl+C to exit.');
