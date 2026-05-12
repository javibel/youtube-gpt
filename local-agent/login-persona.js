'use strict';

/**
 * Helper script to bootstrap a persona's session into a persistent Chrome profile.
 *
 * Fully automated after manual login:
 *   1. Opens headed Chrome with the persona's profile
 *   2. Seeds cookies if available
 *   3. If session invalid → shows login page for manual login
 *   4. Polls every 3s waiting for successful login (detects feed URL)
 *   5. On success: persists cookies to JSON, closes browser, cleans locks, verifies headless
 *
 * Usage:
 *   node login-persona.js persona-alex twitter
 *   node login-persona.js persona-ferran twitter
 *   node login-persona.js persona-alex facebook
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const { persistSession, newPageForProfile, closeBrowserForProfile } = require('./browser');

const PLATFORM_CONFIG = {
  linkedin: {
    loginUrl: 'https://www.linkedin.com/login',
    feedUrl: 'https://www.linkedin.com/feed/',
    feedCheck: '/feed',
    cookieDomain: '.www.linkedin.com',
    cookieName: 'li_at',
  },
  twitter: {
    loginUrl: 'https://x.com/i/flow/login',
    feedUrl: 'https://x.com/home',
    feedCheck: '/home',
    cookieDomain: '.x.com',
    cookieName: 'auth_token',
  },
  facebook: {
    loginUrl: 'https://www.facebook.com/login',
    feedUrl: 'https://www.facebook.com/',
    feedCheck: 'facebook.com',
    cookieDomain: '.facebook.com',
    cookieName: 'c_user',
  },
  reddit: {
    loginUrl: 'https://www.reddit.com/login',
    feedUrl: 'https://www.reddit.com/',
    feedCheck: 'reddit.com',
    cookieDomain: '.reddit.com',
    cookieName: 'reddit_session',
  },
};

const LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'DevToolsActivePort', 'lockfile'];

function cleanLocks(profileDir) {
  for (const lockName of LOCK_FILES) {
    const lockFile = path.join(profileDir, lockName);
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch {}
    }
  }
}

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

  // Step 0: Clean stale locks
  cleanLocks(profileDir);

  console.log(`\n=== Login: ${persona.name} (${personaId}) — ${platform} ===`);
  console.log(`Profile: ${profileDir}\n`);

  const chromePath = process.env.CHROME_PATH
    || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await puppeteerExtra.launch({
    headless: false,
    executablePath: chromePath,
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
    }
  }

  // Step 2: Navigate to feed — if cookies work, we're logged in
  console.log(`Navigating to ${platformCfg.feedUrl}...`);
  await page.goto(platformCfg.feedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  let loggedIn = page.url().includes(platformCfg.feedCheck);

  if (loggedIn) {
    console.log('\n>>> Session accepted from cookies!');
  } else {
    console.log('\n>>> Session expired. Log in manually in the browser window.');
    console.log('>>> Waiting for login... (checking every 3s)\n');

    // Poll until login is detected or browser is closed
    let disconnected = false;
    browser.on('disconnected', () => { disconnected = true; });

    for (let attempt = 0; attempt < 200 && !disconnected; attempt++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const currentUrl = page.url();
        if (currentUrl.includes(platformCfg.feedCheck)) {
          loggedIn = true;
          console.log('>>> Login detected!');
          break;
        }
      } catch {
        // Page might be navigating
      }
    }

    if (disconnected && !loggedIn) {
      console.error('\n✗ Browser closed before login completed. No changes saved.');
      process.exit(1);
    }
  }

  if (!loggedIn) {
    console.error('\n✗ Login not detected after timeout.');
    await browser.close().catch(() => {});
    process.exit(1);
  }

  // Step 3: Persist cookies to JSON backup
  console.log('\nSaving cookies...');
  if (cookieFile) {
    try {
      await persistSession(page, {
        domain: platformCfg.cookieDomain.replace(/^\./, ''),
        cookieFile,
      });
    } catch (err) {
      console.error(`Warning: Could not persist cookies to file: ${err.message}`);
    }
  }

  // Step 4: Close browser gracefully
  console.log('Closing browser...');
  await browser.close().catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // Step 5: Kill any remaining Chrome processes for this profile
  try {
    const { execSync } = require('child_process');
    execSync('powershell -Command "Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
  } catch {}
  await new Promise(r => setTimeout(r, 1000));

  // Step 6: Clean locks
  cleanLocks(profileDir);

  // Step 7: Verify headless session works
  console.log('\nVerifying headless session...');
  try {
    require('dotenv').config();
    const verifyPage = await newPageForProfile(persona.profileDir);

    // Seed cookies in headless too (in case Chrome profile didn't persist them)
    if (cookieFile) {
      const { ensureSession } = require('./browser');
      await ensureSession(verifyPage, {
        domain: platformCfg.cookieDomain.replace(/^\./, ''),
        sessionCookieName: platformCfg.cookieName,
        cookieFile,
      });
    }

    await verifyPage.goto(platformCfg.feedUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    const finalUrl = verifyPage.url();
    await verifyPage.close();
    await closeBrowserForProfile(persona.profileDir);

    if (finalUrl.includes(platformCfg.feedCheck)) {
      console.log(`\n✓ ${persona.name} — ${platform} session verified in headless. Ready to go.`);
    } else {
      console.log(`\n✗ Headless verification failed (redirected to ${finalUrl}).`);
      console.log('  The agent will attempt cookie seeding on next run.');
    }
  } catch (err) {
    console.error(`\n✗ Headless verification error: ${err.message}`);
    console.log('  The agent will attempt cookie seeding on next run.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
