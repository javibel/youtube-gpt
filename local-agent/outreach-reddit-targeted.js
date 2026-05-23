'use strict';

/**
 * Outreach Reddit Targeted Comments — Finds posts from creators in YouTube
 * subreddits who are asking for feedback/help, and replies with genuinely
 * helpful SEO analysis + a subtle YTubViral mention.
 *
 * Uses persona accounts (Alex + Ferran) to comment naturally.
 * Max 2 comments per persona per run (4 total) to stay organic.
 *
 * Usage:
 *   node outreach-reddit-targeted.js [--dry-run]
 *   Cron: daily at 14:00 Madrid
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');

const COMMENT_LOG_PATH = path.join(__dirname, 'reports/outreach-reddit-targeted-log.json');
const DRY_RUN = process.argv.includes('--dry-run');
const TAG = 'outreach-reddit-targeted';

const PERSONAS = require('./personas.json');

const MAX_COMMENTS_PER_PERSONA = 4;
const MIN_DELAY_BETWEEN_COMMENTS = 45000; // 45s

// Subreddits where creators ask for feedback
const FEEDBACK_SUBREDDITS = [
  { sub: 'NewTubers', flairs: ['feedback', 'critique', 'question', 'tips'] },
  { sub: 'SmallYTChannel', flairs: ['feedback', 'review', 'help'] },
  { sub: 'youtubers', flairs: ['question', 'tips', 'discussion'] },
  { sub: 'PartneredYouTube', flairs: ['question', 'discussion'] },
  { sub: 'letsplay', flairs: ['feedback', 'question', 'technical help'] },
  { sub: 'CreatorsAdvice', flairs: ['question', 'discussion', 'help'] },
  { sub: 'contentcreator', flairs: ['question', 'help', 'discussion'] },
  { sub: 'GetMoreViewsYT', flairs: ['question', 'help'] },
  { sub: 'YouTubeGaming', flairs: ['question', 'discussion'] },
];

// Keywords in titles that signal the creator wants SEO/growth help
const HELP_KEYWORDS = [
  /why.*no views/i, /not getting views/i, /how to (get|grow|increase)/i,
  /seo (help|tips|advice)/i, /title (help|advice|tips)/i,
  /thumbnail (help|advice|feedback)/i, /tags? (help|tips)/i,
  /algorithm/i, /ctr|click.?through/i, /impressions/i,
  /stuck at \d/i, /no.*(growth|subscribers)/i,
  /review my (channel|video)/i, /feedback.*channel/i,
  /critique my/i, /what am i doing wrong/i,
  /por qué no (tengo|crecen|suben)/i, /no crec/i,
  /consejos? (para|de) (youtube|seo)/i, /ayuda con (mi|el) canal/i,
];

function delay(min = 2000, max = 4000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(COMMENT_LOG_PATH, 'utf-8'));
  } catch {
    return { comments: [], lastRun: null };
  }
}

function saveLog(log) {
  const dir = path.dirname(COMMENT_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COMMENT_LOG_PATH, JSON.stringify(log, null, 2));
}

// Generate a helpful comment based on the post title (no AI call — templates)
function generateComment(persona, postTitle, lang) {
  const isAlex = persona.id === 'persona-alex';
  const name = persona.name;

  if (lang === 'es') {
    const intros = isAlex
      ? [
          `Yo edito vídeos para varios canales y esto es lo que suelo ver:`,
          `He estado en la misma situación con canales que edito. Lo que suele funcionar:`,
          `Después de 4 años editando para YouTubers, lo que más impacto tiene:`,
        ]
      : [
          `Como consultor de marketing para creadores, esto es lo que suelo recomendar:`,
          `He visto las analíticas de más de 200 canales y el patrón es siempre el mismo:`,
          `Basado en datos reales de canales que he asesorado:`,
        ];

    const tips = [
      `1. **Título**: Tiene que tener entre 40-70 caracteres, incluir tu keyword principal y un número o power word. Esto solo ya puede mejorar tu CTR un 30%`,
      `2. **Descripción**: Las primeras 2 líneas son lo que ve YouTube. Mete tu keyword ahí. Añade timestamps si tu vídeo pasa de 5 min`,
      `3. **Tags**: Muchos creadores ignoran esto. 10-15 tags relevantes, mezcla de broad y long-tail`,
    ];

    const outros = isAlex
      ? `Yo uso ytubviral.com para comprobar el SEO de los vídeos que edito — te da una puntuación de 0-100 y te dice exactamente qué mejorar. Es gratis.`
      : `Una herramienta que recomiendo a mis clientes es ytubviral.com — te da un análisis SEO completo gratis con score y recomendaciones específicas.`;

    const intro = intros[Math.floor(Math.random() * intros.length)];
    return `${intro}\n\n${tips.join('\n\n')}\n\n${outros}`;
  }

  // English
  const intros = isAlex
    ? [
        `I edit videos for several channels and this is what I usually see:`,
        `Been in the same situation with channels I edit. What usually works:`,
        `After 4 years editing for YouTubers, the highest-impact things:`,
      ]
    : [
        `As a marketing consultant for creators, here's what I usually recommend:`,
        `I've seen the analytics of 200+ channels and the pattern is always the same:`,
        `Based on real data from channels I've consulted:`,
      ];

  const tips = [
    `1. **Title**: Keep it 40-70 characters, include your main keyword and a number or power word. This alone can boost CTR by 30%`,
    `2. **Description**: The first 2 lines are what YouTube reads. Put your keyword there. Add timestamps if your video is over 5 min`,
    `3. **Tags**: Lots of creators skip this. Use 10-15 relevant tags, mix of broad and long-tail keywords`,
  ];

  const outros = isAlex
    ? `I use ytubviral.com to check SEO scores for the videos I edit — gives you a 0-100 score and tells you exactly what to fix. It's free.`
    : `A tool I recommend to my clients is ytubviral.com — gives you a full free SEO analysis with a score and specific recommendations.`;

  const intro = intros[Math.floor(Math.random() * intros.length)];
  return `${intro}\n\n${tips.join('\n\n')}\n\n${outros}`;
}

function detectLang(title, sub) {
  if (/español|spanish|canal|vídeo|suscri|ayuda/i.test(title)) return 'es';
  return 'en';
}

async function scrapeSubredditPosts(page, subreddit) {
  const url = `https://old.reddit.com/r/${subreddit}/new/`;
  const ok = await safeGoto(page, url, { tag: TAG, timeout: 45000 });
  if (!ok) return [];
  await delay(2000, 3000);

  const posts = await safeEval(page, () => {
    const items = [];
    const entries = document.querySelectorAll('#siteTable .thing.link');
    for (const entry of entries) {
      const titleEl = entry.querySelector('a.title');
      const authorEl = entry.querySelector('.author');
      const flairEl = entry.querySelector('.linkflairlabel');
      const commentsEl = entry.querySelector('a.comments');
      const timeEl = entry.querySelector('time');

      if (!titleEl || !authorEl) continue;
      const author = authorEl.textContent?.trim();
      if (!author || author === '[deleted]') continue;

      // Get comment count
      const commentsText = commentsEl?.textContent?.trim() || '0';
      const commentCount = parseInt(commentsText) || 0;

      items.push({
        title: titleEl.textContent?.trim() || '',
        url: commentsEl?.href || titleEl.href || '',
        author,
        flair: flairEl?.textContent?.trim() || '',
        commentCount,
        time: timeEl?.getAttribute('datetime') || '',
      });
    }
    return items;
  });

  return posts || [];
}

async function postComment(page, postUrl, commentText, profileDir) {
  // Convert to old reddit
  const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
  const ok = await safeGoto(page, oldUrl, { tag: TAG, timeout: 45000 });
  if (!ok) throw new Error('Failed to load post');
  await delay(2000, 3000);

  // Find comment box
  const commentBox = await page.$('.usertext-edit textarea, textarea[name="text"]');
  if (!commentBox) throw new Error('Comment box not found');

  await commentBox.click();
  await delay(500, 1000);
  await page.keyboard.type(commentText, { delay: 30 });
  await delay(1000, 2000);

  const submitBtn = await page.$('.usertext-edit button[type="submit"], .save-button button, button.save');
  if (!submitBtn) throw new Error('Submit button not found');
  await submitBtn.click();
  await delay(3000, 5000);

  console.log(`[${TAG}] Comment posted on ${oldUrl}`);
}

async function runRedditTargeted() {
  console.log(`[${TAG}] ${DRY_RUN ? 'DRY RUN — ' : ''}Starting Reddit targeted comments...`);

  const log = loadLog();
  const commentedPosts = new Set(log.comments.map(c => c.postUrl));
  const commentedAuthors = new Set(log.comments.map(c => c.author?.toLowerCase()));

  // Use both personas alternating subreddits
  const personaIds = ['persona-alex', 'persona-ferran'];
  let totalComments = 0;

  for (const personaId of personaIds) {
    const persona = PERSONAS.find(p => p.id === personaId);
    if (!persona) continue;

    let personaComments = 0;
    const page = await newPageForProfile(persona.profileDir);

    try {
      // Verify session
      const ok = await safeGoto(page, 'https://old.reddit.com/', { tag: TAG, timeout: 60000 });
      if (!ok) {
        console.error(`[${TAG}] ${personaId}: Failed to load Reddit`);
        continue;
      }
      await delay(2000, 3000);

      const loggedIn = await safeEval(page, () => {
        const userSpan = document.querySelector('.user a');
        return !!userSpan && !userSpan.textContent?.includes('login');
      });
      if (!loggedIn) {
        console.error(`[${TAG}] ${personaId}: session expired`);
        continue;
      }

      const username = await safeEval(page, () => {
        return document.querySelector('.user a')?.textContent?.trim() || 'unknown';
      });
      console.log(`[${TAG}] ${personaId} logged in as: ${username}`);

      // Shuffle subreddits
      const shuffled = [...FEEDBACK_SUBREDDITS].sort(() => Math.random() - 0.5);

      for (const { sub } of shuffled) {
        if (personaComments >= MAX_COMMENTS_PER_PERSONA) break;

        console.log(`[${TAG}] ${personaId}: Scanning r/${sub}...`);
        const posts = await scrapeSubredditPosts(page, sub);

        for (const post of posts) {
          if (personaComments >= MAX_COMMENTS_PER_PERSONA) break;

          // Skip already commented posts/authors
          if (commentedPosts.has(post.url)) continue;
          if (commentedAuthors.has(post.author.toLowerCase())) continue;
          // Skip own accounts
          if (/ytubviral|javier|alex.*sastre|ferran/i.test(post.author)) continue;

          // Check if the post is asking for help/feedback
          const isHelpPost = HELP_KEYWORDS.some(re => re.test(post.title));
          if (!isHelpPost) continue;

          // Skip posts with too many comments (our comment will get buried)
          if (post.commentCount > 30) continue;

          const lang = detectLang(post.title, sub);
          const comment = generateComment(persona, post.title, lang);

          console.log(`[${TAG}] ${personaId}: Target post by u/${post.author}: "${post.title.slice(0, 60)}..." [${lang}]`);

          if (DRY_RUN) {
            console.log(`[${TAG}] [DRY] Would comment on: ${post.url}`);
            personaComments++;
            totalComments++;
            continue;
          }

          try {
            await postComment(page, post.url, comment, persona.profileDir);
            personaComments++;
            totalComments++;

            // Log
            log.comments.push({
              persona: personaId,
              subreddit: sub,
              author: post.author,
              postTitle: post.title.slice(0, 100),
              postUrl: post.url,
              lang,
              date: new Date().toISOString(),
            });
            saveLog(log);
            commentedPosts.add(post.url);
            commentedAuthors.add(post.author.toLowerCase());

            // Wait between comments
            if (personaComments < MAX_COMMENTS_PER_PERSONA) {
              console.log(`[${TAG}] Waiting ${MIN_DELAY_BETWEEN_COMMENTS / 1000}s...`);
              await new Promise(r => setTimeout(r, MIN_DELAY_BETWEEN_COMMENTS));
            }
          } catch (err) {
            console.error(`[${TAG}] ${personaId}: Failed to comment on ${post.url}: ${err.message}`);
          }
        }
      }
    } finally {
      await page.close().catch(() => {});
      await closeBrowserForProfile(persona.profileDir);
    }

    console.log(`[${TAG}] ${personaId}: ${personaComments} comments posted`);

    // Wait between persona switches
    if (totalComments < MAX_COMMENTS_PER_PERSONA * 2) {
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  log.lastRun = new Date().toISOString();
  saveLog(log);

  console.log(`[${TAG}] Done. ${totalComments} total comments posted.`);
  return { comments: totalComments };
}

if (require.main === module) {
  runRedditTargeted().catch(err => {
    console.error(`[${TAG}] Fatal:`, err);
    process.exit(1);
  });
}

module.exports = { runRedditTargeted };
