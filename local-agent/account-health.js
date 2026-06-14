'use strict';

/**
 * Account health — detects suspended / shadowbanned Reddit accounts so the agent never again
 * operates a dead account in the void (lesson from 2026-06-14: brand-reddit was suspended and
 * later u/ytbeviral shadowbanned, both unnoticed for weeks).
 *
 * For accounts WE operate, a logged-out 404 ("page not found") means SHADOWBAN — a real,
 * non-banned profile renders for logged-out viewers even with zero posts. "suspended" in the
 * title is a hard sitewide ban. Usernames are auto-discovered by reddit.js on login and stored
 * in reports/reddit-usernames.json.
 */

const fs = require('fs');
const path = require('path');

const USERNAMES_FILE = path.join(__dirname, 'reports', 'reddit-usernames.json');

function loadUsernames() {
  try { return JSON.parse(fs.readFileSync(USERNAMES_FILE, 'utf8')); } catch { return {}; }
}

// Persist the real logged-in username for an account (called by reddit.js after login).
function saveUsername(accountId, username) {
  if (!accountId || !username || username === 'unknown') return;
  try {
    fs.mkdirSync(path.dirname(USERNAMES_FILE), { recursive: true });
    const data = loadUsernames();
    if (data[accountId]?.username === username) return; // unchanged
    data[accountId] = { username, seenAt: new Date().toISOString() };
    fs.writeFileSync(USERNAMES_FILE, JSON.stringify(data, null, 2));
  } catch { /* non-fatal */ }
}

// Returns { status: 'healthy'|'suspended'|'shadowbanned'|'unknown', reason }
async function checkRedditAccount(username) {
  if (!username) return { status: 'unknown', reason: 'no username known yet' };
  try {
    const res = await fetch(`https://old.reddit.com/user/${encodeURIComponent(username)}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' },
      redirect: 'follow',
    });
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = (titleMatch ? titleMatch[1] : '').toLowerCase();
    const lower = html.toLowerCase();

    if (title.includes('suspended') || lower.includes('account has been suspended') || lower.includes('this account has been banned')) {
      return { status: 'suspended', reason: 'profile shows suspended/banned' };
    }
    if (res.status === 404 || title.includes('page not found') || lower.includes('nobody on reddit goes by')) {
      // Account we operate exists (we log in) but is invisible to logged-out viewers → shadowban
      return { status: 'shadowbanned', reason: 'profile 404/not-found to logged-out viewers' };
    }
    return { status: 'healthy', reason: `http ${res.status}` };
  } catch (err) {
    return { status: 'unknown', reason: err.message };
  }
}

module.exports = { checkRedditAccount, loadUsernames, saveUsername, USERNAMES_FILE };
