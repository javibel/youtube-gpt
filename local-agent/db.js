'use strict';

const { Pool } = require('pg');

// Replace sslmode=require with verify-full to suppress pg v9 deprecation warning
const connStr = (process.env.DATABASE_URL || '').replace(/sslmode=require\b/, 'sslmode=verify-full');
const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 3,                      // reduced from 5 — we never need more than 2 concurrent
  min: 0,                      // don't keep idle connections — let Neon auto-suspend
  idleTimeoutMillis: 2000,     // close idle connections after 2s (default was 10s)
  connectionTimeoutMillis: 10000,
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    client.release();
  }
}

// ── LinkedIn prospects ──

async function saveProspect({ profileUrl, name, headline, followers, status = 'discovered', accountId = null }) {
  await query(`
    INSERT INTO linkedin_prospects (profile_url, name, headline, followers, status, account_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (profile_url) DO NOTHING
  `, [profileUrl, name, headline, followers, status, accountId]);
}

async function updateProspectStatus(profileUrl, status, notes = null) {
  await query(`
    UPDATE linkedin_prospects
    SET status = $2, notes = $3, updated_at = NOW()
    WHERE profile_url = $1
  `, [profileUrl, status, notes]);
}

async function getProspectsByStatus(status, accountId = null) {
  return query(`
    SELECT * FROM linkedin_prospects
    WHERE status = $1 AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
    ORDER BY created_at ASC
  `, [status, accountId]);
}

// ── Actions (all platforms) ──

function _actionTable(type) {
  if (type.startsWith('x_')) return { table: 'twitter_actions', urlCol: 'tweet_url' };
  if (type.startsWith('ig_')) return { table: 'instagram_actions', urlCol: 'post_url' };
  if (type.startsWith('fb_')) return { table: 'facebook_actions', urlCol: 'post_url' };
  if (type.startsWith('rd_')) return { table: 'reddit_actions', urlCol: 'post_url' };
  return { table: 'linkedin_actions', urlCol: 'profile_url' };
}

async function saveAction({ type, profileUrl, content = null, accountId = null }) {
  const { table, urlCol } = _actionTable(type);
  await query(`
    INSERT INTO ${table} (type, ${urlCol}, content, account_id, created_at)
    VALUES ($1, $2, $3, $4, NOW())
  `, [type, profileUrl, content, accountId]);
}

async function countTodayActions(type, accountId = null) {
  const { table } = _actionTable(type);
  const rows = await query(`
    SELECT COUNT(*) as count FROM ${table}
    WHERE type = $1 AND created_at >= CURRENT_DATE
    AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [type, accountId]);
  return parseInt(rows[0]?.count ?? '0');
}

// ── Duplicate checks ──

async function hasTwitterAction(tweetUrl, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM twitter_actions
    WHERE tweet_url = $1 AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [tweetUrl, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

async function hasTwitterActionOfType(tweetUrl, type, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM twitter_actions
    WHERE tweet_url = $1 AND type = $2 AND (account_id = $3 OR ($3 IS NULL AND account_id IS NULL))
  `, [tweetUrl, type, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

async function hasInstagramAction(postUrl, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM instagram_actions
    WHERE post_url = $1 AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [postUrl, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

async function hasFacebookAction(postUrl, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM facebook_actions
    WHERE post_url = $1 AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [postUrl, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

async function hasRedditAction(postUrl, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM reddit_actions
    WHERE post_url = $1 AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [postUrl, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

// ── Follow-up tracking ──

async function getRecentComments(platform, daysBack = 7, accountId = null) {
  const { table, urlCol } = _actionTable(platform === 'twitter' ? 'x_reply' : platform === 'reddit' ? 'rd_comment' : platform === 'facebook' ? 'fb_comment' : platform === 'instagram' ? 'ig_comment' : 'comment');
  const typeFilter = platform === 'twitter' ? 'x_reply' : platform === 'reddit' ? 'rd_comment' : platform === 'facebook' ? 'fb_comment' : platform === 'instagram' ? 'ig_comment' : 'comment';
  return query(`
    SELECT id, type, ${urlCol} as post_url, content, account_id, created_at
    FROM ${table}
    WHERE type = $1 AND content IS NOT NULL
    AND created_at >= NOW() - INTERVAL '${daysBack} days'
    AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
    ORDER BY created_at DESC
  `, [typeFilter, accountId]);
}

async function saveFollowup({ platform, originalActionId, postUrl, replyAuthor, replyContent, ourResponse, accountId = null }) {
  // Upsert: if we previously detected but didn't respond, update the existing row
  const existing = await query(`
    SELECT id FROM followup_checks WHERE platform = $1 AND post_url = $2 AND reply_author = $3
    AND (account_id = $4 OR ($4 IS NULL AND account_id IS NULL))
  `, [platform, postUrl, replyAuthor, accountId]);

  if (existing.length > 0) {
    await query(`
      UPDATE followup_checks SET our_response = $1, responded = $2, original_action_id = COALESCE($3, original_action_id), created_at = NOW()
      WHERE id = $4
    `, [ourResponse, !!ourResponse, originalActionId, existing[0].id]);
  } else {
    await query(`
      INSERT INTO followup_checks (platform, original_action_id, post_url, reply_author, reply_content, our_response, responded, account_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [platform, originalActionId, postUrl, replyAuthor, replyContent, ourResponse, !!ourResponse, accountId]);
  }
}

async function hasFollowup(platform, postUrl, replyAuthor, accountId = null) {
  // Only skip if we already RESPONDED, or if detected < 6h ago (avoid re-processing same cycle)
  const rows = await query(`
    SELECT COUNT(*) as count FROM followup_checks
    WHERE platform = $1 AND post_url = $2 AND reply_author = $3
    AND (account_id = $4 OR ($4 IS NULL AND account_id IS NULL))
    AND (responded = true OR created_at > NOW() - INTERVAL '6 hours')
  `, [platform, postUrl, replyAuthor, accountId]);
  return parseInt(rows[0]?.count ?? '0') > 0;
}

async function countTodayFollowups(platform, accountId = null) {
  const rows = await query(`
    SELECT COUNT(*) as count FROM followup_checks
    WHERE platform = $1 AND responded = TRUE AND created_at >= CURRENT_DATE
    AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
  `, [platform, accountId]);
  return parseInt(rows[0]?.count ?? '0');
}

// ── Stats & reports ──

async function getDailyStats() {
  const [posts, prospects, actions, twitterActions, instagramActions, facebookActions, redditActions, emails] = await Promise.all([
    query(`SELECT platform, COUNT(*) as count, MAX("publishedAt") as last FROM "social_posts" WHERE "publishedAt" >= CURRENT_DATE - INTERVAL '1 day' GROUP BY platform`),
    query(`SELECT status, COUNT(*) as count FROM linkedin_prospects GROUP BY status`),
    query(`SELECT type, COUNT(*) as count FROM linkedin_actions WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`),
    query(`SELECT type, COUNT(*) as count FROM twitter_actions WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`),
    query(`SELECT type, COUNT(*) as count FROM instagram_actions WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`),
    query(`SELECT type, COUNT(*) as count FROM facebook_actions WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`),
    query(`SELECT type, COUNT(*) as count FROM reddit_actions WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`),
    query(`SELECT COUNT(*) as total, SUM(CASE WHEN replied THEN 1 ELSE 0 END) as replied FROM "social_messages" WHERE "receivedAt" >= CURRENT_DATE - INTERVAL '1 day' AND platform = 'gmail'`),
  ]);
  return { posts, prospects, actions, twitterActions, instagramActions, facebookActions, redditActions, emails: emails[0] };
}

async function getTodayComments() {
  const [linkedin, twitter, instagram, facebook, reddit] = await Promise.all([
    query(`SELECT type, profile_url as target, content, account_id, created_at FROM linkedin_actions WHERE content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`),
    query(`SELECT type, tweet_url as target, content, account_id, created_at FROM twitter_actions WHERE content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`),
    query(`SELECT type, post_url as target, content, account_id, created_at FROM instagram_actions WHERE content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`),
    query(`SELECT type, post_url as target, content, account_id, created_at FROM facebook_actions WHERE content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`),
    query(`SELECT type, post_url as target, content, account_id, created_at FROM reddit_actions WHERE content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`),
  ]);
  return { linkedin, twitter, instagram, facebook, reddit };
}

// ── Persona stats ──

async function getPersonaStats(accountId) {
  const [twitter, facebook, linkedin, reddit] = await Promise.all([
    query(`SELECT type, COUNT(*) as count FROM twitter_actions WHERE account_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`, [accountId]),
    query(`SELECT type, COUNT(*) as count FROM facebook_actions WHERE account_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`, [accountId]),
    query(`SELECT type, COUNT(*) as count FROM linkedin_actions WHERE account_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`, [accountId]),
    query(`SELECT type, COUNT(*) as count FROM reddit_actions WHERE account_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '1 day' GROUP BY type`, [accountId]),
  ]);
  return { twitter, facebook, linkedin, reddit };
}

async function getPersonaComments(accountId) {
  const [twitter, facebook, linkedin, reddit] = await Promise.all([
    query(`SELECT type, tweet_url as target, content, created_at FROM twitter_actions WHERE account_id = $1 AND content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`, [accountId]),
    query(`SELECT type, post_url as target, content, created_at FROM facebook_actions WHERE account_id = $1 AND content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`, [accountId]),
    query(`SELECT type, profile_url as target, content, created_at FROM linkedin_actions WHERE account_id = $1 AND content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`, [accountId]),
    query(`SELECT type, post_url as target, content, created_at FROM reddit_actions WHERE account_id = $1 AND content IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '1 day' ORDER BY created_at ASC`, [accountId]),
  ]);
  return { twitter, facebook, linkedin, reddit };
}

// ── Schema init / migration ──

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS linkedin_prospects (
      id SERIAL PRIMARY KEY,
      profile_url TEXT UNIQUE NOT NULL,
      name TEXT,
      headline TEXT,
      followers INTEGER,
      status TEXT DEFAULT 'discovered',
      account_id TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS linkedin_actions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      profile_url TEXT,
      content TEXT,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS twitter_actions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      tweet_url TEXT,
      content TEXT,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS instagram_actions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      post_url TEXT,
      content TEXT,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS facebook_actions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      post_url TEXT,
      content TEXT,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reddit_actions (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      post_url TEXT,
      content TEXT,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS followup_checks (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      original_action_id INTEGER,
      post_url TEXT,
      reply_author TEXT,
      reply_content TEXT,
      our_response TEXT,
      responded BOOLEAN DEFAULT FALSE,
      account_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS social_messages (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'gmail',
      sender TEXT,
      subject TEXT,
      body TEXT,
      reply TEXT,
      replied BOOLEAN DEFAULT FALSE,
      "receivedAt" TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: add account_id to existing tables that lack it
  const migrations = [
    'ALTER TABLE linkedin_prospects ADD COLUMN IF NOT EXISTS account_id TEXT',
    'ALTER TABLE linkedin_actions ADD COLUMN IF NOT EXISTS account_id TEXT',
    'ALTER TABLE twitter_actions ADD COLUMN IF NOT EXISTS account_id TEXT',
    'ALTER TABLE instagram_actions ADD COLUMN IF NOT EXISTS account_id TEXT',
    'ALTER TABLE facebook_actions ADD COLUMN IF NOT EXISTS account_id TEXT',
    'ALTER TABLE reddit_actions ADD COLUMN IF NOT EXISTS account_id TEXT',
  ];

  // Performance indexes — avoid full table scans on frequent queries
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_twitter_actions_created ON twitter_actions (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_twitter_actions_url ON twitter_actions (tweet_url)',
    'CREATE INDEX IF NOT EXISTS idx_reddit_actions_created ON reddit_actions (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_reddit_actions_url ON reddit_actions (post_url)',
    'CREATE INDEX IF NOT EXISTS idx_facebook_actions_created ON facebook_actions (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_instagram_actions_created ON instagram_actions (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_linkedin_actions_created ON linkedin_actions (created_at)',
    'CREATE INDEX IF NOT EXISTS idx_followup_lookup ON followup_checks (platform, post_url, reply_author)',
    'CREATE INDEX IF NOT EXISTS idx_social_messages_received ON social_messages ("receivedAt")',
  ];
  for (const sql of [...migrations, ...indexes]) {
    try {
      await query(sql);
    } catch (e) {
      // Only ignore "already exists" errors
      if (!e.message?.includes('already exists')) {
        console.error(`[db] Migration failed: ${sql.slice(0, 60)} → ${e.message}`);
      }
    }
  }

  console.log('[db] Tables ready');
}

/**
 * Drain all idle connections so Neon can auto-suspend.
 * Call after batch operations (persona runs, reports, etc.)
 * The pool stays alive — next query() will reconnect on demand.
 */
async function disconnect() {
  try {
    // pool._clients gives us active + idle. We only want to close idle ones.
    // The simplest safe way: reduce pool to 0 idle by evicting them.
    const idleCount = pool.idleCount;
    if (idleCount > 0) {
      // Temporarily set allowExitOnIdle so the pool releases all idle clients
      pool.options.allowExitOnIdle = true;
      // Force-evict idle connections
      while (pool.idleCount > 0) {
        const client = await pool.connect();
        client.release(true); // true = destroy instead of return to pool
      }
      pool.options.allowExitOnIdle = false;
    }
  } catch {}
}

module.exports = {
  query, disconnect,
  saveProspect, updateProspectStatus, getProspectsByStatus,
  saveAction, countTodayActions,
  hasTwitterAction, hasTwitterActionOfType, hasInstagramAction, hasFacebookAction, hasRedditAction,
  getRecentComments, saveFollowup, hasFollowup, countTodayFollowups,
  getDailyStats, getTodayComments,
  getPersonaStats, getPersonaComments,
  initDb,
};
