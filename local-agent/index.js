'use strict';

require('dotenv').config();
const cron = require('node-cron');
const db = require('./db');
const twitter = require('./twitter');
const { closeBrowser, closeAllBrowsers } = require('./browser');
const reports = require('./reports');
const personaRunner = require('./persona-runner');
const gmail = require('./gmail');
const followup = require('./followup');
const { runGuardian } = require('./guardian');
const { runScout } = require('./scout');
const { runWatchdog } = require('./watchdog');
const { runManager } = require('./manager');
const { runSentinel } = require('./sentinel');
const { runSocialOptimizer } = require('./social-optimizer');
const { runSeoOptimizer } = require('./seo-optimizer');
const { runFunnelOptimizer } = require('./funnel-optimizer');
const { runInfraOptimizer } = require('./infra-optimizer');
const { runMetaOptimizer } = require('./meta-optimizer');
const { runFollowUp } = require('./outreach-followup');
const { runDiscovery } = require('./outreach-discover');
const { runOutreachSend } = require('./outreach-send');
const { runAttribution } = require('./outreach-attribution');
const { runFeatureMonitor } = require('./feature-monitor');
const { runCleanup: runGmailCleanup } = require('./gmail-cleanup');
const { runBlogGenerator } = require('./blog-generator');
const { runBlogSyndicator } = require('./blog-syndicator');
const { runQuoraCommenter } = require('./quora-commenter');
const { runBlueskyDrip } = require('./bluesky-drip');
const { runYoutubeCommenter } = require('./youtube-commenter');
const { runDmarcMonitor } = require('./dmarc-monitor');
const { runAutoResolver } = require('./auto-resolver');
const { runPersonaMonitor } = require('./persona-monitor');
const { run: runBrandTwitterPost } = require('./brand-twitter-post');
const { run: runBrandXCoach } = require('./brand-x-coach');
const { enqueue: bq } = require('./browser-queue');

console.log('[agent] YTubViral local agent starting...');

// Inicializar BD
db.initDb().catch(err => console.error('[db] Init error:', err));

// ── Cleanup: reports >7d, logs >100KB ────────────────────────────────────────
(function cleanup() {
  const fs = require('fs');
  const path = require('path');
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const MAX_LOG_BYTES = 100 * 1024;

  // Purge old reports
  const reportsDir = path.join(__dirname, 'reports');
  try {
    const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json') && !f.includes('snapshots'));
    let deleted = 0;
    for (const f of files) {
      const fp = path.join(reportsDir, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > SEVEN_DAYS) { fs.unlinkSync(fp); deleted++; }
    }
    if (deleted > 0) console.log(`[cleanup] Deleted ${deleted} reports older than 7 days`);
  } catch {}

  // Rotate large logs
  const logsDir = path.join(__dirname, 'logs');
  try {
    for (const logFile of ['out.log', 'error.log', 'tunnel-error.log']) {
      const fp = path.join(logsDir, logFile);
      try {
        const stat = fs.statSync(fp);
        if (stat.size > MAX_LOG_BYTES) {
          const content = fs.readFileSync(fp, 'utf8');
          const lines = content.split('\n');
          fs.writeFileSync(fp, lines.slice(-200).join('\n'));
          console.log(`[cleanup] Rotated ${logFile}: ${(stat.size / 1024).toFixed(0)}KB → kept last 200 lines`);
        }
      } catch {}
    }
  } catch {}
})();

// ── PRIORITY 1: Site Health ───────────────────────────────────────────────────

// Sentinel — uptime monitor every 5 minutes (24/7)
cron.schedule('*/5 * * * *', async () => {
  await runSentinel().catch(err => console.error('[sentinel]', err.message));
}, { timezone: 'Europe/Madrid' });

// Run sentinel immediately on startup
runSentinel().catch(err => console.error('[sentinel] startup check:', err.message));

// ── Schedules ─────────────────────────────────────────────────────────────────

// Twitter/X brand engagement — DISABLED (user manages brand Twitter manually)
// Personas handle Twitter engagement via persona-runner.js
// const twitterHour1 = 13 + Math.floor(Math.random() * 2);
// const twitterMin1 = Math.floor(Math.random() * 60);

// Gmail inbox — every 30 min (8-23h)
cron.schedule('*/30 8-23 * * *', async () => {
  console.log('[cron] Gmail inbox check');
  await gmail.processInbox().catch(err => console.error('[gmail]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Daily report — 8:05 every day
cron.schedule('5 8 * * *', async () => {
  console.log('[cron] Sending daily report');
  await reports.sendDailyReport().catch(err => console.error('[reports]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// X Coach — 08:00 diario. Plan de X listo para que Javier ejecute a mano (@plata24155):
// tweets para publicar + posts concretos para dar like/responder (con respuesta redactada).
// Búsqueda en X SOLO LECTURA — no automatiza la cuenta de Javier.
cron.schedule('0 8 * * *', async () => {
  console.log('[cron] X Coach — generando plan diario de X');
  await bq('x-coach', async () => {
    const { run: runXCoach } = require('./x-coach');
    await runXCoach().catch(err => console.error('[x-coach]', err.message));
    await db.disconnect().catch(() => {});
  });
}, { timezone: 'Europe/Madrid' });

// Brand X Coach — 08:30 diario. Plan de X para @YTubViral (cuenta brand).
// Javier opera a mano: tweets de marca + engagement con voz de equipo.
cron.schedule('30 8 * * *', async () => {
  console.log('[cron] Brand X Coach — generando plan diario @YTubViral');
  await bq('brand-x-coach', async () => {
    await runBrandXCoach().catch(err => console.error('[brand-x-coach]', err.message));
    await db.disconnect().catch(() => {});
  });
}, { timezone: 'Europe/Madrid' });

// ── Persona engagement — DISABLED 2026-06-25 (all personas shut down)
// const personaHour1 = 9 + Math.floor(Math.random() * 2);
// const personaMin1 = Math.floor(Math.random() * 60);
// cron.schedule(`${personaMin1} ${personaHour1} * * *`, async () => { ... });
// const personaHour2 = 22 + Math.floor(Math.random() * 1);
// const personaMin2 = Math.floor(Math.random() * 60);
// cron.schedule(`${personaMin2} ${personaHour2} * * *`, async () => { ... });

// ── Bluesky dispatcher horario (ritmo por persona) ───────────────────────────
// Cada hora 08–23 Madrid, en un minuto aleatorio. Para cada persona consulta su
// ritmo (persona-rhythm.js): horas propias + ánimo del día. Si "le toca ahora",
// engancha SOLO esa persona.
const blueskyDispatchMin = Math.floor(Math.random() * 60);
cron.schedule(`${blueskyDispatchMin} 8-23 * * *`, async () => {
  const rhythm = require('./persona-rhythm');
  const personas = personaRunner.loadPersonas();
  for (const persona of personas) {
    if (persona.disabled) continue;
    if (!rhythm.shouldEngageNow(persona.id)) continue;
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 90000)));
    await personaRunner.runOnePersonaBluesky(persona.id).catch(err => console.error('[bluesky-dispatch]', persona.id, err.message));
  }
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// ── Informe Bluesky diario — 23:40 Madrid ────────────────────────────────────
cron.schedule('40 23 * * *', async () => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
    const rows = await db.query(
      `SELECT account_id, type, COUNT(*)::int AS n FROM bluesky_actions WHERE DATE("createdAt") = $1 GROUP BY account_id, type ORDER BY account_id, type`,
      [today]
    ).catch(() => ({ rows: [] }));
    const errors = personaRunner.getAndClearErrors();
    let body = `INFORME BLUESKY — ${today}\n${'='.repeat(50)}\n\n`;
    if (!rows.rows.length && !errors.length) {
      body += 'Sin actividad registrada hoy.\n';
    } else {
      const byPersona = {};
      for (const r of rows.rows) {
        if (!byPersona[r.account_id]) byPersona[r.account_id] = {};
        byPersona[r.account_id][r.type] = r.n;
      }
      for (const [id, acts] of Object.entries(byPersona)) {
        const name = id.replace('persona-', '').replace(/^\w/, c => c.toUpperCase());
        body += `${name}: likes=${acts.bsky_like || 0}  replies=${acts.bsky_reply || 0}\n`;
      }
      if (errors.length) {
        body += `\nErrores (${errors.length}):\n`;
        for (const e of errors) body += `  • ${e.persona} [${e.platform}]: ${e.error}\n`;
      }
    }
    body += `\nYTubViral Agent — Bluesky Report\n`;
    await reports.sendEmail('🦋 Bluesky — informe diario', body);
    console.log('[bluesky-report] daily report sent');
  } catch (reportErr) {
    console.error('[bluesky-report] error:', reportErr.message);
  }
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Bluesky warm-up drip — one queued original post per day (12:35 Madrid).
// Posts only while bluesky-post-queue.json has items, then goes quiet.
cron.schedule('35 12 * * *', async () => {
  console.log('[cron] Bluesky warm-up drip');
  await runBlueskyDrip().catch(err => console.error('[bluesky-drip]', err.message));
}, { timezone: 'Europe/Madrid' });

// Persona reports — DISABLED 2026-06-25 (all personas shut down)
// Was: 12:00 and 00:00, reported Twitter/Facebook/Reddit activity for all personas.

// ── Follow-up checks — DISABLED 2026-06-25 (all personas shut down)
// Was: 2x/day, replied to people who replied to persona comments. Already was no-op (Twitter abandoned).

// Weekly backup reminder — Sundays 10:00
cron.schedule('0 10 * * 0', async () => {
  console.log('[cron] Weekly backup reminder');
  const { sendEmail } = require('./reports');
  await sendEmail(
    'Recordatorio: backup semanal YTubViral',
    'Ejecuta el backup semanal de archivos sensibles:\n\n  cd C:\\Users\\jimen\\youtube-gpt\\local-agent\n  powershell -File backup.ps1\n\nDestino: D:\\ytubviral-backup\\\n\nSentinel - YTubViral Agent System'
  ).catch(err => console.error('[backup-reminder]', err.message));
}, { timezone: 'Europe/Madrid' });

// Gmail cleanup — daily at 01:30, archive old emails and label important ones
cron.schedule('30 1 * * *', async () => {
  console.log('[cron] Gmail cleanup — inbox hygiene');
  await runGmailCleanup().catch(err => console.error('[gmail-cleanup]', err.message));
}, { timezone: 'Europe/Madrid' });

// Close all browsers every night to free memory
cron.schedule('0 2 * * *', async () => {
  console.log('[cron] Closing all Puppeteer browsers');
  await closeAllBrowsers().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// ── Agent System ────────────────────────────────────────────────────────────

// Guardian (seguridad + código) — every day at 02:15
cron.schedule('15 2 * * *', async () => {
  console.log('[cron] Guardian agent — security & code audit');
  await runGuardian().catch(err => console.error('[guardian]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Scout (competencia) — every Monday at 02:30
cron.schedule('30 2 * * 1', async () => {
  console.log('[cron] Scout agent — competitor analysis');
  await runScout().catch(err => console.error('[scout]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Watchdog (legal compliance) — every Monday at 02:45
cron.schedule('45 2 * * 1', async () => {
  console.log('[cron] Watchdog agent — legal compliance audit');
  await runWatchdog().catch(err => console.error('[watchdog]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Discovery — 6x/day, find new YouTube creators via API
// Staggered: discover at :30, send at :45 (gives 15min to populate tracker)
cron.schedule('30 7,9,11,14,17,20 * * *', async () => {
  console.log('[cron] Outreach discovery — finding new creators');
  await runDiscovery().catch(err => console.error('[outreach-discover]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Send — 6x/day, send emails to pending-email contacts (15min after discovery)
cron.schedule('45 7,9,11,14,17,20 * * *', async () => {
  console.log('[cron] Outreach send — emailing new contacts');
  await runOutreachSend().catch(err => console.error('[outreach-send]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Follow-up — 2x/day, sends follow-up emails to contacts due today
cron.schedule('0 10,16 * * *', async () => {
  console.log('[cron] Outreach follow-up — checking for due contacts');
  await runFollowUp().catch(err => console.error('[outreach-followup]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Attribution — daily at 02:50, cross-reference contacts vs registered users and
// recompute meta.stats (J1: replied/registered/activated were hardcoded zeros nothing updated).
// Runs before the 03:00 reports so manager/funnel see real outreach numbers.
cron.schedule('50 2 * * *', async () => {
  console.log('[cron] Outreach attribution — matching contacts to signups');
  await runAttribution().catch(err => console.error('[outreach-attribution]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Brand Twitter Post — DESACTIVADO 2026-06-24 (shadowban confirmado, pivote a Bluesky)
// cron.schedule('30 10 * * *', async () => { ... });

// Outreach Monitor — every 3 hours 9-23h, check for new replies to outreach posts
cron.schedule('0 9,12,15,18,21 * * *', async () => {
  console.log('[cron] Outreach monitor — checking for replies');
  await bq('outreach-monitor', async () => {
    const { execSync } = require('child_process');
    try {
      execSync('node outreach-monitor.js', { cwd: __dirname, timeout: 180000, stdio: 'inherit', windowsHide: true });
    } catch (err) {
      console.error('[outreach-monitor]', err.message);
    }
  });
}, { timezone: 'Europe/Madrid' });

// Feature Monitor — 2x/day, end-to-end feature health checks
cron.schedule('0 7,19 * * *', async () => {
  console.log('[cron] Feature Monitor — testing all platform features');
  await bq('feature-monitor', async () => {
    await runFeatureMonitor().catch(err => console.error('[feature-monitor]', err.message));
    await db.disconnect().catch(() => {});
  });
}, { timezone: 'Europe/Madrid' });

// Infra Optimizer — daily at 02:45
cron.schedule('45 2 * * *', async () => {
  console.log('[cron] Infra Optimizer — daily infrastructure analysis');
  await runInfraOptimizer().catch(err => console.error('[infra-optimizer]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// SEO Optimizer — daily at 02:50
cron.schedule('50 2 * * *', async () => {
  console.log('[cron] SEO Optimizer — daily SEO analysis');
  await runSeoOptimizer().catch(err => console.error('[seo-optimizer]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Funnel Optimizer — daily at 02:55
cron.schedule('55 2 * * *', async () => {
  console.log('[cron] Funnel Optimizer — daily conversion analysis');
  await runFunnelOptimizer().catch(err => console.error('[funnel-optimizer]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Social Optimizer — daily at 03:00 (before Manager, so Manager can include findings)
cron.schedule('0 3 * * *', async () => {
  console.log('[cron] Social Optimizer — daily analysis');
  await runSocialOptimizer().catch(err => console.error('[social-optimizer]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Manager (coordinator + executive report) — every day at 03:15
// Runs after all other agents to collect their reports
cron.schedule('15 3 * * *', async () => {
  console.log('[cron] Manager agent — executive report');
  await runManager().catch(err => console.error('[manager]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Meta-Optimizer — weekly Sunday at 03:30 (after Manager)
cron.schedule('30 3 * * 0', async () => {
  console.log('[cron] Meta-Optimizer — weekly self-improvement analysis');
  await runMetaOptimizer().catch(err => console.error('[meta-optimizer]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Persona Monitor — cada hora en horario activo (08:00-23:00)
// Detecta silencio en Bluesky; auto-retry + email si falla
cron.schedule('12 8-23 * * *', async () => {
  await runPersonaMonitor().catch(err => console.error('[persona-monitor]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Auto-Resolver — daily at 09:17 (reads manager report + applies programmatic fixes)
cron.schedule('17 9 * * *', async () => {
  console.log('[cron] Auto-Resolver — reading manager report and applying fixes');
  await runAutoResolver().catch(err => console.error('[auto-resolver]', err.message));
}, { timezone: 'Europe/Madrid' });

// Blog Generator — Monday & Thursday at 04:00 (2 articles/week)
cron.schedule('0 4 * * 1,4', async () => {
  console.log('[cron] Blog Generator — auto-generating SEO article');
  await runBlogGenerator().catch(err => console.error('[blog-generator]', err.message));
}, { timezone: 'Europe/Madrid' });

// Blog Syndicator — daily at 05:00 (cross-post to Blogger/Tumblr)
cron.schedule('0 5 * * *', async () => {
  console.log('[cron] Blog Syndicator — cross-posting article');
  await bq('blog-syndicator', async () => {
    await runBlogSyndicator().catch(err => console.error('[blog-syndicator]', err.message));
  });
}, { timezone: 'Europe/Madrid' });

// Quora Commenter — 13:00 + 19:00 daily
cron.schedule('0 13,19 * * *', async () => {
  console.log('[cron] Quora Commenter — answering YouTube questions');
  await bq('quora-commenter', async () => {
    await runQuoraCommenter().catch(err => console.error('[quora-commenter]', err.message));
  });
}, { timezone: 'Europe/Madrid' });

// YouTube Commenter — DISABLED (risk to persona accounts)
// cron.schedule('30 10,21 * * *', async () => {
//   console.log('[cron] YouTube Commenter — commenting via personas');
//   await runYoutubeCommenter().catch(err => console.error('[youtube-commenter]', err.message));
// }, { timezone: 'Europe/Madrid' });

// DMARC Monitor — daily at 06:00 (analyze email authentication reports)
cron.schedule('0 6 * * *', async () => {
  console.log('[cron] DMARC Monitor — analyzing email auth reports');
  await runDmarcMonitor().catch(err => console.error('[dmarc-monitor]', err.message));
}, { timezone: 'Europe/Madrid' });

console.log('[agent] Schedules registered. Running...');
console.log('  🛡️ Sentinel: every 5min 24/7 (PRIORITY 1)');
console.log('  Personas Twitter/Facebook/Reddit: DISABLED 2026-06-25 (only Bluesky active)');
console.log('  Persona follow-ups: DISABLED 2026-06-25 (Twitter abandoned)');
console.log('  Persona reports (Twitter/FB/Reddit): DISABLED 2026-06-25');
console.log(`  Bluesky dispatcher: hourly 08-23 (Europe/Madrid)`);
console.log('  Bluesky daily report: 23:40 (Europe/Madrid)');
console.log('  Bluesky warm-up drip: 12:35 daily (Europe/Madrid)');
console.log('  Persona Monitor (Bluesky): every hour 08:00-23:00 (Europe/Madrid)');
console.log('  Brand Twitter post (auto): DISABLED');
console.log('  Brand X Coach (@YTubViral manual): 08:30 daily (Europe/Madrid)');
console.log('  Gmail inbox: every 30min 8-23h (Europe/Madrid)');
console.log('  Daily report: 08:05 (Europe/Madrid)');
console.log('  Outreach discover: 07:30,09:30,11:30,14:30,17:30,20:30 (Europe/Madrid)');
console.log('  Outreach send: 07:45,09:45,11:45,14:45,17:45,20:45 (Europe/Madrid)');
console.log('  Outreach follow-up: 10:00,16:00 daily (Europe/Madrid)');
console.log('  Feature Monitor: 07:00, 19:00 daily (Europe/Madrid)');
console.log('  Outreach monitor: every 3h 9-21h (Europe/Madrid)');
console.log('  Infra Optimizer: 02:45 daily (Europe/Madrid)');
console.log('  SEO Optimizer: 02:50 daily (Europe/Madrid)');
console.log('  Funnel Optimizer: 02:55 daily (Europe/Madrid)');
console.log('  Social Optimizer: 03:00 daily (Europe/Madrid)');
console.log('  Manager: 03:15 daily (Europe/Madrid)');
console.log('  Meta-Optimizer: 03:30 Sundays (Europe/Madrid)');
console.log('  Auto-Resolver: 09:17 daily (Europe/Madrid)');
console.log('  Blog Generator: 04:00 Mon+Thu (Europe/Madrid)');
console.log('  Blog Syndicator: 05:00 daily (Europe/Madrid)');
console.log('  Quora Commenter: 13:00, 19:00 daily (Europe/Madrid)');
console.log('  YouTube Commenter: DISABLED (risk to personas)');

// Keep process alive
process.on('uncaughtException', err => console.error('[agent] Uncaught exception:', err));
process.on('unhandledRejection', err => console.error('[agent] Unhandled rejection:', err));
