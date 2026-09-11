'use strict';

/**
 * RETENTION WATCH — antigüedad de los usuarios que siguen activos
 *
 * Pregunta que responde cada semana: de los usuarios con actividad reciente,
 * ¿cuánto tiempo llevan registrados? Y sobre todo: ¿hasta qué antigüedad
 * (días desde el alta) sigue habiendo alguien activo antes de que el
 * abandono sea del 100%? Ese punto de corte es el "muro de retención".
 *
 * Hallazgo inicial (11/09/2026, sesión Claude): el muro estaba en ~54 días —
 * ningún usuario con más antigüedad que eso tenía actividad en los últimos
 * 7 días, pese a haber 31 usuarios con 60+ días de antigüedad en la base.
 * Ver memoria project_retention_wall.md.
 *
 * Corre semanal (lunes) — esta métrica no se mueve día a día, cambiar la
 * cadencia solo generaría ruido. Sin llamadas a Claude: es agregación SQL
 * pura, coste cero.
 *
 * Output: reports/retention-YYYY-MM-DD.json + reports/retention-history.json (serie temporal)
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

const REPORTS_DIR = path.join(__dirname, 'reports');
// El nombre lleva "snapshots" a propósito: el cleanup semanal de index.js purga
// reports/*.json >7 días salvo los que tengan "snapshots" en el nombre (mismo
// patrón que scout-snapshots.json) — sin eso, el historial se borraría solo cada semana.
const HISTORY_FILE = path.join(REPORTS_DIR, 'retention-snapshots.json');

// Mismo criterio que lib/internal-accounts.ts en la webapp (Javier, 13/06/2026).
// Mantener sincronizado a mano si esa lista cambia — no hay import cross-repo.
const INTERNAL_EMAILS = new Set([
  'javibel214@gmail.com',
  'javibel@yahoo.com',
  'jimeno_plata@yahoo.es',
  'ytbeviral@gmail.com',
  'cwsdcrtest@gmail.com',
  'cwsctsqa@gmail.com',
  'antibrg01@blogerspace.com',
  'gorgeous1@web-library.net',
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  ensureDir(REPORTS_DIR);
  // Nos quedamos con ~1 año de semanas — no hace falta más para ver tendencia.
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-52), null, 2));
}

async function runRetentionWatch() {
  const start = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);

  const activity = await db.query(`
    WITH activity AS (
      SELECT "userId", "createdAt" AS ts FROM generations
      UNION ALL SELECT "userId", "analyzedAt" FROM video_seo_scores
      UNION ALL SELECT "userId", "createdAt" FROM daily_ideas
      UNION ALL SELECT "userId", "createdAt" FROM video_previews
      UNION ALL SELECT "userId", "createdAt" FROM chat_messages
      UNION ALL SELECT "userId", "createdAt" FROM optimize_history
      UNION ALL SELECT "userId", "createdAt" FROM extension_events
    )
    SELECT u.id, u.email, u."createdAt" AS signup,
           COUNT(a.ts) AS total_actions,
           COUNT(DISTINCT DATE(a.ts)) AS active_days,
           MAX(a.ts) AS last_action
    FROM users u
    JOIN activity a ON a."userId" = u.id
    GROUP BY u.id
  `);

  const now = new Date();
  const real = activity
    .filter(u => !INTERNAL_EMAILS.has((u.email || '').trim().toLowerCase()))
    .map(u => {
      const ageDays = Math.floor((now - new Date(u.signup)) / 86400000);
      const daysSinceLast = Math.floor((now - new Date(u.last_action)) / 86400000);
      return { ...u, ageDays, daysSinceLast };
    });

  const activeToday = real.filter(u => u.daysSinceLast === 0);
  const active7d = real.filter(u => u.daysSinceLast <= 7);
  const veterans = active7d.filter(u => u.ageDays > 30).sort((a, b) => b.ageDays - a.ageDays);

  const retentionWallDays = active7d.length ? Math.max(...active7d.map(u => u.ageDays)) : null;
  const retentionWallUser = retentionWallDays !== null
    ? active7d.find(u => u.ageDays === retentionWallDays)?.email || null
    : null;
  const avgAgeActive7d = active7d.length
    ? Math.round(active7d.reduce((s, u) => s + u.ageDays, 0) / active7d.length)
    : null;

  // Retención por cohorte de antigüedad: de los que tienen esa antigüedad de alta
  // (no de actividad), ¿qué % sigue activo en los últimos 7 días?
  const allUsers = await db.query(`SELECT id, "createdAt" AS signup FROM users`);
  const buckets = [
    ['0-7d', d => d <= 7],
    ['8-30d', d => d > 7 && d <= 30],
    ['31-60d', d => d > 30 && d <= 60],
    ['61-90d', d => d > 60 && d <= 90],
    ['90d+', d => d > 90],
  ];
  const activeIds = new Set(active7d.map(u => u.id));
  const ageBucketRetention = buckets.map(([label, pred]) => {
    const inBucket = allUsers.filter(u => pred(Math.floor((now - new Date(u.signup)) / 86400000)));
    const activeInBucket = inBucket.filter(u => activeIds.has(u.id));
    return {
      bucket: label,
      total: inBucket.length,
      activeIn7d: activeInBucket.length,
      pct: inBucket.length ? Math.round(100 * activeInBucket.length / inBucket.length) : 0,
    };
  });

  // Comparar con la semana anterior (última entrada del historial) para detectar
  // si el muro se mueve, sin generar ruido si apenas cambia.
  const history = loadHistory();
  const prev = history[history.length - 1] || null;
  let status = 'OK';
  let note = `Muro de retención: ${retentionWallDays ?? 'sin datos'} días. ${active7d.length} usuarios reales activos en 7 días (media ${avgAgeActive7d ?? '-'} días de antigüedad).`;
  if (prev && retentionWallDays !== null && prev.retentionWallDays !== null && prev.retentionWallDays !== undefined) {
    const wallDelta = retentionWallDays - prev.retentionWallDays;
    const activeDelta = active7d.length - (prev.active7dCount ?? 0);
    if (wallDelta <= -7) { status = 'ATENCIÓN'; note += ` El muro RETROCEDIÓ ${Math.abs(wallDelta)} días vs la semana pasada (antes ${prev.retentionWallDays}d).`; }
    else if (wallDelta >= 7) { status = 'MEJORA'; note += ` El muro AVANZÓ ${wallDelta} días vs la semana pasada (antes ${prev.retentionWallDays}d) — primera señal de retención a más largo plazo.`; }
    if (activeDelta <= -Math.max(3, Math.round((prev.active7dCount || 0) * 0.3))) {
      status = 'ATENCIÓN';
      note += ` Usuarios activos en 7d cayeron de ${prev.active7dCount} a ${active7d.length}.`;
    }
  }

  const report = {
    date: todayStr,
    activeTodayCount: activeToday.length,
    active7dCount: active7d.length,
    retentionWallDays,
    retentionWallUser,
    avgAgeActive7d,
    veteransCount: veterans.length,
    veterans: veterans.map(u => ({ email: u.email, ageDays: u.ageDays, daysSinceLast: u.daysSinceLast, totalActions: Number(u.total_actions) })),
    ageBucketRetention,
    status,
    note,
    durationMs: Date.now() - start,
  };

  ensureDir(REPORTS_DIR);
  fs.writeFileSync(path.join(REPORTS_DIR, `retention-${todayStr}.json`), JSON.stringify(report, null, 2));
  history.push({ date: todayStr, retentionWallDays, active7dCount: active7d.length, activeTodayCount: activeToday.length, avgAgeActive7d });
  saveHistory(history);

  console.log(`[retention-watch] ${note}`);
  return report;
}

module.exports = { runRetentionWatch };
