'use strict';

/**
 * Post a specific comment on a Reddit post using a persona's browser session.
 *
 * Usage: node outreach-reddit-comment.js <persona-id> <post-url> <comment-text>
 * Example: node outreach-reddit-comment.js persona-alex https://old.reddit.com/r/SideProject/comments/xxx "Great tool!"
 */

require('dotenv').config();
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');

const PERSONAS = require('./personas.json');

function delay(min = 1500, max = 3000) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function commentOnPost(personaId, postUrl, commentText, opts = {}) {
  const persona = PERSONAS.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona ${personaId} not found`);

  const profileDir = persona.profileDir;
  const tag = `reddit-comment:${personaId}`;

  // Convert new reddit URL to old reddit for reliable DOM
  const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');

  console.log(`[${tag}] Opening browser...`);
  const page = await newPageForProfile(profileDir);

  try {
    // Verify session
    const ok = await safeGoto(page, 'https://old.reddit.com/', { tag, timeout: 60000 });
    if (!ok) throw new Error('Failed to load Reddit');
    await delay(2000, 3000);

    const loggedIn = await safeEval(page, () => {
      const userSpan = document.querySelector('.user a');
      return !!userSpan && !userSpan.textContent?.includes('login');
    });

    if (!loggedIn) throw new Error(`${personaId} session expired on Reddit`);

    const username = await safeEval(page, () => {
      return document.querySelector('.user a')?.textContent?.trim() || 'unknown';
    });
    console.log(`[${tag}] Logged in as: ${username}`);

    // Navigate to post
    console.log(`[${tag}] Navigating to post...`);
    const postOk = await safeGoto(page, oldUrl, { tag, timeout: 45000 });
    if (!postOk) throw new Error('Failed to load post');
    await delay(2000, 3000);

    // If replyToUser is set, find that user's comment and click reply on it
    if (opts.replyToUser) {
      console.log(`[${tag}] Looking for comment by ${opts.replyToUser} to reply to...`);
      const clicked = await safeEval(page, (targetUser) => {
        const comments = document.querySelectorAll('.comment');
        for (const c of comments) {
          const author = c.querySelector('.author')?.textContent?.trim();
          if (author === targetUser) {
            const replyBtn = c.querySelector('a[onclick*="reply"], .buttons a.comments, ul.buttons li a[data-event-action="comment"]');
            // old reddit: the reply link is in the buttons list
            const btns = c.querySelectorAll('ul.flat-list li a');
            for (const b of btns) {
              if (b.textContent.trim().toLowerCase() === 'reply') {
                b.click();
                return true;
              }
            }
          }
        }
        return false;
      }, opts.replyToUser);

      if (!clicked) throw new Error(`Could not find comment by ${opts.replyToUser} to reply to`);
      await delay(1000, 2000);

      // After clicking reply, a textarea appears inside that comment
      const replyBox = await safeEval(page, (targetUser) => {
        const comments = document.querySelectorAll('.comment');
        for (const c of comments) {
          const author = c.querySelector('.author')?.textContent?.trim();
          if (author === targetUser) {
            const ta = c.querySelector('.usertext-edit textarea');
            if (ta) { ta.focus(); return true; }
          }
        }
        return false;
      }, opts.replyToUser);

      if (!replyBox) throw new Error('Reply textarea not found after clicking reply');
      await delay(500, 1000);

      // Type into the focused textarea
      await page.keyboard.type(commentText, { delay: 35 });
      await delay(1000, 2000);

      // Submit — find the save button inside that comment's reply form
      const submitted = await safeEval(page, (targetUser) => {
        const comments = document.querySelectorAll('.comment');
        for (const c of comments) {
          const author = c.querySelector('.author')?.textContent?.trim();
          if (author === targetUser) {
            const btn = c.querySelector('.usertext-edit button[type="submit"], .save-button button');
            if (btn) { btn.click(); return true; }
          }
        }
        return false;
      }, opts.replyToUser);

      if (!submitted) throw new Error('Could not find submit button for reply');
    } else {
      // Top-level comment
      const commentBox = await page.$('.usertext-edit textarea, textarea[name="text"]');
      if (!commentBox) throw new Error('Comment box not found — may need to scroll or expand');

      await commentBox.click();
      await delay(500, 1000);
      await page.keyboard.type(commentText, { delay: 35 });
      await delay(1000, 2000);

      const submitBtn = await page.$('.usertext-edit button[type="submit"], .save-button button, button.save');
      if (!submitBtn) throw new Error('Submit button not found');
      await submitBtn.click();
    }

    await delay(3000, 4000);
    console.log(`[${tag}] Comment posted successfully!`);
    console.log(`[${tag}] Comment: "${commentText.slice(0, 80)}..."`);

  } finally {
    await page.close().catch(() => {});
    await closeBrowserForProfile(profileDir);
  }
}

// --- Main ---
// Usage: node outreach-reddit-comment.js <persona-id> <post-url> [--reply-to <username>] "<comment>"
async function main() {
  const args = process.argv.slice(2);
  const personaId = args[0];
  const postUrl = args[1];

  let replyToUser = null;
  let commentParts = [];

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--reply-to' && args[i + 1]) {
      replyToUser = args[i + 1];
      i++;
    } else {
      commentParts.push(args[i]);
    }
  }
  const commentText = commentParts.join(' ');

  if (!personaId || !postUrl || !commentText) {
    console.log('Usage: node outreach-reddit-comment.js <persona-id> <post-url> [--reply-to <username>] "<comment>"');
    process.exit(1);
  }

  await commentOnPost(personaId, postUrl, commentText, { replyToUser });
}

main().catch(err => {
  console.error('[outreach-reddit-comment] Error:', err.message);
  process.exit(1);
});

module.exports = { commentOnPost, postTweet: null };
