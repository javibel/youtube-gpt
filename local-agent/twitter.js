'use strict';

const { newPage, newPageForProfile, ensureSession, persistSession, closeBrowserForProfile } = require('./browser');
const db = require('./db');
const { generateTweetReply } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { diagnose } = require('./doctor');
const { adjustedLimit, shouldSkipSession, shouldSkipPost, readingPause, actionPause, commentPause, warmupScroll } = require('./humanize');

const BASE_LIMITS = { likes: 8, replies: 3 };

// Targeted searches — INTENT-BASED: find people actively looking for tools or asking for help
// Ordered by conversion potential: tool-seekers first, then help-seekers, then niche tags
const SEARCH_QUERIES = [
  // TIER 1: People explicitly asking for YouTube tools (HIGHEST CONVERSION)
  '"what tool" youtube', '"recommend" youtube tool',
  '"best tool" youtube', '"any tool" youtube',
  '"youtube tool" free', '"seo tool" youtube',
  '"herramienta" youtube', '"qué herramienta" youtube',
  '"tool for" youtube seo', '"looking for" youtube tool',
  // TIER 2: People asking for help with problems YTubViral solves
  '"need help" youtube channel', '"how to" youtube seo',
  '"thumbnail" help youtube', '"youtube title" help',
  '"no one watches" youtube', '"no views" youtube',
  '"youtube analytics" help', '"keyword research" youtube',
  '"nadie ve" mis videos', '"cómo mejorar" youtube',
  '"no sé qué subir"', '"ideas para video" youtube',
  // TIER 3: High-intent niche hashtags (only the ones where people ask questions)
  '#youtubeseo', '#smallyoutuber help',
  '#youtubetips', '#creadordecontenido',
];

// Legacy alias for compatibility
const HASHTAGS = SEARCH_QUERIES;

// Relevance filter: tweet must contain at least one niche keyword to engage
// Unambiguous YouTube-creator signals — any one is enough to engage.
// Deliberately does NOT include bare "youtube"/"video"/"channel": those appear in
// political/news/sports tweets that merely link a YouTube video (the observed failure
// — personas replied to football/election tweets). Bare terms go through the weak path.
const STRONG_YT = /\b(youtubers?|small ?youtubers?|newtubers?|(mi |tu |su )?canal de youtube|youtube channel|yt channel|suscriptores?|subscribers?|thumbnails?|miniaturas?|youtube seo|seo (de |en )?youtube|youtube algorithm|algoritmo de youtube|watch ?time|tiempo de visualizaci|views per hour|\bvph\b|click.?through rate|\bctr\b|monetiz)\b/i;

// Off-niche poison: politics, news, sports, crypto. If present, skip even when a
// YouTube word is also there (a political tweet linking a YouTube video is not for us).
const OFF_TOPIC = /\b(elecci[oó]n|election|gobierno|govern(ment|or)|pol[ií]tic|president|congres|senad|diputad|partido (popular|socialista)|madridista|bar[çc]a|real madrid|f[úu]tbol|football|premier league|nba|crypto|bitcoin|\bnft\b|forex|trading|stock market|ucrani|ukrain|israel|gaza|palestin|trump|biden|psoe|\bvox\b|feij[oó]o)\b/i;

function isRelevantTweet(text) {
  const lower = text.toLowerCase();
  if (OFF_TOPIC.test(lower)) return false;        // off-niche → never engage
  if (STRONG_YT.test(lower)) return true;         // unambiguous creator signal → engage
  // Weak signal: a YouTube-ish word AND a creator-problem word must co-occur.
  const hasYt = /\b(youtube|youtuber|mi canal|tu canal|su canal|channel|creator|creador)\b/i.test(lower);
  const hasProblem = /\b(seo|keywords?|palabras? clave|t[íi]tulos?|titles?|tags?|thumbnails?|miniaturas?|views|visitas|grow|crec|stuck|estancad|optimiz|analytic|anal[íi]tic|tools?|herramientas?|ideas?|guion|script|retenci|retention|engagement|algoritmo|algorithm)\b/i.test(lower);
  return hasYt && hasProblem;
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

      // Skip tweets still truncated after the show-more expansion (Twitter appends an
      // ellipsis char). Replying to half a tweet makes the persona say "the tweet's cut
      // off but..." — observed and embarrassing.
      if (tweet.text.trim().endsWith('…')) continue;

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

      // Reply chance scaled by intent (replaces the blind 50% coin flip): high-intent
      // tweets — an explicit question or a strong YouTube-creator signal — are worth
      // replying to far more often than ambiguous-but-relevant ones. Mirrors Reddit.
      const isHighIntent = STRONG_YT.test(tweet.text)
        || /\?|help|recommend|how (do|to)|what tool|looking for|any (good|tool)|stuck|no views|nadie ve|c[óo]mo |ayuda|recomien|qu[ée] herramienta/i.test(tweet.text);
      const replyChance = isHighIntent ? 0.85 : 0.4;
      if (!alreadyReplied && todayReplies + repliesGiven < limits.replies && Math.random() < replyChance) {
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
