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

console.log('[agent] YTubViral local agent starting...');

// Inicializar BD
db.initDb().catch(err => console.error('[db] Init error:', err));

// ── PRIORITY 1: Site Health ───────────────────────────────────────────────────

// Sentinel — uptime monitor every 5 minutes (24/7)
cron.schedule('*/5 * * * *', async () => {
  await runSentinel().catch(err => console.error('[sentinel]', err.message));
}, { timezone: 'Europe/Madrid' });

// Run sentinel immediately on startup
runSentinel().catch(err => console.error('[sentinel] startup check:', err.message));

// ── Schedules ─────────────────────────────────────────────────────────────────

// Twitter/X engagement — 2 sessions per day at random hours (13-15h and 20-22h Madrid)
const twitterHour1 = 13 + Math.floor(Math.random() * 2);
const twitterMin1 = Math.floor(Math.random() * 60);
cron.schedule(`${twitterMin1} ${twitterHour1} * * *`, async () => {
  console.log('[cron] Twitter engage (session 1)');
  await twitter.engageWithTweets().catch(err => console.error('[twitter]', err.message));
}, { timezone: 'Europe/Madrid' });

const twitterHour2 = 20 + Math.floor(Math.random() * 2);
const twitterMin2 = Math.floor(Math.random() * 60);
cron.schedule(`${twitterMin2} ${twitterHour2} * * *`, async () => {
  console.log('[cron] Twitter engage (session 2)');
  await twitter.engageWithTweets().catch(err => console.error('[twitter]', err.message));
}, { timezone: 'Europe/Madrid' });

// Gmail inbox — every 30 min (8-23h)
cron.schedule('*/30 8-23 * * *', async () => {
  console.log('[cron] Gmail inbox check');
  await gmail.processInbox().catch(err => console.error('[gmail]', err.message));
}, { timezone: 'Europe/Madrid' });

// Daily report — 8:05 every day
cron.schedule('5 8 * * *', async () => {
  console.log('[cron] Sending daily report');
  await reports.sendDailyReport().catch(err => console.error('[reports]', err.message));
}, { timezone: 'Europe/Madrid' });

// ── Persona engagement (2 daily rounds) ─────────────────────────────────────
const personaHour1 = 9 + Math.floor(Math.random() * 2);
const personaMin1 = Math.floor(Math.random() * 60);
cron.schedule(`${personaMin1} ${personaHour1} * * *`, async () => {
  console.log('[cron] Persona engagement (morning)');
  await personaRunner.runAllPersonas().catch(err => console.error('[persona-runner]', err.message));
}, { timezone: 'Europe/Madrid' });

const personaHour2 = 22 + Math.floor(Math.random() * 1);
const personaMin2 = Math.floor(Math.random() * 60);
cron.schedule(`${personaMin2} ${personaHour2} * * *`, async () => {
  console.log('[cron] Persona engagement (evening)');
  await personaRunner.runAllPersonas().catch(err => console.error('[persona-runner]', err.message));
}, { timezone: 'Europe/Madrid' });

// Persona reports — 12:00 and 00:00 Madrid
cron.schedule('0 12 * * *', async () => {
  console.log('[cron] Sending persona report (noon)');
  await reports.sendPersonaReport().catch(err => console.error('[reports]', err.message));
}, { timezone: 'Europe/Madrid' });

cron.schedule('0 0 * * *', async () => {
  console.log('[cron] Sending persona report (midnight)');
  await reports.sendPersonaReport().catch(err => console.error('[reports]', err.message));
}, { timezone: 'Europe/Madrid' });

// ── Follow-up checks (reply to people who replied to our comments) — 2x/day ──
const followupHour1 = 10 + Math.floor(Math.random() * 2);
const followupMin1 = Math.floor(Math.random() * 60);
cron.schedule(`${followupMin1} ${followupHour1} * * *`, async () => {
  console.log('[cron] Follow-up reply checks (morning)');
  await followup.runFollowupChecks().catch(err => console.error('[followup]', err.message));
}, { timezone: 'Europe/Madrid' });

const followupHour2 = 17 + Math.floor(Math.random() * 2);
const followupMin2 = Math.floor(Math.random() * 60);
cron.schedule(`${followupMin2} ${followupHour2} * * *`, async () => {
  console.log('[cron] Follow-up reply checks (evening)');
  await followup.runFollowupChecks().catch(err => console.error('[followup]', err.message));
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
}, { timezone: 'Europe/Madrid' });

// Scout (competencia) — every Monday at 02:30
cron.schedule('30 2 * * 1', async () => {
  console.log('[cron] Scout agent — competitor analysis');
  await runScout().catch(err => console.error('[scout]', err.message));
}, { timezone: 'Europe/Madrid' });

// Watchdog (legal compliance) — every Monday at 02:45
cron.schedule('45 2 * * 1', async () => {
  console.log('[cron] Watchdog agent — legal compliance audit');
  await runWatchdog().catch(err => console.error('[watchdog]', err.message));
}, { timezone: 'Europe/Madrid' });

// Social Optimizer — daily at 03:00 (before Manager, so Manager can include findings)
cron.schedule('0 3 * * *', async () => {
  console.log('[cron] Social Optimizer — daily analysis');
  await runSocialOptimizer().catch(err => console.error('[social-optimizer]', err.message));
}, { timezone: 'Europe/Madrid' });

// Manager (coordinator + executive report) — every day at 03:15
// Runs after all other agents to collect their reports
cron.schedule('15 3 * * *', async () => {
  console.log('[cron] Manager agent — executive report');
  await runManager().catch(err => console.error('[manager]', err.message));
}, { timezone: 'Europe/Madrid' });

console.log('[agent] Schedules registered. Running...');
console.log('  🛡️ Sentinel: every 5min 24/7 (PRIORITY 1)');
console.log(`  Twitter session 1: ${twitterHour1}:${String(twitterMin1).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Twitter session 2: ${twitterHour2}:${String(twitterMin2).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Personas morning: ${personaHour1}:${String(personaMin1).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Personas evening: ${personaHour2}:${String(personaMin2).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Follow-up morning: ${followupHour1}:${String(followupMin1).padStart(2, '0')} (Europe/Madrid)`);
console.log(`  Follow-up evening: ${followupHour2}:${String(followupMin2).padStart(2, '0')} (Europe/Madrid)`);
console.log('  Gmail inbox: every 30min 8-23h (Europe/Madrid)');
console.log('  Daily report: 08:05 (Europe/Madrid)');
console.log('  Persona reports: 12:00, 00:00 (Europe/Madrid)');
console.log('  Guardian: 02:15 daily (Europe/Madrid)');
console.log('  Scout: 02:30 Mondays (Europe/Madrid)');
console.log('  Watchdog: 02:45 Mondays (Europe/Madrid)');
console.log('  Manager: 03:15 daily (Europe/Madrid)');

// Keep process alive
process.on('uncaughtException', err => console.error('[agent] Uncaught exception:', err));
process.on('unhandledRejection', err => console.error('[agent] Unhandled rejection:', err));
