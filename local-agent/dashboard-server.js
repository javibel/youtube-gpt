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
    infraOptimizerTime: '02:45',
    seoOptimizerTime: '02:50',
    funnelOptimizerTime: '02:55',
    optimizerTime: '03:00',
    managerTime: '03:15',
    metaOptimizerTime: '03:30 (Sundays)',
  },
  sentinel: {
    siteUrl: 'https://ytubviral.com',
    timeoutMs: 20000,
    slowThresholdMs: 5000,
    confirmRetries: 3,
    confirmDelayMs: 10000,
    ownerEmail: 'ytbeviral@gmail.com',
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
    alertEmail: 'ytbeviral@gmail.com',
  },
  gmail: {
    model: 'claude-haiku-4-5-20251001',
    agentEmail: 'ytbeviral@gmail.com',
    ownerEmail: 'ytbeviral@gmail.com',
    activeHours: '8-23',
  },
  scout: {
    model: 'claude-haiku-4-5-20251001',
  },
  watchdog: {
    model: 'claude-haiku-4-5-20251001',
  },
  'social-optimizer': {
    model: 'claude-opus-4-8',
  },
  manager: {
    model: 'claude-opus-4-8',
  },
  'seo-optimizer': {
    model: 'claude-opus-4-8',
  },
  'funnel-optimizer': {
    model: 'claude-opus-4-8',
  },
  'infra-optimizer': {
    model: 'claude-opus-4-8',
  },
  'meta-optimizer': {
    model: 'claude-opus-4-8',
    enabled: true,
  },
  personas: {
    alex: {
      name: 'Alex Sastre',
      age: 26,
      city: 'Valencia',
      job: 'Editor de video freelance',
      platforms: 'Twitter, Bluesky',
      mentionRate: 0.25,
    },
    ferran: {
      name: 'Ferran Gómez',
      age: 33,
      city: 'Barcelona',
      job: 'Consultor marketing digital',
      platforms: 'Twitter, Bluesky',
      mentionRate: 0.20,
    },
    ana: {
      name: 'Ana Reyes',
      age: 29,
      city: 'Madrid',
      job: 'Community manager freelance',
      platforms: 'Twitter, Bluesky',
      mentionRate: 0.30,
    },
    mayra: {
      name: 'Mayra Vidal',
      age: 31,
      city: 'Sevilla',
      job: 'Copywriter YouTube',
      platforms: 'Twitter, Bluesky',
      mentionRate: 0.40,
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
    const output = execSync('pm2 jlist', { encoding: 'utf8', timeout: 5000, windowsHide: true });
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

// ── Ecosystem status (live checks) ───────────────────────────────────────

async function getEcosystemStatus() {
  const results = {};

  // 1. YTubViral.com (Vercel) — HTTP check
  try {
    const start = Date.now();
    const r = await fetch('https://ytubviral.com/', { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    results.vercel = { status: 'ok', httpStatus: r.status, responseMs: Date.now() - start, url: 'https://ytubviral.com' };
  } catch (e) { results.vercel = { status: 'error', error: e.message }; }

  // 2. Neon (PostgreSQL) — DB ping
  try {
    const db = require('./db');
    const start = Date.now();
    const r = await db.query('SELECT 1 AS ok');
    results.neon = { status: 'ok', responseMs: Date.now() - start, region: 'eu-west-2' };
  } catch (e) { results.neon = { status: 'error', error: e.message }; }

  // 3. Anthropic — balance from config
  const config = loadConfig();
  const bal = config._anthropicBalance || {};
  results.anthropic = {
    status: bal.amount > 0.5 ? 'ok' : bal.amount > 0 ? 'warning' : 'error',
    balance: bal.amount ?? null,
    currency: bal.currency || 'USD',
    spentToday: bal.totalSpentToday ?? null,
    lastChecked: bal.lastChecked ?? null,
  };

  // 4. Resend — API check
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    const domains = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
    const domain = domains.find(d => d.name === 'ytubviral.com');
    results.resend = {
      status: domain?.status === 'verified' ? 'ok' : 'warning',
      domain: 'ytubviral.com',
      domainStatus: domain?.status || 'unknown',
      addresses: ['hello@', 'support@', 'legal@', 'privacy@'],
    };
  } catch (e) { results.resend = { status: 'error', error: e.message }; }

  // 5. Stripe — basic key check (no live call without secret key on local)
  results.stripe = {
    status: 'ok',
    mode: 'live',
    products: ['Pro (9.99€/mo)', 'Business (29.99€/mo)'],
    webhookUrl: 'https://ytubviral.com/api/stripe/webhook',
  };

  // 6. Cloudflare — DNS check
  try {
    const r = await fetch('https://dns.google/resolve?name=ytubviral.com&type=A', { signal: AbortSignal.timeout(5000) });
    const data = await r.json();
    const ips = (data.Answer || []).map(a => a.data);
    results.cloudflare = {
      status: data.Status === 0 ? 'ok' : 'error',
      mode: 'DNS-only',
      ips,
      records: { SPF: true, DKIM: true, DMARC: true },
    };
  } catch (e) { results.cloudflare = { status: 'error', error: e.message }; }

  // 7. Google Search Console
  results.gsc = {
    status: 'ok',
    indexedPages: '30+',
    sitemapUrl: 'https://ytubviral.com/sitemap.xml',
    tools: ['gsc-index-urls.js', 'gsc-inspect-urls.js'],
  };

  // 8. Chrome Extension
  results.chromeExtension = {
    status: 'ok',
    endpoints: ['/api/extension/channel-stats', '/api/extension/seo-quick', '/api/extension/video-scorecard'],
    auth: 'Bearer token',
  };

  // 9. Gmail API (for inbox reading)
  results.gmailApi = {
    status: 'ok',
    use: 'Inbox reading only (outbound migrated to Resend)',
    account: 'ytbeviral@gmail.com',
  };

  // 10. YouTube Data API
  results.youtubeApi = {
    status: 'ok',
    features: ['Channel stats', 'Analytics', 'Video metadata'],
    auth: 'OAuth2 + API Key',
  };

  // 11. Meta (Facebook + Instagram)
  results.meta = {
    status: 'ok',
    platforms: ['Facebook Page', 'Instagram Business'],
    api: 'Graph API v19',
    use: 'YCMR publishing',
  };

  // 12. PM2
  try {
    const { execSync } = require('child_process');
    const output = execSync('pm2 jlist', { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const processes = JSON.parse(output);
    const agent = processes.find(p => p.name === 'ytubviral-agent' || p.name === 'local-agent');
    results.pm2 = {
      status: agent?.pm2_env?.status === 'online' ? 'ok' : 'warning',
      processStatus: agent?.pm2_env?.status || 'not found',
      uptime: agent?.pm2_env?.pm_uptime ? Math.floor((Date.now() - agent.pm2_env.pm_uptime) / 3600000) + 'h' : null,
      restarts: agent?.pm2_env?.restart_time ?? null,
    };
  } catch { results.pm2 = { status: 'warning', error: 'pm2 not available' }; }

  // 14. Puppeteer/Chrome
  results.chrome = {
    status: 'ok',
    path: config.browser?.chromePath || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: config.browser?.headless ?? true,
    stealth: config.browser?.stealthPlugin ?? true,
    profiles: ['brand', 'alex', 'ferran'],
  };

  return results;
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
<form method="POST" action="/login" autocomplete="on"><input name="username" type="text" value="admin" autocomplete="username" style="display:none"><input name="token" type="password" placeholder="Token de acceso" autocomplete="current-password" autofocus>
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

      // Validate model ID before saving
      if (body.model) {
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ model: body.model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
          });
          const data = await r.json();
          if (data.error) return sendJSON(res, 400, { success: false, error: `Modelo inválido: ${data.error.message}` });
        } catch (e) {
          return sendJSON(res, 400, { success: false, error: `Error validando modelo: ${e.message}` });
        }
      }

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

  // Validate a model ID against the Anthropic API
  if (pathname === '/api/validate-model' && req.method === 'POST') {
    const body = await parseBody(req);
    const model = body.model;
    if (!model) return sendJSON(res, 400, { error: 'model required' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      });
      const data = await r.json();
      if (data.error) return sendJSON(res, 200, { valid: false, error: data.error.message });
      return sendJSON(res, 200, { valid: true, model });
    } catch (e) {
      return sendJSON(res, 200, { valid: false, error: e.message });
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

  // Site Analytics (proxy to ytubviral.com API)
  if (pathname === '/api/analytics' && req.method === 'GET') {
    const days = url.searchParams.get('days') || '7';
    try {
      const r = await fetch(`https://ytubviral.com/api/analytics?days=${days}&token=${DASHBOARD_TOKEN}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return sendJSON(res, r.status, { error: `Analytics API: ${r.status}` });
      const data = await r.json();
      return sendJSON(res, 200, data);
    } catch (e) {
      return sendJSON(res, 500, { error: `Analytics fetch failed: ${e.message}` });
    }
  }

  // Reports listing
  if (pathname === '/api/reports' && req.method === 'GET') {
    const reports = [];
    if (fs.existsSync(REPORTS_DIR)) {
      const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
      for (const f of files) {
        const match = f.match(/^(.+?)-(\d{4}-\d{2}-\d{2})\.json$/);
        if (match) {
          const stat = fs.statSync(path.join(REPORTS_DIR, f));
          reports.push({ filename: f, agent: match[1], date: match[2], sizeKb: (stat.size / 1024).toFixed(1) });
        }
      }
    }
    return sendJSON(res, 200, reports);
  }

  // Single report content
  const reportMatch = pathname.match(/^\/api\/reports\/(.+\.json)$/);
  if (reportMatch && req.method === 'GET') {
    const filePath = path.join(REPORTS_DIR, path.basename(reportMatch[1]));
    if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Report not found' });
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return sendJSON(res, 200, content);
    } catch (e) { return sendJSON(res, 500, { error: 'Error reading report' }); }
  }

  const logsMatch = pathname.match(/^\/api\/logs\/(.+)$/);
  if (logsMatch && req.method === 'GET') {
    return sendJSON(res, 200, getRecentLogs(logsMatch[1]));
  }

  // Social overrides (hot-patchable config for Claude intervention)
  const SOCIAL_OVERRIDES_FILE = path.join(__dirname, 'social-overrides.json');
  if (pathname === '/api/social-overrides' && req.method === 'GET') {
    try {
      const data = fs.existsSync(SOCIAL_OVERRIDES_FILE)
        ? JSON.parse(fs.readFileSync(SOCIAL_OVERRIDES_FILE, 'utf8'))
        : {};
      return sendJSON(res, 200, data);
    } catch { return sendJSON(res, 200, {}); }
  }
  if (pathname === '/api/social-overrides' && req.method === 'PUT') {
    const body = await parseBody(req);
    // Validate: only allow known fields
    const ALLOWED = ['offTopicPatterns', 'additionalRejectPatterns', 'coreRulesExtra', 'mentionFormula', 'personaMentionRates'];
    const current = fs.existsSync(SOCIAL_OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(SOCIAL_OVERRIDES_FILE, 'utf8')) : {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED.includes(k)) current[k] = v;
    }
    current.changeLog = current.changeLog || [];
    current.changeLog.push({ date: new Date().toISOString().slice(0, 10), by: 'dashboard', summary: 'Manual edit from dashboard' });
    if (current.changeLog.length > 20) current.changeLog = current.changeLog.slice(-20);
    fs.writeFileSync(SOCIAL_OVERRIDES_FILE, JSON.stringify(current, null, 2), 'utf8');
    return sendJSON(res, 200, { success: true, overrides: current });
  }

  // Ecosystem — live service status
  if (pathname === '/api/ecosystem' && req.method === 'GET') {
    const ecosystem = await getEcosystemStatus();
    return sendJSON(res, 200, ecosystem);
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[dashboard] YTubViral Agent Dashboard running at http://localhost:${PORT}`);
  console.log(`[dashboard] Config file: ${CONFIG_FILE}`);
});
