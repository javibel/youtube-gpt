'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PATH = path.join(__dirname, 'reports', 'blog-syndication-log.json');
const BLOG_DATA_PATH = path.join(__dirname, '..', 'youtube-gpt', 'lib', 'blog-data.ts');

const DEV_TO_API_KEY = (process.env.DEV_TO_API_KEY || '').trim();
const HASHNODE_API_KEY = (process.env.HASHNODE_API_KEY || '').trim();
const HASHNODE_PUBLICATION_ID = (process.env.HASHNODE_PUBLICATION_ID || '').trim();

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

  // Extract title (EN)
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

  // Extract article body blocks (EN version)
  const varName = slug.replace(/-/g, '_').toUpperCase();
  const bodyVarName = `ART_${varName}_EN`;

  // Find the const declaration for EN body
  const bodyStart = content.indexOf(`const ${bodyVarName}`);
  if (bodyStart === -1) return null;

  // Find the closing "];" for this array
  const arrayStart = content.indexOf('[', bodyStart);
  let depth = 0;
  let arrayEnd = arrayStart;
  for (let i = arrayStart; i < content.length; i++) {
    if (content[i] === '[') depth++;
    if (content[i] === ']') depth--;
    if (depth === 0) { arrayEnd = i + 1; break; }
  }

  // We can't JSON.parse TypeScript directly, so we'll regex-extract blocks
  const bodyStr = content.slice(arrayStart, arrayEnd);
  const blocks = parseBlocksFromTS(bodyStr);

  return { slug, titleEn, titleEs, excerptEn, cat, blocks };
}

function parseBlocksFromTS(tsArrayStr) {
  const blocks = [];
  // Match each { type: '...', ... } block
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

// ── BlockType → Markdown conversion ─────────────────────────────────────────

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
        lines.push(`{% youtube ${block.videoId} %}`);
        lines.push('');
        break;
    }
  }

  // Add syndication footer
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

// ── Dev.to API ──────────────────────────────────────────────────────────────

async function publishToDevTo(title, markdown, canonicalUrl, tags) {
  if (!DEV_TO_API_KEY) {
    console.log('[blog-syndicator] Dev.to: No API key, skipping');
    return null;
  }

  const body = {
    article: {
      title,
      body_markdown: markdown,
      published: true,
      canonical_url: canonicalUrl,
      tags: tags.slice(0, 4), // Dev.to max 4 tags
    },
  };

  if (DRY_RUN) {
    console.log(`[blog-syndicator] DRY RUN Dev.to: "${title}" (${tags.join(', ')})`);
    return { url: 'dry-run', id: 0 };
  }

  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': DEV_TO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dev.to API ${res.status}: ${err}`);
  }

  const data = await res.json();
  console.log(`[blog-syndicator] Published to Dev.to: ${data.url}`);
  return { url: data.url, id: data.id };
}

// ── Hashnode API (GraphQL) ──────────────────────────────────────────────────

async function publishToHashnode(title, markdown, canonicalUrl, tags) {
  if (!HASHNODE_API_KEY || !HASHNODE_PUBLICATION_ID) {
    console.log('[blog-syndicator] Hashnode: No API key or publication ID, skipping');
    return null;
  }

  const mutation = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          id
          url
          slug
        }
      }
    }
  `;

  const variables = {
    input: {
      title,
      contentMarkdown: markdown,
      publicationId: HASHNODE_PUBLICATION_ID,
      originalArticleURL: canonicalUrl,
      tags: tags.map(t => ({ slug: t, name: t })),
    },
  };

  if (DRY_RUN) {
    console.log(`[blog-syndicator] DRY RUN Hashnode: "${title}" (${tags.join(', ')})`);
    return { url: 'dry-run', id: 'dry-run' };
  }

  const res = await fetch('https://gql.hashnode.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': HASHNODE_API_KEY,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Hashnode API ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`Hashnode: ${data.errors[0].message}`);
  }

  const post = data.data?.publishPost?.post;
  console.log(`[blog-syndicator] Published to Hashnode: ${post?.url}`);
  return { url: post?.url || '', id: post?.id || '' };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runBlogSyndicator() {
  console.log(`[blog-syndicator] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  if (!DEV_TO_API_KEY && !HASHNODE_API_KEY) {
    console.log('[blog-syndicator] No platform API keys configured. Set DEV_TO_API_KEY and/or HASHNODE_API_KEY in .env');
    return;
  }

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

    const markdown = blocksToMarkdown(article.blocks, slug);
    const canonicalUrl = `https://ytubviral.com/blog/${slug}`;
    const tags = getCategoryTags(article.cat);

    const entry = {
      slug,
      title: article.titleEn,
      syndicatedAt: new Date().toISOString(),
      devTo: null,
      hashnode: null,
    };

    // Publish to Dev.to
    try {
      entry.devTo = await publishToDevTo(article.titleEn, markdown, canonicalUrl, tags);
    } catch (err) {
      console.error(`[blog-syndicator] Dev.to error for ${slug}:`, err.message);
      entry.devTo = { error: err.message };
    }

    // Publish to Hashnode
    try {
      entry.hashnode = await publishToHashnode(article.titleEn, markdown, canonicalUrl, tags);
    } catch (err) {
      console.error(`[blog-syndicator] Hashnode error for ${slug}:`, err.message);
      entry.hashnode = { error: err.message };
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
