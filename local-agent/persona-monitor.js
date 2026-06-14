'use strict';

/**
 * PERSONA MONITOR — Detecta silencio y auto-recupera sesiones
 *
 * Corre cada hora. Para cada persona/plataforma activa:
 *   1. Consulta BD: ¿cuándo fue la última acción?
 *   2. Si el silencio supera el umbral → intenta retry
 *   3. Si el retry falla → envía email de alerta con pasos exactos
 *   4. Guarda estado en reports/persona-health-{fecha}.json
 *
 * Umbrales:
 *   - Twitter:  silencio > 14h en horario activo (08:00-23:00) → alerta
 *   - Reddit:   silencio > 26h → alerta (corre 1x/día, margen amplio)
 *   - Facebook: silencio > 48h → alerta (baja prioridad)
 *
 * Auto-retry:
 *   - Ejecuta la persona fallida via runAllPersonas() filtrado
 *   - Máximo 2 retries/persona/día para no spamear
 *   - Si falla: escala a email con pasos de restauración manual
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { sendEmail } = require('./reports');
const { loadPersonas } = require('./persona-runner');
const { checkRedditAccount, loadUsernames } = require('./account-health');

const REPORTS_DIR  = path.join(__dirname, 'reports');
const HEALTH_FILE  = () => path.join(REPORTS_DIR, `persona-health-${today()}.json`);
const COOKIES_DIR  = path.join(__dirname, 'cookies');

// Reddit abandoned 2026-06-14 (accounts shadowbanned) — don't monitor it (no silence/health
// alerts for a dead channel). Flip to true if Reddit is ever re-enabled on healthy accounts.
const MONITOR_REDDIT = false;

// Retry count tracker (in-memory, resets on PM2 restart)
const retryCount = {};

function today() { return new Date().toISOString().slice(0, 10); }

function log(msg) { console.log(`[persona-monitor] ${msg}`); }

function readHealth() {
  try { return JSON.parse(fs.readFileSync(HEALTH_FILE(), 'utf8')); }
  catch { return { date: today(), personas: {}, lastCheck: null }; }
}

function saveHealth(data) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(HEALTH_FILE(), JSON.stringify(data, null, 2));
}

function hourMadrid() {
  return new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }) | 0;
}

function isActiveHour() {
  const h = hourMadrid();
  return h >= 8 && h <= 23;
}

/**
 * Returns threshold in milliseconds for considering a persona "silent".
 * platform: 'twitter' | 'reddit' | 'facebook'
 */
function silenceThresholdMs(platform) {
  return { twitter: 14 * 3600000, reddit: 26 * 3600000, facebook: 48 * 3600000 }[platform] ?? 24 * 3600000;
}

/**
 * Check if the cookie file for a persona/platform exists and is non-empty.
 */
function cookieFileOk(persona, platform) {
  const cookiePath = persona.platforms?.[platform]?.cookieFile;
  if (!cookiePath) return false;
  const full = path.isAbsolute(cookiePath) ? cookiePath : path.join(__dirname, cookiePath);
  try {
    const stat = fs.statSync(full);
    if (stat.size < 50) return false; // Empty or placeholder
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

/**
 * Attempt to re-run a specific persona on a specific platform.
 * Returns true if it completes without throwing.
 */
async function retryPersona(persona, platform) {
  const key = `${persona.id}:${platform}`;
  const current = retryCount[key] || 0;

  if (current >= 2) {
    log(`${persona.id}/${platform}: max retries reached today (${current}), skipping`);
    return false;
  }

  retryCount[key] = current + 1;

  log(`${persona.id}/${platform}: attempting retry #${retryCount[key]}...`);

  try {
    // Import at runtime to avoid circular deps
    const twitter = require('./twitter');
    const reddit  = require('./reddit');
    const { enqueue } = require('./browser-queue');

    await new Promise((resolve, reject) => {
      enqueue(`persona-retry-${persona.id}-${platform}`, async () => {
        if (platform === 'twitter') {
          await twitter.engageWithTweets({
            accountId: persona.id,
            profileDir: path.join(__dirname, persona.profileDir || `chrome-profiles/${persona.id}`),
            cookieFile: path.join(__dirname, persona.platforms.twitter.cookieFile),
            persona,
          });
        } else if (platform === 'reddit') {
          await reddit.engageWithPosts({
            accountId: persona.id,
            profileDir: path.join(__dirname, persona.profileDir || `chrome-profiles/${persona.id}`),
            cookieFile: path.join(__dirname, persona.platforms.reddit.cookieFile),
            persona,
          });
        }
        resolve();
      }).catch(reject);
    });

    log(`${persona.id}/${platform}: retry succeeded`);
    return true;
  } catch (err) {
    log(`${persona.id}/${platform}: retry failed — ${err.message}`);
    return false;
  }
}

/**
 * Build and send an escalation email for a failed persona.
 */
async function sendPersonaAlert(persona, platform, lastActivity, retryFailed, cookieOk) {
  const silenceHours = lastActivity
    ? Math.round((Date.now() - lastActivity.getTime()) / 3600000)
    : '??';

  const platformSteps = {
    twitter: [
      `1. Ejecuta en terminal: cd C:/Users/jimen/youtube-gpt/local-agent`,
      `2. node login-persona.js ${persona.id} twitter`,
      `3. En la ventana Chrome que se abre, haz login en x.com manualmente`,
      `4. Cierra el navegador (las cookies se guardan automáticamente)`,
      `5. pm2 restart ytubviral-agent`,
    ],
    reddit: [
      `1. cd C:/Users/jimen/youtube-gpt/local-agent`,
      `2. node login-persona.js ${persona.id} reddit`,
      `3. Haz login en reddit.com en la ventana que se abre`,
      `4. Cierra el navegador`,
      `5. pm2 restart ytubviral-agent`,
    ],
    facebook: [
      `1. cd C:/Users/jimen/youtube-gpt/local-agent`,
      `2. node login-persona.js ${persona.id} facebook`,
      `3. Haz login en facebook.com en la ventana que se abre`,
      `4. Cierra el navegador`,
      `5. pm2 restart ytubviral-agent`,
    ],
  };

  const steps = platformSteps[platform] || [`Revisar cookie: cookies/${persona.id}-${platform}.json`];

  const subject = `🚨 PERSONA CAÍDA — ${persona.name} (${platform}) sin actividad ${silenceHours}h`;
  let body = `ALERTA — PERSONA SIN ACTIVIDAD\n${'='.repeat(50)}\n\n`;
  body += `Persona:      ${persona.name} (${persona.id})\n`;
  body += `Plataforma:   ${platform}\n`;
  body += `Última acción: ${lastActivity ? lastActivity.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) : 'NUNCA'}\n`;
  body += `Silencio:     ${silenceHours} horas\n`;
  body += `Cookie OK:    ${cookieOk ? 'Sí' : 'NO — archivo vacío o inexistente'}\n`;
  body += `Auto-retry:   ${retryFailed ? 'Falló' : 'No ejecutado (max retries)'}\n\n`;
  body += `CAUSA MÁS PROBABLE:\n`;
  if (!cookieOk) body += `  → Archivo de cookies vacío o inexistente\n`;
  else body += `  → Sesión expirada (cookie caducada) o bloqueo de X/Reddit\n`;
  body += `\nPASOS PARA RESTAURAR:\n${steps.join('\n')}\n`;
  body += `\nPersona Monitor — YTubViral Agent System\n`;

  try {
    await sendEmail(subject, body);
    log(`${persona.id}/${platform}: alert email sent`);
  } catch (err) {
    log(`${persona.id}/${platform}: failed to send alert — ${err.message}`);
    // Write to disk as fallback
    const alertFile = path.join(__dirname, 'logs', `persona-alert-${today()}.log`);
    fs.appendFileSync(alertFile, `\n${new Date().toISOString()} ${subject}\n${body}\n`);
  }
}

/**
 * Alert for a suspended/shadowbanned account. Unlike a silence alert, re-login does NOT fix
 * this — the account is dead and needs an appeal or a fresh, organically-warmed account.
 */
async function sendAccountAlert(persona, username, status) {
  const label = status === 'suspended' ? 'SUSPENDIDA (ban sitewide)' : 'SHADOWBANEADA (invisible para todos)';
  const subject = `🚫 CUENTA REDDIT ${status.toUpperCase()} — ${persona.name} (u/${username})`;
  let body = `CUENTA DE REDDIT COMPROMETIDA\n${'='.repeat(50)}\n\n`;
  body += `Persona:  ${persona.name} (${persona.id})\n`;
  body += `Cuenta:   u/${username}\n`;
  body += `Estado:   ${label}\n\n`;
  body += status === 'shadowbanned'
    ? `La cuenta funciona para ti al loguearte, pero su perfil da 404 a quien no está logueado y todo lo que publica es invisible. Re-loguear NO lo arregla.\n`
    : `La cuenta está suspendida por Reddit. No puede comentar ni postear. Re-loguear NO lo arregla.\n`;
  body += `\nQUÉ HACER:\n`;
  body += `  1. Confirmar: comenta en r/ShadowBan logueado como u/${username} (un bot responde al instante).\n`;
  body += `  2. Apelar en reddit.com/appeals o r/reddit — a veces es falso positivo reversible.\n`;
  body += `  3. Si no, crear cuenta nueva y calentarla orgánicamente ANTES de automatizar (evitar autopromo + Puppeteer agresivo en cuenta nueva).\n`;
  body += `  4. Esta persona puede dejarse 'disabled:true' en personas.json mientras tanto.\n`;
  body += `\nPersona Monitor — YTubViral Agent System\n`;
  try {
    await sendEmail(subject, body);
    log(`${persona.id}: account alert sent (${status})`);
  } catch (err) {
    log(`${persona.id}: failed to send account alert — ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runPersonaMonitor() {
  if (!isActiveHour()) {
    log('Outside active hours (08:00-23:00) — skipping');
    return;
  }

  log('Starting persona health check...');
  const personas = loadPersonas();
  const health   = readHealth();
  health.lastCheck = new Date().toISOString();

  const alerts = [];

  for (const persona of personas) {
    if (persona.disabled) {
      log(`${persona.id}: SKIPPED (disabled: ${persona.disabledReason || 'no reason'})`);
      continue;
    }
    const platforms = Object.keys(persona.platforms || {});
    health.personas[persona.id] = health.personas[persona.id] || {};

    // Account-health check (suspension / shadowban) for the Reddit account, if we know its
    // username. Runs once per persona; a dead account alerts even when it's not "silent".
    if (MONITOR_REDDIT && persona.platforms?.reddit) {
      const username = loadUsernames()[persona.id]?.username;
      if (username) {
        const acc = await checkRedditAccount(username);
        health.personas[persona.id].redditAccount = { username, ...acc, checkedAt: new Date().toISOString() };
        if (acc.status === 'suspended' || acc.status === 'shadowbanned') {
          log(`${persona.id}: ⚠️ Reddit account u/${username} is ${acc.status.toUpperCase()} — ${acc.reason}`);
          const alreadyAlerted = health.personas[persona.id].accountAlertedAt?.startsWith(today());
          if (!alreadyAlerted) {
            await sendAccountAlert(persona, username, acc.status);
            health.personas[persona.id].accountAlertedAt = new Date().toISOString();
            alerts.push({ persona: persona.id, platform: 'reddit', issue: acc.status });
          }
        }
      }
    }

    for (const platform of platforms) {
      if (platform === 'reddit' && !MONITOR_REDDIT) continue; // Reddit abandoned — no alerts
      const threshold = silenceThresholdMs(platform);
      let lastActivity = null;

      try {
        lastActivity = await db.getLastActivity(persona.id, platform);
      } catch (err) {
        log(`${persona.id}/${platform}: DB query failed — ${err.message}`);
        continue;
      }

      const cookieOk  = cookieFileOk(persona, platform);

      // Skip platforms that have never had activity AND no cookie file — not configured yet
      if (!lastActivity && !cookieOk) {
        log(`${persona.id}/${platform}: UNCONFIGURED — no cookie file and no activity, skipping`);
        continue;
      }

      const silenceMs = lastActivity ? Date.now() - lastActivity.getTime() : Infinity;
      const silenceH  = Math.round(silenceMs / 3600000);
      const isSilent  = silenceMs > threshold;
      const status    = isSilent ? 'SILENT' : 'OK';

      log(`${persona.id}/${platform}: ${status} — last activity ${lastActivity ? lastActivity.toISOString() : 'never'} (${silenceH}h ago)`);

      health.personas[persona.id][platform] = {
        status,
        lastActivity: lastActivity?.toISOString() || null,
        silenceHours: silenceH,
        cookieOk,
        checkedAt: new Date().toISOString(),
      };

      if (!isSilent) continue;

      // Silent → attempt retry first
      const retryOk = await retryPersona(persona, platform);

      if (retryOk) {
        health.personas[persona.id][platform].status = 'RECOVERED';
        health.personas[persona.id][platform].recoveredAt = new Date().toISOString();
        log(`${persona.id}/${platform}: RECOVERED after retry`);
        continue;
      }

      // Retry failed or max retries reached → alert
      const alertKey = `${persona.id}:${platform}`;
      const alreadyAlerstedToday = health.personas[persona.id][platform]?.alertedAt?.startsWith(today());

      if (!alreadyAlerstedToday) {
        await sendPersonaAlert(persona, platform, lastActivity, true, cookieOk);
        health.personas[persona.id][platform].alertedAt = new Date().toISOString();
        alerts.push({ persona: persona.id, platform, silenceHours: silenceH });
      } else {
        log(`${persona.id}/${platform}: alert already sent today, skipping`);
      }
    }
  }

  saveHealth(health);
  log(`Done — ${alerts.length} alert(s) sent`);
  return { health, alerts };
}

module.exports = { runPersonaMonitor };

if (require.main === module) {
  db.initDb()
    .then(() => runPersonaMonitor())
    .then(r => { console.log('Done', JSON.stringify(r?.alerts)); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
