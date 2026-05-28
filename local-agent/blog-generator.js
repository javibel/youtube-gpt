'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { guardedCall } = require('./api-guard');

const DRY_RUN = process.argv.includes('--dry-run');
const STATE_PATH = path.join(__dirname, 'reports', 'blog-generator-state.json');
const BLOG_DATA_PATH = path.join(__dirname, '..', 'youtube-gpt', 'lib', 'blog-data.ts');
const GSC_INDEX_PATH = path.join(__dirname, 'gsc-index-urls.js');
const MAX_ARTICLES_PER_RUN = 1;

// ── BlockType definition for Claude ──────────────────────────────────────────

const BLOCKTYPE_DEFINITION = `
BlockType is a TypeScript union type. Each article body is an array of BlockType objects.
Valid block types:
- { type: 'p', t: string }                    — paragraph
- { type: 'h2', t: string }                   — section heading (main sections)
- { type: 'h3', t: string }                   — subsection heading
- { type: 'list', items: string[] }            — bulleted list
- { type: 'callout-mid', t: string, sub: string, cta: string, href: string } — mid-article CTA card (use 2-3 per article)
- { type: 'callout-final', t: string, sub: string, cta: string, href: string } — end-of-article CTA (exactly 1 at the very end)

Rules:
- Start with a compelling intro paragraph (type: 'p')
- Use h2 for main sections (5-8 per article)
- Use h3 for subsections when needed
- Include 2-3 callout-mid CTAs linking to relevant YTubViral features
- End with exactly 1 callout-final CTA
- Article should be 1200-2000 words total
- Write naturally, not AI-sounding. Use specific data, examples, and actionable advice
- Never use asterisks or markdown formatting inside text values
- href values for CTAs: /generate, /research, /seo-score, /features/competitor-analysis, /features/seo-score, /features/keyword-research, /features/ai-generator, /features/ab-testing, /features/trend-explorer
`.trim();

const EXAMPLE_BLOCKS = `
Example of a good article body (abbreviated):
[
  { "type": "p", "t": "One of the most common mistakes when starting on YouTube is thinking you need the best equipment on the market. Not true. The best creators in the world started with what they had." },
  { "type": "h2", "t": "Why Your Title Matters More Than Your Content" },
  { "type": "p", "t": "YouTube is a search engine. Your title is the first thing people see. A great video with a bad title gets zero clicks. Data from channels we've analyzed shows titles under 50 characters get 20% more clicks on average." },
  { "type": "list", "items": ["Use numbers when relevant (7 Tips, 5 Mistakes)", "Front-load the keyword", "Keep it under 60 characters", "Create curiosity without clickbait"] },
  { "type": "callout-mid", "t": "Generate viral titles with AI", "sub": "YTubViral analyzes top-performing titles in your niche and generates 5 optimized options.", "cta": "Try Title Generator", "href": "/generate" },
  { "type": "h2", "t": "The Description Nobody Reads (But YouTube Does)" },
  { "type": "p", "t": "Your description is not for viewers. Its for the algorithm. YouTube reads your description to understand what your video is about. A well-optimized description with keywords can double your search traffic." },
  { "type": "callout-final", "t": "Start optimizing your YouTube channel today", "sub": "Free SEO analysis, keyword research, and AI-powered content tools.", "cta": "Try YTubViral Free", "href": "/seo-score" }
]
`.trim();

// ── Initial keyword queue ────────────────────────────────────────────────────

const INITIAL_KEYWORDS = [
  { keyword: 'best youtube title generator 2026', slug: 'best-youtube-title-generator-2026', cat: 'ai', priority: 1 },
  { keyword: 'youtube seo checker free', slug: 'youtube-seo-checker-free-tool', cat: 'tutorials', priority: 1 },
  { keyword: 'vidiq alternative free 2026', slug: 'vidiq-alternative-free-2026', cat: 'ai', priority: 1 },
  { keyword: 'tubebuddy vs vidiq 2026', slug: 'tubebuddy-vs-vidiq-2026', cat: 'marketing', priority: 2 },
  { keyword: 'youtube description generator ai', slug: 'youtube-description-generator-ai', cat: 'ai', priority: 2 },
  { keyword: 'youtube tag generator free', slug: 'youtube-tag-generator-free-2026', cat: 'tutorials', priority: 2 },
  { keyword: 'youtube keyword research free tool', slug: 'youtube-keyword-research-free-tool', cat: 'tutorials', priority: 3 },
  { keyword: 'youtube analytics tools free 2026', slug: 'youtube-analytics-tools-free-2026', cat: 'ai', priority: 3 },
  { keyword: 'how to get more views on youtube 2026', slug: 'how-to-get-more-views-youtube-2026', cat: 'youtube', priority: 3 },
  { keyword: 'youtube thumbnail tips beginners', slug: 'youtube-thumbnail-tips-beginners-guide', cat: 'tutorials', priority: 3 },
];

// ── State management ─────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    const state = {
      queue: INITIAL_KEYWORDS.map(k => ({ ...k, status: 'pending' })),
      published: [],
      lastRun: null,
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    return state;
  }
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function pickNextKeyword(state) {
  return state.queue
    .filter(k => k.status === 'pending')
    .sort((a, b) => a.priority - b.priority)[0] || null;
}

// ── Article generation ───────────────────────────────────────────────────────

async function generateArticleBody(keyword, slug, cat, lang) {
  const langLabel = lang === 'es' ? 'Spanish' : 'English';
  const system = `You are an expert SEO content writer for a YouTube tools blog. You write detailed, practical articles optimized for search engines.

${BLOCKTYPE_DEFINITION}

${EXAMPLE_BLOCKS}

Output ONLY a valid JSON array of BlockType objects. No markdown, no code fences, no explanation — just the raw JSON array.`;

  const prompt = `Write a complete blog article in ${langLabel} targeting the keyword: "${keyword}"

Category: ${cat}
Target length: 1500-2000 words across all paragraphs
Slug: ${slug}

Requirements:
- SEO-optimized: use the target keyword naturally 3-5 times throughout
- Include 5-8 h2 sections with practical, actionable content
- Include specific data, statistics, or examples where possible
- Include 2-3 callout-mid CTAs linking to relevant YTubViral features
- End with 1 callout-final CTA
- Write in a conversational but professional tone
- If comparing tools (YTubViral vs competitors), be honest and fair but highlight YTubViral's strengths
- If the article is about a feature YTubViral offers, explain how to use it

Output ONLY the JSON array. No wrapping, no explanation.`;

  const { text: result } = await guardedCall(prompt, {
    maxTokens: 8000,
    agentId: 'blog-generator',
    model: 'claude-sonnet-4-6',
    system,
  });

  // Parse JSON — handle potential code fences
  let cleaned = result.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const blocks = JSON.parse(cleaned);
  if (!Array.isArray(blocks)) throw new Error('Response is not an array');
  return blocks;
}

async function generateMetadata(keyword, slug, cat) {
  const system = 'You generate blog post metadata. Output ONLY valid JSON, no explanation.';
  const prompt = `Generate metadata for a blog article about: "${keyword}"

Output JSON with this exact structure:
{
  "title_es": "Título SEO en español (50-70 chars, incluye keyword)",
  "title_en": "SEO title in English (50-70 chars, includes keyword)",
  "excerpt_es": "Descripción corta en español (150-200 chars)",
  "excerpt_en": "Short description in English (150-200 chars)",
  "readMin": 10
}`;

  const { text: result } = await guardedCall(prompt, {
    maxTokens: 500,
    agentId: 'blog-generator',
    system,
  });
  let cleaned = result.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateBlockTypes(blocks) {
  const errors = [];
  const validTypes = ['p', 'h2', 'h3', 'list', 'callout', 'callout-mid', 'callout-final', 'callout-gear', 'video'];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== 'object') { errors.push(`Block ${i}: not an object`); continue; }
    if (!validTypes.includes(b.type)) { errors.push(`Block ${i}: invalid type "${b.type}"`); continue; }

    if (['p', 'h2', 'h3', 'callout'].includes(b.type) && typeof b.t !== 'string') {
      errors.push(`Block ${i} (${b.type}): missing or invalid 't' field`);
    }
    if (b.type === 'list' && (!Array.isArray(b.items) || b.items.some(x => typeof x !== 'string'))) {
      errors.push(`Block ${i} (list): 'items' must be string[]`);
    }
    if (['callout-mid', 'callout-final'].includes(b.type)) {
      if (typeof b.t !== 'string') errors.push(`Block ${i} (${b.type}): missing 't'`);
      if (typeof b.sub !== 'string') errors.push(`Block ${i} (${b.type}): missing 'sub'`);
      if (typeof b.cta !== 'string') errors.push(`Block ${i} (${b.type}): missing 'cta'`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── TypeScript code generation ───────────────────────────────────────────────

function escapeForTS(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function blockToTS(block, indent = '  ') {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'callout':
      return `${indent}{ type: '${block.type}', t: '${escapeForTS(block.t)}' },`;
    case 'list':
      const items = block.items.map(i => `'${escapeForTS(i)}'`).join(', ');
      return `${indent}{ type: 'list', items: [${items}] },`;
    case 'callout-mid':
    case 'callout-final':
      const href = block.href ? `, href: '${escapeForTS(block.href)}'` : '';
      return `${indent}{ type: '${block.type}', t: '${escapeForTS(block.t)}', sub: '${escapeForTS(block.sub)}', cta: '${escapeForTS(block.cta)}'${href} },`;
    case 'callout-gear':
      return `${indent}{ type: 'callout-gear', t: '${escapeForTS(block.t)}', sub: '${escapeForTS(block.sub)}', cta: '${escapeForTS(block.cta)}' },`;
    case 'video':
      return `${indent}{ type: 'video', videoId: '${escapeForTS(block.videoId)}' },`;
    default:
      return '';
  }
}

function buildTypeScriptCode(slug, metadata, bodyEs, bodyEn) {
  const varName = slug.replace(/-/g, '_').toUpperCase();
  const today = new Date();
  const dateEs = today.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateEn = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const constBlock = `
const ART_${varName}_ES: BlockType[] = [
${bodyEs.map(b => blockToTS(b)).join('\n')}
];

const ART_${varName}_EN: BlockType[] = [
${bodyEn.map(b => blockToTS(b)).join('\n')}
];
`.trim();

  const postsEntry = `  {
    slug: '${slug}',
    cat: '${metadata.cat}',
    readMin: ${metadata.readMin || 10},
    date: { es: '${dateEs}', en: '${dateEn}' },
    author: { name: 'Javier Jimeno', role: { es: 'CEO & Fundador de YTubViral', en: 'CEO & Founder of YTubViral' }, avatar: 'JJ' },
    image: '/blog/${slug}.webp',
    title: {
      es: '${escapeForTS(metadata.title_es)}',
      en: '${escapeForTS(metadata.title_en)}',
    },
    excerpt: {
      es: '${escapeForTS(metadata.excerpt_es)}',
      en: '${escapeForTS(metadata.excerpt_en)}',
    },
  },`;

  const bodiesEntry = `  '${slug}': {
    es: ART_${varName}_ES,
    en: ART_${varName}_EN,
  },`;

  return { constBlock, postsEntry, bodiesEntry };
}

// ── File manipulation ────────────────────────────────────────────────────────

function appendToBlogData(tsCode) {
  // Backup first
  const backup = BLOG_DATA_PATH + '.bak';
  fs.copyFileSync(BLOG_DATA_PATH, backup);

  let content = fs.readFileSync(BLOG_DATA_PATH, 'utf8');

  // 1. Insert const arrays BEFORE "export const ARTICLE_BODIES"
  const bodiesMarker = 'export const ARTICLE_BODIES';
  const bodiesIdx = content.indexOf(bodiesMarker);
  if (bodiesIdx === -1) throw new Error('Cannot find ARTICLE_BODIES marker in blog-data.ts');
  content = content.slice(0, bodiesIdx) + tsCode.constBlock + '\n\n' + content.slice(bodiesIdx);

  // 2. Insert new entry into BLOG_POSTS array (before the "];" that closes it)
  // Find the BLOG_POSTS closing: last occurrence of "];" before ARTICLE_BODIES
  const postsClosePattern = /\n\];\n\n\/\/ ── Article bodies/;
  const postsMatch = content.match(postsClosePattern);
  if (!postsMatch) throw new Error('Cannot find BLOG_POSTS closing bracket');
  const postsCloseIdx = content.indexOf(postsMatch[0]);
  content = content.slice(0, postsCloseIdx) + '\n' + tsCode.postsEntry + '\n];\n\n// ── Article bodies' + content.slice(postsCloseIdx + postsMatch[0].length);

  // 3. Insert new entry into ARTICLE_BODIES record (before the "};" that closes it)
  const bodiesClosePattern = /\n\};\n\nexport function getPost/;
  const bodiesCloseMatch = content.match(bodiesClosePattern);
  if (!bodiesCloseMatch) throw new Error('Cannot find ARTICLE_BODIES closing brace');
  const bodiesCloseIdx = content.indexOf(bodiesCloseMatch[0]);
  content = content.slice(0, bodiesCloseIdx) + '\n' + tsCode.bodiesEntry + '\n};\n\nexport function getPost' + content.slice(bodiesCloseIdx + bodiesCloseMatch[0].length);

  fs.writeFileSync(BLOG_DATA_PATH, content, 'utf8');
  console.log(`[blog-generator] Appended article to blog-data.ts`);

  // Remove backup if write succeeded
  try { fs.unlinkSync(backup); } catch {}
}

function addToGscIndex(slug) {
  let content = fs.readFileSync(GSC_INDEX_PATH, 'utf8');
  const newUrl = `    'https://ytubviral.com/blog/${slug}',`;
  // Insert after the last blog URL
  const lastBlogUrl = content.lastIndexOf("'https://ytubviral.com/blog/");
  if (lastBlogUrl === -1) return;
  const endOfLine = content.indexOf('\n', lastBlogUrl);
  content = content.slice(0, endOfLine + 1) + newUrl + '\n' + content.slice(endOfLine + 1);
  fs.writeFileSync(GSC_INDEX_PATH, content, 'utf8');
  console.log(`[blog-generator] Added ${slug} to gsc-index-urls.js`);
}

function triggerIndexing() {
  try {
    execSync(`node "${GSC_INDEX_PATH}"`, { cwd: __dirname, timeout: 60000, stdio: 'pipe', windowsHide: true });
    console.log('[blog-generator] Google indexing triggered');
  } catch (err) {
    console.error('[blog-generator] Indexing failed:', err.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runBlogGenerator() {
  console.log(`[blog-generator] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const state = loadState();
  let count = 0;
  const slugs = [];

  for (let i = 0; i < MAX_ARTICLES_PER_RUN; i++) {
    const kw = pickNextKeyword(state);
    if (!kw) {
      console.log('[blog-generator] No pending keywords in queue');
      break;
    }

    console.log(`[blog-generator] Generating article for: "${kw.keyword}" (slug: ${kw.slug})`);

    try {
      // Generate metadata
      const metadata = await generateMetadata(kw.keyword, kw.slug, kw.cat);
      metadata.cat = kw.cat;
      console.log(`[blog-generator] Metadata: "${metadata.title_en}"`);

      // Generate body ES
      console.log('[blog-generator] Generating Spanish body...');
      const bodyEs = await generateArticleBody(kw.keyword, kw.slug, kw.cat, 'es');
      const valEs = validateBlockTypes(bodyEs);
      if (!valEs.valid) {
        console.error(`[blog-generator] ES validation failed:`, valEs.errors);
        kw.status = 'failed';
        kw.error = valEs.errors.join('; ');
        saveState(state);
        continue;
      }
      console.log(`[blog-generator] ES body: ${bodyEs.length} blocks`);

      // Generate body EN
      console.log('[blog-generator] Generating English body...');
      const bodyEn = await generateArticleBody(kw.keyword, kw.slug, kw.cat, 'en');
      const valEn = validateBlockTypes(bodyEn);
      if (!valEn.valid) {
        console.error(`[blog-generator] EN validation failed:`, valEn.errors);
        kw.status = 'failed';
        kw.error = valEn.errors.join('; ');
        saveState(state);
        continue;
      }
      console.log(`[blog-generator] EN body: ${bodyEn.length} blocks`);

      // Build TypeScript code
      const tsCode = buildTypeScriptCode(kw.slug, metadata, bodyEs, bodyEn);

      if (DRY_RUN) {
        console.log('[blog-generator] DRY RUN — would insert:');
        console.log(`  Const block: ${tsCode.constBlock.split('\n').length} lines`);
        console.log(`  BLOG_POSTS entry: ${tsCode.postsEntry.split('\n').length} lines`);
        console.log(`  ARTICLE_BODIES entry: ${tsCode.bodiesEntry.split('\n').length} lines`);
      } else {
        // Append to blog-data.ts
        appendToBlogData(tsCode);

        // Add to GSC index and trigger
        addToGscIndex(kw.slug);
        triggerIndexing();
      }

      // Update state (don't mark as published in dry run)
      if (!DRY_RUN) {
        kw.status = 'published';
        state.published.push({
          slug: kw.slug,
          keyword: kw.keyword,
          publishedAt: new Date().toISOString(),
          indexedAt: new Date().toISOString(),
        });
      }

      count++;
      slugs.push(kw.slug);
      console.log(`[blog-generator] Article "${kw.slug}" ${DRY_RUN ? 'validated' : 'published'} successfully`);

    } catch (err) {
      console.error(`[blog-generator] Failed to generate "${kw.keyword}":`, err.message);
      kw.status = 'failed';
      kw.error = err.message;
    }
  }

  saveState(state);
  console.log(`[blog-generator] Done. ${count} article(s) ${DRY_RUN ? 'validated' : 'published'}.`);
  return { count, slugs };
}

if (require.main === module) {
  runBlogGenerator().catch(err => {
    console.error('[blog-generator] Fatal:', err);
    process.exit(1);
  });
}

module.exports = { runBlogGenerator };
