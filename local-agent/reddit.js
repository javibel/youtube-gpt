'use strict';

const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const db = require('./db');
const { generatePersonaComment } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { diagnose } = require('./doctor');

const LIMITS = { upvotes: 8, comments: 4 };

// HIGH-PRIORITY: people actively asking about YouTube growth/tools (highest conversion)
const SUBREDDITS_PRIORITY = [
  'NewTubers', 'youtubers', 'SmallYTChannel', 'PartneredYoutube',
  'letsplay', 'contentcreation', 'YouTubeGrowth',
];

// MEDIUM: adjacent audiences that care about content/SEO/tools
const SUBREDDITS_MEDIUM = [
  'CreatorServices', 'ContentCreators',
  'socialmedia', 'SEO', 'VideoEditing',
  'SideProject', 'InternetIsBeautiful',
];

// Pick 2-3 subreddits per session for better reach
function pickSubreddits() {
  const picks = [];
  // Always 1-2 priority
  const shuffledPri = [...SUBREDDITS_PRIORITY].sort(() => Math.random() - 0.5);
  picks.push(shuffledPri[0]);
  if (Math.random() < 0.6) picks.push(shuffledPri[1]);
  // 40% chance of adding 1 medium
  if (Math.random() < 0.4) {
    const med = SUBREDDITS_MEDIUM[Math.floor(Math.random() * SUBREDDITS_MEDIUM.length)];
    if (!picks.includes(med)) picks.push(med);
  }
  return picks;
}

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

async function login({ profileDir, cookieFile }) {
  if (!profileDir) throw new Error('reddit.js requires a profileDir');
  const tag = `reddit:${profileDir.replace(/.*[/\\]/, '')}`;

  const p = await newPageForProfile(profileDir);

  const ok = await safeGoto(p, 'https://old.reddit.com/', { tag, timeout: 60000 });
  if (!ok) {
    await p.close().catch(() => {});
    return null;
  }
  await new Promise(r => setTimeout(r, 3000));

  const loggedIn = await safeEval(p, () => {
    const userSpan = document.querySelector('.user a');
    return !!userSpan && !userSpan.textContent?.includes('login');
  });

  if (loggedIn) {
    console.log(`[${tag}] Session active`);
    return p;
  }

  // Session invalid — let doctor diagnose and attempt recovery
  await p.close().catch(() => {});
  const accountId = profileDir.replace(/.*[/\\]/, '');
  const result = await diagnose(new Error('Session invalid after login attempt'), {
    platform: 'reddit',
    account: accountId,
    action: 'login',
    profileDir,
    cookieFile,
    sessionInvalid: true,
  });

  if (result.healed) {
    // Doctor thinks a retry can work (e.g. cookies available for re-seeding)
    console.log(`[${tag}] Doctor suggests retry: ${result.action}`);
    await closeBrowserForProfile(profileDir);
    const retryPage = await newPageForProfile(profileDir);
    const retryOk = await safeGoto(retryPage, 'https://old.reddit.com/', { tag, timeout: 60000 });
    if (retryOk) {
      await new Promise(r => setTimeout(r, 3000));
      const retryLoggedIn = await safeEval(retryPage, () => {
        const userSpan = document.querySelector('.user a');
        return !!userSpan && !userSpan.textContent?.includes('login');
      });
      if (retryLoggedIn) {
        console.log(`[${tag}] Session recovered after doctor fix`);
        return retryPage;
      }
    }
    await retryPage.close().catch(() => {});
  }

  // Could not self-heal — alert human
  await alertSessionExpired('Reddit', accountId,
    `Pasos:\n1. Ejecuta: node login-persona.js ${accountId} reddit\n2. Haz login manual y cierra el navegador\n3. pm2 restart ytubviral-agent`);

  console.error(`[${tag}] Session invalid — doctor could not heal`);
  return null;
}

// Collect posts from a subreddit (old.reddit.com HTML)
async function collectPosts(page, subreddit, tag = 'reddit') {
  const ok = await safeGoto(page, `https://old.reddit.com/r/${subreddit}/new/`, { tag, timeout: 60000 });
  if (!ok) return [];
  await delay(2000, 3000);

  const posts = await safeEval(page, () => {
    const results = [];
    const things = document.querySelectorAll('#siteTable > .thing.link');
    for (const thing of things) {
      // Skip stickied/pinned posts
      if (thing.classList.contains('stickied')) continue;

      const titleEl = thing.querySelector('a.title');
      const title = titleEl?.textContent?.trim() ?? '';
      const postUrl = titleEl?.href ?? '';

      // Get self-text if available (expand link or existing expando)
      const expandoText = thing.querySelector('.md')?.textContent?.trim() ?? '';

      // Get author
      const authorEl = thing.querySelector('.author');
      const author = authorEl?.textContent?.trim() ?? '[deleted]';

      // Get time — old reddit uses <time> tag
      const timeEl = thing.querySelector('time');
      const datetime = timeEl?.getAttribute('datetime') ?? '';
      if (datetime) {
        const postDate = new Date(datetime);
        const hoursAgo = (Date.now() - postDate.getTime()) / 3600000;
        if (hoursAgo > 48) continue; // Skip posts older than 48h
      }

      // Get comment count
      const commentsEl = thing.querySelector('.comments');
      const commentsText = commentsEl?.textContent?.trim() ?? '0';
      const commentCount = parseInt(commentsText) || 0;

      // Check if already upvoted (arrow class)
      const upArrow = thing.querySelector('.arrow.up, .arrow.upmod');
      const alreadyUpvoted = upArrow?.classList.contains('upmod') ?? false;

      if (title && postUrl) {
        results.push({
          title: title.slice(0, 300),
          text: expandoText.slice(0, 400),
          postUrl,
          author,
          commentCount,
          alreadyUpvoted,
        });
      }
    }
    return results.slice(0, 15);
  });

  return posts || [];
}

// opts: { accountId, cookieFile, profileDir, persona, limits }
async function engageWithPosts(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || LIMITS;
  const persona = opts.persona || null;
  const tag = accountId ? `reddit:${accountId}` : 'reddit';

  const todayUpvotes = await db.countTodayActions('rd_upvote', accountId);
  const todayComments = await db.countTodayActions('rd_comment', accountId);

  if (todayUpvotes >= limits.upvotes && todayComments >= limits.comments) {
    console.log(`[${tag}] Daily limits reached`);
    return;
  }

  const page = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile });
  if (!page) return;

  try {
    const subreddits = pickSubreddits();
    console.log(`[${tag}] Session subreddits: ${subreddits.map(s => 'r/' + s).join(', ')}`);

    // Collect posts from all selected subreddits
    let allPosts = [];
    for (const subreddit of subreddits) {
      const posts = await collectPosts(page, subreddit, tag);
      console.log(`[${tag}] Found ${posts.length} posts in r/${subreddit}`);
      allPosts.push(...posts.map(p => ({ ...p, subreddit })));
      await delay(1500, 2500);
    }
    // Sort by intent: questions/help-seekers FIRST (highest conversion), then randomize the rest
    const INTENT_PATTERN = /\?|help|recommend|suggest|advice|stuck|how do|what tool|best way|looking for|need a|any good|consejo|ayuda|recomendar|herramienta|cómo|alguien sabe/i;
    allPosts = allPosts
      .map(p => ({ ...p, _isIntent: INTENT_PATTERN.test(p.title + ' ' + p.text) }))
      .sort((a, b) => {
        if (a._isIntent && !b._isIntent) return -1;
        if (!a._isIntent && b._isIntent) return 1;
        return Math.random() - 0.5; // random within same tier
      });
    const posts = allPosts;

    let upvotesGiven = 0;
    let commentsGiven = 0;

    for (const post of posts) {
      const alreadyActed = await db.hasRedditAction(post.postUrl, accountId);
      if (alreadyActed) continue;

      // Upvote (if under limit, not already upvoted)
      if (!post.alreadyUpvoted && todayUpvotes + upvotesGiven < limits.upvotes) {
        try {
          const upvoted = await safeEval(page, (url) => {
            const things = document.querySelectorAll('#siteTable > .thing.link');
            for (const thing of things) {
              const link = thing.querySelector('a.title');
              if (link?.href === url) {
                const arrow = thing.querySelector('.arrow.up:not(.upmod)');
                if (arrow) { arrow.click(); return true; }
              }
            }
            return false;
          }, post.postUrl);

          if (upvoted) {
            upvotesGiven++;
            await db.saveAction({ type: 'rd_upvote', profileUrl: post.postUrl, accountId });
            console.log(`[${tag}] Upvoted: ${post.title.slice(0, 50)}...`);
            await delay(1500, 3000);
          }
        } catch (err) {
          console.error(`[${tag}] Upvote error:`, err.message);
        }
      }

      // Prioritize posts where someone is asking for help (higher conversion potential)
      const isQuestion = post._isIntent || /\?|help|recommend|suggest|advice|stuck|how do|what tool|best way|looking for|need a|consejo|ayuda|recomendar|herramienta|cómo/i.test(post.title + ' ' + post.text);
      const commentChance = isQuestion ? 0.85 : 0.25; // 85% for questions (was 70%), 25% for others (was 35%)

      // Comment (probability-based, only if under limit and post has content to reply to)
      // Require minimum body text — title-only posts give Claude too little context and
      // cause it to break character (seen: "I'd need to see the post content...")
      if (todayComments + commentsGiven < limits.comments
        && post.text.length > 50
        && Math.random() < commentChance) {
        try {
          const postContent = `${post.title}\n\n${post.text}`;

          let comment;
          if (persona) {
            comment = await generatePersonaComment(persona, 'reddit', post.author, postContent);
          } else {
            // Fallback — shouldn't happen since reddit is persona-only
            continue;
          }

          if (!comment) {
            console.log(`[${tag}] Claude rejected comment for ${post.author} — skipping`);
            continue;
          }

          // Sanity check: reject comments that reveal the AI generation process
          // (meta-phrases indicate Claude broke character due to insufficient context)
          const metaPhrases = [
            /i.{0,10}d need to see/i,
            /post content/i,
            /write something real/i,
            /drop the (post|text)/i,
            /can.t tell (if|without)/i,
            /give you a genuine comment/i,
            /need more (context|info|detail)/i,
            /what (setting|platform|metric).{0,30}exactly/i,
          ];
          if (metaPhrases.some(p => p.test(comment))) {
            console.log(`[${tag}] ⚠️ Meta-phrase detected in generated comment — skipping (insufficient post context)`);
            continue;
          }

          // Navigate to the post to leave a comment
          const postNavOk = await safeGoto(page, post.postUrl, { tag, timeout: 45000 });
          if (!postNavOk) {
            console.log(`[${tag}] Failed to load post, skipping comment`);
            continue;
          }
          await delay(2000, 3000);

          // old.reddit.com has a textarea for comments
          const commentBox = await page.$('.usertext-edit textarea, #comment_reply_form textarea, textarea[name="text"]');
          if (!commentBox) {
            console.log(`[${tag}] Comment box not found for post by ${post.author}`);
            // Navigate back to subreddit listing
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await delay(1000, 2000);
            continue;
          }

          await commentBox.click();
          await delay(500, 1000);
          await page.keyboard.type(comment, { delay: 40 });
          await delay(1000, 2000);

          // Submit — old reddit uses a "save" button for comments
          const submitBtn = await page.$('.usertext-edit button[type="submit"], .save-button button, button.save');
          if (submitBtn) {
            await submitBtn.click();
            await delay(2000, 3000);
            commentsGiven++;
            await db.saveAction({ type: 'rd_comment', profileUrl: post.postUrl, content: comment, accountId });
            console.log(`[${tag}] Commented on ${post.author}: "${comment.slice(0, 50)}..."`);
          } else {
            console.log(`[${tag}] Submit button not found`);
          }

          // Navigate back to subreddit listing
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await delay(3000, 5000);
        } catch (err) {
          console.error(`[${tag}] Comment error:`, err.message);
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      }

      if (todayUpvotes + upvotesGiven >= limits.upvotes && todayComments + commentsGiven >= limits.comments) break;
    }

    console.log(`[${tag}] Session done — ${upvotesGiven} upvotes, ${commentsGiven} comments`);
  } catch (err) {
    console.error(`[${tag}] engageWithPosts error:`, err.message);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { engageWithPosts };
