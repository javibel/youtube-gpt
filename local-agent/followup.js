'use strict';

const { newPage, newPageForProfile, ensureSession, persistSession } = require('./browser');
const db = require('./db');
const { generateFollowupReply } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { readingPause, commentPause } = require('./humanize');
const config = require('./config');

// Configurable via dashboard (module: 'followup')
function getFollowupCfg() {
  return {
    twitterLimit: config.get('followup', 'twitterLimit', 4),
    redditLimit: config.get('followup', 'redditLimit', 4),
    daysBack: config.get('followup', 'daysBack', 14),
    fuzzyMatchThreshold: config.get('followup', 'fuzzyMatchThreshold', 0.4),
  };
}

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// Fuzzy matching: check if our comment matches the context by word overlap
// Reddit/Twitter reformat text (entities, truncation, markdown), so exact match fails
function fuzzyMatchComment(ourContent, contextTexts) {
  if (!ourContent || ourContent.length < 10) return false;
  // Extract significant words (4+ chars, lowercase, no common words)
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'would', 'could', 'should', 'about', 'their', 'there', 'them', 'they', 'what', 'when', 'your', 'para', 'como', 'pero', 'también', 'esto', 'eso', 'más', 'que', 'una', 'los', 'las', 'del', 'con']);
  const getWords = (text) => text.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));

  const ourWords = getWords(ourContent);
  if (ourWords.length < 3) return false;
  const ourSet = new Set(ourWords.slice(0, 20)); // First 20 significant words

  for (const ctx of contextTexts) {
    const ctxWords = getWords(ctx);
    let matches = 0;
    for (const word of ctxWords) {
      if (ourSet.has(word)) matches++;
    }
    // If 40%+ of our significant words appear in the context, it's a match
    const ratio = matches / ourSet.size;
    if (ratio >= getFollowupCfg().fuzzyMatchThreshold && matches >= 3) return true;
  }
  return false;
}

// ── Twitter: check notifications for replies ──

async function checkTwitterFollowups(opts = {}) {
  const accountId = opts.accountId || null;
  const tag = accountId ? `followup:twitter:${accountId}` : 'followup:twitter';
  const persona = opts.persona || null;
  const fCfg = getFollowupCfg();

  const todayCount = await db.countTodayFollowups('twitter', accountId);
  if (todayCount >= fCfg.twitterLimit) {
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
    const ourComments = await db.getRecentComments('twitter', fCfg.daysBack, accountId);

    let followupsGiven = 0;

    for (const mention of mentions) {
      if (todayCount + followupsGiven >= fCfg.twitterLimit) break;

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

      // Match our original comment using fuzzy word overlap (exact matching fails due to reformatting)
      let ourOriginal = null;
      for (const comment of ourComments) {
        if (!comment.content) continue;
        // Try exact snippet first (fast path)
        const snippet = comment.content.slice(0, 40);
        if (context.some(t => t.includes(snippet))) {
          ourOriginal = comment;
          break;
        }
        // Fuzzy fallback — word overlap matching
        if (fuzzyMatchComment(comment.content, context)) {
          ourOriginal = comment;
          break;
        }
      }

      if (!ourOriginal) {
        // Even without matching our original, if someone replied to us, try to respond
        // (the mention IS in our notifications, so it's likely a reply to us)
        if (mention.text.length > 10) {
          console.log(`[${tag}] Can't match original but replying to mention from ${mention.author}`);
          const reply = await generateFollowupReply(
            'twitter', '(context unavailable)', mention.text, mention.author,
            persona, !persona && Math.random() < 0.15
          );
          if (reply) {
            try {
              const replyClicked = await safeEval(page, () => {
                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                const target = articles[articles.length - 1] || articles[0];
                if (!target) return false;
                const replyBtn = target.querySelector('button[data-testid="reply"]');
                if (replyBtn) { replyBtn.click(); return true; }
                return false;
              });
              if (replyClicked) {
                await delay(1500, 2500);
                const textArea = await page.$('div[data-testid="tweetTextarea_0"]');
                if (textArea) {
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
                      platform: 'twitter', originalActionId: null,
                      postUrl: mention.tweetUrl, replyAuthor: mention.author,
                      replyContent: mention.text, ourResponse: reply, accountId,
                    });
                    await db.saveAction({ type: 'x_reply', profileUrl: mention.tweetUrl, content: reply, accountId });
                    console.log(`[${tag}] Follow-up (no match) to ${mention.author}: "${reply.slice(0, 60)}..."`);
                  }
                }
              }
            } catch (err) {
              console.error(`[${tag}] Reply error (no match): ${err.message}`);
            }
            await commentPause();
            continue;
          }
        }
        await db.saveFollowup({
          platform: 'twitter', originalActionId: null,
          postUrl: mention.tweetUrl, replyAuthor: mention.author,
          replyContent: mention.text, ourResponse: null, accountId,
        });
        continue;
      }

      console.log(`[${tag}] ${mention.author} replied to our comment: "${mention.text.slice(0, 60)}..."`);
      await readingPause();

      // Follow-ups are the best moment to mention YTubViral — someone is engaged with us
      const shouldMention = persona ? (Math.random() < (persona.mentionRate || 0.25) * 1.5) : (Math.random() < 0.30);
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
  const fCfg = getFollowupCfg();

  if (!opts.profileDir) {
    console.log(`[${tag}] Reddit requires profileDir, skipping`);
    return;
  }

  const todayCount = await db.countTodayFollowups('reddit', accountId);
  if (todayCount >= fCfg.redditLimit) {
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

    const ourComments = await db.getRecentComments('reddit', fCfg.daysBack, accountId);

    let followupsGiven = 0;

    for (const msg of messages) {
      if (todayCount + followupsGiven >= fCfg.redditLimit) break;

      const alreadyHandled = await db.hasFollowup('reddit', msg.contextUrl, msg.author, accountId);
      if (alreadyHandled) continue;

      // Match to our original comment — use fuzzy matching (Reddit reformats heavily)
      let ourOriginal = null;
      for (const comment of ourComments) {
        if (!comment.content) continue;
        // Try exact snippet first
        const snippet = comment.content.slice(0, 40);
        if (msg.parentText && msg.parentText.includes(snippet)) {
          ourOriginal = comment;
          break;
        }
        // Fuzzy matching on parentText
        if (msg.parentText && fuzzyMatchComment(comment.content, [msg.parentText])) {
          ourOriginal = comment;
          break;
        }
        // URL matching: if the contextUrl contains the same post we commented on
        if (comment.post_url && msg.contextUrl && msg.contextUrl.includes(comment.post_url.split('/comments/')[1]?.split('/')[0] || '___none___')) {
          ourOriginal = comment;
          break;
        }
      }

      if (!ourOriginal) {
        // Even if we can't match our original, if someone replied in our inbox it's to us — respond
        if (msg.body.length > 10) {
          console.log(`[${tag}] Can't match original but ${msg.author} replied in inbox, responding...`);
          const shouldMention = persona ? (Math.random() < (persona.mentionRate || 0.15)) : (Math.random() < 0.12);
          const reply = await generateFollowupReply(
            'reddit', msg.parentText || '(context unavailable)', msg.body, msg.author,
            persona, shouldMention
          );
          if (reply) {
            try {
              const navOk = await safeGoto(page, msg.contextUrl, { tag, timeout: 45000 });
              if (navOk) {
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

                if (replyLinkClicked) {
                  await delay(1000, 2000);
                  const commentBox = await page.$('.usertext-edit textarea, textarea[name="text"]');
                  if (commentBox) {
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
                        platform: 'reddit', originalActionId: null,
                        postUrl: msg.contextUrl, replyAuthor: msg.author,
                        replyContent: msg.body, ourResponse: reply, accountId,
                      });
                      await db.saveAction({ type: 'rd_comment', profileUrl: msg.contextUrl, content: reply, accountId });
                      console.log(`[${tag}] Follow-up (no match) to ${msg.author}: "${reply.slice(0, 60)}..."`);
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`[${tag}] Reply error (no match): ${err.message}`);
            }
            await commentPause();
            continue;
          }
        }
        await db.saveFollowup({
          platform: 'reddit', originalActionId: null,
          postUrl: msg.contextUrl, replyAuthor: msg.author,
          replyContent: msg.body, ourResponse: null, accountId,
        });
        continue;
      }

      console.log(`[${tag}] ${msg.author} replied: "${msg.body.slice(0, 60)}..."`);
      await readingPause();

      // Follow-ups are prime moments to mention YTubViral — someone is already engaged
      const shouldMention = persona ? (Math.random() < (persona.mentionRate || 0.20) * 1.5) : (Math.random() < 0.25);
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
