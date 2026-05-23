'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto } = require('./resilience');
const { guardedCall } = require('./api-guard');

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PATH = path.join(__dirname, 'reports', 'youtube-comments-log.json');
const YT_API_KEY = (process.env.YOUTUBE_API_KEY || '').trim();

// Conservative limits — start slow, scale gradually
const MAX_COMMENTS_PER_PERSONA = 2;
const MIN_DELAY_BETWEEN = 60000;  // 60s min between comments
const MAX_DELAY_BETWEEN = 150000; // 150s max
const VIEW_SIMULATION_MIN = 10000; // Watch 10-30s before commenting
const VIEW_SIMULATION_MAX = 30000;

// Personas that can comment on YouTube (must have Google login in their Chrome profile)
const PERSONAS = [
  { id: 'persona-alex', profileDir: 'chrome-profiles/persona-alex' },
  { id: 'persona-ferran', profileDir: 'chrome-profiles/persona-ferran' },
];

// Queries to find target videos
const SEARCH_QUERIES = [
  'youtube seo tips 2026',
  'how to grow on youtube',
  'youtube algorithm explained',
  'youtube thumbnail optimization',
  'youtube keyword research',
  'youtube analytics tutorial',
  'youtube shorts strategy',
  'content creation tips youtube',
  'como crecer en youtube',
  'seo youtube tutorial',
];

// ── Log management ──────────────────────────────────────────────────────────

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    const log = { comments: [], lastRun: null, totalComments: 0 };
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    return log;
  }
}

function saveLog(log) {
  log.lastRun = new Date().toISOString();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ── Find target videos via YouTube Data API ────────────────────────────────

async function findTargetVideos(query) {
  if (!YT_API_KEY) return [];

  try {
    // Search for recent videos (last 7 days)
    const publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=date&publishedAfter=${publishedAfter}&maxResults=10&key=${YT_API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const videoIds = (data.items || []).map(i => i.id?.videoId).filter(Boolean);
    if (!videoIds.length) return [];

    // Get stats to filter
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${YT_API_KEY}`;
    const statsRes = await fetch(statsUrl);
    if (!statsRes.ok) return [];
    const statsData = await statsRes.json();

    return (statsData.items || [])
      .map(v => ({
        videoId: v.id,
        title: v.snippet?.title || '',
        channelTitle: v.snippet?.channelTitle || '',
        views: parseInt(v.statistics?.viewCount || '0', 10),
        comments: parseInt(v.statistics?.commentCount || '0', 10),
        url: `https://www.youtube.com/watch?v=${v.id}`,
      }))
      // Target: 1K-100K views, < 80 comments (room for visibility)
      .filter(v => v.views >= 1000 && v.views <= 100000 && v.comments < 80);
  } catch (err) {
    console.error(`[youtube-commenter] API search failed: ${err.message}`);
    return [];
  }
}

// ── Verify YouTube session ──────────────────────────────────────────────────

async function verifyYoutubeSession(page) {
  const ok = await safeGoto(page, 'https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!ok) return false;

  await new Promise(r => setTimeout(r, 3000));

  // Check if logged in
  const isLoggedIn = await page.evaluate(() => {
    // Avatar button indicates logged-in state
    const avatar = document.querySelector('#avatar-btn, button[aria-label*="Account"], img[id="img"][alt*="Avatar"]');
    return !!avatar;
  });

  return isLoggedIn;
}

// ── Generate comment with Claude ────────────────────────────────────────────

async function generateYoutubeComment(videoTitle, channelName, mentionYtubviral) {
  const system = `You write genuine YouTube comments as a viewer. Comments are 2-3 sentences, specific to the video topic. Sound like a real person, not a bot. Never use emojis excessively (max 1). Never use generic phrases like "great video" or "amazing content".`;

  const mentionInstruction = mentionYtubviral
    ? `\nAt the end, naturally mention that you use ytubviral.com for similar analysis — but make it feel organic, like sharing a helpful tool, not promoting.`
    : '';

  const prompt = `Write a YouTube comment for this video:
Title: "${videoTitle}"
Channel: ${channelName}

Requirements:
- 2-3 sentences, specific to the video topic
- Sound genuine and add value (share a related tip, ask a thoughtful question, or share your experience)
- Minimum 20 words
- No generic praise
- No emojis or max 1${mentionInstruction}

Output ONLY the comment text.`;

  const { text } = await guardedCall(prompt, {
    maxTokens: 200,
    agentId: 'youtube-commenter',
    system,
  });

  const comment = text.trim();
  // Quality gate: at least 20 words, no generic phrases
  const words = comment.split(/\s+/).length;
  if (words < 20) return null;
  if (/great video|amazing content|love this|incredible content|awesome video/i.test(comment)) return null;

  return comment;
}

// ── Post comment on YouTube ─────────────────────────────────────────────────

async function postYoutubeComment(page, videoUrl, commentText) {
  const ok = await safeGoto(page, videoUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!ok) throw new Error('Failed to navigate to video');

  // Simulate watching the video for a bit
  const watchTime = VIEW_SIMULATION_MIN + Math.random() * (VIEW_SIMULATION_MAX - VIEW_SIMULATION_MIN);
  console.log(`[youtube-commenter] Simulating ${Math.round(watchTime / 1000)}s watch...`);
  await new Promise(r => setTimeout(r, watchTime));

  // Scroll down to comments section
  await page.evaluate(() => {
    const comments = document.querySelector('#comments');
    if (comments) {
      comments.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollBy(0, 600);
    }
  });
  await new Promise(r => setTimeout(r, 3000));

  // Additional scroll to trigger comment loading
  await page.evaluate(() => window.scrollBy(0, 300));
  await new Promise(r => setTimeout(r, 2000));

  // Click the comment placeholder ("Add a comment...")
  const clickedPlaceholder = await page.evaluate(() => {
    const placeholder = document.querySelector('#simplebox-placeholder, [id="placeholder-area"]');
    if (placeholder) {
      placeholder.click();
      return true;
    }
    return false;
  });

  if (!clickedPlaceholder) throw new Error('Cannot find comment placeholder');
  await new Promise(r => setTimeout(r, 1500));

  // Find the contenteditable editor and type
  const editor = await page.$('#contenteditable-root, [contenteditable="true"]');
  if (!editor) throw new Error('Cannot find comment editor');

  await editor.click();
  await new Promise(r => setTimeout(r, 500));

  // Type with human-like delay
  await page.keyboard.type(commentText, { delay: 45 });
  await new Promise(r => setTimeout(r, 2000));

  // Click submit button
  const submitted = await page.evaluate(() => {
    const submitBtn = document.querySelector('#submit-button button, #submit-button tp-yt-paper-button, [aria-label*="Comment"], [aria-label*="Comentar"]');
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
      return true;
    }
    // Fallback: find any enabled button inside #submit-button
    const container = document.querySelector('#submit-button');
    if (container) {
      const btn = container.querySelector('button, tp-yt-paper-button');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!submitted) throw new Error('Cannot find or click submit button');
  await new Promise(r => setTimeout(r, 3000));

  // Check for warnings/CAPTCHA
  const hasWarning = await page.evaluate(() => {
    const warn = document.querySelector('[class*="warning"], [class*="error"], [class*="captcha"]');
    return !!warn;
  });

  if (hasWarning) throw new Error('YouTube warning/CAPTCHA detected — aborting');

  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runYoutubeCommenter() {
  console.log(`[youtube-commenter] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  if (!YT_API_KEY) {
    console.log('[youtube-commenter] YOUTUBE_API_KEY not set');
    return;
  }

  const log = loadLog();
  const commentedVideos = new Set(log.comments.map(c => c.videoId));

  // Pick today's queries (rotate)
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const hourSlot = now.getHours() >= 18 ? 1 : 0;
  const startIdx = ((dayOfYear * 2) + hourSlot) % SEARCH_QUERIES.length;
  const queries = [
    SEARCH_QUERIES[startIdx % SEARCH_QUERIES.length],
    SEARCH_QUERIES[(startIdx + 1) % SEARCH_QUERIES.length],
  ];

  console.log(`[youtube-commenter] Finding videos for: ${queries.join(', ')}`);

  // Collect target videos
  const allVideos = [];
  for (const q of queries) {
    const videos = await findTargetVideos(q);
    allVideos.push(...videos.filter(v => !commentedVideos.has(v.videoId)));
    await new Promise(r => setTimeout(r, 500));
  }

  // Dedupe
  const seen = new Set();
  const unique = allVideos.filter(v => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });

  console.log(`[youtube-commenter] Found ${unique.length} target videos`);

  if (!unique.length) {
    saveLog(log);
    return;
  }

  // Process with each persona
  let videoIdx = 0;

  for (const persona of PERSONAS) {
    if (videoIdx >= unique.length) break;

    console.log(`[youtube-commenter] Using persona: ${persona.id}`);

    let page;
    try {
      page = await newPageForProfile(persona.profileDir, { headless: true });
    } catch (err) {
      console.error(`[youtube-commenter] Browser launch failed for ${persona.id}: ${err.message}`);
      continue;
    }

    try {
      const isLoggedIn = await verifyYoutubeSession(page);
      if (!isLoggedIn) {
        console.log(`[youtube-commenter] ${persona.id} not logged in to YouTube, skipping`);
        continue;
      }
      console.log(`[youtube-commenter] ${persona.id} YouTube session verified`);

      let personaComments = 0;

      while (personaComments < MAX_COMMENTS_PER_PERSONA && videoIdx < unique.length) {
        const video = unique[videoIdx++];

        // 1 in 5 comments mentions ytubviral
        const mentionYtubviral = Math.random() < 0.2;

        try {
          const comment = await generateYoutubeComment(video.title, video.channelTitle, mentionYtubviral);
          if (!comment) {
            console.log(`[youtube-commenter] Quality gate rejected comment for "${video.title.slice(0, 50)}"`);
            continue;
          }

          if (DRY_RUN) {
            console.log(`[youtube-commenter] DRY RUN — ${persona.id} would comment on "${video.title.slice(0, 50)}...":`);
            console.log(`  "${comment.slice(0, 120)}..."`);
          } else {
            await postYoutubeComment(page, video.url, comment);
            console.log(`[youtube-commenter] ${persona.id} commented on "${video.title.slice(0, 50)}..."`);
          }

          log.comments.push({
            videoId: video.videoId,
            videoTitle: video.title,
            persona: persona.id,
            mentionedYtubviral: mentionYtubviral,
            commentLength: comment.length,
            commentedAt: new Date().toISOString(),
          });
          log.totalComments++;
          personaComments++;

          // Delay between comments
          if (personaComments < MAX_COMMENTS_PER_PERSONA) {
            const delay = MIN_DELAY_BETWEEN + Math.random() * (MAX_DELAY_BETWEEN - MIN_DELAY_BETWEEN);
            console.log(`[youtube-commenter] Waiting ${Math.round(delay / 1000)}s...`);
            await new Promise(r => setTimeout(r, delay));
          }
        } catch (err) {
          console.error(`[youtube-commenter] Failed on "${video.title.slice(0, 50)}": ${err.message}`);
          if (err.message.includes('CAPTCHA') || err.message.includes('warning')) {
            console.error(`[youtube-commenter] Safety stop for ${persona.id}`);
            break;
          }
        }
      }

      console.log(`[youtube-commenter] ${persona.id}: ${personaComments} comments`);
    } finally {
      try { await closeBrowserForProfile(persona.profileDir); } catch {}
    }
  }

  saveLog(log);
  console.log(`[youtube-commenter] Done. ${log.comments.length} total comments in log.`);
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
  runYoutubeCommenter().catch(err => {
    console.error('[youtube-commenter] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runYoutubeCommenter };
