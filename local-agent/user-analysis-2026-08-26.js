/**
 * Análisis de usuarios 26/08/2026 — activación y retención (SOLO LECTURA)
 * Pregunta: ¿por qué muchos no generan nada y los que generan no vuelven?
 */
require('dotenv').config();
const db = require('./db');

async function main() {
  // 1. Actividad unificada por usuario y día (todas las tablas de actividad)
  const activity = await db.query(`
    WITH activity AS (
      SELECT "userId", "createdAt" AS ts, 'generation' AS kind FROM generations
      UNION ALL
      SELECT "userId", "analyzedAt", 'seo_score' FROM video_seo_scores
      UNION ALL
      SELECT "userId", "createdAt", 'daily_idea' FROM daily_ideas
      UNION ALL
      SELECT "userId", "createdAt", 'video_preview' FROM video_previews
      UNION ALL
      SELECT "userId", "createdAt", 'chat' FROM chat_messages
      UNION ALL
      SELECT "userId", "createdAt", 'optimize' FROM optimize_history
    )
    SELECT
      u.id, u.email, u.name, u."createdAt" AS signup,
      u."utmSource", u."signupReferrer", u."signupLandingPage", u.lang,
      (SELECT COUNT(*) FROM extension_tokens et WHERE et."userId" = u.id) AS ext_tokens,
      (SELECT COUNT(*) FROM youtube_tokens yt WHERE yt."userId" = u.id) AS yt_connected,
      COUNT(a.ts) AS total_actions,
      COUNT(DISTINCT DATE(a.ts)) AS active_days,
      MIN(a.ts) AS first_action,
      MAX(a.ts) AS last_action,
      COUNT(DISTINCT CASE WHEN DATE(a.ts) > DATE(u."createdAt") THEN DATE(a.ts) END) AS return_days,
      STRING_AGG(DISTINCT a.kind, ',') AS kinds
    FROM users u
    LEFT JOIN activity a ON a."userId" = u.id
    GROUP BY u.id
    ORDER BY u."createdAt"
  `);

  console.log(`TOTAL USUARIOS: ${activity.length}\n`);

  // 2. Segmentos
  const seg = { never: [], oneDay: [], returned: [] };
  for (const u of activity) {
    const n = +u.total_actions;
    if (n === 0) seg.never.push(u);
    else if (+u.return_days === 0) seg.oneDay.push(u);
    else seg.returned.push(u);
  }
  console.log(`— Nunca hicieron nada: ${seg.never.length}`);
  console.log(`— Actividad solo el día del registro: ${seg.oneDay.length}`);
  console.log(`— Volvieron otro día: ${seg.returned.length}\n`);

  const fmt = u => `  ${u.email} | alta ${u.signup.toISOString().slice(0,10)} | src=${u.utmSource || u.signupReferrer || '?'} | landing=${(u.signupLandingPage||'?').slice(0,40)} | ext=${u.ext_tokens>0?'Y':'N'} | yt=${u.yt_connected>0?'Y':'N'} | acciones=${u.total_actions} | dias_activo=${u.active_days} | tipos=${u.kinds||'-'}`;

  console.log('=== VOLVIERON (los buenos — qué tienen en común) ===');
  seg.returned.forEach(u => console.log(fmt(u)));
  console.log('\n=== SOLO DÍA 1 (activados que no vuelven) ===');
  seg.oneDay.forEach(u => console.log(fmt(u)));
  console.log('\n=== NUNCA ACTIVADOS ===');
  seg.never.forEach(u => console.log(fmt(u)));

  // 3. Qué generan: templates más usados y última generación por template
  const templates = await db.query(`
    SELECT template, COUNT(*) AS uses, COUNT(DISTINCT "userId") AS users, MAX("createdAt") AS last_use
    FROM generations GROUP BY template ORDER BY uses DESC
  `);
  console.log('\n=== TEMPLATES (generations) ===');
  templates.forEach(t => console.log(`  ${t.template}: ${t.uses} usos, ${t.users} usuarios, último ${t.last_use.toISOString().slice(0,10)}`));

  // 4. Cruce fuente → activación/retención
  console.log('\n=== POR FUENTE (utmSource o referrer) ===');
  const bySource = {};
  for (const u of activity) {
    const src = u.utmSource || u.signupReferrer || 'directo/desconocido';
    bySource[src] = bySource[src] || { total: 0, activated: 0, returned: 0 };
    bySource[src].total++;
    if (+u.total_actions > 0) bySource[src].activated++;
    if (+u.return_days > 0) bySource[src].returned++;
  }
  Object.entries(bySource).sort((a,b)=>b[1].total-a[1].total).forEach(([src, s]) =>
    console.log(`  ${src}: ${s.total} altas → ${s.activated} activados (${Math.round(100*s.activated/s.total)}%) → ${s.returned} volvieron (${Math.round(100*s.returned/s.total)}%)`));

  // 5. Extensión y canal conectado vs retención
  console.log('\n=== FACTORES vs RETENCIÓN ===');
  const factor = (label, pred) => {
    const yes = activity.filter(pred);
    const yesRet = yes.filter(u => +u.return_days > 0).length;
    const no = activity.filter(u => !pred(u));
    const noRet = no.filter(u => +u.return_days > 0).length;
    console.log(`  ${label}: CON → ${yesRet}/${yes.length} vuelven (${yes.length?Math.round(100*yesRet/yes.length):0}%) | SIN → ${noRet}/${no.length} (${no.length?Math.round(100*noRet/no.length):0}%)`);
  };
  factor('Extensión instalada', u => +u.ext_tokens > 0);
  factor('Canal YouTube conectado', u => +u.yt_connected > 0);
  factor('Usó chat IA', u => (u.kinds||'').includes('chat'));
  factor('Usó SEO score', u => (u.kinds||'').includes('seo_score'));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
