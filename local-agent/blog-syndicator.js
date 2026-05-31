'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { OAuth } = require('oauth');

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PATH = path.join(__dirname, 'reports', 'blog-syndication-log.json');
const BLOG_DATA_PATH = path.join(__dirname, '..', 'youtube-gpt', 'lib', 'blog-data.ts');

// WordPress.com credentials
const WP_SITE = (process.env.WP_COM_SITE || '').trim();          // e.g. "ytubviral.wordpress.com"
const WP_TOKEN = (process.env.WP_COM_TOKEN || '').trim();         // OAuth2 bearer token

// Blogger credentials (reuses existing Google OAuth)
const BLOGGER_BLOG_ID = (process.env.BLOGGER_BLOG_ID || '').trim();
const BLOGGER_CLIENT_ID = (process.env.GMAIL_CLIENT_ID || '').trim();
const BLOGGER_CLIENT_SECRET = (process.env.GMAIL_CLIENT_SECRET || '').trim();
const BLOGGER_REFRESH_TOKEN = (process.env.BLOGGER_REFRESH_TOKEN || '').trim();

// Tumblr credentials (OAuth 1.0a)
const TUMBLR_CONSUMER_KEY = (process.env.TUMBLR_CONSUMER_KEY || '').trim();
const TUMBLR_CONSUMER_SECRET = (process.env.TUMBLR_CONSUMER_SECRET || '').trim();
const TUMBLR_ACCESS_TOKEN = (process.env.TUMBLR_ACCESS_TOKEN || '').trim();
const TUMBLR_ACCESS_TOKEN_SECRET = (process.env.TUMBLR_ACCESS_TOKEN_SECRET || '').trim();
const TUMBLR_BLOG_NAME = (process.env.TUMBLR_BLOG_NAME || '').trim();

const MAX_PER_RUN = 1; // Syndicate 1 article per run to avoid rate limits

// ── Log management ──────────────────────────────────────────────────────────

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    const log = { syndicated: [], lastRun: null };
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    return log;
  }
}

function saveLog(log) {
  log.lastRun = new Date().toISOString();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ── Extract articles from blog-data.ts ──────────────────────────────────────

function getAllSlugs() {
  const content = fs.readFileSync(BLOG_DATA_PATH, 'utf8');
  const slugs = [];
  const re = /slug:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    slugs.push(m[1]);
  }
  return slugs;
}

function extractArticleData(slug) {
  const content = fs.readFileSync(BLOG_DATA_PATH, 'utf8');

  const slugIdx = content.indexOf(`slug: '${slug}'`);
  if (slugIdx === -1) return null;

  const blockAround = content.slice(slugIdx, slugIdx + 800);

  const titleEnMatch = blockAround.match(/title:\s*\{[^}]*en:\s*'([^']+)'/s);
  const titleEsMatch = blockAround.match(/title:\s*\{[^}]*es:\s*'([^']+)'/s);
  const excerptEnMatch = blockAround.match(/excerpt:\s*\{[^}]*en:\s*'([^']+)'/s);
  const catMatch = blockAround.match(/cat:\s*'([^']+)'/);

  const titleEn = titleEnMatch?.[1] || slug;
  const titleEs = titleEsMatch?.[1] || slug;
  const excerptEn = excerptEnMatch?.[1] || '';
  const cat = catMatch?.[1] || 'tutorials';

  // Extract article body variable name from ARTICLE_BODIES mapping
  // Find the slug entry and extract the EN variable name
  const bodiesStart = content.indexOf('export const ARTICLE_BODIES');
  const bodiesSection = content.slice(bodiesStart);
  const slugPos = bodiesSection.indexOf(`'${slug}'`);
  if (slugPos === -1) return null;
  const afterSlug = bodiesSection.slice(slugPos, slugPos + 200);
  const enVarMatch = afterSlug.match(/en:\s*(\w+)/);
  if (!enVarMatch) return null;
  const bodyVarName = enVarMatch[1];

  const bodyStart = content.indexOf(`const ${bodyVarName}`);
  if (bodyStart === -1) return null;

  // Skip past "BlockType[] = " to find the actual array opening bracket
  const eqSign = content.indexOf('= [', bodyStart);
  if (eqSign === -1) return null;
  const arrayStart = eqSign + 2; // points to the '[' after '= '
  let depth = 0;
  let arrayEnd = arrayStart;
  for (let i = arrayStart; i < content.length; i++) {
    if (content[i] === '[') depth++;
    if (content[i] === ']') depth--;
    if (depth === 0) { arrayEnd = i + 1; break; }
  }

  const bodyStr = content.slice(arrayStart, arrayEnd);
  const blocks = parseBlocksFromTS(bodyStr);

  return { slug, titleEn, titleEs, excerptEn, cat, blocks };
}

function parseBlocksFromTS(tsArrayStr) {
  const blocks = [];
  const blockRe = /\{\s*type:\s*'([^']+)'[^}]*\}/g;
  let m;
  while ((m = blockRe.exec(tsArrayStr)) !== null) {
    const type = m[1];
    const full = m[0];

    if (type === 'p' || type === 'h2' || type === 'h3' || type === 'callout') {
      const tMatch = full.match(/\bt:\s*'((?:[^'\\]|\\.)*)'/);
      if (tMatch) blocks.push({ type, t: tMatch[1].replace(/\\'/g, "'").replace(/\\n/g, '\n') });
    } else if (type === 'list') {
      const itemsMatch = full.match(/items:\s*\[(.*?)\]/s);
      if (itemsMatch) {
        const items = [];
        const itemRe = /'((?:[^'\\]|\\.)*)'/g;
        let im;
        while ((im = itemRe.exec(itemsMatch[1])) !== null) {
          items.push(im[1].replace(/\\'/g, "'").replace(/\\n/g, '\n'));
        }
        blocks.push({ type: 'list', items });
      }
    } else if (type === 'callout-mid' || type === 'callout-final') {
      const tMatch = full.match(/\bt:\s*'((?:[^'\\]|\\.)*)'/);
      const subMatch = full.match(/sub:\s*'((?:[^'\\]|\\.)*)'/);
      const ctaMatch = full.match(/cta:\s*'((?:[^'\\]|\\.)*)'/);
      const hrefMatch = full.match(/href:\s*'((?:[^'\\]|\\.)*)'/);
      blocks.push({
        type,
        t: tMatch?.[1]?.replace(/\\'/g, "'") || '',
        sub: subMatch?.[1]?.replace(/\\'/g, "'") || '',
        cta: ctaMatch?.[1]?.replace(/\\'/g, "'") || '',
        href: hrefMatch?.[1] || '',
      });
    } else if (type === 'video') {
      const vidMatch = full.match(/videoId:\s*'([^']+)'/);
      if (vidMatch) blocks.push({ type: 'video', videoId: vidMatch[1] });
    }
  }
  return blocks;
}

// ── BlockType → HTML conversion (for Blogger + WordPress) ───────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function blocksToHtml(blocks, slug) {
  const lines = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'p':
        lines.push(`<p>${escapeHtml(block.t)}</p>`);
        break;
      case 'h2':
        lines.push(`<h2>${escapeHtml(block.t)}</h2>`);
        break;
      case 'h3':
        lines.push(`<h3>${escapeHtml(block.t)}</h3>`);
        break;
      case 'list':
        lines.push('<ul>');
        for (const item of block.items) {
          lines.push(`  <li>${escapeHtml(item)}</li>`);
        }
        lines.push('</ul>');
        break;
      case 'callout':
        lines.push(`<blockquote><p>${escapeHtml(block.t)}</p></blockquote>`);
        break;
      case 'callout-mid':
      case 'callout-final':
        lines.push('<blockquote>');
        lines.push(`  <p><strong>${escapeHtml(block.t)}</strong></p>`);
        lines.push(`  <p>${escapeHtml(block.sub)}</p>`);
        if (block.href) {
          lines.push(`  <p><a href="https://ytubviral.com${block.href}">${escapeHtml(block.cta)}</a></p>`);
        }
        lines.push('</blockquote>');
        break;
      case 'video':
        lines.push(`<p><a href="https://www.youtube.com/watch?v=${block.videoId}">Watch on YouTube</a></p>`);
        break;
    }
  }

  // Syndication footer with backlink
  lines.push('<hr>');
  lines.push(`<p><em>Originally published on <a href="https://ytubviral.com/blog/${slug}">YTubViral Blog</a>. YTubViral is a free AI-powered toolkit for YouTube creators — SEO analysis, title generation, keyword research, and more.</em></p>`);

  return lines.join('\n');
}

// ── BlockType → Markdown conversion (kept for compatibility) ────────────────

function blocksToMarkdown(blocks, slug) {
  const lines = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'p':
        lines.push(block.t);
        lines.push('');
        break;
      case 'h2':
        lines.push(`## ${block.t}`);
        lines.push('');
        break;
      case 'h3':
        lines.push(`### ${block.t}`);
        lines.push('');
        break;
      case 'list':
        for (const item of block.items) {
          lines.push(`- ${item}`);
        }
        lines.push('');
        break;
      case 'callout':
        lines.push(`> ${block.t}`);
        lines.push('');
        break;
      case 'callout-mid':
      case 'callout-final':
        lines.push(`> **${block.t}**`);
        lines.push(`> ${block.sub}`);
        if (block.href) {
          lines.push(`> [${block.cta}](https://ytubviral.com${block.href})`);
        }
        lines.push('');
        break;
      case 'video':
        lines.push(`[Watch on YouTube](https://www.youtube.com/watch?v=${block.videoId})`);
        lines.push('');
        break;
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Originally published on [YTubViral Blog](https://ytubviral.com/blog/${slug}). YTubViral is a free AI-powered toolkit for YouTube creators — SEO analysis, title generation, keyword research, and more.*`);

  return lines.join('\n');
}

// ── Category → tags mapping ─────────────────────────────────────────────────

function getCategoryTags(cat) {
  const tagMap = {
    ai: ['youtube', 'ai', 'productivity', 'tools'],
    youtube: ['youtube', 'contentcreation', 'socialmedia', 'video'],
    marketing: ['youtube', 'marketing', 'seo', 'growth'],
    tutorials: ['youtube', 'tutorial', 'seo', 'beginners'],
    gear: ['youtube', 'equipment', 'gear', 'video'],
  };
  return tagMap[cat] || ['youtube', 'contentcreation'];
}

// ── Blogger API (Google OAuth2) ─────────────────────────────────────────────

async function getBloggerAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: BLOGGER_CLIENT_ID,
      client_secret: BLOGGER_CLIENT_SECRET,
      refresh_token: BLOGGER_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Blogger OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function publishToBlogger(title, htmlContent, canonicalUrl, tags) {
  if (!BLOGGER_BLOG_ID || !BLOGGER_REFRESH_TOKEN) {
    console.log('[blog-syndicator] Blogger: No blog ID or refresh token, skipping');
    return null;
  }

  if (DRY_RUN) {
    console.log(`[blog-syndicator] DRY RUN Blogger: "${title}" (${tags.join(', ')})`);
    return { url: 'dry-run', id: 'dry-run' };
  }

  const accessToken = await getBloggerAccessToken();

  // Note: canonical in <body> is ignored by Google — Blogger must be configured
  // via theme settings to add noindex or canonical in <head> for syndicated posts.

  const body = {
    kind: 'blogger#post',
    title,
    content: htmlContent,
    labels: tags,
  };

  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOGGER_BLOG_ID}/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blogger API ${res.status}: ${err}`);
  }

  const data = await res.json();
  console.log(`[blog-syndicator] Published to Blogger: ${data.url}`);
  return { url: data.url, id: data.id };
}

// ── WordPress.com REST API ──────────────────────────────────────────────────

async function publishToWordPress(title, htmlContent, canonicalUrl, tags) {
  if (!WP_SITE || !WP_TOKEN) {
    console.log('[blog-syndicator] WordPress.com: No site or token, skipping');
    return null;
  }

  if (DRY_RUN) {
    console.log(`[blog-syndicator] DRY RUN WordPress.com: "${title}" (${tags.join(', ')})`);
    return { url: 'dry-run', id: 0 };
  }

  const body = {
    title,
    content: htmlContent,
    status: 'publish',
    tags: tags.join(','),
    format: 'standard',
    meta: { canonical_url: canonicalUrl },
  };

  const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${WP_SITE}/posts/new`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress.com API ${res.status}: ${err}`);
  }

  const data = await res.json();
  console.log(`[blog-syndicator] Published to WordPress.com: ${data.URL}`);
  return { url: data.URL, id: data.ID };
}

// ── Tumblr API (OAuth 1.0a) ─────────────────────────────────────────────────

async function publishToTumblr(title, htmlContent, canonicalUrl, tags) {
  if (!TUMBLR_CONSUMER_KEY || !TUMBLR_ACCESS_TOKEN || !TUMBLR_BLOG_NAME) {
    console.log('[blog-syndicator] Tumblr: No credentials or blog name, skipping');
    return null;
  }

  if (DRY_RUN) {
    console.log(`[blog-syndicator] DRY RUN Tumblr: "${title}" (${tags.join(', ')})`);
    return { url: 'dry-run', id: 'dry-run' };
  }

  const oauth = new OAuth(
    'https://www.tumblr.com/oauth/request_token',
    'https://www.tumblr.com/oauth/access_token',
    TUMBLR_CONSUMER_KEY,
    TUMBLR_CONSUMER_SECRET,
    '1.0A',
    null,
    'HMAC-SHA1'
  );

  const postUrl = `https://api.tumblr.com/v2/blog/${TUMBLR_BLOG_NAME}/post`;

  // Add source link at the bottom
  const contentWithSource = `${htmlContent}\n<p><a href="${canonicalUrl}">Read the original article on YTubViral</a></p>`;

  const postData = {
    type: 'text',
    title,
    body: contentWithSource,
    tags: tags.join(','),
    format: 'html',
    state: 'published',
    source_url: canonicalUrl,
  };

  return new Promise((resolve, reject) => {
    oauth.post(
      postUrl,
      TUMBLR_ACCESS_TOKEN,
      TUMBLR_ACCESS_TOKEN_SECRET,
      postData,
      'application/x-www-form-urlencoded',
      (err, data) => {
        if (err) {
          const errMsg = typeof err.data === 'string' ? err.data : JSON.stringify(err);
          return reject(new Error(`Tumblr API: ${errMsg}`));
        }
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const postId = parsed.response?.id;
        const url = `https://www.tumblr.com/${TUMBLR_BLOG_NAME}/${postId}`;
        // Also fetch the real post_url from the API
        console.log(`[blog-syndicator] Published to Tumblr: ${url}`);
        resolve({ url, id: String(postId) });
      }
    );
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runBlogSyndicator() {
  console.log(`[blog-syndicator] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const hasWordPress = WP_SITE && WP_TOKEN;
  const hasBlogger = BLOGGER_BLOG_ID && BLOGGER_REFRESH_TOKEN;
  const hasTumblr = TUMBLR_CONSUMER_KEY && TUMBLR_ACCESS_TOKEN && TUMBLR_BLOG_NAME;

  if (!hasWordPress && !hasBlogger && !hasTumblr) {
    console.log('[blog-syndicator] No platform configured. Set credentials in .env');
    return;
  }

  console.log(`[blog-syndicator] Platforms: ${hasWordPress ? 'WordPress.com' : '-'} | ${hasBlogger ? 'Blogger' : '-'} | ${hasTumblr ? 'Tumblr' : '-'}`);

  const log = loadLog();
  const allSlugs = getAllSlugs();
  const syndicatedSlugs = new Set(log.syndicated.map(s => s.slug));

  // Find unsyndicated articles (oldest first)
  const unsyndicated = allSlugs.filter(s => !syndicatedSlugs.has(s));

  if (!unsyndicated.length) {
    console.log('[blog-syndicator] All articles already syndicated');
    saveLog(log);
    return;
  }

  console.log(`[blog-syndicator] ${unsyndicated.length} articles pending syndication`);
  let count = 0;

  for (const slug of unsyndicated.slice(0, MAX_PER_RUN)) {
    console.log(`[blog-syndicator] Processing: ${slug}`);

    const article = extractArticleData(slug);
    if (!article || !article.blocks.length) {
      console.log(`[blog-syndicator] Could not extract data for ${slug}, skipping`);
      continue;
    }

    const htmlContent = blocksToHtml(article.blocks, slug);
    const canonicalUrl = `https://ytubviral.com/blog/${slug}`;
    const tags = getCategoryTags(article.cat);

    const entry = {
      slug,
      title: article.titleEn,
      syndicatedAt: new Date().toISOString(),
      wordpress: null,
      blogger: null,
      tumblr: null,
    };

    // Publish to WordPress.com
    try {
      entry.wordpress = await publishToWordPress(article.titleEn, htmlContent, canonicalUrl, tags);
    } catch (err) {
      console.error(`[blog-syndicator] WordPress.com error for ${slug}:`, err.message);
      entry.wordpress = { error: err.message };
    }

    // Publish to Blogger
    try {
      entry.blogger = await publishToBlogger(article.titleEn, htmlContent, canonicalUrl, tags);
    } catch (err) {
      console.error(`[blog-syndicator] Blogger error for ${slug}:`, err.message);
      entry.blogger = { error: err.message };
    }

    // Publish to Tumblr
    try {
      entry.tumblr = await publishToTumblr(article.titleEn, htmlContent, canonicalUrl, tags);
    } catch (err) {
      console.error(`[blog-syndicator] Tumblr error for ${slug}:`, err.message);
      entry.tumblr = { error: err.message };
    }

    log.syndicated.push(entry);
    count++;
    console.log(`[blog-syndicator] Syndicated: ${slug}`);
  }

  saveLog(log);
  console.log(`[blog-syndicator] Done. ${count} article(s) syndicated.`);
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
  runBlogSyndicator().catch(err => {
    console.error('[blog-syndicator] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runBlogSyndicator };
