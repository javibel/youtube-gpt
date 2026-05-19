'use strict';

const { newPage, newPageForProfile, ensureSession, persistSession, closeBrowserForProfile } = require('./browser');
const db = require('./db');
const { generateTweetReply } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { diagnose } = require('./doctor');
const { adjustedLimit, shouldSkipSession, shouldSkipPost, readingPause, actionPause, commentPause, warmupScroll } = require('./humanize');

const BASE_LIMITS = { likes: 8, replies: 3 };

// Targeted searches — removed generic hashtags (#youtube, #contentcreator) that return irrelevant noise
const SEARCH_QUERIES = [
  // Niche hashtags (high signal-to-noise)
  '#smallyoutuber', '#youtubeseo', '#youtubergrowth', '#youtubetips',
  '#videomarketing', '#creatoreconomy',
  '#marketingdigital', '#creadordecontenido',
  // Keyword queries (find people asking for help — HIGH CONVERSION)
  '"youtube seo" tool', '"need help" youtube channel',
  '"video ideas" stuck', '"how to grow" youtube',
  '"what tool" youtube', '"recommend" youtube tool',
  '"thumbnail" help', '"youtube analytics" recommend',
  'youtube channel tips', 'youtube algorithm help',
  'grow my youtube channel', 'youtube title ideas',
  // ES keyword queries
  '"herramienta youtube"', '"ideas para video"',
  '"no sé qué subir"', '"cómo crecer" youtube',
  '"seo youtube" herramienta', 'crecer en youtube consejos',
];

// Legacy alias for compatibility
const HASHTAGS = SEARCH_QUERIES;

// Relevance filter: tweet must contain at least one niche keyword to engage
const RELEVANCE_KEYWORDS = [
  // EN
  'youtube', 'youtuber', 'video', 'creator', 'content', 'channel', 'subscribe',
  'thumbnail', 'upload', 'monetize', 'monetization', 'vlog', 'vlogger',
  'streaming', 'shorts', 'reels', 'tiktok', 'podcast', 'editing', 'editor',
  'seo', 'algorithm', 'views', 'growth', 'audience', 'niche',
  // ES
  'canal', 'suscriptor', 'suscríbete', 'miniatura', 'subir', 'monetizar',
  'creador', 'contenido', 'edición', 'audiencia', 'nicho', 'viral',
  'crecimiento', 'emprendedor', 'digital',
];

function isRelevantTweet(text) {
  const lower = text.toLowerCase();
  return RELEVANCE_KEYWORDS.some(kw => lower.includes(kw));
}

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

async function login({ profileDir, cookieFile } = {}) {
  const tag = profileDir ? `twitter:${profileDir}` : 'twitter';
  const p = profileDir ? await newPageForProfile(profileDir) : await newPage();

  // Seed cookies for all accounts (brand from default file, personas from their backup file)
  // Personas also use Chrome profile, but cookie seeding provides a fallback if the profile corrupts
  const effectiveCookieFile = cookieFile
    || (profileDir ? `cookies/${profileDir.replace(/.*[/\\]/, '')}-twitter.json` : 'twitter-cookies.json');
  await ensureSession(p, {
    domain: 'x.com',
    sessionCookieName: 'auth_token',
    cookieFile: effectiveCookieFile,
  });

  const ok = await safeGoto(p, 'https://x.com/home', { tag, timeout: 60000, profileDir: profileDir || undefined });
  if (!ok) {
    await p.close().catch(() => {});
    return null;
  }
  await new Promise(r => setTimeout(r, 3000));

  const url = p.url();
  if (url.includes('/home')) {
    console.log(`[${tag}] Session active`);
    // Persist cookies back to file (brand + personas — backup against profile corruption)
    await persistSession(p, { domain: 'x.com', cookieFile: effectiveCookieFile });
    return p;
  }

  // Session invalid — let doctor diagnose and attempt recovery
  await p.close().catch(() => {});
  const accountId = profileDir ? profileDir.replace(/.*[/\\]/, '') : null;
  const result = await diagnose(new Error(`Session invalid — redirected to ${url}`), {
    platform: 'twitter',
    account: accountId || 'brand',
    action: 'login',
    profileDir: profileDir || undefined,
    cookieFile: cookieFile || 'twitter-cookies.json',
    sessionInvalid: true,
  });

  if (result.healed) {
    console.log(`[${tag}] Doctor suggests retry: ${result.action}`);
    if (profileDir) await closeBrowserForProfile(profileDir);
    const retryPage = profileDir ? await newPageForProfile(profileDir) : await newPage();
    await ensureSession(retryPage, {
      domain: 'x.com',
      sessionCookieName: 'auth_token',
      cookieFile: effectiveCookieFile,
    });
    const retryOk = await safeGoto(retryPage, 'https://x.com/home', { tag, timeout: 60000, profileDir: profileDir || undefined });
    if (retryOk) {
      await new Promise(r => setTimeout(r, 3000));
      if (retryPage.url().includes('/home')) {
        console.log(`[${tag}] Session recovered after doctor fix`);
        await persistSession(retryPage, { domain: 'x.com', cookieFile: effectiveCookieFile });
        return retryPage;
      }
    }
    await retryPage.close().catch(() => {});
  }

  // Could not self-heal — alert human
  const instructions = profileDir
    ? `Pasos:\n1. Ejecuta: node login-persona.js ${accountId} twitter\n2. Haz login manual y cierra el navegador\n3. pm2 restart ytubviral-agent`
    : 'Pasos:\n1. Abre Edge y entra a x.com\n2. Abre Cookie Editor > Export as JSON\n3. Reemplaza twitter-cookies.json\n4. pm2 restart ytubviral-agent';
  await alertSessionExpired('Twitter', accountId, instructions);

  console.error(`[${tag}] Session invalid — doctor could not heal`);
  return null;
}

// Like tweets and optionally reply — single function to avoid navigating twice
// opts: { accountId, cookieFile, profileDir, commentGenerator, limits }
async function engageWithTweets(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || { likes: adjustedLimit(BASE_LIMITS.likes), replies: adjustedLimit(BASE_LIMITS.replies) };
  const replyGenerator = opts.commentGenerator || generateTweetReply;
  const tag = accountId ? `twitter:${accountId}` : 'twitter';

  // Skip ~15% of sessions randomly (humans have off moments)
  if (!accountId && shouldSkipSession()) {
    console.log(`[${tag}] Skipping session (random rest)`);
    return;
  }

  const todayLikes = await db.countTodayActions('x_like', accountId);
  const todayReplies = await db.countTodayActions('x_reply', accountId);

  if (todayLikes >= limits.likes && todayReplies >= limits.replies) {
    console.log(`[${tag}] Daily limits reached (${limits.likes} likes, ${limits.replies} replies today)`);
    return;
  }
  console.log(`[${tag}] Session limits: ${limits.likes} likes, ${limits.replies} replies`);

  const page = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile });
  if (!page) return;

  try {
    // Warmup: browse feed briefly before searching
    await warmupScroll(page, tag);

    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    console.log(`[${tag}] Searching: ${query}`);

    const searchUrl = query.startsWith('#')
      ? `https://x.com/search?q=%23${query.slice(1)}&src=typed_query&f=live`
      : `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    const navOk = await safeGoto(page, searchUrl, { tag, timeout: 60000, profileDir: opts.profileDir });
    if (!navOk) {
      console.log(`[${tag}] Failed to load search, ending session`);
      return;
    }
    await delay(3000, 5000);

    // Scroll to load more tweets
    await safeEval(page, () => window.scrollBy(0, 800));
    await delay(2000, 3000);

    // Expand "Show more" / "Mostrar más" on truncated tweets
    await safeEval(page, () => {
      const btns = document.querySelectorAll('button[data-testid="tweet-text-show-more-link"], span[data-testid="tweet-text-show-more-link"]');
      for (const btn of btns) btn.click();
    });
    await delay(500, 800);

    // Collect tweet data from the page
    const tweets = await safeEval(page, () => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (const article of articles) {
        const textEl = article.querySelector('div[data-testid="tweetText"]');
        const text = textEl?.innerText?.trim() ?? '';
        if (!text || text.length < 20) continue;

        // Get tweet link (time element's parent <a> contains the permalink)
        const timeLink = article.querySelector('time')?.closest('a');
        const tweetUrl = timeLink?.href ?? '';

        // Check if already liked (unlike button present = already liked)
        const alreadyLiked = !!article.querySelector('button[data-testid="unlike"]');

        // Get author name
        const authorEl = article.querySelector('div[data-testid="User-Name"] a span');
        const author = authorEl?.innerText?.trim() ?? '';

        if (tweetUrl) {
          results.push({ text: text.slice(0, 300), tweetUrl, alreadyLiked, author });
        }
      }
      return results.slice(0, 15);
    });

    if (!tweets || tweets.length === 0) {
      console.log(`[${tag}] No tweets found for "${query}"`);
      return;
    }

    console.log(`[${tag}] Found ${tweets.length} tweets for "${query}"`);

    let likesGiven = 0;
    let repliesGiven = 0;

    for (const tweet of tweets) {
      // Skip off-topic tweets that don't match our niche
      if (!isRelevantTweet(tweet.text)) continue;

      // Randomly skip some posts (humans don't engage with everything)
      if (shouldSkipPost()) continue;

      // Simulate reading the tweet before deciding to engage
      await readingPause();

      const alreadyLikedInDb = await db.hasTwitterActionOfType(tweet.tweetUrl, 'x_like', accountId);
      const alreadyReplied = await db.hasTwitterActionOfType(tweet.tweetUrl, 'x_reply', accountId);

      // Like (if under limit, not already liked in UI or DB)
      if (!tweet.alreadyLiked && !alreadyLikedInDb && todayLikes + likesGiven < limits.likes) {
        const liked = await safeEval(page, (url) => {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          for (const article of articles) {
            const timeLink = article.querySelector('time')?.closest('a');
            if (timeLink?.href === url) {
              const likeBtn = article.querySelector('button[data-testid="like"]');
              if (likeBtn) { likeBtn.click(); return true; }
            }
          }
          return false;
        }, tweet.tweetUrl);

        if (liked) {
          likesGiven++;
          await db.saveAction({ type: 'x_like', profileUrl: tweet.tweetUrl, accountId });
          console.log(`[${tag}] Liked tweet by ${tweet.author}`);
          await actionPause();
        }
        // If liked === null (timeout), just skip this tweet silently and continue
      }

      // Reply (if under limit, not already replied, ~50% chance per tweet to keep it natural)
      if (!alreadyReplied && todayReplies + repliesGiven < limits.replies && Math.random() < 0.5) {
        try {
          const reply = await replyGenerator(tweet.author, tweet.text);
          if (!reply) {
            console.log(`[${tag}] Claude rejected reply for ${tweet.author} — skipping`);
            continue;
          }

          // Navigate to the tweet's own page to reply
          const tweetNavOk = await safeGoto(page, tweet.tweetUrl, { tag, timeout: 60000 });
          if (!tweetNavOk) {
            console.log(`[${tag}] Failed to load tweet page, ending session`);
            break;
          }
          await delay(2000, 3000);

          // Click reply button on the tweet's page
          const replyClicked = await safeEval(page, () => {
            const article = document.querySelector('article[data-testid="tweet"]');
            if (!article) return false;
            const replyBtn = article.querySelector('button[data-testid="reply"]');
            if (replyBtn) { replyBtn.click(); return true; }
            return false;
          });

          if (!replyClicked) {
            console.log(`[${tag}] Reply button not found for ${tweet.author}`);
            await safeGoto(page, searchUrl, { tag, timeout: 60000 });
            continue;
          }
          await delay(1500, 2500);

          // Type reply in the modal text area
          const textArea = await page.$('div[data-testid="tweetTextarea_0"]');
          if (!textArea) {
            console.log(`[${tag}] Reply text area not found`);
            await page.keyboard.press('Escape').catch(() => {});
            await safeGoto(page, searchUrl, { tag, timeout: 60000 });
            continue;
          }

          await textArea.click();
          await delay(500, 1000);
          await page.keyboard.type(reply, { delay: 50 });
          await delay(1000, 2000);

          // Click the reply submit button
          const submitBtn = await page.$('button[data-testid="tweetButtonInline"]');
          if (submitBtn) {
            await submitBtn.click();
            await delay(2000, 3000);
            repliesGiven++;
            await db.saveAction({ type: 'x_reply', profileUrl: tweet.tweetUrl, content: reply, accountId });
            console.log(`[${tag}] Replied to ${tweet.author}: "${reply.slice(0, 50)}..."`);
          } else {
            console.log(`[${tag}] Reply submit button not found`);
            await page.keyboard.press('Escape').catch(() => {});
          }

          // Navigate back to search results
          const backOk = await safeGoto(page, searchUrl, { tag, timeout: 60000 });
          if (!backOk) {
            console.log(`[${tag}] Search nav failed, trying fresh load...`);
            const retry = await safeGoto(page, searchUrl, { tag, timeout: 60000, retries: 1 });
            if (!retry) {
              console.log(`[${tag}] Cannot return to search, ending session`);
              break;
            }
          }
          await commentPause();
        } catch (err) {
          console.error(`[${tag}] Reply error: ${err.message}`);
          await page.keyboard.press('Escape').catch(() => {});
          const backOk = await safeGoto(page, searchUrl, { tag, timeout: 60000 });
          if (!backOk) {
            console.log(`[${tag}] Cannot return to search, ending session`);
            break;
          }
        }
      }

      if (todayLikes + likesGiven >= limits.likes && todayReplies + repliesGiven >= limits.replies) break;
    }

    console.log(`[${tag}] Session done — ${likesGiven} likes, ${repliesGiven} replies`);
  } catch (err) {
    console.error(`[${tag}] engageWithTweets error: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { engageWithTweets };
