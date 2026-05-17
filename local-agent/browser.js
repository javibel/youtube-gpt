'use strict';

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const { diagnose } = require('./doctor');
const config = require('./config');

const CHROME_PROFILE_DIR = path.join(__dirname, 'chrome-profile');

// Map of profileDir -> browser instance (supports multiple simultaneous profiles)
const browsers = new Map();

async function launchBrowser(absDir) {
  // Remove stale lock/port files if exists (zombie Chrome)
  for (const lockName of ['SingletonLock', 'SingletonCookie', 'DevToolsActivePort', 'lockfile']) {
    const lockFile = path.join(absDir, lockName);
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch {}
      console.log(`[browser] Removed stale ${lockName} for ${absDir}`);
    }
  }

  const chromePath = config.get('browser', 'chromePath',
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');

  return puppeteerExtra.launch({
    headless: config.get('browser', 'headless', true),
    executablePath: chromePath,
    userDataDir: absDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: {
      width: config.get('browser', 'viewportWidth', 1280),
      height: config.get('browser', 'viewportHeight', 800),
    },
    protocolTimeout: config.get('browser', 'protocolTimeout', 60000),
  });
}

async function getBrowserForProfile(profileDir) {
  const absDir = path.resolve(__dirname, profileDir);
  let b = browsers.get(absDir);
  if (b && b.isConnected()) return b;

  try {
    b = await launchBrowser(absDir);
  } catch (err) {
    // Let the doctor diagnose and attempt a fix
    const result = await diagnose(err, {
      platform: 'browser',
      action: 'launch',
      profileDir,
    });

    if (result.healed) {
      // Doctor fixed something (e.g. renamed corrupt profile) — retry
      console.log(`[browser] Doctor healed: ${result.action} — retrying launch...`);
      try {
        b = await launchBrowser(absDir);
      } catch (retryErr) {
        console.error(`[browser] Retry after doctor fix also failed: ${retryErr.message}`);
        throw retryErr;
      }
    } else {
      throw err;
    }
  }

  browsers.set(absDir, b);
  return b;
}

async function closeBrowserForProfile(profileDir) {
  const absDir = path.resolve(__dirname, profileDir);
  const b = browsers.get(absDir);
  if (b) {
    await b.close().catch(() => {});
    browsers.delete(absDir);
  }
}

async function closeAllBrowsers() {
  for (const [dir, b] of browsers) {
    await b.close().catch(() => {});
  }
  browsers.clear();
}

// Create a new page with a realistic user-agent for a specific profile
async function newPageForProfile(profileDir) {
  const b = await getBrowserForProfile(profileDir);
  const p = await b.newPage();
  await p.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );
  return p;
}

// ── Legacy wrappers (brand account, backward-compatible) ──

async function getBrowser() {
  return getBrowserForProfile(CHROME_PROFILE_DIR);
}

async function closeBrowser() {
  return closeBrowserForProfile(CHROME_PROFILE_DIR);
}

async function newPage() {
  return newPageForProfile(CHROME_PROFILE_DIR);
}

// Seed cookies from a JSON file if the profile doesn't have a session for the given domain.
// Returns true if session was found or seeded successfully.
async function ensureSession(page, { domain, sessionCookieName, cookieFile }) {
  // Check cookies using the clean domain (strip leading dot)
  const cleanDomain = domain.startsWith('.') ? domain.slice(1) : domain;
  const existing = await page.cookies(`https://${cleanDomain}`);
  const hasSession = existing.some(c => c.name === sessionCookieName);

  if (hasSession) {
    console.log(`[browser] Session restored from profile for ${cleanDomain}`);
    return true;
  }

  const filePath = path.join(__dirname, cookieFile);
  if (!fs.existsSync(filePath)) {
    console.error(`[browser] No cookie file found: ${cookieFile}`);
    return false;
  }

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
    console.log(`[browser] Cookies seeded from ${cookieFile} (first run)`);
    return true;
  } catch (err) {
    console.error(`[browser] Failed to load ${cookieFile}:`, err.message);
    return false;
  }
}

// Save current browser cookies back to the JSON file so they stay fresh.
// Call this after confirming a session is active.
async function persistSession(page, { domain, cookieFile }) {
  try {
    // Fetch cookies from the domain and its parent (e.g. www.linkedin.com + linkedin.com)
    const cleanDomain = domain.startsWith('.') ? domain.slice(1) : domain;
    const urls = [`https://${cleanDomain}`];
    // Also fetch parent domain if it's a subdomain (www.linkedin.com → linkedin.com)
    const parts = cleanDomain.split('.');
    if (parts.length > 2) {
      urls.push(`https://${parts.slice(1).join('.')}`);
    }
    const allCookies = await page.cookies(...urls);
    // Deduplicate by name+domain
    const seen = new Set();
    const cookies = allCookies.filter(c => {
      const key = `${c.name}:${c.domain}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!cookies.length) return;

    // Convert to the same format as the exported JSON (Netscape-ish)
    const exported = cookies.map(c => ({
      domain: c.domain,
      expirationDate: c.expires > 0 ? c.expires : undefined,
      hostOnly: !c.domain.startsWith('.'),
      httpOnly: c.httpOnly,
      name: c.name,
      path: c.path,
      sameSite: c.sameSite === 'None' ? 'no_restriction'
              : c.sameSite === 'Lax' ? 'lax'
              : c.sameSite === 'Strict' ? 'strict'
              : null,
      secure: c.secure,
      session: !c.expires || c.expires < 0,
      storeId: null,
      value: c.value,
    }));

    const filePath = path.join(__dirname, cookieFile);
    fs.writeFileSync(filePath, JSON.stringify(exported, null, 4), 'utf8');
    console.log(`[browser] Cookies persisted back to ${cookieFile} (${exported.length} cookies)`);
  } catch (err) {
    console.error(`[browser] Failed to persist cookies to ${cookieFile}:`, err.message);
  }
}

module.exports = {
  // New multi-profile API
  getBrowserForProfile,
  closeBrowserForProfile,
  closeAllBrowsers,
  newPageForProfile,
  // Legacy (brand account)
  getBrowser,
  closeBrowser,
  newPage,
  ensureSession,
  persistSession,
};
