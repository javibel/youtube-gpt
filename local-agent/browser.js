'use strict';

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const { diagnose } = require('./doctor');
const config = require('./config');

const CHROME_PROFILE_DIR = path.join(__dirname, 'chrome-profile');
const COOKIE_BACKUP_DIR = path.join(__dirname, 'reports', 'cookie-backups');

// Map of profileDir -> browser instance (supports multiple simultaneous profiles)
const browsers = new Map();

// Track consecutive navigation failures per profile for auto-healing
const navFailures = new Map();

function recordNavFailure(profileDir) {
  const count = (navFailures.get(profileDir) || 0) + 1;
  navFailures.set(profileDir, count);
  return count;
}

function resetNavFailures(profileDir) {
  navFailures.set(profileDir, 0);
}

// ── Cookie backup & restore ─────────────────────────────────────────────
// Backs up Network/Cookies file after successful browser use.
// Restores from backup if profile is corrupted (missing Cookies file).

function backupCookies(absDir) {
  try {
    const cookieSrc = path.join(absDir, 'Default', 'Network', 'Cookies');
    if (!fs.existsSync(cookieSrc)) return;
    const size = fs.statSync(cookieSrc).size;
    if (size < 1024) return; // Skip tiny/empty cookie files
    if (!fs.existsSync(COOKIE_BACKUP_DIR)) fs.mkdirSync(COOKIE_BACKUP_DIR, { recursive: true });
    const profileName = path.basename(absDir);
    const dest = path.join(COOKIE_BACKUP_DIR, `${profileName}-Cookies.bak`);
    fs.copyFileSync(cookieSrc, dest);
  } catch (e) {
    // Silent — backup is best-effort
  }
}

function restoreCookiesIfMissing(absDir) {
  try {
    const cookieDest = path.join(absDir, 'Default', 'Network', 'Cookies');
    if (fs.existsSync(cookieDest)) return false; // Cookies exist, nothing to restore
    const profileName = path.basename(absDir);
    const backupSrc = path.join(COOKIE_BACKUP_DIR, `${profileName}-Cookies.bak`);
    if (!fs.existsSync(backupSrc)) return false; // No backup available
    // Ensure directory structure exists
    const networkDir = path.join(absDir, 'Default', 'Network');
    if (!fs.existsSync(networkDir)) fs.mkdirSync(networkDir, { recursive: true });
    fs.copyFileSync(backupSrc, cookieDest);
    console.log(`[browser] Restored cookies from backup for ${profileName}`);
    return true;
  } catch (e) {
    console.error(`[browser] Cookie restore failed: ${e.message}`);
    return false;
  }
}

// ── Deep profile cleanup (preserves cookies & login data) ───────────────
// Removes cache/GPU/shader/crash data that can corrupt a profile without
// affecting session cookies or saved passwords.

function deepCleanProfile(absDir) {
  const profileName = path.basename(absDir);
  console.log(`[browser] Deep-cleaning profile ${profileName}...`);
  let cleaned = 0;

  // Root-level junk
  const rootJunk = [
    'Crashpad', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache',
    'BrowserMetrics-spare.pma', 'CrashpadMetrics-active.pma',
    'component_crx_cache', 'extensions_crx_cache',
  ];
  for (const item of rootJunk) {
    const fp = path.join(absDir, item);
    if (fs.existsSync(fp)) {
      try {
        const stat = fs.statSync(fp);
        if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true });
        else fs.unlinkSync(fp);
        cleaned++;
      } catch {}
    }
  }

  // Default/ sub-directory caches
  const defaultDir = path.join(absDir, 'Default');
  if (fs.existsSync(defaultDir)) {
    const defaultJunk = [
      'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
      'Service Worker', 'blob_storage',
    ];
    for (const item of defaultJunk) {
      const fp = path.join(defaultDir, item);
      if (fs.existsSync(fp)) {
        try { fs.rmSync(fp, { recursive: true, force: true }); cleaned++; } catch {}
      }
    }
  }

  // Clean ALL leveldb LOCK files (stale locks crash Chrome on startup)
  try {
    const { execSync } = require('child_process');
    execSync(`powershell -Command "Get-ChildItem -Path '${absDir.replace(/'/g, "''")}' -Recurse -Filter 'LOCK' -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue"`, { timeout: 5000, stdio: 'pipe', windowsHide: true });
    cleaned++;
  } catch {}

  console.log(`[browser] Deep-clean done for ${profileName}: ${cleaned} items removed`);
  return cleaned > 0;
}

/**
 * Kill zombie Chrome processes that hold lockfiles.
 * Uses taskkill on Windows to kill chrome.exe instances tied to a profile dir.
 */
async function killZombieChromeForProfile(absDir) {
  const { execSync } = require('child_process');
  try {
    // On Windows, find chrome.exe processes whose command line includes the profile dir
    const cmd = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${absDir.replace(/\\/g, '\\\\')}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
    execSync(cmd, { timeout: 10000, stdio: 'pipe', windowsHide: true });
    console.log(`[browser] Killed zombie Chrome processes for ${path.basename(absDir)}`);
    // Brief wait for OS to release file handles
    await new Promise(r => setTimeout(r, 1000));
  } catch {
    // Fallback: if targeted kill fails, don't nuke all Chrome (user might have browser open)
    console.log(`[browser] No zombie Chrome found for ${path.basename(absDir)}`);
  }
}

function cleanLockFiles(absDir) {
  let lockBlocked = false;
  for (const lockName of ['SingletonLock', 'SingletonCookie', 'DevToolsActivePort', 'lockfile']) {
    const lockFile = path.join(absDir, lockName);
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch {
        lockBlocked = true;
      }
      console.log(`[browser] Removed stale ${lockName} for ${path.basename(absDir)}`);
    }
  }
  return lockBlocked;
}

async function launchBrowser(absDir, { deepClean = false } = {}) {
  // Step 0: Deep-clean if requested (second attempt after crash)
  if (deepClean) {
    deepCleanProfile(absDir);
    restoreCookiesIfMissing(absDir);
  }

  // Step 1: Remove stale lock/port files
  let lockBlocked = cleanLockFiles(absDir);

  // Step 2: If any lock couldn't be removed, a zombie Chrome holds it — kill and retry
  if (lockBlocked) {
    console.log(`[browser] Lock files held by zombie process — killing Chrome for ${path.basename(absDir)}`);
    await killZombieChromeForProfile(absDir);
    cleanLockFiles(absDir);
  }

  const chromePath = config.get('browser', 'chromePath',
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');

  return puppeteerExtra.launch({
    headless: config.get('browser', 'headless', true),
    executablePath: chromePath,
    userDataDir: absDir,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: {
      width: config.get('browser', 'viewportWidth', 1280),
      height: config.get('browser', 'viewportHeight', 800),
    },
    protocolTimeout: config.get('browser', 'protocolTimeout', 60000),
    ignoreDefaultArgs: ['--enable-automation'],
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
      // Doctor fixed something — retry with deep-clean to remove corrupt cache/locks
      console.log(`[browser] Doctor healed: ${result.action} — retrying with deep-clean...`);
      try {
        b = await launchBrowser(absDir, { deepClean: true });
      } catch (retryErr) {
        console.error(`[browser] Retry after deep-clean also failed: ${retryErr.message}`);
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
    // Backup cookies after clean shutdown
    backupCookies(absDir);
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
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

// ── Graceful shutdown ────────────────────────────────────────────────────
// Close all browsers cleanly when PM2 sends SIGINT/SIGTERM, preventing
// zombie Chrome processes and corrupt profiles.

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[browser] ${signal} received — closing all browsers gracefully...`);
  for (const [absDir, b] of browsers) {
    try {
      await b.close();
      backupCookies(absDir);
      console.log(`[browser] Closed ${path.basename(absDir)}`);
    } catch {}
  }
  browsers.clear();
  // Don't call process.exit — let the caller handle it
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('beforeExit', () => gracefulShutdown('beforeExit'));

// ── Periodic zombie reaper ──────────────────────────────────────────────
// Every 5 minutes, check for Chrome processes tied to our profiles that
// are NOT tracked in the browsers Map (= zombies from crashes).

const ZOMBIE_REAP_INTERVAL = 5 * 60 * 1000; // 5 min
let zombieReaperTimer = null;

function startZombieReaper() {
  if (zombieReaperTimer) return;
  zombieReaperTimer = setInterval(async () => {
    try {
      const { execSync } = require('child_process');
      // Get all chrome.exe PIDs using our profile dirs
      const output = execSync(
        `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('chrome-profiles') -or $_.CommandLine.Contains('chrome-profile')) -and $_.CommandLine.Contains('${__dirname.replace(/\\/g, '\\\\')}') } | Select-Object ProcessId, @{N='Profile';E={if($_.CommandLine -match 'user-data-dir=(.+?)( |$)'){$matches[1]}}} | ConvertTo-Json"`,
        { timeout: 10000, stdio: 'pipe', windowsHide: true }
      ).toString().trim();

      if (!output || output === '') return;
      let procs = JSON.parse(output);
      if (!Array.isArray(procs)) procs = [procs];

      // Which profile dirs do we actively track?
      const activeProfiles = new Set([...browsers.keys()].map(d => d.replace(/\\/g, '/')));

      for (const proc of procs) {
        if (!proc.Profile) continue;
        const normalizedProfile = proc.Profile.replace(/\\/g, '/').replace(/"/g, '');
        const isTracked = [...activeProfiles].some(ap => normalizedProfile.includes(ap) || ap.includes(normalizedProfile));
        if (!isTracked) {
          console.log(`[browser] Zombie reaper: killing orphan Chrome PID ${proc.ProcessId} (profile: ${path.basename(normalizedProfile)})`);
          try { execSync(`taskkill /F /PID ${proc.ProcessId}`, { timeout: 5000, stdio: 'pipe', windowsHide: true }); } catch {}
        }
      }
    } catch {
      // Silent — reaper is best-effort
    }
  }, ZOMBIE_REAP_INTERVAL);
  zombieReaperTimer.unref(); // Don't prevent Node.js from exiting
}

// Start the zombie reaper automatically
startZombieReaper();

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
  // Nav failure tracking (used by resilience.js for auto-healing)
  recordNavFailure,
  resetNavFailures,
  killZombieChromeForProfile,
  // Profile maintenance
  backupCookies,
  restoreCookiesIfMissing,
  deepCleanProfile,
};
