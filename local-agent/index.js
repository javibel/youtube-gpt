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
const { runOutreachPost } = require('./outreach-post');
const { runFeatureMonitor } = require('./feature-monitor');

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

// ── Persona engagement (2 daily rounds) ─────────────────────────────────────
const personaHour1 = 9 + Math.floor(Math.random() * 2);
const personaMin1 = Math.floor(Math.random() * 60);
cron.schedule(`${personaMin1} ${personaHour1} * * *`, async () => {
  console.log('[cron] Persona engagement (morning)');
  await personaRunner.runAllPersonas().catch(err => console.error('[persona-runner]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

const personaHour2 = 22 + Math.floor(Math.random() * 1);
const personaMin2 = Math.floor(Math.random() * 60);
cron.schedule(`${personaMin2} ${personaHour2} * * *`, async () => {
  console.log('[cron] Persona engagement (evening)');
  await personaRunner.runAllPersonas().catch(err => console.error('[persona-runner]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Persona reports — 12:00 and 00:00 Madrid
cron.schedule('0 12 * * *', async () => {
  console.log('[cron] Sending persona report (noon)');
  await reports.sendPersonaReport().catch(err => console.error('[reports]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

cron.schedule('0 0 * * *', async () => {
  console.log('[cron] Sending persona report (midnight)');
  await reports.sendPersonaReport().catch(err => console.error('[reports]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// ── Follow-up checks (reply to people who replied to our comments) — 2x/day ──
const followupHour1 = 10 + Math.floor(Math.random() * 2);
const followupMin1 = Math.floor(Math.random() * 60);
cron.schedule(`${followupMin1} ${followupHour1} * * *`, async () => {
  console.log('[cron] Follow-up reply checks (morning)');
  await followup.runFollowupChecks().catch(err => console.error('[followup]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

const followupHour2 = 17 + Math.floor(Math.random() * 2);
const followupMin2 = Math.floor(Math.random() * 60);
cron.schedule(`${followupMin2} ${followupHour2} * * *`, async () => {
  console.log('[cron] Follow-up reply checks (evening)');
  await followup.runFollowupChecks().catch(err => console.error('[followup]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Weekly backup reminder — Sundays 10:00
cron.schedule('0 10 * * 0', async () => {
  console.log('[cron] Weekly backup reminder');
  const { sendEmail } = require('./reports');
  await sendEmail(
    'Recordatorio: backup semanal YTubViral',
    'Ejecuta el backup semanal de archivos sensibles:\n\n  cd C:\\Users\\jimen\\youtube-gpt\\local-agent\n  powershell -File backup.ps1\n\nDestino: D:\\ytubviral-backup\\\n\nSentinel - YTubViral Agent System'
  ).catch(err => console.error('[backup-reminder]', err.message));
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

// Outreach Discovery — 4x/day, find new YouTube creators via API
// Staggered: discover at :30, send at :45 (gives 15min to populate tracker)
cron.schedule('30 8,12,16,20 * * *', async () => {
  console.log('[cron] Outreach discovery — finding new creators');
  await runDiscovery().catch(err => console.error('[outreach-discover]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Send — 4x/day, send emails to pending-email contacts (15min after discovery)
cron.schedule('45 8,12,16,20 * * *', async () => {
  console.log('[cron] Outreach send — emailing new contacts');
  await runOutreachSend().catch(err => console.error('[outreach-send]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Follow-up — daily at 10:00, sends follow-up emails to contacts due today
cron.schedule('0 10 * * *', async () => {
  console.log('[cron] Outreach follow-up — checking for due contacts');
  await runFollowUp().catch(err => console.error('[outreach-followup]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Community Posts — daily at 11:00, publish pending Reddit posts
cron.schedule('0 11 * * *', async () => {
  console.log('[cron] Outreach post — publishing community posts');
  await runOutreachPost().catch(err => console.error('[outreach-post]', err.message));
  await db.disconnect().catch(() => {});
}, { timezone: 'Europe/Madrid' });

// Outreach Monitor — every 3 hours 9-23h, check for new replies to outreach posts
cron.schedule('0 9,12,15,18,21 * * *', async () => {
  console.log('[cron] Outreach monitor — checking for replies');
  const { execSync } = require('child_process');
  try {
    execSync('node outreach-monitor.js', { cwd: __dirname, timeout: 180000, stdio: 'inherit' });
  } catch (err) {
    console.error('[outreach-monitor]', err.message);
  }
}, { timezone: 'Europe/Madrid' });

// Feature Monitor — 2x/day, end-to-end feature health checks
cron.schedule('0 7,19 * * *', async () => {
  console.log('[cron] Feature Monitor — testing all platform features');
  await runFeatureMonitor().catch(err => console.error('[feature-monitor]', err.message));
  await db.disconnect().catch(() => {});
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

console.log('[agent] Schedules registered. Running...');
console.log('  🛡️ Sentinel: every 5min 24/7 (PRIORITY 1)');
console.log('  Twitter brand: DISABLED (manual)');
console.log(`  Personas morning: ${personaHour1}:${String(personaMin1).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Personas evening: ${personaHour2}:${String(personaMin2).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Follow-up morning: ${followupHour1}:${String(followupMin1).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Follow-up evening: ${followupHour2}:${String(followupMin2).padStart(2, '0')} (Europe/Madrid)`);
console.log('  Gmail inbox: every 30min 8-23h (Europe/Madrid)');
console.log('  Daily report: 08:05 (Europe/Madrid)');
console.log('  Persona reports: 12:00, 00:00 (Europe/Madrid)');
console.log('  Outreach discover: 08:30,12:30,16:30,20:30 (Europe/Madrid)');
console.log('  Outreach send: 08:45,12:45,16:45,20:45 (Europe/Madrid)');
console.log('  Outreach follow-up: 10:00 daily (Europe/Madrid)');
console.log('  Outreach posts: 11:00 daily (Europe/Madrid)');
console.log('  Feature Monitor: 07:00, 19:00 daily (Europe/Madrid)');
console.log('  Outreach monitor: every 3h 9-21h (Europe/Madrid)');
console.log('  Infra Optimizer: 02:45 daily (Europe/Madrid)');
console.log('  SEO Optimizer: 02:50 daily (Europe/Madrid)');
console.log('  Funnel Optimizer: 02:55 daily (Europe/Madrid)');
console.log('  Social Optimizer: 03:00 daily (Europe/Madrid)');
console.log('  Manager: 03:15 daily (Europe/Madrid)');
console.log('  Meta-Optimizer: 03:30 Sundays (Europe/Madrid)');

// Keep process alive
process.on('uncaughtException', err => console.error('[agent] Uncaught exception:', err));
process.on('unhandledRejection', err => console.error('[agent] Unhandled rejection:', err));
