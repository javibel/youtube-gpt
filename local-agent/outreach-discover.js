'use strict';

/**
 * Outreach Discovery — finds YouTube creators in relevant niches,
 * extracts public emails from channel descriptions, and adds them
 * to outreach-tracker.json for follow-up.
 *
 * Uses YouTube Data API v3 (search + channels endpoints).
 * Quota: ~200 units per run (search=100, channels list=1 per id batch).
 * Daily quota: 10,000 units → can run ~50 times/day.
 *
 * Usage:
 *   node outreach-discover.js [--dry-run]
 *   Cron: daily at 08:30 Madrid
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');
const DRY_RUN = process.argv.includes('--dry-run');
const YT_API_KEY = process.env.YOUTUBE_API_KEY;

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const YT_CHANNELS = 'https://www.googleapis.com/youtube/v3/channels';

// Niches to search — rotates daily so we don't repeat queries
const SEARCH_QUERIES = [
  // English — SEO & growth
  { q: 'youtube seo tips for small channels', lang: 'en', niche: 'YouTube SEO' },
  { q: 'how to grow on youtube 2026', lang: 'en', niche: 'YouTube growth' },
  { q: 'youtube algorithm explained small creators', lang: 'en', niche: 'YouTube strategy' },
  { q: 'youtube thumbnail tips beginners', lang: 'en', niche: 'YouTube thumbnails' },
  { q: 'youtube keyword research tutorial', lang: 'en', niche: 'YouTube SEO' },
  { q: 'how to get more views on youtube', lang: 'en', niche: 'YouTube growth' },
  { q: 'youtube content ideas for beginners', lang: 'en', niche: 'YouTube content' },
  { q: 'youtube analytics explained for beginners', lang: 'en', niche: 'YouTube analytics' },
  { q: 'best youtube tools for small creators 2026', lang: 'en', niche: 'YouTube tools' },
  { q: 'youtube shorts strategy grow channel', lang: 'en', niche: 'YouTube Shorts' },
  { q: 'youtube title optimization tips', lang: 'en', niche: 'YouTube SEO' },
  { q: 'how to rank videos on youtube', lang: 'en', niche: 'YouTube SEO' },
  { q: 'youtube niche ideas 2026', lang: 'en', niche: 'YouTube content' },
  { q: 'get first 1000 subscribers youtube', lang: 'en', niche: 'YouTube growth' },
  { q: 'youtube tags tutorial for beginners', lang: 'en', niche: 'YouTube SEO' },
  { q: 'faceless youtube channel ideas', lang: 'en', niche: 'YouTube content' },
  { q: 'youtube monetization tips small channel', lang: 'en', niche: 'YouTube monetization' },
  { q: 'youtube description optimization seo', lang: 'en', niche: 'YouTube SEO' },
  // Spanish
  { q: 'como crecer en youtube 2026', lang: 'es', niche: 'Crecimiento YouTube' },
  { q: 'seo youtube tutorial español', lang: 'es', niche: 'YouTube SEO' },
  { q: 'como conseguir más visitas youtube', lang: 'es', niche: 'Crecimiento YouTube' },
  { q: 'herramientas para youtubers', lang: 'es', niche: 'Herramientas YouTube' },
  { q: 'tips para creadores de contenido', lang: 'es', niche: 'Creación contenido' },
  { q: 'como hacer miniaturas youtube', lang: 'es', niche: 'Miniaturas YouTube' },
  { q: 'palabras clave youtube', lang: 'es', niche: 'YouTube SEO' },
  { q: 'algoritmo youtube 2026 como funciona', lang: 'es', niche: 'Algoritmo YouTube' },
  { q: 'youtube shorts como crecer', lang: 'es', niche: 'YouTube Shorts' },
  { q: 'ganar dinero youtube canal pequeño', lang: 'es', niche: 'Monetización YouTube' },
  { q: 'ideas para videos youtube 2026', lang: 'es', niche: 'Ideas contenido' },
  { q: 'primeros 1000 suscriptores youtube', lang: 'es', niche: 'Crecimiento YouTube' },
];

// Max new contacts to add per run (4 runs/day × 4 = ~16 new contacts/day)
const MAX_NEW_PER_RUN = 4;

// Sub range to target (too small = hobbyist, too big = unreachable)
const MIN_SUBS = 500;
const MAX_SUBS = 100000;

// Email regex — matches common patterns in channel descriptions
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Emails to skip (generic/no-reply)
const SKIP_EMAILS = new Set([
  'example@example.com', 'noreply@youtube.com', 'press@', 'abuse@',
]);

function shouldSkipEmail(email) {
  const lower = email.toLowerCase();
  if (lower.includes('noreply') || lower.includes('no-reply')) return true;
  for (const skip of SKIP_EMAILS) {
    if (lower.includes(skip)) return true;
  }
  return false;
}

async function ytFetch(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function searchChannels(query) {
  // Search for videos (not channels) — gives more diverse channel results
  const data = await ytFetch(YT_SEARCH, {
    key: YT_API_KEY,
    part: 'snippet',
    type: 'video',
    q: query.q,
    maxResults: 25,
    relevanceLanguage: query.lang === 'es' ? 'es' : 'en',
  });

  // Extract unique channel IDs from video results
  const seen = new Set();
  const channels = [];
  for (const item of (data.items || [])) {
    const channelId = item.snippet.channelId;
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    channels.push({
      channelId,
      title: item.snippet.channelTitle,
      lang: query.lang,
      niche: query.niche,
    });
  }
  return channels;
}

async function getChannelDetails(channelIds) {
  if (channelIds.length === 0) return [];

  // Batch up to 50 IDs per request
  const batches = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    batches.push(channelIds.slice(i, i + 50));
  }

  const results = [];
  for (const batch of batches) {
    const data = await ytFetch(YT_CHANNELS, {
      key: YT_API_KEY,
      part: 'snippet,statistics',
      id: batch.join(','),
    });

    for (const item of (data.items || [])) {
      const subs = parseInt(item.statistics.subscriberCount || '0', 10);
      const description = item.snippet.description || '';
      const emails = description.match(EMAIL_RE) || [];
      const validEmails = emails.filter(e => !shouldSkipEmail(e));

      results.push({
        channelId: item.id,
        title: item.snippet.title,
        subs,
        description: description.slice(0, 500),
        emails: validEmails,
        customUrl: item.snippet.customUrl || null,
      });
    }
  }

  return results;
}

async function runDiscovery() {
  if (!YT_API_KEY) {
    console.error('[outreach-discover] YOUTUBE_API_KEY not set in .env');
    return { added: 0 };
  }

  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf-8'));
  const existingEmails = new Set(
    tracker.contacts.filter(c => c.email).map(c => c.email.toLowerCase())
  );
  const existingNames = new Set(
    tracker.contacts.map(c => c.name.toLowerCase())
  );

  // Pick queries for this run (rotate by day + hour so each of the 4 daily runs uses different queries)
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const hourSlot = Math.floor(now.getHours() / 6); // 0-3 slots per day
  const startIdx = ((dayOfYear * 4) + hourSlot) % SEARCH_QUERIES.length;
  const todayQueries = [];
  for (let i = 0; i < 3; i++) {
    todayQueries.push(SEARCH_QUERIES[(startIdx + i) % SEARCH_QUERIES.length]);
  }

  console.log(`[outreach-discover] ${DRY_RUN ? 'DRY RUN — ' : ''}Searching ${todayQueries.length} queries: ${todayQueries.map(q => q.q).join(', ')}`);

  // Step 1: Search for channels
  const allChannels = [];
  for (const query of todayQueries) {
    try {
      const channels = await searchChannels(query);
      for (const ch of channels) {
        ch.lang = query.lang;
        ch.niche = query.niche;
      }
      allChannels.push(...channels);
    } catch (err) {
      console.error(`[outreach-discover] Search failed for "${query.q}": ${err.message}`);
    }
  }

  if (allChannels.length === 0) {
    console.log('[outreach-discover] No channels found.');
    return { added: 0 };
  }

  // Dedupe by channelId
  const uniqueChannels = [...new Map(allChannels.map(c => [c.channelId, c])).values()];
  console.log(`[outreach-discover] Found ${uniqueChannels.length} unique channels. Fetching details...`);

  // Step 2: Get channel details (subs, description, emails)
  const channelIds = uniqueChannels.map(c => c.channelId);
  let details;
  try {
    details = await getChannelDetails(channelIds);
  } catch (err) {
    console.error(`[outreach-discover] Channel details failed: ${err.message}`);
    return { added: 0 };
  }

  // Step 3: Filter — right size, has email, not already in tracker
  const candidates = [];
  for (const ch of details) {
    if (ch.subs < MIN_SUBS || ch.subs > MAX_SUBS) continue;
    if (ch.emails.length === 0) continue;

    const email = ch.emails[0].toLowerCase();
    if (existingEmails.has(email)) continue;
    if (existingNames.has(ch.title.toLowerCase())) continue;

    // Find the original search data for lang/niche
    const searchData = uniqueChannels.find(c => c.channelId === ch.channelId);

    candidates.push({
      name: ch.title,
      email,
      lang: searchData?.lang || 'en',
      niche: searchData?.niche || 'YouTube',
      subs: ch.subs,
      source: `youtube.com/${ch.customUrl || 'channel/' + ch.channelId}`,
    });
  }

  console.log(`[outreach-discover] ${candidates.length} candidates with email in target range (${MIN_SUBS}-${MAX_SUBS} subs)`);

  // Step 4: Add top candidates to tracker
  const toAdd = candidates.slice(0, MAX_NEW_PER_RUN);
  let added = 0;
  const nextId = Math.max(...tracker.contacts.map(c => c.id), 0) + 1;

  for (let i = 0; i < toAdd.length; i++) {
    const c = toAdd[i];
    const contact = {
      id: nextId + i,
      name: c.name,
      lang: c.lang,
      niche: c.niche,
      source: c.source,
      email: c.email,
      status: 'pending-email',
      dateSent: null,
      dateFollowUp: null,
      dateReplied: null,
      dateRegistered: null,
      dateActivated: null,
      notes: `Auto-discovered. ${c.subs.toLocaleString()} subs. Found ${new Date().toISOString().split('T')[0]}`,
    };

    console.log(`  + ${c.name} <${c.email}> [${c.lang}] ${c.subs} subs — ${c.niche}`);

    if (!DRY_RUN) {
      tracker.contacts.push(contact);
      existingEmails.add(c.email);
      added++;
    }
  }

  if (!DRY_RUN && added > 0) {
    fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
  }

  console.log(`[outreach-discover] Done. ${DRY_RUN ? `Would add ${toAdd.length}` : `Added ${added}`} contacts.`);
  return { added, candidates: candidates.length };
}

if (require.main === module) {
  runDiscovery().catch(err => {
    console.error('[outreach-discover] Fatal:', err);
    process.exit(1);
  });
}

module.exports = { runDiscovery };
