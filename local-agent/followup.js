'use strict';

const fs = require('fs');
const path = require('path');
const { newPage, newPageForProfile, ensureSession, persistSession } = require('./browser');
const db = require('./db');
const { generateFollowupReply, callClaude } = require('./claude');
const { safeGoto, safeEval, alertSessionExpired } = require('./resilience');
const { readingPause, commentPause } = require('./humanize');
const config = require('./config');

// Configurable via dashboard (module: 'followup')
function getFollowupCfg() {
  return {
    twitterLimit: config.get('followup', 'twitterLimit', 4),
    daysBack: config.get('followup', 'daysBack', 14),
    fuzzyMatchThreshold: config.get('followup', 'fuzzyMatchThreshold', 0.4),
  };
}

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// Fuzzy matching: check if our comment matches the context by word overlap
// Twitter/Bluesky reformat text (entities, truncation, markdown), so exact match fails
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

// ── Main orchestrator ──

async function runFollowupChecks() {
  console.log('[followup] Starting follow-up check cycle...');

  // Twitter ABANDONADO 2026-06-24 — shadowban confirmado en las 4 personas. Sin followups de Twitter.
  console.log('[followup] Twitter followups DISABLED — plataforma abandonada');

  console.log('[followup] Follow-up check cycle complete');
}

module.exports = { runFollowupChecks, checkTwitterFollowups };
