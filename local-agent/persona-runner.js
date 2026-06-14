'use strict';

const fs = require('fs');
const path = require('path');
const { closeBrowserForProfile } = require('./browser');
const { generatePersonaComment } = require('./claude');

const twitter = require('./twitter');
const reddit = require('./reddit');
const facebook = require('./facebook');
const { diagnose } = require('./doctor');

// Canales de personas. Reddit ABANDONADO (cuentas shadowbanned). Facebook + Bluesky son los
// reemplazos (Javier's call 2026-06-14). Cada canal arranca en false hasta que las cuentas de
// las personas estén creadas y con sesión iniciada — así el runner no intenta postear desde
// sesiones inexistentes ni rompe el proceso vivo. Poner a true cuando estén listas.
const REDDIT_AUTOMATION_ENABLED = false;
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

    // Build comment generator bound to this persona
    const makeCommentGen = (platform) => {
      return (authorName, postContent) => generatePersonaComment(persona, platform, authorName, postContent);
    };

    // Twitter
    if (persona.platforms.twitter) {
      const cfg = persona.platforms.twitter;
      try {
        console.log(`[persona-runner] ${persona.name} → Twitter`);
        await twitter.engageWithTweets({
          accountId: persona.id,
          cookieFile: cfg.cookieFile,
          profileDir: persona.profileDir,
          commentGenerator: makeCommentGen('twitter'),
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Twitter error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Twitter', error: msg, at: new Date().toISOString() });
        await diagnose(err, { platform: 'twitter', account: persona.id, profileDir: persona.profileDir, action: 'engage' }).catch(() => {});
      }
    }

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

    // Reddit
    // ABANDONED 2026-06-14 (Javier's call): the persona Reddit accounts are shadowbanned
    // (u/Javi_Mart, u/AdNearby3690 confirmed; profiles 404 to logged-out) — their comments are
    // invisible to everyone, so Reddit automation produced 0 real reach for weeks. Puppeteer
    // automation + self-promo from dedicated accounts is exactly what Reddit shadowbans. Channel
    // disabled. Twitter (verified alive) + email outreach + SEO are the live channels.
    // To re-enable on healthy accounts: set REDDIT_AUTOMATION_ENABLED = true (módulo arriba).
    if (REDDIT_AUTOMATION_ENABLED && persona.platforms.reddit) {
      try {
        console.log(`[persona-runner] ${persona.name} → Reddit`);
        const founderKarmaMode = persona.mentionYtubviral === false;
        await reddit.engageWithPosts({
          accountId: persona.id,
          cookieFile: persona.platforms.reddit.cookieFile,
          profileDir: persona.profileDir,
          persona,
          ...(founderKarmaMode ? { commentChance: { question: 0.95, other: 0.6 } } : {}),
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Reddit error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Reddit', error: msg, at: new Date().toISOString() });
        await diagnose(err, { platform: 'reddit', account: persona.id, profileDir: persona.profileDir, action: 'engage' }).catch(() => {});
      }
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
