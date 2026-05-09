'use strict';

const { newPage, ensureSession } = require('./browser');
const db = require('./db');
const { generateInstagramComment } = require('./claude');
const { sendEmail } = require('./reports');
const { adjustedLimit, shouldSkipSession, shouldSkipPost, readingPause, actionPause, commentPause, warmupScroll } = require('./humanize');

const BASE_LIMITS = { likes: 10, follows: 5, comments: 3 };

// Mega-volume hashtags — IG hashtag pages show "Top" posts which can be old.
// We use only hashtags with millions of posts so the recent tab refreshes often.
// Max 30 days filter (IG top posts are often weeks old, 7d was too strict).
const HASHTAGS = [
  // Mega EN (100M+ posts each — top posts refresh daily)
  'youtube', 'youtuber', 'contentcreator', 'socialmedia',
  'digitalmarketing', 'reels', 'viral', 'vlog',
  // High EN (10M-100M posts)
  'contentcreators', 'podcast', 'vlogger', 'editing',
  'entrepreneur', 'onlinebusiness', 'motivation',
  // High ES (1M-50M posts)
  'emprendedor', 'marketingdigital', 'emprendimiento',
  'redessociales', 'creadordecontenido',
];

function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

let sessionAlertSent = false;

async function login() {
  const p = await newPage();

  await ensureSession(p, {
    domain: 'www.instagram.com',
    sessionCookieName: 'sessionid',
    cookieFile: 'instagram-cookies.json',
  });

  await p.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss cookie/notification dialogs if present
  const dismissBtns = await p.$$('button');
  for (const btn of dismissBtns) {
    const text = await btn.evaluate(el => el.textContent?.trim());
    if (text === 'Not Now' || text === 'Ahora no' || text === 'Decline optional cookies' || text === 'Rechazar cookies opcionales') {
      await btn.click().catch(() => {});
      await delay(500, 1000);
    }
  }

  const url = p.url();
  if (!url.includes('/accounts/login')) {
    sessionAlertSent = false;
    console.log('[instagram] Session active');
    return p;
  }

  if (!sessionAlertSent) {
    sessionAlertSent = true;
    await sendEmail(
      'YCML Instagram: sesion expirada',
      'La sesion de Instagram ha expirado.\n\nPasos:\n1. Abre Edge y entra a instagram.com\n2. Abre Cookie Editor > Export as JSON\n3. Reemplaza instagram-cookies.json\n4. pm2 restart ytubviral-agent\n\nAgente YTubViral'
    ).catch(e => console.error('[instagram] Failed to send alert:', e.message));
  }

  console.error('[instagram] Session invalid. URL:', url);
  await p.close();
  return null;
}

// Collect post links from Instagram Explore feed (no hashtag needed)
async function collectExplorePosts(page) {
  await page.goto('https://www.instagram.com/explore/', {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await delay(3000, 5000);

  try {
    await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 10000 });
  } catch {
    console.warn('[instagram] No posts in Explore feed');
    return [];
  }

  // Scroll to load more
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await delay(1500, 2500);
  }

  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    const seen = new Set();
    const results = [];
    for (const a of anchors) {
      const href = a.href.split('?')[0];
      if (!seen.has(href)) {
        seen.add(href);
        results.push(href);
      }
    }
    return results.slice(0, 15);
  });

  console.log(`[instagram] Explore feed: ${links.length} posts`);
  return links;
}

// Collect post links from a hashtag explore page
async function collectPostLinks(page, hashtag) {
  const fs = require('fs');
  const path = require('path');

  await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await delay(3000, 5000);

  // Wait for post links to render (React hydration)
  try {
    await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 10000 });
  } catch {
    console.warn('[instagram] No post/reel links appeared after waiting');
  }

  // Scroll to load more posts
  await page.evaluate(() => window.scrollBy(0, 600));
  await delay(1500, 2500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await delay(1500, 2500);

  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    const seen = new Set();
    const results = [];
    for (const a of anchors) {
      const href = a.href.split('?')[0];
      if (!seen.has(href)) {
        seen.add(href);
        results.push(href);
      }
    }
    return results.slice(0, 12);
  });

  // Debug: save screenshot when no posts found
  if (links.length === 0) {
    const debugDir = path.join(__dirname, 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const screenshotPath = path.join(debugDir, `ig-hashtag-${hashtag}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const pageUrl = page.url();
    console.warn(`[instagram] 0 posts found. URL: ${pageUrl} — screenshot saved to ${screenshotPath}`);
  }

  return links;
}

async function engageWithPosts() {
  // Skip ~15% of sessions (humans aren't always active)
  if (shouldSkipSession()) {
    console.log('[instagram] Skipping session (random rest)');
    return;
  }

  const limits = {
    likes: adjustedLimit(BASE_LIMITS.likes),
    follows: adjustedLimit(BASE_LIMITS.follows),
    comments: adjustedLimit(BASE_LIMITS.comments),
  };
  const todayLikes = await db.countTodayActions('ig_like');
  const todayFollows = await db.countTodayActions('ig_follow');
  const todayComments = await db.countTodayActions('ig_comment');

  if (todayLikes >= limits.likes && todayFollows >= limits.follows && todayComments >= limits.comments) {
    console.log('[instagram] Daily limits reached');
    return;
  }
  console.log(`[instagram] Session limits: ${limits.likes} likes, ${limits.follows} follows, ${limits.comments} comments`);

  const page = await login();
  if (!page) return;

  try {
    // Warmup: scroll Instagram feed before engaging
    await warmupScroll(page, 'instagram');

    let likesGiven = 0;
    let followsGiven = 0;
    let commentsGiven = 0;

    // Try up to 4 hashtags until we get at least 1 actionable (fresh) post
    const tried = new Set();
    let engagedAny = false;

    for (let attempt = 0; attempt < 4 && !engagedAny; attempt++) {
      let pick;
      do { pick = HASHTAGS[Math.floor(Math.random() * HASHTAGS.length)]; } while (tried.has(pick) && tried.size < HASHTAGS.length);
      tried.add(pick);
      const hashtag = pick;
      console.log(`[instagram] Exploring #${hashtag} (attempt ${attempt + 1})`);
      const postLinks = await collectPostLinks(page, hashtag);
      console.log(`[instagram] Found ${postLinks.length} posts for #${hashtag}`);
      if (postLinks.length === 0) {
        console.log(`[instagram] No posts — trying another hashtag`);
        continue;
      }

    let freshPosts = 0;

    for (const postUrl of postLinks) {
      const alreadyActed = await db.hasInstagramAction(postUrl);
      if (alreadyActed) continue;

      try {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000, 3000);

        // Skip posts older than 48 hours
        const postAge = await page.evaluate(() => {
          // Method 1: time element with datetime attribute
          const timeEl = document.querySelector('time[datetime]');
          if (timeEl) {
            const dt = timeEl.getAttribute('datetime');
            if (dt) return Date.now() - new Date(dt).getTime();
          }
          // Method 2: look for relative time text ("2h", "3d", "1w")
          const timeTexts = document.querySelectorAll('time');
          for (const t of timeTexts) {
            const text = t.textContent?.trim();
            if (!text) continue;
            const m = text.match(/^(\d+)\s*(m|h|d|w|min|hora|día|sem)/i);
            if (m) {
              const val = parseInt(m[1]);
              const unit = m[2].toLowerCase();
              if (unit.startsWith('m')) return val * 60 * 1000;
              if (unit.startsWith('h')) return val * 3600 * 1000;
              if (unit.startsWith('d') || unit === 'día') return val * 86400 * 1000;
              if (unit.startsWith('w') || unit.startsWith('sem')) return val * 7 * 86400 * 1000;
            }
          }
          return null;
        });
        if (postAge === null) {
          // If we can't determine age, engage anyway (better than skipping everything)
          console.log(`[instagram] No timestamp for ${postUrl} — engaging anyway`);
        } else {
          // IG "Top" tab shows posts from months/years ago. Only skip if truly ancient (>90d).
          // These are popular posts that IG surfaces as relevant — engaging is natural.
          const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
          if (postAge > maxAgeMs) {
            continue; // silently skip very old posts
          }
        }

        // Randomly skip some posts (humans don't engage with everything)
        if (shouldSkipPost()) continue;

        freshPosts++;
        engagedAny = true;

        // Simulate reading the post before engaging
        await readingPause();

        // Expand "more" / "más" to get full caption
        await page.evaluate(() => {
          const moreButtons = document.querySelectorAll('button, span[role="button"], div[role="button"]');
          for (const btn of moreButtons) {
            const t = btn.textContent?.trim().toLowerCase();
            if (t === 'more' || t === 'más' || t === '… more' || t === '… más') {
              btn.click();
              break;
            }
          }
        });
        await delay(500, 800);

        // Get post text and author
        const postData = await page.evaluate(() => {
          // Author: find the first non-nav profile link on the page
          const navNames = ['explore', 'reels', 'p', 'accounts', 'direct', 'stories'];
          const allLinks = document.querySelectorAll('a[href*="/"]');
          let author = '';
          let authorUrl = '';
          const seenUsernames = new Set();
          for (const a of allLinks) {
            const match = a.href.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?$/);
            if (!match) continue;
            const username = match[1];
            if (navNames.includes(username) || seenUsernames.has(username)) continue;
            seenUsernames.add(username);
            const text = a.textContent?.trim();
            // Skip our own profile link (first link is usually the logged-in user in nav)
            // The post author is the first non-self profile link with visible text
            if (text && text.length > 0 && text.length < 60 && text !== 'Profile'
                && !text.match(/^(Home|Reels|Search|Explore|Messages|Notifications|Create|More|Inicio|Buscar|Explorar|Mensajes|Notificaciones|Crear|Más)$/i)) {
              author = text;
              authorUrl = a.href.split('?')[0];
              break;
            }
          }

          // Post caption — look for the actual caption content, NOT the page <h1>
          let caption = '';

          // Method 1: caption container near the author name (usually a span inside the article)
          const article = document.querySelector('article');
          if (article) {
            // The caption is typically in a span inside a div that also contains the author link
            const spans = article.querySelectorAll('span');
            for (const span of spans) {
              const t = span.textContent?.trim();
              // Skip short text, author name, buttons, and generic page text
              if (t && t.length > 20 && t !== author && !t.match(/^(Like|Comment|Share|Instagram|Me gusta|Comentar|Compartir)$/i)) {
                caption = t;
                break;
              }
            }
          }

          // Method 2: meta description as fallback
          if (!caption) {
            const meta = document.querySelector('meta[name="description"]');
            caption = meta?.content?.trim() ?? '';
          }

          caption = caption.slice(0, 400);

          // Check if already liked
          const unlikeBtn = document.querySelector('svg[aria-label="Unlike"], svg[aria-label="Ya no me gusta"]');
          const alreadyLiked = !!unlikeBtn;

          return { author, authorUrl, caption, alreadyLiked };
        });

        // Like
        if (!postData.alreadyLiked && todayLikes + likesGiven < limits.likes) {
          const liked = await page.evaluate(() => {
            // Find the post's like button (inside <section>, not the nav)
            const sections = document.querySelectorAll('section');
            for (const section of sections) {
              const likeSvg = section.querySelector('svg[aria-label="Like"], svg[aria-label="Me gusta"]');
              if (likeSvg) {
                const btn = likeSvg.closest('[role="button"]') || likeSvg.closest('button') || likeSvg.closest('span');
                if (btn) { btn.click(); return true; }
              }
            }
            return false;
          });
          if (liked) {
            likesGiven++;
            await db.saveAction({ type: 'ig_like', profileUrl: postUrl });
            console.log(`[instagram] Liked post by ${postData.author}`);
            await delay(1500, 3000);
          }
        }

        // Comment (30% chance, if under limit, only if caption has real content)
        if (postData.caption && postData.caption.length > 30 && todayComments + commentsGiven < limits.comments && Math.random() < 0.3) {
          try {
            const comment = await generateInstagramComment(postData.author, postData.caption);
            if (comment) {
              // Click on the comment icon to open/focus the comment input
              const commentIconClicked = await page.evaluate(() => {
                // Instagram comment icon: svg inside a button or span near the like/share row
                const svgs = document.querySelectorAll('svg[aria-label="Comment"], svg[aria-label="Comentar"], svg[aria-label="Comentario"]');
                for (const svg of svgs) {
                  const btn = svg.closest('[role="button"]') || svg.closest('button') || svg.parentElement;
                  if (btn) { btn.click(); return true; }
                }
                // Fallback: click on any visible comment input area
                const inputs = document.querySelectorAll('textarea, form textarea, div[contenteditable="true"][role="textbox"]');
                for (const el of inputs) {
                  const r = el.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0) { el.click(); el.focus(); return true; }
                }
                return false;
              });

              if (!commentIconClicked) {
                console.log(`[instagram] Comment icon/input not found for ${postData.author}`);
              } else {
                await delay(800, 1200);

                // Find the active comment input (textarea or contenteditable)
                const inputHandle = await page.evaluateHandle(() => {
                  // Try textarea first (Instagram sometimes uses this)
                  const textareas = document.querySelectorAll('textarea');
                  for (const ta of textareas) {
                    const r = ta.getBoundingClientRect();
                    const label = (ta.getAttribute('aria-label') || ta.getAttribute('placeholder') || '').toLowerCase();
                    if (r.width > 0 && r.height > 0 && (label.includes('comment') || label.includes('comentario') || label.includes('añade') || label.includes('add'))) {
                      return ta;
                    }
                  }
                  // Try contenteditable div (newer Instagram)
                  const editables = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
                  for (const el of editables) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) return el;
                  }
                  // Last resort: any focused textarea
                  if (document.activeElement?.tagName === 'TEXTAREA') return document.activeElement;
                  return null;
                });

                const inputEl = inputHandle?.asElement();
                if (!inputEl) {
                  console.log(`[instagram] Comment input not found after clicking icon for ${postData.author}`);
                } else {
                  await inputEl.click();
                  await delay(300, 500);
                  await page.keyboard.type(comment, { delay: 40 });
                  await delay(1000, 1500);

                  // Submit: find the Post/Publicar button that appears after typing
                  const submitted = await page.evaluate(() => {
                    // Look for submit buttons with text "Post" or "Publicar"
                    const candidates = document.querySelectorAll('div[role="button"], button, span[role="button"]');
                    for (const el of candidates) {
                      const t = el.textContent?.trim();
                      if ((t === 'Post' || t === 'Publicar') && !el.getAttribute('aria-disabled')) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) { el.click(); return true; }
                      }
                    }
                    return false;
                  });

                  if (submitted) {
                    await delay(2000, 3000);
                    commentsGiven++;
                    await db.saveAction({ type: 'ig_comment', profileUrl: postUrl, content: comment });
                    console.log(`[instagram] Commented on ${postData.author}: "${comment.slice(0, 50)}..."`);
                  } else {
                    // Fallback: try Enter key (some IG layouts submit on Enter)
                    await page.keyboard.press('Enter');
                    await delay(2000, 3000);
                    // Check if comment was posted by looking for it in the comments section
                    const posted = await page.evaluate((txt) => {
                      const spans = document.querySelectorAll('span');
                      for (const s of spans) {
                        if (s.textContent?.includes(txt.slice(0, 30))) return true;
                      }
                      return false;
                    }, comment);
                    if (posted) {
                      commentsGiven++;
                      await db.saveAction({ type: 'ig_comment', profileUrl: postUrl, content: comment });
                      console.log(`[instagram] Commented (Enter) on ${postData.author}: "${comment.slice(0, 50)}..."`);
                    } else {
                      console.log(`[instagram] Submit button not found for ${postData.author} — comment may not have posted`);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('[instagram] Comment error:', err.message);
          }
        }

        // Follow (20% chance, if under limit) — skip official/brand accounts
        const skipAccounts = ['instagram', 'facebook', 'meta', 'threads'];
        const authorLower = postData.author.toLowerCase();
        const isSkipAccount = skipAccounts.some(s => authorLower === s) || postData.authorUrl.endsWith('instagram.com/');
        if (postData.authorUrl && !isSkipAccount && todayFollows + followsGiven < limits.follows && Math.random() < 0.2) {
          try {
            // Navigate to author profile
            await page.goto(postData.authorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(2000, 3000);

            const followed = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              const followBtn = buttons.find(b => {
                const text = b.textContent?.trim();
                return text === 'Follow' || text === 'Seguir';
              });
              if (followBtn) { followBtn.click(); return true; }
              return false;
            });

            if (followed) {
              followsGiven++;
              await db.saveAction({ type: 'ig_follow', profileUrl: postData.authorUrl });
              console.log(`[instagram] Followed ${postData.author}`);
              await delay(2000, 4000);
            }
          } catch (err) {
            console.error('[instagram] Follow error:', err.message);
          }
        }

        await delay(4000, 8000);
      } catch (err) {
        console.error(`[instagram] Post error (${postUrl}):`, err.message);
      }

      const allDone = todayLikes + likesGiven >= limits.likes
        && todayFollows + followsGiven >= limits.follows
        && todayComments + commentsGiven >= limits.comments;
      if (allDone) break;
    }

    if (freshPosts === 0) {
      console.log(`[instagram] All posts for #${hashtag} were >30d old — trying another hashtag`);
    }

    } // end hashtag retry loop

    // Fallback: if hashtags yielded nothing, try Explore feed
    if (!engagedAny) {
      console.log('[instagram] All hashtags failed — trying Explore feed');
      const exploreLinks = await collectExplorePosts(page);

      for (const postUrl of exploreLinks) {
        const alreadyActed = await db.hasInstagramAction(postUrl);
        if (alreadyActed) continue;

        try {
          await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await delay(2000, 3000);

          const postAge = await page.evaluate(() => {
            const timeEl = document.querySelector('time[datetime]');
            if (!timeEl) return null;
            const dt = timeEl.getAttribute('datetime');
            if (!dt) return null;
            return Date.now() - new Date(dt).getTime();
          });
          if (postAge === null || postAge > 48 * 60 * 60 * 1000) continue;

          // Like only (keep Explore engagement light)
          if (todayLikes + likesGiven < limits.likes) {
            const liked = await page.evaluate(() => {
              const sections = document.querySelectorAll('section');
              for (const section of sections) {
                const likeSvg = section.querySelector('svg[aria-label="Like"], svg[aria-label="Me gusta"]');
                if (likeSvg) {
                  const btn = likeSvg.closest('[role="button"]') || likeSvg.closest('button') || likeSvg.closest('span');
                  if (btn) { btn.click(); return true; }
                }
              }
              return false;
            });
            if (liked) {
              likesGiven++;
              await db.saveAction({ type: 'ig_like', profileUrl: postUrl });
              console.log(`[instagram] Liked Explore post: ${postUrl}`);
              await delay(2000, 4000);
            }
          }

          if (todayLikes + likesGiven >= limits.likes) break;
        } catch (err) {
          console.error(`[instagram] Explore post error: ${err.message}`);
        }
      }
    }

    console.log(`[instagram] Session done — ${likesGiven} likes, ${followsGiven} follows, ${commentsGiven} comments`);
  } catch (err) {
    console.error('[instagram] engageWithPosts error:', err.message);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { engageWithPosts };
