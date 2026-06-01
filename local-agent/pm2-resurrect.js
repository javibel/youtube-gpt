#!/usr/bin/env node
/**
 * PM2 Resurrect — ensures all 3 services are running.
 * Called by Windows Task Scheduler every 5 minutes.
 * If PM2 daemon crashed and processes are gone, restarts them from ecosystem.
 */
const { execSync } = require('child_process');
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

function main() {
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
