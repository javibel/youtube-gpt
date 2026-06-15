'use strict';

// Bluesky warm-up drip — posts ONE queued original post per account per run.
// Keeps a brand-new persona account looking human (gradual posting) before it
// starts auto-engaging. Queue lives in bluesky-post-queue.json:
//   { "persona-ferran": ["post 1", "post 2", ...] }
// Credentials (handle + app password) in bluesky-accounts.json.
// Runs daily from index.js; also runnable standalone: `node bluesky-drip.js`.

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'bluesky-post-queue.json');
const ACCOUNTS_FILE = path.join(__dirname, 'bluesky-accounts.json');

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function getAgentCtor() {
  const pkg = require('@atproto/api');
  const Agent = pkg.AtpAgent || pkg.BskyAgent;
  if (!Agent) throw new Error('@atproto/api no exporta AtpAgent/BskyAgent');
  return Agent;
}

async function runBlueskyDrip() {
  const queue = loadJson(QUEUE_FILE);
  const accounts = loadJson(ACCOUNTS_FILE);
  const accountIds = Object.keys(queue).filter(id => Array.isArray(queue[id]) && queue[id].length > 0);

  if (accountIds.length === 0) {
    console.log('[bluesky-drip] Queue empty — nothing to post');
    return;
  }

  const Agent = getAgentCtor();

  for (const accountId of accountIds) {
    const creds = accounts[accountId];
    if (!creds || !creds.handle || !creds.appPassword) {
      console.error(`[bluesky-drip] ${accountId}: sin credenciales en bluesky-accounts.json, salto`);
      continue;
    }

    const text = String(queue[accountId][0] || '').trim().slice(0, 300);
    if (!text) { queue[accountId].shift(); continue; }

    const agent = new Agent({ service: creds.service || 'https://bsky.social' });
    try {
      await agent.login({ identifier: creds.handle, password: creds.appPassword });
      await agent.post({ text });
      // Only remove from queue after a confirmed successful post
      queue[accountId].shift();
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
      console.log(`[bluesky-drip] ${accountId}: posted "${text.slice(0, 50)}..." (${queue[accountId].length} left in queue)`);
    } catch (err) {
      console.error(`[bluesky-drip] ${accountId}: post fallido — ${err.message} (queda en cola)`);
    }
  }
}

module.exports = { runBlueskyDrip };

if (require.main === module) {
  require('dotenv').config();
  runBlueskyDrip()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
