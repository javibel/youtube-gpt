'use strict';

/**
 * Outreach Discovery — finds YouTube creators in relevant niches,
 * extracts public emails from channel descriptions, and adds them
 * to outreach-tracker.json for follow-up.
 *
 * Uses YouTube Data API v3 (search + channels + videos endpoints).
 * Quota: ~600 units per run (search=100×3 queries, channels=1, video search=100×4, video details=1×4).
 * Daily quota: 10,000 units → can run ~16 times/day.
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
const YT_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';

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
const EMAIL_RE = /[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

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

// ── Quick SEO score from video metadata (0-100) ───────────────────────────
// Mirrors the checks in /api/youtube/seo-score but runs locally from YT Data API

function quickSeoScore(video) {
  let score = 0;
  const title = video.title || '';
  const desc = video.description || '';
  const tags = video.tags || [];

  // Title length (ideal 40-70 chars)
  if (title.length >= 40 && title.length <= 70) score += 15;
  else if (title.length >= 20 && title.length <= 90) score += 8;
  else score += 3;

  // Title has numbers or power words
  if (/\d/.test(title)) score += 5;
  if (/how|why|best|top|ultimate|guide|tips|tutorial|cómo|mejor|guía/i.test(title)) score += 5;

  // Description length (ideal >500 chars)
  if (desc.length >= 500) score += 15;
  else if (desc.length >= 200) score += 10;
  else if (desc.length >= 50) score += 5;
  else score += 2;

  // Description has links
  if (/https?:\/\//.test(desc)) score += 5;

  // Description has timestamps
  if (/\d{1,2}:\d{2}/.test(desc)) score += 5;

  // Tags
  if (tags.length >= 10) score += 15;
  else if (tags.length >= 5) score += 10;
  else if (tags.length >= 1) score += 5;
  else score += 0; // No tags = missed opportunity

  // Has custom thumbnail (default thumbnails are lower res)
  // YT API doesn't expose this directly, but maxres presence is a proxy
  if (video.hasThumbnail) score += 10;
  else score += 3;

  // View performance relative to subs (if available)
  if (video.viewCount && video.channelSubs) {
    const viewRatio = video.viewCount / Math.max(video.channelSubs, 1);
    if (viewRatio >= 0.5) score += 15;      // viral-level
    else if (viewRatio >= 0.15) score += 10; // healthy
    else if (viewRatio >= 0.05) score += 5;  // average
    else score += 2;                          // underperforming
  } else {
    score += 5; // neutral if unknown
  }

  return Math.min(100, Math.max(0, score));
}

function generateSeoTips(video, score) {
  const tips = [];
  const title = video.title || '';
  const desc = video.description || '';
  const tags = video.tags || [];

  if (title.length < 40) tips.push({ area: 'title', tip_en: 'Title is too short — aim for 40-70 characters with your main keyword', tip_es: 'El título es muy corto — apunta a 40-70 caracteres con tu keyword principal' });
  if (title.length > 70) tips.push({ area: 'title', tip_en: 'Title is too long — it gets cut off in search. Keep it under 70 characters', tip_es: 'El título es muy largo — se corta en búsquedas. Mantenlo bajo 70 caracteres' });
  if (!/\d/.test(title) && !/how|why|best|top|cómo|mejor/i.test(title)) tips.push({ area: 'title', tip_en: 'Add numbers or power words (How to, Best, Top 5) to boost CTR', tip_es: 'Añade números o palabras clave (Cómo, Mejor, Top 5) para mejorar el CTR' });

  if (desc.length < 200) tips.push({ area: 'description', tip_en: 'Description is too short — YouTube reads this for ranking. Aim for 500+ characters', tip_es: 'La descripción es muy corta — YouTube la usa para posicionar. Apunta a 500+ caracteres' });
  if (!/https?:\/\//.test(desc)) tips.push({ area: 'description', tip_en: 'No links in description — add your channel links and relevant resources', tip_es: 'Sin enlaces en la descripción — añade links a tu canal y recursos relevantes' });
  if (!/\d{1,2}:\d{2}/.test(desc)) tips.push({ area: 'description', tip_en: 'No timestamps — adding chapters improves watch time and helps YouTube understand your content', tip_es: 'Sin timestamps — añadir capítulos mejora el tiempo de visualización y ayuda a YouTube a entender tu contenido' });

  if (tags.length === 0) tips.push({ area: 'tags', tip_en: 'No tags at all — you\'re missing easy ranking signals. Add 5-15 relevant tags', tip_es: 'Sin tags — estás perdiendo señales de posicionamiento fáciles. Añade 5-15 tags relevantes' });
  else if (tags.length < 5) tips.push({ area: 'tags', tip_en: `Only ${tags.length} tags — add more related keywords (aim for 10-15)`, tip_es: `Solo ${tags.length} tags — añade más keywords relacionadas (apunta a 10-15)` });

  // Return top 3 most impactful tips
  return tips.slice(0, 3);
}

// ── Fetch latest video from a channel ──────────────────────────────────────

async function getLatestVideo(channelId, channelSubs) {
  try {
    // Search for latest video from this channel (costs 100 quota units)
    const searchData = await ytFetch(YT_SEARCH, {
      key: YT_API_KEY,
      part: 'snippet',
      channelId,
      type: 'video',
      order: 'date',
      maxResults: 1,
    });

    if (!searchData.items || searchData.items.length === 0) return null;

    const videoId = searchData.items[0].id.videoId;
    if (!videoId) return null;

    // Get full video details (costs 1 quota unit per video)
    const videoData = await ytFetch(YT_VIDEOS, {
      key: YT_API_KEY,
      part: 'snippet,statistics',
      id: videoId,
    });

    if (!videoData.items || videoData.items.length === 0) return null;

    const v = videoData.items[0];
    const snippet = v.snippet || {};
    const stats = v.statistics || {};

    return {
      videoId,
      title: snippet.title || '',
      description: (snippet.description || '').slice(0, 1000),
      tags: snippet.tags || [],
      viewCount: parseInt(stats.viewCount || '0', 10),
      likeCount: parseInt(stats.likeCount || '0', 10),
      commentCount: parseInt(stats.commentCount || '0', 10),
      publishedAt: snippet.publishedAt || '',
      hasThumbnail: !!(snippet.thumbnails?.maxres || snippet.thumbnails?.high),
      channelSubs: channelSubs || 0,
    };
  } catch (err) {
    console.error(`[outreach-discover] Failed to get latest video for ${channelId}: ${err.message}`);
    return null;
  }
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
      channelId: ch.channelId,
      name: ch.title,
      email,
      lang: searchData?.lang || 'en',
      niche: searchData?.niche || 'YouTube',
      subs: ch.subs,
      source: `youtube.com/${ch.customUrl || 'channel/' + ch.channelId}`,
    });
  }

  console.log(`[outreach-discover] ${candidates.length} candidates with email in target range (${MIN_SUBS}-${MAX_SUBS} subs)`);

  // Step 4: Fetch latest video + SEO score for top candidates (value-upfront email)
  const toAdd = candidates.slice(0, MAX_NEW_PER_RUN);
  console.log(`[outreach-discover] Fetching latest video for ${toAdd.length} candidates...`);

  for (const c of toAdd) {
    try {
      const video = await getLatestVideo(c.channelId, c.subs);
      if (video) {
        c.latestVideo = {
          videoId: video.videoId,
          title: video.title,
          url: `https://youtube.com/watch?v=${video.videoId}`,
          viewCount: video.viewCount,
          publishedAt: video.publishedAt,
        };
        c.seoScore = quickSeoScore(video);
        c.seoTips = generateSeoTips(video, c.seoScore);
        console.log(`  📊 ${c.name}: "${video.title.slice(0, 50)}..." → SEO ${c.seoScore}/100`);
      }
    } catch (err) {
      console.error(`  ⚠ Video fetch failed for ${c.name}: ${err.message}`);
    }
    // Small delay between API calls
    await new Promise(r => setTimeout(r, 300));
  }

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
      // Value-upfront data for personalized outreach
      latestVideo: c.latestVideo || null,
      seoScore: c.seoScore || null,
      seoTips: c.seoTips || [],
    };

    console.log(`  + ${c.name} <${c.email}> [${c.lang}] ${c.subs} subs — ${c.niche}${c.seoScore ? ` (SEO: ${c.seoScore}/100)` : ''}`);

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
