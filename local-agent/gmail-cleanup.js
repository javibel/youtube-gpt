'use strict';

/**
 * Gmail Cleanup — Automatic inbox hygiene for BOTH accounts:
 *   1. ytbeviral@gmail.com (agent/business)
 *   2. javijimenoplata@gmail.com (personal)
 *
 * Runs daily at 01:30. Classifies and purges old emails:
 *
 * PRESERVE (label "YTubViral/Importante", never delete):
 *   - Stripe/payment emails
 *   - User replies to outreach
 *   - Product Hunt replies/engagement
 *   - Security alerts (Google, Vercel, GitHub)
 *   - Legal/compliance emails
 *   - Business opportunities (partnership, press)
 *
 * ARCHIVE after 7 days:
 *   - Agent status emails (daily reports, cron errors)
 *   - DMARC reports
 *   - Newsletters (SaaSHub, BetaList, etc.)
 *   - Google service reminders
 *
 * DELETE after 30 days:
 *   - Archived agent/DMARC/newsletter emails
 *
 * Usage:
 *   node gmail-cleanup.js [--dry-run]              # clean both accounts
 *   node gmail-cleanup.js --account=ytbeviral       # only ytbeviral
 *   node gmail-cleanup.js --account=personal        # only personal
 *   node gmail-cleanup.js --auth-personal           # generate OAuth token for personal account
 */

require('dotenv').config();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const DRY_RUN = process.argv.includes('--dry-run');
const ACCOUNT_FLAG = (process.argv.find(a => a.startsWith('--account=')) || '').split('=')[1] || 'all';

// ── Account configurations ───────────────────────────────────────────────────

const ACCOUNTS = {
  ytbeviral: {
    name: 'ytbeviral@gmail.com',
    clientId: () => process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: () => process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
  },
  personal: {
    name: 'javijimenoplata@gmail.com',
    // Uses same OAuth app (same client ID/secret), different refresh token
    clientId: () => process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: () => process.env.PERSONAL_GMAIL_REFRESH_TOKEN,
  },
};

// ── Gmail API helpers ────────────────────────────────────────────────────────

async function getAccessToken(account) {
  const cfg = ACCOUNTS[account];
  if (!cfg) throw new Error(`Unknown account: ${account}`);
  const refreshToken = cfg.refreshToken();
  if (!refreshToken) return null; // Account not configured yet

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId(),
      client_secret: cfg.clientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth failed for ${cfg.name}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function gmailGet(token, endpoint) {
  const res = await fetch(`${GMAIL_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function gmailPost(token, endpoint, body) {
  const res = await fetch(`${GMAIL_BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function searchMessages(token, query, maxResults = 100) {
  const messages = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(maxResults - messages.length, 100)) });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gmailGet(token, `/messages?${params}`);
    if (data.messages) messages.push(...data.messages);
    pageToken = data.nextPageToken;
  } while (pageToken && messages.length < maxResults);
  return messages;
}

async function batchModify(token, messageIds, addLabelIds, removeLabelIds) {
  if (!messageIds.length) return;
  for (let i = 0; i < messageIds.length; i += 1000) {
    const batch = messageIds.slice(i, i + 1000);
    await gmailPost(token, '/messages/batchModify', {
      ids: batch,
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || [],
    });
  }
}

async function batchTrash(token, messageIds) {
  for (const id of messageIds) {
    await gmailPost(token, `/messages/${id}/trash`, {});
    await new Promise(r => setTimeout(r, 100));
  }
}

// ── Label management ─────────────────────────────────────────────────────────

async function ensureLabels(token) {
  const labelNames = ['YTubViral/Importante', 'YTubViral/Outreach', 'YTubViral/Agente'];
  const { labels } = await gmailGet(token, '/labels');
  const labelMap = {};

  for (const name of labelNames) {
    const existing = labels.find(l => l.name === name);
    if (existing) {
      labelMap[name] = existing.id;
    } else {
      const created = await gmailPost(token, '/labels', {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      });
      labelMap[name] = created.id;
      console.log(`  Created label: ${name}`);
    }
  }
  return labelMap;
}

// ── Classification rules ─────────────────────────────────────────────────────

// Important — preserve forever
const IMPORTANT_QUERIES = [
  'from:stripe.com',
  'from:producthunt.com subject:replied',
  'from:producthunt.com subject:started',
  'from:producthunt.com subject:thread',
  'from:noreply@vercel.com subject:failed',
  'from:github.com subject:security',
  'from:google.com subject:suspended OR subject:violation OR subject:removed',
  'subject:partnership OR subject:colaboración OR subject:press OR subject:investment',
  'subject:payment OR subject:refund OR subject:chargeback OR subject:invoice',
  'subject:DMCA OR subject:copyright OR subject:legal',
];

// Archive after 7 days — routine/automated
const ARCHIVE_AFTER_7D = [
  'from:hello@ytubviral.com subject:"[YTubViral Agent]"',
  'from:noreply-dmarc-support@google.com',
  'from:stan@saashub.com',
  'from:team@betalist.com',
  'from:hello@digest.producthunt.com',
  'from:google-noreply@google.com subject:Recordatorio',
  'from:notification@priority.facebookmail.com',
  'subject:"Report domain" from:noreply-dmarc',
  'from:noreply@google.com subject:"Nuevos cambios" OR subject:"Tus servicios"',
  'from:accounts-noreply@google.com',
];

// Trash after 30 days
const DELETE_AFTER_30D = [
  'from:noreply-dmarc-support@google.com older_than:30d',
  'from:hello@ytubviral.com subject:"[YTubViral Agent]" older_than:30d',
  'from:stan@saashub.com older_than:30d',
  'from:team@betalist.com older_than:30d',
  'from:hello@digest.producthunt.com older_than:30d',
  'from:notification@priority.facebookmail.com older_than:30d',
  'from:google-noreply@google.com subject:Recordatorio older_than:30d',
  'from:accounts-noreply@google.com older_than:30d',
  'from:noreply@google.com subject:"Nuevos cambios" older_than:30d',
  'subject:"Report domain" from:noreply-dmarc older_than:30d',
];

// ── Per-account cleanup ──────────────────────────────────────────────────────

async function cleanAccount(accountKey) {
  const cfg = ACCOUNTS[accountKey];
  console.log(`\n[gmail-cleanup] === ${cfg.name} ===`);

  let token;
  try {
    token = await getAccessToken(accountKey);
  } catch (err) {
    console.error(`  OAuth failed: ${err.message}`);
    return null;
  }
  if (!token) {
    console.log(`  Skipping — no refresh token configured (set PERSONAL_GMAIL_REFRESH_TOKEN in .env)`);
    return null;
  }

  const labelMap = await ensureLabels(token);
  const stats = { labeled: 0, archived: 0, trashed: 0 };

  // Phase 1: Label important emails
  console.log('  Phase 1: Labeling important emails...');
  for (const query of IMPORTANT_QUERIES) {
    try {
      const messages = await searchMessages(token, `in:inbox ${query} newer_than:30d`, 50);
      if (messages.length > 0) {
        console.log(`    ${query} → ${messages.length}`);
        if (!DRY_RUN) {
          await batchModify(token, messages.map(m => m.id), [labelMap['YTubViral/Importante']], []);
        }
        stats.labeled += messages.length;
      }
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  // Phase 1b: Label outreach copies (BCC)
  try {
    const outreach = await searchMessages(token, 'in:inbox from:hello@ytubviral.com (subject:"SEO analysis" OR subject:"análisis SEO" OR subject:"SEO tool" OR subject:"herramienta SEO") newer_than:30d', 50);
    if (outreach.length > 0) {
      console.log(`    Outreach copies → ${outreach.length}`);
      if (!DRY_RUN) await batchModify(token, outreach.map(m => m.id), [labelMap['YTubViral/Outreach']], []);
      stats.labeled += outreach.length;
    }
  } catch {}

  // Phase 1c: Label agent emails
  try {
    const agent = await searchMessages(token, 'in:inbox from:hello@ytubviral.com subject:"[YTubViral Agent]" newer_than:7d', 100);
    if (agent.length > 0) {
      console.log(`    Agent emails → ${agent.length}`);
      if (!DRY_RUN) await batchModify(token, agent.map(m => m.id), [labelMap['YTubViral/Agente']], []);
      stats.labeled += agent.length;
    }
  } catch {}

  // Phase 2: Archive old routine emails (>7 days)
  console.log('  Phase 2: Archiving routine emails >7d...');
  for (const query of ARCHIVE_AFTER_7D) {
    try {
      const messages = await searchMessages(token, `in:inbox ${query} older_than:7d`, 100);
      if (messages.length > 0) {
        console.log(`    ${query.split(' ')[0]} → archiving ${messages.length}`);
        if (!DRY_RUN) await batchModify(token, messages.map(m => m.id), [], ['INBOX']);
        stats.archived += messages.length;
      }
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  // Phase 3: Trash old emails (>30 days, excluding Importante)
  console.log('  Phase 3: Trashing old emails >30d...');
  for (const query of DELETE_AFTER_30D) {
    try {
      const safeQuery = `${query} -label:${labelMap['YTubViral/Importante'] || 'YTubViral-Importante'}`;
      const messages = await searchMessages(token, safeQuery, 100);
      if (messages.length > 0) {
        console.log(`    ${query.split(' older_than')[0]} → trashing ${messages.length}`);
        if (!DRY_RUN) await batchTrash(token, messages.map(m => m.id));
        stats.trashed += messages.length;
      }
    } catch (err) {
      console.error(`    Error: ${err.message}`);
    }
  }

  console.log(`  Done: labeled=${stats.labeled}, archived=${stats.archived}, trashed=${stats.trashed}`);
  return stats;
}

// ── OAuth helper for personal account ────────────────────────────────────────

async function authPersonal() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&` +
    `response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

  console.log('\n=== OAuth Setup for javijimenoplata@gmail.com ===\n');
  console.log('1. Open this URL in your browser (log in with javijimenoplata@gmail.com):\n');
  console.log(authUrl);
  console.log('\n2. Authorize the app and copy the code');
  console.log('3. Run this command with the code:\n');
  console.log('   node gmail-cleanup.js --exchange-code=YOUR_CODE_HERE\n');
}

async function exchangeCode(code) {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    }),
  });

  const data = await res.json();
  if (!data.refresh_token) {
    console.error('Failed to get refresh token:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('\nSuccess! Add this to your .env file:\n');
  console.log(`PERSONAL_GMAIL_REFRESH_TOKEN=${data.refresh_token}`);
  console.log('\nThen restart PM2: pm2 restart ytubviral-agent --update-env');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runCleanup() {
  console.log(`[gmail-cleanup] ${DRY_RUN ? 'DRY RUN — ' : ''}Starting inbox cleanup...`);

  const accountsToClean = ACCOUNT_FLAG === 'all'
    ? ['ytbeviral', 'personal']
    : [ACCOUNT_FLAG];

  const results = {};
  for (const account of accountsToClean) {
    results[account] = await cleanAccount(account);
  }

  console.log('\n[gmail-cleanup] All accounts processed.');
  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  if (process.argv.includes('--auth-personal')) {
    authPersonal();
  } else {
    const codeFlag = process.argv.find(a => a.startsWith('--exchange-code='));
    if (codeFlag) {
      exchangeCode(codeFlag.split('=')[1]).catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
    } else {
      runCleanup().catch(err => {
        console.error('[gmail-cleanup] Fatal:', err.message);
        process.exit(1);
      });
    }
  }
}

module.exports = { runCleanup };
