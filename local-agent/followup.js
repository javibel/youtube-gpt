'use strict';

const { newPage, newPageForProfile, ensureSession, persistSession } = require('./browser');
const db = require('./db');
const { generateFollowupReply } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { readingPause, commentPause } = require('./humanize');

// Limits per platform per day
const FOLLOWUP_LIMITS = { twitter: 2, reddit: 2 };

// How many days back to look for our comments that might have replies
const DAYS_BACK = 7;

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// ── Twitter: check notifications for replies ──

async function checkTwitterFollowups(opts = {}) {
  const accountId = opts.accountId || null;
  const tag = accountId ? `followup:twitter:${accountId}` : 'followup:twitter';
  const persona = opts.persona || null;

  const todayCount = await db.countTodayFollowups('twitter', accountId);
  if (todayCount >= FOLLOWUP_LIMITS.twitter) {
    console.log(`[${tag}] Daily follow-up limit reached (${todayCount})`);
    return;
  }

  console.log(`[${tag}] Checking notifications for replies...`);

  const page = opts.profileDir
    ? await newPageForProfile(opts.profileDir)
    : await newPage();

  if (!opts.profileDir) {
    await ensureSession(page, {
      domain: 'x.com',
      sessionCookieName: 'auth_token',
      cookieFile: opts.cookieFile || 'twitter-cookies.json',
    });
  }

  try {
    const ok = await safeGoto(page, 'https://x.com/notifications/mentions', { tag, timeout: 60000 });
    if (!ok) return;
    await delay(3000, 5000);

    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow')) {
      const who = accountId || (opts.profileDir ? opts.profileDir.replace(/.*[/\\]/, '') : null);
      await alertSessionExpired('Twitter', who,
        'Pasos:\n1. Abre Edge y entra a x.com (o node login-persona.js)\n2. Exporta cookies\n3. pm2 restart ytubviral-agent');
      console.log(`[${tag}] Session invalid, skipping`);
      return;
    }

    if (!opts.profileDir) {
      await persistSession(page, { domain: 'x.com', cookieFile: opts.cookieFile || 'twitter-cookies.json' });
    }

    // Scroll to load mentions
    await safeEval(page, () => window.scrollBy(0, 400));
    await delay(2000, 3000);

    // Collect mention notifications
    const mentions = await safeEval(page, () => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (const article of articles) {
        const textEl = article.querySelector('div[data-testid="tweetText"]');
        const text = textEl?.innerText?.trim() ?? '';
        if (!text || text.length < 5) continue;

        const timeLink = article.querySelector('time')?.closest('a');
        const tweetUrl = timeLink?.href ?? '';

        const authorEl = article.querySelector('div[data-testid="User-Name"] a span');
        const author = authorEl?.innerText?.trim() ?? '';

        const timeEl = article.querySelector('time');
        const datetime = timeEl?.getAttribute('datetime') ?? '';

        if (tweetUrl && author) {
          results.push({ text: text.slice(0, 400), tweetUrl, author, datetime });
        }
      }
      return results.slice(0, 10);
    });

    if (!mentions || mentions.length === 0) {
      console.log(`[${tag}] No mentions found`);
      return;
    }

    console.log(`[${tag}] Found ${mentions.length} mentions`);

    // Get our recent comments to match against
    const ourComments = await db.getRecentComments('twitter', DAYS_BACK, accountId);

    let followupsGiven = 0;

    for (const mention of mentions) {
      if (todayCount + followupsGiven >= FOLLOWUP_LIMITS.twitter) break;

      // Filter: only last 48h
      if (mention.datetime) {
        const age = Date.now() - new Date(mention.datetime).getTime();
        if (age > 48 * 60 * 60 * 1000) continue;
      }

      // Check if we already handled this reply
      const alreadyHandled = await db.hasFollowup('twitter', mention.tweetUrl, mention.author, accountId);
      if (alreadyHandled) continue;

      // Navigate to the mention to see the conversation context
      const navOk = await safeGoto(page, mention.tweetUrl, { tag, timeout: 45000 });
      if (!navOk) continue;
      await delay(2000, 3000);

      // Look for our original comment in the thread
      const context = await safeEval(page, () => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const texts = [];
        for (const article of articles) {
          const textEl = article.querySelector('div[data-testid="tweetText"]');
          const t = textEl?.innerText?.trim() ?? '';
          if (t) texts.push(t.slice(0, 300));
        }
        return texts;
      }) || [];

      // Match our original comment
      let ourOriginal = null;
      for (const comment of ourComments) {
        if (!comment.content) continue;
        const snippet = comment.content.slice(0, 40);
        if (context.some(t => t.includes(snippet))) {
          ourOriginal = comment;
          break;
        }
      }

      if (!ourOriginal) {
        await db.saveFollowup({
          platform: 'twitter', originalActionId: null,
          postUrl: mention.tweetUrl, replyAuthor: mention.author,
          replyContent: mention.text, ourResponse: null, accountId,
        });
        continue;
      }

      console.log(`[${tag}] ${mention.author} replied to our comment: "${mention.text.slice(0, 60)}..."`);
      await readingPause();

      const shouldMention = !persona && Math.random() < 0.15;
      const reply = await generateFollowupReply(
        'twitter', ourOriginal.content, mention.text, mention.author,
        persona, shouldMention
      );

      if (!reply) {
        console.log(`[${tag}] Claude decided not to follow up with ${mention.author}`);
        await db.saveFollowup({
          platform: 'twitter', originalActionId: ourOriginal.id,
          postUrl: mention.tweetUrl, replyAuthor: mention.author,
          replyContent: mention.text, ourResponse: null, accountId,
        });
        continue;
      }

      // Post the reply
      try {
        const replyClicked = await safeEval(page, () => {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          const target = articles[articles.length - 1] || articles[0];
          if (!target) return false;
          const replyBtn = target.querySelector('button[data-testid="reply"]');
          if (replyBtn) { replyBtn.click(); return true; }
          return false;
        });

        if (!replyClicked) {
          console.log(`[${tag}] Reply button not found for ${mention.author}`);
          continue;
        }
        await delay(1500, 2500);

        const textArea = await page.$('div[data-testid="tweetTextarea_0"]');
        if (!textArea) {
          console.log(`[${tag}] Reply textarea not found`);
          await page.keyboard.press('Escape').catch(() => {});
          continue;
        }

        await textArea.click();
        await delay(500, 1000);
        await page.keyboard.type(reply, { delay: 50 });
        await delay(1000, 2000);

        const submitBtn = await page.$('button[data-testid="tweetButtonInline"]');
        if (submitBtn) {
          await submitBtn.click();
          await delay(2000, 3000);
          followupsGiven++;

          await db.saveFollowup({
            platform: 'twitter', originalActionId: ourOriginal.id,
            postUrl: mention.tweetUrl, replyAuthor: mention.author,
            replyContent: mention.text, ourResponse: reply, accountId,
          });
          await db.saveAction({ type: 'x_reply', profileUrl: mention.tweetUrl, content: reply, accountId });
          console.log(`[${tag}] Follow-up reply to ${mention.author}: "${reply.slice(0, 60)}..."`);
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }

        await commentPause();
      } catch (err) {
        console.error(`[${tag}] Reply error: ${err.message}`);
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    console.log(`[${tag}] Done — ${followupsGiven} follow-ups`);
  } catch (err) {
    console.error(`[${tag}] Error: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Reddit: check inbox for comment replies ──

async function checkRedditFollowups(opts = {}) {
  const accountId = opts.accountId || null;
  const persona = opts.persona || null;
  const tag = accountId ? `followup:reddit:${accountId}` : 'followup:reddit';

  if (!opts.profileDir) {
    console.log(`[${tag}] Reddit requires profileDir, skipping`);
    return;
  }

  const todayCount = await db.countTodayFollowups('reddit', accountId);
  if (todayCount >= FOLLOWUP_LIMITS.reddit) {
    console.log(`[${tag}] Daily follow-up limit reached`);
    return;
  }

  console.log(`[${tag}] Checking inbox for replies...`);

  const page = await newPageForProfile(opts.profileDir);

  try {
    const ok = await safeGoto(page, 'https://old.reddit.com/message/inbox/', { tag, timeout: 60000 });
    if (!ok) return;
    await delay(3000, 5000);

    const loggedIn = await safeEval(page, () => {
      const userSpan = document.querySelector('.user a');
      return !!userSpan && !userSpan.textContent?.includes('login');
    });

    if (!loggedIn) {
      const who = accountId || opts.profileDir.replace(/.*[/\\]/, '');
      await alertSessionExpired('Reddit', who,
        `Pasos:\n1. Ejecuta: node login-persona.js ${who} reddit\n2. Haz login manual y cierra el navegador\n3. pm2 restart ytubviral-agent`);
      console.log(`[${tag}] Session invalid, skipping`);
      return;
    }

    // Collect inbox messages — comment replies
    const messages = await safeEval(page, () => {
      const results = [];
      const things = document.querySelectorAll('#siteTable > .thing.message');
      for (const thing of things) {
        const subjectEl = thing.querySelector('.subject .md-container, .subject');
        const subject = subjectEl?.textContent?.trim() ?? '';
        if (!subject.toLowerCase().includes('comment reply') && !subject.toLowerCase().includes('post reply')) continue;

        const bodyEl = thing.querySelector('.md');
        const body = bodyEl?.textContent?.trim() ?? '';
        if (!body || body.length < 5) continue;

        const authorEl = thing.querySelector('.author');
        const author = authorEl?.textContent?.trim() ?? '[deleted]';

        const contextLink = thing.querySelector('a.bylink[href*="/comments/"]');
        const contextUrl = contextLink?.href ?? '';

        const isNew = thing.classList.contains('unread');

        const parentEl = thing.querySelector('.parent .md');
        const parentText = parentEl?.textContent?.trim() ?? '';

        if (contextUrl && author !== '[deleted]') {
          results.push({
            body: body.slice(0, 400), author, contextUrl, isNew,
            parentText: parentText.slice(0, 300),
          });
        }
      }
      return results.slice(0, 8);
    }) || [];

    console.log(`[${tag}] Found ${messages.length} comment replies in inbox`);

    const ourComments = await db.getRecentComments('reddit', DAYS_BACK, accountId);

    let followupsGiven = 0;

    for (const msg of messages) {
      if (todayCount + followupsGiven >= FOLLOWUP_LIMITS.reddit) break;

      const alreadyHandled = await db.hasFollowup('reddit', msg.contextUrl, msg.author, accountId);
      if (alreadyHandled) continue;

      // Match to our original comment
      let ourOriginal = null;
      for (const comment of ourComments) {
        if (!comment.content) continue;
        const snippet = comment.content.slice(0, 40);
        if (msg.parentText.includes(snippet)) {
          ourOriginal = comment;
          break;
        }
      }

      if (!ourOriginal) {
        await db.saveFollowup({
          platform: 'reddit', originalActionId: null,
          postUrl: msg.contextUrl, replyAuthor: msg.author,
          replyContent: msg.body, ourResponse: null, accountId,
        });
        continue;
      }

      console.log(`[${tag}] ${msg.author} replied: "${msg.body.slice(0, 60)}..."`);
      await readingPause();

      const shouldMention = persona ? (Math.random() < (persona.mentionRate || 0.15)) : (Math.random() < 0.12);
      const reply = await generateFollowupReply(
        'reddit', ourOriginal.content, msg.body, msg.author,
        persona, shouldMention
      );

      if (!reply) {
        console.log(`[${tag}] Claude decided not to follow up with ${msg.author}`);
        await db.saveFollowup({
          platform: 'reddit', originalActionId: ourOriginal.id,
          postUrl: msg.contextUrl, replyAuthor: msg.author,
          replyContent: msg.body, ourResponse: null, accountId,
        });
        continue;
      }

      // Navigate to the comment context to reply
      try {
        const navOk = await safeGoto(page, msg.contextUrl, { tag, timeout: 45000 });
        if (!navOk) continue;
        await delay(2000, 3000);

        const replyLinkClicked = await safeEval(page, (replyAuthor) => {
          const comments = document.querySelectorAll('.comment');
          for (const comment of comments) {
            const authorEl = comment.querySelector('.author');
            if (authorEl?.textContent?.trim() === replyAuthor) {
              const buttons = comment.querySelectorAll('.buttons a, .flat-list a');
              for (const btn of buttons) {
                if (btn.textContent?.trim().toLowerCase() === 'reply') {
                  btn.click();
                  return true;
                }
              }
            }
          }
          return false;
        }, msg.author);

        if (!replyLinkClicked) {
          console.log(`[${tag}] Reply link not found for ${msg.author}'s comment`);
          await db.saveFollowup({
            platform: 'reddit', originalActionId: ourOriginal.id,
            postUrl: msg.contextUrl, replyAuthor: msg.author,
            replyContent: msg.body, ourResponse: null, accountId,
          });
          continue;
        }
        await delay(1000, 2000);

        const commentBox = await page.$('.usertext-edit textarea, textarea[name="text"]');
        if (!commentBox) {
          console.log(`[${tag}] Comment box not found after clicking reply`);
          continue;
        }

        await commentBox.click();
        await delay(500, 1000);
        await page.keyboard.type(reply, { delay: 40 });
        await delay(1000, 2000);

        const submitBtn = await page.$('.usertext-edit button[type="submit"], button.save');
        if (submitBtn) {
          await submitBtn.click();
          await delay(2000, 3000);
          followupsGiven++;

          await db.saveFollowup({
            platform: 'reddit', originalActionId: ourOriginal.id,
            postUrl: msg.contextUrl, replyAuthor: msg.author,
            replyContent: msg.body, ourResponse: reply, accountId,
          });
          await db.saveAction({ type: 'rd_comment', profileUrl: msg.contextUrl, content: reply, accountId });
          console.log(`[${tag}] Follow-up reply to ${msg.author}: "${reply.slice(0, 60)}..."`);
        }

        await commentPause();
      } catch (err) {
        console.error(`[${tag}] Reply error: ${err.message}`);
      }
    }

    // Mark inbox as read after processing
    if (messages.some(m => m.isNew)) {
      await safeGoto(page, 'https://old.reddit.com/message/inbox/', { tag, timeout: 30000 });
    }

    console.log(`[${tag}] Done — ${followupsGiven} follow-ups`);
  } catch (err) {
    console.error(`[${tag}] Error: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Main orchestrator ──

async function runFollowupChecks() {
  console.log('[followup] Starting follow-up check cycle...');

  // Brand Twitter follow-ups
  await checkTwitterFollowups().catch(err => console.error('[followup] Twitter error:', err.message));
  await delay(5000, 10000);

  // Persona accounts (Reddit + Twitter)
  try {
    const personas = require('./personas.json');
    for (const persona of personas) {
      if (persona.platforms.reddit) {
        await checkRedditFollowups({
          accountId: persona.id,
          profileDir: persona.profileDir,
          persona,
        }).catch(err => console.error(`[followup] Reddit ${persona.id} error:`, err.message));
        await delay(5000, 10000);
      }
      if (persona.platforms.twitter) {
        await checkTwitterFollowups({
          accountId: persona.id,
          profileDir: persona.profileDir,
          cookieFile: persona.platforms.twitter.cookieFile,
          persona,
        }).catch(err => console.error(`[followup] Twitter ${persona.id} error:`, err.message));
        await delay(5000, 10000);
      }
    }
  } catch (err) {
    console.error('[followup] Persona loading error:', err.message);
  }

  console.log('[followup] Follow-up check cycle complete');
}

module.exports = { runFollowupChecks, checkTwitterFollowups, checkRedditFollowups };
