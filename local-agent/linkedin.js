'use strict';

const { newPage, newPageForProfile, getBrowserForProfile } = require('./browser');
const db = require('./db');
const { generateComment } = require('./claude');
const { sendEmail } = require('./reports');
const fs = require('fs');
const path = require('path');
const { adjustedLimit, shouldSkipSession, readingPause, actionPause, commentPause, warmupScroll } = require('./humanize');

// Base limits (will be randomized each session)
const BASE_LIMITS = {
  follows: 3,
  comments: 3,
  dms: 1,
};

// Hashtags — high-follower-count tags on LinkedIn (3-5 per post is optimal in 2026)
const HASHTAGS = [
  // EN mega (1M+ followers on LinkedIn)
  'digitalmarketing', 'contentmarketing', 'socialmedia',
  'marketing', 'socialmediamarketing', 'personalbranding',
  'entrepreneurship', 'AI', 'technology', 'leadership',
  // EN high (100K-1M followers)
  'contentcreator', 'creatoreconomy', 'videomarketing',
  'youtube', 'onlinebusiness', 'storytelling', 'branding',
  // ES high (active on LinkedIn ES)
  'marketingdigital', 'emprendimiento', 'emprendedor',
  'redessociales', 'contenidodigital',
];

// Delay aleatorio humano (ms)
function delay(min = 1500, max = 4000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

let page = null;
let sessionAlertSent = false; // evitar spam de alertas

async function getPage(profileDir) {
  if (profileDir) {
    return await newPageForProfile(profileDir);
  }
  if (!page || page.isClosed()) {
    page = await newPage();
  }
  return page;
}

async function notifySessionExpired(reason) {
  if (sessionAlertSent) return;
  sessionAlertSent = true;
  console.error('[linkedin] Session expired — notifying owner');
  await sendEmail(
    'YCML LinkedIn: login fallido — acción requerida',
    `${reason}\n\nAgente YTubViral`
  ).catch(e => console.error('[linkedin] Failed to send alert:', e.message));
}

async function login({ profileDir, cookieFile, email: emailOverride, password: passwordOverride } = {}) {
  const p = await getPage(profileDir);

  // Try navigating to feed — if already logged in via persistent Chrome profile, skip login
  // This works for both brand account (chrome-profile/) and personas (chrome-profiles/persona-*)
  // as long as the user did a manual login once via login-persona.js
  await p.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  if (p.url().includes('/feed')) {
    sessionAlertSent = false;
    console.log('[linkedin] Session active (persistent profile)');
    return p;
  }

  // Persona accounts: rely on persistent Chrome profile only (no cookie seeding, no form login)
  // If the profile doesn't have a session, the user needs to run: node login-persona.js <persona-id> linkedin
  if (profileDir) {
    console.error(`[linkedin] Persona session invalid — run: node login-persona.js <persona-id> linkedin`);
    await p.close().catch(() => {});
    return null;
  }

  // Brand account: form login fallback
  console.log('[linkedin] No session, attempting login...');
  const email = emailOverride || process.env.LINKEDIN_EMAIL;
  const password = passwordOverride || process.env.LINKEDIN_PASSWORD;
  if (!email || !password) {
    await notifySessionExpired('LINKEDIN_EMAIL o LINKEDIN_PASSWORD no configurados en .env');
    if (profileDir) await p.close().catch(() => {});
    return null;
  }

  try {
    await p.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(1500, 2500);

    // LinkedIn may show "Welcome back" card instead of the standard form.
    const switched = await p.evaluate(() => {
      const links = [...document.querySelectorAll('a, button')];
      const link = links.find(el =>
        el.textContent?.includes('Sign in using another account') ||
        el.textContent?.includes('Iniciar sesión con otra cuenta')
      );
      if (link) { link.click(); return true; }
      return false;
    });
    if (switched) {
      console.log('[linkedin] Detected "Welcome back" screen — switched to standard login form');
      await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    // Wait for password field to confirm the login form is ready
    await p.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 }).catch(() => {});
    await delay(500, 1000);

    // Mark the visible email input with a data attribute
    await p.evaluate(() => {
      const selectors = ['#username', 'input[name="session_key"]', 'input[autocomplete="username"]', 'input[type="email"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.setAttribute('data-li-email', '1'); return; }
      }
      const inputs = document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])');
      for (const el of inputs) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { el.setAttribute('data-li-email', '1'); return; }
      }
    });

    const emailInput = await p.$('input[data-li-email]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await delay(200, 400);
      await p.keyboard.type(email, { delay: 30 });
      console.log('[linkedin] Email typed');
    } else {
      console.error('[linkedin] Email input not found — unexpected page state. URL:', p.url());
    }
    await delay(500, 800);

    // Password
    await p.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      for (const el of inputs) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { el.setAttribute('data-li-pass', '1'); return; }
      }
    });
    const passInput = await p.$('input[data-li-pass]');
    if (passInput) {
      await passInput.click();
      await delay(200, 400);
      await p.keyboard.type(password, { delay: 30 });
      console.log('[linkedin] Password typed');
    } else {
      console.error('[linkedin] Password input not found');
    }
    await delay(500, 800);

    // Click sign in
    await p.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const btn = buttons.find(b => {
        const t = b.textContent?.trim().toLowerCase();
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (t === 'sign in' || t === 'iniciar sesión' || b.type === 'submit');
      });
      if (btn) btn.setAttribute('data-li-submit', '1');
    });
    const signInBtn = await p.$('button[data-li-submit]');
    if (signInBtn) {
      await signInBtn.click();
      console.log('[linkedin] Sign in button clicked');
    } else {
      console.error('[linkedin] Sign in button not found');
    }
    await new Promise(r => setTimeout(r, 8000));

    const url = p.url();
    if (url.includes('/feed') || url.includes('/check/')) {
      sessionAlertSent = false;
      console.log('[linkedin] Login successful');
      return p;
    }

    // Check for security challenge
    if (url.includes('/checkpoint') || url.includes('/challenge')) {
      await notifySessionExpired('LinkedIn requiere verificación de seguridad (captcha/email). Entra manualmente a linkedin.com desde el PC para desbloquear.');
      console.error('[linkedin] Security challenge detected. URL:', url);
      if (profileDir) await p.close().catch(() => {});
      return null;
    }

    // Login failed — save screenshot
    try {
      const debugDir = path.join(__dirname, 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      const screenshotPath = path.join(debugDir, 'linkedin-login-failed.png');
      await p.screenshot({ path: screenshotPath, fullPage: false });
      console.error('[linkedin] Screenshot saved to debug/linkedin-login-failed.png');
    } catch (_) {}

    const pageError = await p.evaluate(() => {
      const selectors = [
        '#error-for-username', '#error-for-password', '.alert-content',
        '[data-test-id="alert-message"]', '.form__error--is-active',
        '#session_key-login-error', '#session_password-login-error',
        'p.form__label--is-error',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      const allErrors = document.querySelectorAll('[class*="error"], [class*="alert"]');
      for (const el of allErrors) {
        const t = el.textContent?.trim();
        if (t && t.length < 200) return t;
      }
      return null;
    }).catch(() => null);

    if (pageError) console.error('[linkedin] Page error message:', pageError);

    await notifySessionExpired(`Login fallido. URL: ${url}${pageError ? `\nError en página: ${pageError}` : ''}`);
    console.error('[linkedin] Login failed. URL:', url);
    if (profileDir) await p.close().catch(() => {});
    return null;
  } catch (err) {
    console.error('[linkedin] Login error:', err.message);
    if (profileDir) await p.close().catch(() => {});
    return null;
  }
}

// Verificación proactiva al arrancar el agente
async function checkSessionOnStartup() {
  const p = await login();
  if (p) console.log('[linkedin] Startup check OK');
}

// opts: { accountId, profileDir, email, password, limits }
async function discoverProspects(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || BASE_LIMITS;
  const tag = accountId ? `linkedin:${accountId}` : 'linkedin';

  try {
    const p = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile, email: opts.email, password: opts.password });
    if (!p) return;

    try {
      const hashtag = HASHTAGS[Math.floor(Math.random() * HASHTAGS.length)];
      console.log(`[${tag}] Searching hashtag #${hashtag}`);

      await p.goto(`https://www.linkedin.com/search/results/content/?keywords=%23${hashtag}&datePosted=past-24h&sortBy=date_posted`, {
        waitUntil: 'domcontentloaded', timeout: 60000,
      });
      await delay(2000, 4000);

      await new Promise(r => setTimeout(r, 5000));
      const prospects = await p.evaluate(() => {
        const seen = new Set();
        const results = [];
        const links = document.querySelectorAll('a[href*="/in/"]');
        for (const a of links) {
          const url = a.href.split('?')[0];
          if (!url.match(/linkedin\.com\/in\/[^/]+\/?$/) || seen.has(url)) continue;
          seen.add(url);
          const ariaLabel = a.getAttribute('aria-label') || '';
          const spanText = a.closest('[class]')?.querySelector('span[aria-hidden="true"]')?.innerText?.trim() || '';
          const slugName = url.split('/in/')[1].replace(/\/$/, '').replace(/-\w{5,10}$/, '').replace(/-/g, ' ');
          const name = (spanText || ariaLabel || slugName).slice(0, 60);
          results.push({ name, headline: '', profileUrl: url });
        }
        return results.slice(0, 10);
      });

      console.log(`[${tag}] Found ${prospects.length} prospects from #${hashtag}`);
      for (const prospect of prospects) {
        await db.saveProspect({ ...prospect, followers: null, accountId });
      }
    } finally {
      if (opts.profileDir) await p.close().catch(() => {});
    }
  } catch (err) {
    console.error(`[${tag}] discoverProspects error:`, err.message);
  }
}

// opts: { accountId, profileDir, email, password, limits }
async function followProspects(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || { follows: adjustedLimit(BASE_LIMITS.follows), comments: adjustedLimit(BASE_LIMITS.comments), dms: BASE_LIMITS.dms };
  const tag = accountId ? `linkedin:${accountId}` : 'linkedin';

  // Skip ~15% of sessions
  if (!accountId && shouldSkipSession()) {
    console.log(`[${tag}] Skipping follow session (random rest)`);
    return;
  }

  const todayFollows = await db.countTodayActions('follow', accountId);
  if (todayFollows >= limits.follows) {
    console.log(`[${tag}] Follow limit reached for today (${limits.follows})`);
    return;
  }
  console.log(`[${tag}] Follow session limit: ${limits.follows}`);

  const prospects = await db.getProspectsByStatus('discovered', accountId);
  const toFollow = prospects.slice(0, limits.follows - todayFollows);
  if (toFollow.length === 0) return;

  const p = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile, email: opts.email, password: opts.password });
  if (!p) return;

  try {
    // Warmup: browse LinkedIn feed before following
    await warmupScroll(p, tag);

    for (const prospect of toFollow) {
      try {
        await p.goto(prospect.profile_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Simulate reading the profile
        await readingPause();

        const followBtn = await p.$('button[aria-label*="Follow"], button[aria-label*="Seguir"]');
        if (followBtn) {
          await followBtn.click();
          await delay(1000, 2000);
          await db.saveAction({ type: 'follow', profileUrl: prospect.profile_url, accountId });
          await db.updateProspectStatus(prospect.profile_url, 'followed');
          console.log(`[${tag}] Followed: ${prospect.name}`);
        } else {
          await db.updateProspectStatus(prospect.profile_url, 'followed');
        }

        await actionPause();
      } catch (err) {
        console.error(`[${tag}] Follow error for ${prospect.profile_url}:`, err.message);
      }
    }
  } finally {
    if (opts.profileDir) await p.close().catch(() => {});
  }
}

// opts: { accountId, profileDir, email, password, commentGenerator, limits }
async function commentOnProspects(opts = {}) {
  const accountId = opts.accountId || null;
  const limits = opts.limits || { follows: adjustedLimit(BASE_LIMITS.follows), comments: adjustedLimit(BASE_LIMITS.comments), dms: BASE_LIMITS.dms };
  const commentGen = opts.commentGenerator || generateComment;
  const tag = accountId ? `linkedin:${accountId}` : 'linkedin';

  const todayComments = await db.countTodayActions('comment', accountId);
  if (todayComments >= limits.comments) {
    console.log(`[${tag}] Comment limit reached for today`);
    return;
  }

  const prospects = await db.query(`
    SELECT * FROM linkedin_prospects
    WHERE status = 'followed'
    AND updated_at < NOW() - INTERVAL '1 day'
    AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
    ORDER BY updated_at ASC
    LIMIT $1
  `, [limits.comments - todayComments, accountId]);

  if (prospects.length === 0) return;

  const p = await login({ profileDir: opts.profileDir, cookieFile: opts.cookieFile, email: opts.email, password: opts.password });
  if (!p) return;

  try {
    for (const prospect of prospects) {
      try {
        await p.goto(prospect.profile_url + 'recent-activity/all/', {
          waitUntil: 'domcontentloaded', timeout: 60000,
        });
        await delay(2000, 4000);

        // Expand "ver más" / "see more"
        await p.evaluate(() => {
          const btns = document.querySelectorAll('button.see-more, button[aria-label*="more"], span.lt-line-clamp__more, button[aria-label*="más"]');
          for (const btn of btns) { btn.click(); }
        });
        await delay(500, 800);

        const postContent = await p.evaluate(() => {
          const selectors = [
            '.feed-shared-update-v2__description',
            '.update-components-text',
            'div[data-ad-preview="message"]',
            'span[dir="ltr"]',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            const text = el?.textContent?.trim();
            if (text && text.length > 30) return text.slice(0, 400);
          }
          const allSpans = document.querySelectorAll('main span, main div[dir="ltr"]');
          let best = '';
          for (const el of allSpans) {
            const t = el.textContent?.trim() ?? '';
            if (t.length > best.length && t.length > 30) best = t;
          }
          return best.slice(0, 400);
        });

        if (!postContent) {
          console.log(`[${tag}] No posts found for ${prospect.name}`);
          continue;
        }

        const comment = await commentGen(prospect.name, postContent);
        if (!comment) {
          console.log(`[${tag}] Claude rejected comment for ${prospect.name}`);
          continue;
        }

        // Find and click comment button
        const commentBtn = await p.evaluateHandle(() => {
          const selectors = [
            'button[aria-label*="Comment"]', 'button[aria-label*="comment"]',
            'button[aria-label*="Comentar"]', 'button[aria-label*="comentar"]',
          ];
          for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn) return btn;
          }
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase();
            if (text === 'comment' || text === 'comentar') return btn;
          }
          return null;
        });

        if (!commentBtn || !commentBtn.asElement()) {
          console.log(`[${tag}] Comment button not found for ${prospect.name}`);
          continue;
        }

        await commentBtn.asElement().click();
        await delay(1500, 2500);

        // Try multiple selectors for the comment box — LinkedIn changes DOM frequently
        let commentBox = await p.$('.ql-editor[contenteditable="true"]');
        if (!commentBox) commentBox = await p.$('div[role="textbox"][contenteditable="true"]');
        if (!commentBox) commentBox = await p.$('.comments-comment-texteditor .ql-editor');
        if (!commentBox) commentBox = await p.$('div[data-placeholder][contenteditable="true"]');
        if (!commentBox) commentBox = await p.$('.editor-content[contenteditable="true"]');
        // Fallback: any contenteditable in the comments section
        if (!commentBox) {
          commentBox = await p.evaluateHandle(() => {
            const editors = document.querySelectorAll('[contenteditable="true"]');
            for (const ed of editors) {
              const r = ed.getBoundingClientRect();
              if (r.width > 100 && r.height > 20 && r.top > 200) return ed;
            }
            return null;
          });
          if (commentBox && !(await commentBox.asElement())) commentBox = null;
        }
        if (!commentBox) {
          console.log(`[${tag}] Comment box not found for ${prospect.name}`);
          continue;
        }

        await commentBox.click();
        await delay(500, 1000);
        await p.keyboard.type(comment, { delay: 60 });
        await delay(1000, 2000);

        // Submit
        const submitBtn = await p.$('button[class*="comments-comment-box__submit-button"], button.comments-comment-box__submit-button--cr, button[data-control-name="comment_submit"]');
        if (!submitBtn) {
          const fallbackSubmit = await p.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              const t = btn.textContent?.trim();
              if (t === 'Post' || t === 'Publicar' || t === 'Comentar' || t === 'Comment') {
                const r = btn.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) return btn;
              }
            }
            return null;
          });
          if (fallbackSubmit && fallbackSubmit.asElement()) {
            await fallbackSubmit.asElement().click();
            await delay(2000, 3000);
            await db.saveAction({ type: 'comment', profileUrl: prospect.profile_url, content: comment, accountId });
            await db.updateProspectStatus(prospect.profile_url, 'commented', comment);
            console.log(`[${tag}] Commented on ${prospect.name}'s post`);
          } else {
            console.log(`[${tag}] Submit button not found for ${prospect.name}`);
          }
        } else {
          await submitBtn.click();
          await delay(2000, 3000);
          await db.saveAction({ type: 'comment', profileUrl: prospect.profile_url, content: comment, accountId });
          await db.updateProspectStatus(prospect.profile_url, 'commented', comment);
          console.log(`[${tag}] Commented on ${prospect.name}'s post`);
        }

        await delay(5000, 10000);
      } catch (err) {
        console.error(`[${tag}] Comment error for ${prospect.profile_url}:`, err.message);
      }
    }
  } finally {
    if (opts.profileDir) await p.close().catch(() => {});
  }
}

module.exports = { discoverProspects, followProspects, commentOnProspects, checkSessionOnStartup };
