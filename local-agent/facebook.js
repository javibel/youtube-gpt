'use strict';

const { newPage, newPageForProfile, ensureSession, persistSession } = require('./browser');
const db = require('./db');
const { generateFacebookComment } = require('./claude');
const { sendEmail } = require('./reports');
const { adjustedLimit, shouldSkipSession, shouldSkipPost, readingPause, actionPause, commentPause, warmupScroll } = require('./humanize');

const BASE_LIMITS = { likes: 8, comments: 3 };

// Grupos de creadores de contenido / YouTubers en español
const GROUPS = [
  // Se pueden añadir IDs o URLs de grupos específicos
  // Por ahora buscamos posts en el feed de grupos sugeridos
];

const SEARCH_TERMS = [
  // EN — active FB groups and communities
  'content creator community',
  'youtube creator tips',
  'small youtuber support',
  'content creators help',
  'social media marketing tips',
  'video marketing strategy',
  'grow your youtube channel',
  // ES — active FB groups
  'creadores de contenido',
  'youtubers pequeños apoyo',
  'cómo crecer en youtube',
  'marketing digital emprendedores',
  'creadores de video',
  'emprendedores digitales',
];

// Skip posts from our own accounts — names, URLs, and partial matches
const OWN_ACCOUNT_NAMES = [
  'ytubviral', 'ytub viral', 'ytubviral.com',
  'ytbeviral', 'ytbe viral',
  'javier jimeno', 'javi jimeno',
];
const OWN_ACCOUNT_URL_PARTS = [
  'ytubviral', 'ytbeviral',
];

function isOwnAccount(author, authorUrl = '') {
  const lowerName = author.toLowerCase().replace(/[^a-z0-9\s.]/g, '');
  if (OWN_ACCOUNT_NAMES.some(own => lowerName.includes(own))) return true;
  if (authorUrl) {
    const lowerUrl = authorUrl.toLowerCase();
    if (OWN_ACCOUNT_URL_PARTS.some(part => lowerUrl.includes(part))) return true;
  }
  return false;
}

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

let sessionAlertSent = false;

async function login({ profileDir, cookieFile } = {}) {
  const p = profileDir ? await newPageForProfile(profileDir) : await newPage();

  // Persona accounts: use persistent Chrome profile (no cookie seeding needed)
  // Brand account: seed cookies from JSON file as before
  if (!profileDir) {
    await ensureSession(p, {
      domain: '.facebook.com',
      sessionCookieName: 'c_user',
      cookieFile: cookieFile || 'facebook-cookies.json',
    });
  }

  await p.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss cookie dialog if present
  const dismissBtns = await p.$$('button');
  for (const btn of dismissBtns) {
    const text = await btn.evaluate(el => el.textContent?.trim());
    if (text === 'Decline optional cookies' || text === 'Rechazar cookies opcionales'
      || text === 'Allow all cookies' || text === 'Permitir todas las cookies') {
      if (text.toLowerCase().includes('decline') || text.toLowerCase().includes('rechazar')) {
        await btn.click().catch(() => {});
        await delay(500, 1000);
      }
    }
  }

  // Check if logged in — if redirected to login page, session is invalid
  const url = p.url();
  const loggedIn = await p.evaluate(() => {
    return !!document.querySelector('div[role="navigation"]') || !!document.querySelector('div[aria-label="Facebook"]');
  });

  if (loggedIn && !url.includes('/login')) {
    sessionAlertSent = false;
    console.log('[facebook] Session active');
    // Persist cookies back to file for brand account
    if (!profileDir) {
      await persistSession(p, { domain: '.facebook.com', cookieFile: cookieFile || 'facebook-cookies.json' });
    }
    return p;
  }

  // Persona accounts: no fallback, just report
  if (profileDir) {
    console.error('[facebook] Persona session invalid — run: node login-persona.js <persona-id> facebook');
    await p.close();
    return null;
  }

  if (!sessionAlertSent) {
    sessionAlertSent = true;
    await sendEmail(
      'YCML Facebook: sesion expirada',
      'La sesion de Facebook ha expirado.\n\nPasos:\n1. Abre Edge y entra a facebook.com\n2. Abre Cookie Editor > Export as JSON\n3. Reemplaza facebook-cookies.json\n4. pm2 restart ytubviral-agent\n\nAgente YTubViral'
    ).catch(e => console.error('[facebook] Failed to send alert:', e.message));
  }

  console.error('[facebook] Session invalid. URL:', url);
  await p.close();
  return null;
}

// Search for posts and collect them from Facebook search results
async function collectGroupPosts(page, searchTerm) {
  const encodedTerm = encodeURIComponent(searchTerm);
  // Use filters[rp_chrono_sort]=1 to sort by most recent first
  await page.goto(
    `https://www.facebook.com/search/posts?q=${encodedTerm}&filters=${encodeURIComponent('{"rp_chrono_sort:0":"{\\"name\\":\\"chronosort\\",\\"args\\":\\"\\"}"}')}`,
    { waitUntil: 'domcontentloaded', timeout: 60000 }
  );
  await delay(3000, 5000);

  // Scroll to load more results
  await page.evaluate(() => window.scrollBy(0, 800));
  await delay(2000, 3000);

  // Expand all "Ver más" / "See more" in visible posts
  await page.evaluate(() => {
    const elements = document.querySelectorAll('div[role="button"], span[role="button"]');
    for (const el of elements) {
      const t = el.textContent?.trim().toLowerCase();
      if (t === 'ver más' || t === 'see more') {
        el.click();
      }
    }
  });
  await delay(1000, 1500);

  const posts = await page.evaluate(() => {
    const results = [];
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return results;

    const children = feed.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Get post text from dir="auto" divs
      const textEls = child.querySelectorAll('div[dir="auto"]');
      let text = '';
      for (const el of textEls) {
        const t = el.innerText?.trim();
        if (t && t.length > 30) { text = t; break; }
      }
      if (!text) continue;

      // Get author: find links with role="link" and meaningful text (not just "p" or empty)
      const allLinks = child.querySelectorAll('a[role="link"]');
      let author = '';
      let authorHref = '';
      for (const link of allLinks) {
        const t = link.innerText?.trim()?.split('\n')[0] ?? '';
        if (t.length > 1) { author = t; authorHref = link.href?.split('?')[0] ?? ''; break; }
      }

      // Build a pseudo-URL for dedup based on author + text snippet
      const textHash = text.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
      const postId = `fb_${authorHref.split('/').pop() || 'unknown'}_${textHash}`;

      // Filter out old posts — Facebook shows relative time like "2h", "1d", "3w", "1y"
      // Look for timestamp text in links (usually an <a> with short text like "2h" or "1 d")
      let tooOld = false;
      const timeLinks = child.querySelectorAll('a[href*="/posts/"], a[href*="/photo"], a[href*="story_fbid"], span[id]');
      for (const tl of timeLinks) {
        const t = tl.textContent?.trim();
        if (!t) continue;
        // Match patterns: "2h", "3d", "1w", "2mo", "1y", "2 h", "3 d", etc.
        const m = t.match(/^(\d+)\s*(m|min|h|d|w|mo|y)$/i);
        if (m) {
          const num = parseInt(m[1]);
          const unit = m[2].toLowerCase();
          // Allow: minutes, hours, days up to 2
          if (unit === 'w' || unit === 'mo' || unit === 'y') { tooOld = true; break; }
          if (unit === 'd' && num > 2) { tooOld = true; break; }
        }
      }
      // Also check for <abbr> timestamps (some Facebook layouts)
      if (!tooOld) {
        const abbrs = child.querySelectorAll('abbr[data-utime]');
        for (const abbr of abbrs) {
          const utime = parseInt(abbr.getAttribute('data-utime') || '0') * 1000;
          if (utime > 0 && (Date.now() - utime) > 48 * 3600000) { tooOld = true; break; }
        }
      }
      if (tooOld) continue;

      // Check if this post has a comment box available
      const hasCommentBox = !!child.querySelector('div[contenteditable="true"]');

      if (text && author) {
        results.push({
          text: text.slice(0, 400),
          author: author.slice(0, 60),
          authorUrl: authorHref,
          postUrl: postId,
          hasCommentBox,
          feedIndex: i,
        });
      }
    }

    return results.slice(0, 8);
  });

  return posts;
}

// opts: { accountId, cookieFile, profileDir, commentGenerator, limits }
async function engageWithPosts(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || { likes: adjustedLimit(BASE_LIMITS.likes), comments: adjustedLimit(BASE_LIMITS.comments) };
  const commentGen = opts.commentGenerator || generateFacebookComment;
  const tag = accountId ? `facebook:${accountId}` : 'facebook';

  // Skip ~15% of sessions randomly
  if (!accountId && shouldSkipSession()) {
    console.log(`[${tag}] Skipping session (random rest)`);
    return;
  }

  const todayLikes = await db.countTodayActions('fb_like', accountId);
  const todayComments = await db.countTodayActions('fb_comment', accountId);

  if (todayLikes >= limits.likes && todayComments >= limits.comments) {
    console.log(`[${tag}] Daily limits reached`);
    return;
  }
  console.log(`[${tag}] Session limits: ${limits.likes} likes, ${limits.comments} comments`);

  const page = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile });
  if (!page) return;

  try {
    // Warmup: scroll Facebook feed before engaging
    await warmupScroll(page, tag);

    let likesGiven = 0;
    let commentsGiven = 0;

    // Try up to 3 search terms until we get actionable posts
    const tried = new Set();
    for (let attempt = 0; attempt < 3; attempt++) {
      let pick;
      do { pick = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]; } while (tried.has(pick) && tried.size < SEARCH_TERMS.length);
      tried.add(pick);

      console.log(`[${tag}] Searching: "${pick}" (attempt ${attempt + 1})`);
      const posts = await collectGroupPosts(page, pick);
      console.log(`[${tag}] Found ${posts.length} posts`);

      if (posts.length === 0) continue;

      for (const post of posts) {
        // Skip our own posts
        if (isOwnAccount(post.author, post.authorUrl)) continue;

        const alreadyActed = await db.hasFacebookAction(post.postUrl, accountId);
        if (alreadyActed) continue;

        // Randomly skip some posts (humans don't engage with everything)
        if (shouldSkipPost()) continue;

        // Simulate reading the post
        await readingPause();

        // Like (click the Like button in the feed item)
        if (todayLikes + likesGiven < limits.likes) {
          try {
            const liked = await page.evaluate((feedIndex) => {
              const feed = document.querySelector('div[role="feed"]');
              if (!feed) return false;
              const child = feed.children[feedIndex];
              if (!child) return false;

              // Find Like button — it's a div[role="button"] with aria-label containing "Like"/"Me gusta"
              // but NOT the one that says "Unlike"/"Ya no me gusta"
              const buttons = child.querySelectorAll('div[role="button"][aria-label]');
              for (const btn of buttons) {
                const label = btn.getAttribute('aria-label') || '';
                if ((label === 'Like' || label === 'Me gusta') && !label.includes('Un')) {
                  const r = btn.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0) { btn.click(); return true; }
                }
              }
              // Fallback: find the Like span text inside action bar
              const spans = child.querySelectorAll('span');
              for (const span of spans) {
                const t = span.textContent?.trim();
                if ((t === 'Like' || t === 'Me gusta') && span.closest('[role="button"]')) {
                  const btn = span.closest('[role="button"]');
                  const r = btn.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0) { btn.click(); return true; }
                }
              }
              return false;
            }, post.feedIndex);

            if (liked) {
              likesGiven++;
              await db.saveAction({ type: 'fb_like', profileUrl: post.postUrl, accountId });
              console.log(`[${tag}] Liked post by ${post.author}`);
              await actionPause();
            }
          } catch (err) {
            console.error(`[${tag}] Like error:`, err.message);
          }
        }

        // Comment (only if under limit and comment box visible OR we can open it)
        if (todayComments + commentsGiven < limits.comments) {
          try {
            // Click Comment button/icon to open comment box
            await page.evaluate((feedIndex) => {
              const feed = document.querySelector('div[role="feed"]');
              if (!feed) return;
              const child = feed.children[feedIndex];
              if (!child) return;
              // Method 1: Click span with "Comment"/"Comentar" text
              const spans = child.querySelectorAll('span');
              for (const span of spans) {
                const t = span.textContent?.trim();
                if ((t === 'Comment' || t === 'Comentar') && span.closest('[role="button"]')) {
                  span.closest('[role="button"]').click();
                  return;
                }
              }
              // Method 2: Click the comment icon (SVG with comment bubble path)
              const icons = child.querySelectorAll('div[role="button"] svg, i[data-visualcompletion]');
              for (const icon of icons) {
                const parent = icon.closest('[role="button"]');
                if (!parent) continue;
                const ariaLabel = parent.getAttribute('aria-label') || '';
                if (/comment|comentar/i.test(ariaLabel)) {
                  parent.click();
                  return;
                }
              }
            }, post.feedIndex);
            await delay(1500, 2500);

            const comment = await commentGen(post.author, post.text);
            if (!comment) continue;

            // Find and focus the comment box — search within the post AND globally
            // Facebook sometimes renders comment boxes outside the feed child
            const focused = await page.evaluate((feedIndex) => {
              const feed = document.querySelector('div[role="feed"]');
              if (!feed) return false;
              const child = feed.children[feedIndex];
              if (!child) return false;

              // Search within the post first
              let commentBox = child.querySelector('div[contenteditable="true"][role="textbox"]');

              // Fallback: search in the next sibling (FB sometimes puts comments below)
              if (!commentBox && child.nextElementSibling) {
                commentBox = child.nextElementSibling.querySelector('div[contenteditable="true"][role="textbox"]');
              }

              // Fallback: look for any recently visible textbox near the post
              if (!commentBox) {
                const allBoxes = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
                for (const box of allBoxes) {
                  const r = box.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0) {
                    // Check if placeholder suggests it's a comment box
                    const ph = box.getAttribute('aria-placeholder') || box.getAttribute('aria-label') || box.textContent || '';
                    if (/comment|comentar|escribe.*comentario|write.*comment/i.test(ph) || ph.length === 0) {
                      commentBox = box;
                      break;
                    }
                  }
                }
              }

              if (!commentBox) return false;
              commentBox.click();
              commentBox.focus();
              return true;
            }, post.feedIndex);

            if (!focused) {
              console.log(`[${tag}] Comment box not accessible for post by ${post.author}`);
              continue;
            }

            await delay(800, 1200);
            await page.keyboard.type(comment, { delay: 45 });
            await delay(1000, 1500);
            await page.keyboard.press('Enter');
            await delay(2000, 3000);

            commentsGiven++;
            await db.saveAction({ type: 'fb_comment', profileUrl: post.postUrl, content: comment, accountId });
            console.log(`[${tag}] Commented on ${post.author}: "${comment.slice(0, 50)}..."`);

            await commentPause();
          } catch (err) {
            console.error(`[${tag}] Comment error (${post.author}):`, err.message);
          }
        }

        await actionPause();

        const allDone = todayLikes + likesGiven >= limits.likes && todayComments + commentsGiven >= limits.comments;
        if (allDone) break;
      }

      // If we got some engagement, don't retry more search terms
      if (likesGiven > 0 || commentsGiven > 0) break;
    }

    console.log(`[${tag}] Session done — ${likesGiven} likes, ${commentsGiven} comments`);
  } catch (err) {
    console.error(`[${tag}] engageWithPosts error:`, err.message);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { engageWithPosts };
