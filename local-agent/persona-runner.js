'use strict';

const fs = require('fs');
const path = require('path');
const { closeBrowserForProfile } = require('./browser');
const { generatePersonaComment } = require('./claude');

const twitter = require('./twitter');
const facebook = require('./facebook');
const { diagnose } = require('./doctor');

// Canales de personas: Twitter + Facebook + Bluesky (Reddit/LinkedIn retirados 2026-06-20).
// Cada canal arranca en false hasta que las cuentas de las personas estén creadas y con sesión
// iniciada — así el runner no intenta postear desde sesiones inexistentes ni rompe el proceso vivo.
const FACEBOOK_AUTOMATION_ENABLED = process.env.FACEBOOK_AUTOMATION_ENABLED === 'true';
const BLUESKY_AUTOMATION_ENABLED = process.env.BLUESKY_AUTOMATION_ENABLED === 'true';
let bluesky = null;
if (BLUESKY_AUTOMATION_ENABLED) {
  try { bluesky = require('./bluesky'); } catch (e) { console.error('[persona-runner] bluesky module unavailable:', e.message); }
}

function loadPersonas() {
  const file = path.join(__dirname, 'personas.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Shared error log — collected during runs, read by reports
const _errors = [];
function getAndClearErrors() {
  return _errors.splice(0);
}

// Run all personas sequentially (1 browser at a time to limit memory)
async function runAllPersonas() {
  const personas = loadPersonas();
  console.log(`[persona-runner] Starting run for ${personas.length} personas`);

  for (const persona of personas) {
    if (persona.disabled) {
      console.log(`[persona-runner] ${persona.name} (${persona.id}) — SKIPPED (disabled: ${persona.disabledReason || 'no reason given'})`);
      continue;
    }
    console.log(`[persona-runner] === ${persona.name} (${persona.id}) ===`);

    // Build comment generator bound to this persona.
    // Bluesky: strip all ytubviral mentions — zero promotional patterns on a new platform.
    const makeCommentGen = (platform) => {
      const personaForPlatform = platform === 'bluesky'
        ? { ...persona, mentionYtubviral: false, mentionRate: 0 }
        : persona;
      return (authorName, postContent) => generatePersonaComment(personaForPlatform, platform, authorName, postContent);
    };

    // Twitter — ABANDONADO 2026-06-24 (shadowban confirmado en las 4 personas). Pivote a Bluesky.
    // if (persona.platforms.twitter) { ... }

    // Close browser between platforms to save memory
    await closeBrowserForProfile(persona.profileDir).catch(() => {});

    // Facebook — reemplazo de Reddit (driver, reglas de Claude y tabla facebook_actions ya existían).
    // Busca posts públicos por término (grupos/feed de creadores ES+EN), da likes y comenta.
    if (FACEBOOK_AUTOMATION_ENABLED && persona.platforms.facebook) {
      try {
        console.log(`[persona-runner] ${persona.name} → Facebook`);
        await facebook.engageWithPosts({
          accountId: persona.id,
          cookieFile: persona.platforms.facebook.cookieFile,
          profileDir: persona.profileDir,
          commentGenerator: makeCommentGen('facebook'),
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Facebook error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Facebook', error: msg, at: new Date().toISOString() });
        await diagnose(err, { platform: 'facebook', account: persona.id, profileDir: persona.profileDir, action: 'engage' }).catch(() => {});
      }
      await closeBrowserForProfile(persona.profileDir).catch(() => {});
    }

    await closeBrowserForProfile(persona.profileDir).catch(() => {});

    // Bluesky — API oficial (AT Protocol), sin Puppeteer → riesgo de ban mínimo. Seguro de vida
    // contra otro wipe tipo Reddit. Credenciales (handle + app password) en bluesky-accounts.json.
    if (BLUESKY_AUTOMATION_ENABLED && bluesky) {
      try {
        console.log(`[persona-runner] ${persona.name} → Bluesky`);
        await bluesky.engageWithPosts({
          accountId: persona.id,
          persona,
          commentGenerator: makeCommentGen('bluesky'),
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Bluesky error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Bluesky', error: msg, at: new Date().toISOString() });
        await diagnose(err, { platform: 'bluesky', account: persona.id, action: 'engage' }).catch(() => {});
      }
    }

    console.log(`[persona-runner] ${persona.name} done`);
  }

  // Summary
  if (_errors.length > 0) {
    console.log(`[persona-runner] All personas complete — ${_errors.length} error(s) this run`);
  } else {
    console.log('[persona-runner] All personas complete — no errors');
  }
}

module.exports = { runAllPersonas, loadPersonas, getAndClearErrors };
