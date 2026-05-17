'use strict';

/**
 * Dashboard Server — Admin panel for YTubViral Agent System
 *
 * Serves the interactive architecture dashboard and exposes a REST API
 * for reading/writing agent configuration. Agents read from agent-config.json
 * on each execution tick.
 *
 * Endpoints:
 *   GET  /api/config              — all config
 *   GET  /api/config/:module      — config for a specific module
 *   PUT  /api/config/:module      — update config for a module
 *   DELETE /api/config/:module    — reset module to defaults
 *   GET  /api/logs/:module        — recent logs for a module
 *   GET  /api/status              — live system status
 *
 * Run: node dashboard-server.js
 * Access: http://localhost:3456
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DASHBOARD_PORT || '3456');
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';
const CONFIG_FILE = path.join(__dirname, 'agent-config.json');
const LOGS_DIR = path.join(__dirname, 'logs');
const REPORTS_DIR = path.join(__dirname, 'reports');

// ── Default configuration ─────────────────────────────────────────────────

const DEFAULTS = {
  scheduler: {
    sentinelInterval: 5,
    gmailInterval: 30,
    reportTime: '08:05',
    personaMorning: '09:00-10:59',
    personaEvening: '22:00-22:59',
    followupMorning: '10:00-11:59',
    followupEvening: '17:00-18:59',
    cleanupTime: '02:00',
    guardianTime: '02:15',
    scoutTime: '02:30',
    watchdogTime: '02:45',
    optimizerTime: '03:00',
    managerTime: '03:15',
  },
  sentinel: {
    siteUrl: 'https://ytubviral.com',
    timeoutMs: 20000,
    slowThresholdMs: 5000,
    confirmRetries: 3,
    confirmDelayMs: 10000,
    ownerEmail: 'javijimenoplata@gmail.com',
  },
  'api-guard': {
    maxTokensPerCall: 2000,
    maxInputChars: 15000,
    dailyBudgetTokens: 100000,
    maxCallsPerMinute: 10,
    timeoutMs: 30000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 300000,
  },
  claude: {
    model: 'claude-haiku-4-5-20251001',
    maxTokensTwitter: 150,
    maxTokensReddit: 200,
    maxCharsTwitter: 300,
    maxCharsReddit: 800,
  },
  humanize: {
    skipSessionProbability: 0.15,
    skipPostProbability: 0.25,
    readingPauseMin: 5,
    readingPauseMax: 15,
    actionPauseMin: 3,
    actionPauseMax: 8,
    commentPauseMin: 15,
    commentPauseMax: 40,
    dailyLimitVariance: 40,
  },
  'persona-runner': {
    model: 'claude-haiku-4-5-20251001',
    maxTweetsPerSession: 10,
    maxRedditPerSession: 5,
  },
  followup: {
    model: 'claude-haiku-4-5-20251001',
    twitterLimit: 4,
    redditLimit: 4,
    daysBack: 14,
    fuzzyMatchThreshold: 0.4,
  },
  'meta-agent': {
    fbRandomDelayMax: 12,
    fbRetryDelayMax: 15,
    igPollInterval: 3000,
    igMaxPollAttempts: 10,
    duplicateCheck: true,
    fallbackImage: '/social-images/default.jpg',
  },
  'linkedin-agent': {
    imageFolders: ['javier', 'oficina'],
    rotationDays: 30,
  },
  browser: {
    chromePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 800,
    protocolTimeout: 60000,
    stealthPlugin: true,
  },
  guardian: {
    model: 'claude-haiku-4-5-20251001',
    webDir: '../youtube-gpt',
    timeoutMs: 60000,
    dangerousPatterns: ['eval(', 'innerHTML', 'dangerouslySetInnerHTML', 'AKIA[0-9A-Z]'],
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    useAI: true,
    alertEmail: 'javijimenoplata@gmail.com',
  },
  gmail: {
    model: 'claude-haiku-4-5-20251001',
    agentEmail: 'ytbeviral@gmail.com',
    ownerEmail: 'javijimenoplata@gmail.com',
    activeHours: '8-23',
  },
  scout: {
    model: 'claude-haiku-4-5-20251001',
  },
  watchdog: {
    model: 'claude-haiku-4-5-20251001',
  },
  'social-optimizer': {
    model: 'claude-haiku-4-5-20251001',
  },
  manager: {
    model: 'claude-sonnet-4-6',
  },
  personas: {
    alex: {
      name: 'Alex Sastre',
      age: 26,
      city: 'Valencia',
      job: 'Editor de video freelance',
      platforms: 'Twitter, Reddit',
      mentionRate: 0.25,
    },
    ferran: {
      name: 'Ferran Gómez',
      age: 33,
      city: 'Barcelona',
      job: 'Consultor marketing digital',
      platforms: 'Twitter, Reddit',
      mentionRate: 0.20,
    },
  },
};

// ── Config file management ────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[dashboard] Error reading config:', err.message);
  }
  return { ...DEFAULTS };
}

function saveConfigFile(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Initialize config file if it doesn't exist
if (!fs.existsSync(CONFIG_FILE)) {
  saveConfigFile(DEFAULTS);
  console.log('[dashboard] Created agent-config.json with defaults');
}

// ── Logs reader ───────────────────────────────────────────────────────────

function getRecentLogs(module, lines = 50) {
  // Check for daily log files
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const files = [
    path.join(LOGS_DIR, `${module}-${today}.json`),
    path.join(LOGS_DIR, `${module}-${today}.log`),
    path.join(REPORTS_DIR, `${module}-${today}.json`),
    path.join(LOGS_DIR, `${module}-${yesterday}.json`),
    path.join(REPORTS_DIR, `${module}-${yesterday}.json`),
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        return { file: path.basename(file), content: content.slice(-10000) };
      } catch { continue; }
    }
  }
  return { file: null, content: 'No logs found for this module.' };
}

// ── Anthropic balance ──────────────────────────────────────────────────────

async function fetchAnthropicBalance() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY not set' };

  try {
    // Anthropic Admin API — organization billing
    const res = await fetch('https://api.anthropic.com/v1/messages/batch', {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    // If we get 401/403 it means key works but no access; if 200/404 key is valid
    // The real balance comes from the admin console, so we store it manually
    // but we can verify the key is alive
    const keyValid = res.status !== 401;

    // Read stored balance from config
    const config = loadConfig();
    const balance = config._anthropicBalance || { amount: null, lastChecked: null };
    balance.keyValid = keyValid;
    return balance;
  } catch (err) {
    const config = loadConfig();
    return config._anthropicBalance || { amount: null, lastChecked: null, error: err.message };
  }
}

// ── System status ─────────────────────────────────────────────────────────

function getSystemStatus() {
  const config = loadConfig();
  const now = new Date();

  // Check PM2 process
  let pm2Status = 'unknown';
  try {
    const { execSync } = require('child_process');
    const output = execSync('pm2 jlist', { encoding: 'utf8', timeout: 5000 });
    const processes = JSON.parse(output);
    const agent = processes.find(p => p.name === 'ytubviral-agent' || p.name === 'local-agent');
    pm2Status = agent ? agent.pm2_env.status : 'not found';
  } catch { pm2Status = 'pm2 not available'; }

  // Check recent reports
  const reports = [];
  if (fs.existsSync(REPORTS_DIR)) {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .slice(-5);
    for (const f of files) {
      reports.push({ name: f, date: f.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '' });
    }
  }

  return {
    timestamp: now.toISOString(),
    pm2Status,
    configLastModified: fs.existsSync(CONFIG_FILE)
      ? fs.statSync(CONFIG_FILE).mtime.toISOString()
      : null,
    recentReports: reports,
    uptime: process.uptime(),
  };
}

// ── HTTP Server (no Express needed) ───────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) reject(new Error('Too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const LOGIN_PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Login</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:2rem;width:340px;text-align:center}
h2{margin-bottom:1.5rem;font-size:1.1rem;font-weight:600}
input{width:100%;padding:0.7rem;background:#09090b;border:1px solid #3f3f46;border-radius:8px;color:#fafafa;font-size:0.9rem;margin-bottom:1rem}
input:focus{outline:none;border-color:#3b82f6}
button{width:100%;padding:0.7rem;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer}
button:hover{background:#2563eb}.err{color:#ef4444;font-size:0.8rem;margin-bottom:0.5rem}
</style></head><body><div class="card"><h2>YTubViral Dashboard</h2>
<form method="POST" action="/login"><input name="token" type="password" placeholder="Token de acceso" autofocus>
<div class="err" id="err"></div><button type="submit">Entrar</button></form>
<script>if(location.search.includes('err=1'))document.getElementById('err').textContent='Token incorrecto'</script>
</div></body></html>`;

function checkAuth(req, url) {
  if (!DASHBOARD_TOKEN) return true; // No token configured = no auth
  // Check cookie
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith('dash_token='));
  if (authCookie && authCookie.split('=')[1] === DASHBOARD_TOKEN) return true;
  // Check query param (for API calls)
  if (url.searchParams.get('token') === DASHBOARD_TOKEN) return true;
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Login flow
  if (DASHBOARD_TOKEN) {
    if (pathname === '/login' && req.method === 'POST') {
      const body = await new Promise(resolve => {
        let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d));
      });
      const token = new URLSearchParams(body).get('token');
      if (token === DASHBOARD_TOKEN) {
        res.writeHead(302, {
          'Set-Cookie': `dash_token=${DASHBOARD_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
          Location: '/',
        });
        return res.end();
      }
      res.writeHead(302, { Location: '/login?err=1' });
      return res.end();
    }
    if (pathname === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(LOGIN_PAGE);
    }
    if (!checkAuth(req, url)) {
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
  }

  // Static files
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(res, path.join(__dirname, 'architecture-diagram.html'), 'text/html; charset=utf-8');
  }

  // API Routes
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, loadConfig());
  }

  if (pathname === '/api/defaults' && req.method === 'GET') {
    return sendJSON(res, 200, DEFAULTS);
  }

  const configMatch = pathname.match(/^\/api\/config\/(.+)$/);
  if (configMatch) {
    const module = configMatch[1];

    if (req.method === 'GET') {
      const config = loadConfig();
      return sendJSON(res, 200, config[module] || {});
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const config = loadConfig();
      config[module] = { ...(config[module] || {}), ...body };
      config._lastModified = new Date().toISOString();
      config._lastModifiedBy = 'dashboard';
      saveConfigFile(config);
      return sendJSON(res, 200, { success: true, module, config: config[module] });
    }

    if (req.method === 'DELETE') {
      const config = loadConfig();
      config[module] = DEFAULTS[module] || {};
      config._lastModified = new Date().toISOString();
      saveConfigFile(config);
      return sendJSON(res, 200, { success: true, module, reset: true });
    }
  }

  if (pathname === '/api/status' && req.method === 'GET') {
    return sendJSON(res, 200, getSystemStatus());
  }

  // Anthropic balance
  if (pathname === '/api/balance' && req.method === 'GET') {
    const balance = await fetchAnthropicBalance();
    return sendJSON(res, 200, balance);
  }

  if (pathname === '/api/balance' && req.method === 'PUT') {
    const body = await parseBody(req);
    const config = loadConfig();
    config._anthropicBalance = {
      amount: parseFloat(body.amount) || 0,
      currency: body.currency || 'USD',
      lastChecked: new Date().toISOString(),
    };
    saveConfigFile(config);
    return sendJSON(res, 200, { success: true, balance: config._anthropicBalance });
  }

  const logsMatch = pathname.match(/^\/api\/logs\/(.+)$/);
  if (logsMatch && req.method === 'GET') {
    return sendJSON(res, 200, getRecentLogs(logsMatch[1]));
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[dashboard] YTubViral Agent Dashboard running at http://localhost:${PORT}`);
  console.log(`[dashboard] Config file: ${CONFIG_FILE}`);
});
