'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { guardedCall } = require('./api-guard');

const DRY_RUN = process.argv.includes('--dry-run');
// Overridable por env para poder probar la insercion (appendToBlogData) sin tocar el
// state ni el blog-data.ts reales. Idea tomada de un intento de arreglo anterior que
// vivia en un worktree de este mismo repo (rama claude/nifty-golick-266653, commit
// 8ab9010) y nunca se habia mergeado a main.
const STATE_PATH = process.env.BLOG_STATE_PATH
  ? path.resolve(process.env.BLOG_STATE_PATH)
  : path.join(__dirname, 'reports', 'blog-generator-state.json');
const YT_PROJECT = process.env.BLOG_DATA_PROJECT
  ? path.resolve(process.env.BLOG_DATA_PROJECT)
  : path.join(__dirname, '..', 'youtube-gpt');
const BLOG_DATA_PATH = path.join(YT_PROJECT, 'lib', 'blog-data.ts');
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

TRUTHFULNESS RULES — these override everything else. Every article is published under the byline of the real CEO, Javier Jimeno. Violating these is a serious brand and legal problem:
- NEVER invent statistics, percentages, multipliers ("3x faster", "35% more CTR", "up to 300%"), or numeric study findings. If you don't have a real, verifiable source for a number, don't use a number — make the point qualitatively ("a strong title can significantly lift CTR").
- NEVER attribute a claim to a named source (Backlinko, Briggsby, Social Blade, "YouTube's own data", "a study of 100,000 videos") unless you are certain that exact source published that exact finding. When unsure, drop the attribution and the number together.
- NEVER claim YTubViral has run studies, "internal data", "internal tests", "channels we analyzed", or A/B test results. YTubViral has NOT published any such research. Do not imply it has.
- NEVER invent named case studies ("a channel called 'Finanzas Para Todos' went from 12,000 to 87,000 subscribers"). Illustrative examples are fine ONLY if clearly hypothetical ("imagine a finance channel that...").
- Do NOT state specific competitor prices or plan names as fact (they change and are often wrong). Say "paid plans" / "higher tiers" instead.
Well-known, uncontroversial facts stated without a fake citation are fine ("YouTube is the second-largest search engine").

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
- Use concrete, practical examples — but follow the TRUTHFULNESS RULES: no invented statistics, no fake source attributions, no claims of YTubViral research, no fabricated case studies
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

// Localiza el cierre que pertenece a una declaracion concreta: primero ancla la
// declaracion a principio de linea y despues busca SU primer cierre a columna 0.
//
// El bug (06/07 y de nuevo el 27/08): se usaba lastIndexOf('];', idxDeARTICLE_BODIES),
// asumiendo que el ultimo '];' antes de ARTICLE_BODIES era el de BLOG_POSTS. Es falso:
// entre ambos estan TODOS los `const ART_*: BlockType[] = [ ... ];`, asi que devolvia el
// cierre del ULTIMO articulo y el objeto de metadatos acababa dentro del array de bloques
// de otro articulo. Rompia tsc y, la segunda vez, en silencio.
function findDeclCloser(content, declRe, closerRe, what) {
  const decl = declRe.exec(content);
  if (!decl) throw new Error(`No se encuentra la declaracion de ${what} en blog-data.ts`);
  const re = new RegExp(closerRe.source, 'gm');
  re.lastIndex = decl.index + decl[0].length;
  const close = re.exec(content);
  if (!close) throw new Error(`No se encuentra el cierre de ${what} en blog-data.ts`);
  return close.index;
}

// ¿El slug ya existe en ARTICLE_BODIES? Es la unica fuente de verdad sobre lo publicado:
// el fichero de estado se ha desincronizado dos veces y no se puede confiar en el.
function slugExistsInBlogData(slug) {
  try {
    const content = fs.readFileSync(BLOG_DATA_PATH, 'utf8');
    return content.includes(`'${slug}': {`) || content.includes(`"${slug}": {`);
  } catch {
    return false;
  }
}

// tsc --noEmit sobre la webapp. Devuelve las lineas de error (vacio = limpio).
function runTscCheck() {
  try {
    execSync('node node_modules/typescript/bin/tsc --noEmit', {
      cwd: YT_PROJECT, timeout: 600000, stdio: 'pipe', windowsHide: true,
    });
    return [];
  } catch (err) {
    const out = ((err.stdout || '') + (err.stderr || '')).toString();
    return out.split(/\r?\n/).filter(l => /error TS\d+/.test(l)).map(l => l.trim());
  }
}

function appendToBlogData(tsCode) {
  const backup = BLOG_DATA_PATH + '.bak';
  fs.copyFileSync(BLOG_DATA_PATH, backup);

  // Baseline ANTES de tocar nada: si el proyecto ya tenia errores de TypeScript
  // ajenos, no queremos revertir por ellos. Solo importan los errores NUEVOS.
  const baseline = new Set(runTscCheck());

  let content = fs.readFileSync(BLOG_DATA_PATH, 'utf8');
  // blog-data.ts es CRLF: hay que respetar el EOL del fichero al insertar.
  const EOL = content.includes('\r\n') ? '\r\n' : '\n';
  const fix = (txt) => txt.replace(/\r?\n/g, EOL);

  // 1. Entrada de metadatos, antes del cierre PROPIO de BLOG_POSTS.
  const postsCloseIdx = findDeclCloser(content, /^export const BLOG_POSTS\b/m, /^\];/, 'BLOG_POSTS');
  content = content.slice(0, postsCloseIdx) + fix(tsCode.postsEntry) + EOL + content.slice(postsCloseIdx);

  // 2. Los const ART_*, justo antes de ARTICLE_BODIES (se relocaliza: el paso 1 desplazo todo).
  const bodiesDeclIdx = content.search(/^export const ARTICLE_BODIES\b/m);
  if (bodiesDeclIdx === -1) throw new Error('No se encuentra ARTICLE_BODIES en blog-data.ts');
  content = content.slice(0, bodiesDeclIdx) + fix(tsCode.constBlock) + EOL + EOL + content.slice(bodiesDeclIdx);

  // 3. Entrada del cuerpo, antes del cierre PROPIO de ARTICLE_BODIES.
  const bodiesCloseIdx = findDeclCloser(content, /^export const ARTICLE_BODIES\b/m, /^\};/, 'ARTICLE_BODIES');
  content = content.slice(0, bodiesCloseIdx) + fix(tsCode.bodiesEntry) + EOL + content.slice(bodiesCloseIdx);

  fs.writeFileSync(BLOG_DATA_PATH, content, 'utf8');

  // Guarda: si la insercion rompio la compilacion, se revierte SOLA. Antes esto
  // quedaba roto en el working tree hasta que alguien lo veia a mano.
  const after = runTscCheck();
  const nuevos = after.filter(l => !baseline.has(l));
  if (nuevos.length > 0) {
    fs.copyFileSync(backup, BLOG_DATA_PATH);
    try { fs.unlinkSync(backup); } catch {}
    throw new Error('La insercion rompio TypeScript, revertido. Errores nuevos:\n  ' + nuevos.slice(0, 8).join('\n  '));
  }

  console.log('[blog-generator] Appended article to blog-data.ts (tsc limpio)');
  try { fs.unlinkSync(backup); } catch {}
}

// Commit + push de lib/blog-data.ts al repo de la webapp. SIN esto el articulo
// se queda en disco y nunca llega a produccion (Vercel despliega desde git) —
// era el motivo de que el blog llevara desde junio sin publicar nada de verdad.
// Solo toca blog-data.ts; si algo falla, revierte ESE fichero y lanza.
function commitAndPushBlogData(slug) {
  const git = (args) => execSync(`git ${args}`, {
    cwd: YT_PROJECT, timeout: 120000, stdio: 'pipe', windowsHide: true,
  }).toString().trim();

  const oldHead = git('rev-parse HEAD');
  try {
    git('add -- lib/blog-data.ts');
    // Nada que commitear (p.ej. el append no cambio bytes) => no es un error.
    const staged = git('diff --cached --name-only');
    if (!staged.includes('lib/blog-data.ts')) {
      throw new Error('blog-data.ts no quedo staged tras el append');
    }
    // -- lib/blog-data.ts: commitea SOLO ese fichero, aunque el working tree
    // tuviera otras cosas a medio (drift de local-agent, sesion de dev, etc).
    git(`commit -m ${JSON.stringify(`blog(auto): nuevo articulo ${slug}`)} -- lib/blog-data.ts`);
    git('push');
    console.log(`[blog-generator] blog-data.ts commiteado y pusheado (${slug})`);
  } catch (err) {
    try {
      git(`reset --soft ${oldHead}`);
      git(`checkout ${oldHead} -- lib/blog-data.ts`);
      git('reset -- lib/blog-data.ts');
    } catch (rb) {
      console.error('[blog-generator] rollback de git FALLO:', rb.message);
    }
    const detail = ((err.stdout || '') + (err.stderr || '') || err.message).toString().split(/\r?\n/).slice(0, 6).join(' | ');
    throw new Error(`commit/push de blog-data.ts fallo, revertido: ${detail}`);
  }
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

// La cola se ha desincronizado dos veces (julio y agosto) y las dos veces se
// regeneraron articulos ya publicados. blog-data.ts es la verdad; el estado no.
// Esto se auto-corrige en cada arranque, asi que el fallo ya no puede repetirse.
function reconcileQueue(state) {
  let arreglados = 0;
  for (const kw of state.queue) {
    if (kw.status === 'published') continue;
    if (!slugExistsInBlogData(kw.slug)) continue;
    kw.status = 'published';
    kw.reconciledAt = new Date().toISOString();
    if (!state.published.some(p => p.slug === kw.slug)) {
      state.published.push({ slug: kw.slug, keyword: kw.keyword, publishedAt: new Date().toISOString(), reconciled: true });
    }
    arreglados++;
    console.log(`[blog-generator] Reconciliado: "${kw.slug}" ya existe en blog-data.ts`);
  }
  if (arreglados > 0) saveState(state);
  return arreglados;
}

async function runBlogGenerator() {
  console.log(`[blog-generator] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const state = loadState();
  reconcileQueue(state);
  let count = 0;
  const slugs = [];

  for (let i = 0; i < MAX_ARTICLES_PER_RUN; i++) {
    const kw = pickNextKeyword(state);
    if (!kw) {
      console.log('[blog-generator] No pending keywords in queue');
      break;
    }

    // Ultima defensa antes de gastar llamadas a Claude: si el articulo ya existe,
    // no se regenera pase lo que pase en el estado.
    if (slugExistsInBlogData(kw.slug)) {
      console.log(`[blog-generator] "${kw.slug}" ya existe en blog-data.ts — se marca publicado y se salta`);
      kw.status = 'published';
      saveState(state);
      continue;
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

        // Commit + push ANTES de notificar a Google: sin esto el articulo nunca
        // llega a produccion y triggerIndexing() le pediria a Google un 404.
        commitAndPushBlogData(kw.slug);

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

module.exports = { runBlogGenerator, reconcileQueue, slugExistsInBlogData, appendToBlogData, buildTypeScriptCode, runTscCheck };
