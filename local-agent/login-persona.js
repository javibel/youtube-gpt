'use strict';

/**
 * Helper script to bootstrap a persona's LinkedIn session into a persistent Chrome profile.
 *
 * Strategy: seed cookies from the JSON file into a HEADED browser, navigate to LinkedIn feed.
 * If LinkedIn accepts the session, the Chrome profile adopts it natively — no more cookie seeding needed.
 * If it doesn't work, the browser stays open for manual login.
 *
 * Usage:
 *   node login-persona.js persona-alex linkedin
 *   node login-persona.js persona-ferran linkedin
 *   node login-persona.js persona-alex facebook
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

const PLATFORM_CONFIG = {
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    feedUrl: 'https://www.linkedin.com/feed/',
    feedCheck: '/feed',
    cookieDomain: '.www.linkedin.com',
  },
  twitter: {
    loginUrl: 'https://x.com/i/flow/login',
    feedUrl: 'https://x.com/home',
    feedCheck: '/home',
    cookieDomain: '.x.com',
  },
  facebook: {
    loginUrl: 'https://www.facebook.com/login',
    feedUrl: 'https://www.facebook.com/',
    feedCheck: 'facebook.com',
    cookieDomain: '.facebook.com',
  },
  reddit: {
    loginUrl: 'https://www.reddit.com/login',
    feedUrl: 'https://www.reddit.com/',
    feedCheck: 'reddit.com',
    cookieDomain: '.reddit.com',
  },
};

async function main() {
  const personaId = process.argv[2];
  const platform = process.argv[3] || 'linkedin';

  if (!personaId) {
    console.error('Usage: node login-persona.js <persona-id> [platform]');
    console.error('  persona-id: persona-alex | persona-ferran');
    console.error('  platform:   linkedin | twitter | facebook | reddit');
    process.exit(1);
  }

  const personas = JSON.parse(fs.readFileSync(path.join(__dirname, 'personas.json'), 'utf8'));
  const persona = personas.find(p => p.id === personaId);
  if (!persona) {
    console.error(`Persona "${personaId}" not found. Available: ${personas.map(p => p.id).join(', ')}`);
    process.exit(1);
  }

  const platformCfg = PLATFORM_CONFIG[platform];
  if (!platformCfg) {
    console.error(`Unknown platform "${platform}". Available: ${Object.keys(PLATFORM_CONFIG).join(', ')}`);
    process.exit(1);
  }

  const platformData = persona.platforms[platform];
  const cookieFile = platformData?.cookieFile;

  const profileDir = path.resolve(__dirname, persona.profileDir);

  // Remove stale lock file
  const lockFile = path.join(profileDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch {}
    console.log('Removed stale SingletonLock');
  }

  console.log(`Opening HEADED browser for ${persona.name} (${personaId}) — ${platform}`);
  console.log(`Profile: ${profileDir}`);

  const browser = await puppeteerExtra.launch({
    headless: false,
    userDataDir: profileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );

  // Step 1: Seed cookies from JSON file into this profile
  if (cookieFile) {
    const filePath = path.join(__dirname, cookieFile);
    if (fs.existsSync(filePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const cleaned = cookies
          .filter(c => !c.session)
          .map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
            path: c.path,
            expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite === 'no_restriction' ? 'None'
                    : c.sameSite === 'lax' ? 'Lax'
                    : c.sameSite === 'strict' ? 'Strict'
                    : 'None',
          }));
        await page.setCookie(...cleaned);
        console.log(`Seeded ${cleaned.length} cookies from ${cookieFile}`);
      } catch (err) {
        console.error(`Failed to seed cookies: ${err.message}`);
      }
    } else {
      console.log(`No cookie file found at ${cookieFile} — skipping seed`);
    }
  }

  // Step 2: Navigate to feed — if cookies work, we're logged in
  console.log(`Navigating to ${platformCfg.feedUrl}...`);
  await page.goto(platformCfg.feedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  if (url.includes(platformCfg.feedCheck)) {
    console.log('');
    console.log('>>> SESSION ACTIVE! You are logged in.');
    console.log('>>> Close the browser to save the session to the Chrome profile.');
    console.log('');
  } else {
    console.log('');
    console.log('>>> Cookie session was not accepted. You are on:', url);
    console.log('>>> Log in MANUALLY in the browser window, then close it.');
    console.log('');
  }

  // Wait for browser to close
  await new Promise(resolve => {
    browser.on('disconnected', resolve);
  });

  console.log('Browser closed. Session saved in Chrome profile.');
  console.log(`The agent will use this persistent session for ${persona.name}'s ${platform}.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
