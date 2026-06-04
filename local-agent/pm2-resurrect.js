#!/usr/bin/env node
/**
 * PM2 Resurrect — ensures all 3 services are running + wmic patch applied.
 * Called by Windows Task Scheduler every 5 minutes.
 * If PM2 daemon crashed and processes are gone, restarts them from ecosystem.
 * Also ensures the pidusage wmic→gwmi patch survives PM2 reinstalls.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ECOSYSTEM = path.join(__dirname, 'ecosystem.config.js');
const EXPECTED = ['ytubviral-agent', 'ytubviral-dashboard', 'ytubviral-tunnel'];

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    return e.stdout?.trim?.() ?? '';
  }
}

/**
 * PM2's pidusage uses wmic.exe which is deprecated on Windows 11.
 * wmic crashes with exit code 0xC0000142 (DLL_INIT_FAILED), killing the PM2 daemon.
 * This patch forces the gwmi (PowerShell) backend instead.
 * Must be re-applied after every `npm install -g pm2`.
 */
function ensureWmicPatch() {
  // Find pidusage stats.js inside PM2's global install
  const npmGlobal = run('npm root -g');
  const statsPath = path.join(npmGlobal, 'pm2', 'node_modules', 'pidusage', 'lib', 'stats.js');

  if (!fs.existsSync(statsPath)) return;

  const content = fs.readFileSync(statsPath, 'utf8');

  // Already patched
  if (content.includes('Force gwmi (PowerShell) backend')) return;

  // Apply patch: replace the wmic spawn check with direct gwmi usage
  const original = `  if (platform === 'win') {
    // TODO: use https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where to avoid try/catch
    let child;
    try {
      child = spawn('wmic', function (err) {
        if (err) throw new Error(err)
      })
    } catch (err) {
      fn = requireMap.gwmi()
    } finally {
      if (child) {
        child.kill()
      }
    }
  }`;

  const patched = `  if (platform === 'win') {
    // Force gwmi (PowerShell) backend — wmic is deprecated on Windows 11
    // and crashes the PM2 daemon with exit code 0xC0000142 (DLL_INIT_FAILED)
    fn = requireMap.gwmi()
  }`;

  if (content.includes(original)) {
    fs.writeFileSync(statsPath, content.replace(original, patched), 'utf8');
    const ts = new Date().toISOString();
    console.log(`[${ts}] PM2 resurrect: re-applied wmic→gwmi patch to ${statsPath}`);
  }
}

function main() {
  // Ensure the wmic patch is applied (survives npm install -g pm2)
  ensureWmicPatch();

  const list = run('pm2 jlist');
  let processes = [];
  try { processes = JSON.parse(list); } catch { processes = []; }

  const running = processes
    .filter(p => p.pm2_env?.status === 'online')
    .map(p => p.name);

  const missing = EXPECTED.filter(name => !running.includes(name));

  if (missing.length === 0) return; // all good

  const ts = new Date().toISOString();
  console.log(`[${ts}] PM2 resurrect: missing ${missing.join(', ')} — restarting from ecosystem`);

  // If all 3 are missing, daemon probably crashed — start fresh from ecosystem
  if (missing.length === EXPECTED.length) {
    run(`pm2 start "${ECOSYSTEM}"`);
  } else {
    // Only some missing — restart individually
    for (const name of missing) {
      run(`pm2 restart ${name}`);
    }
  }

  run('pm2 save');
  console.log(`[${new Date().toISOString()}] PM2 resurrect: done`);
}

main();
