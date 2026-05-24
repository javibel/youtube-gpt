'use strict';
require('dotenv').config();
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto, safeEval } = require('./resilience');
const PROFILE = 'chrome-profiles/brand-reddit';

const POSTS = [
  {
    sub: 'EntrepreneurRideAlong',
    title: 'From programming car factory robots to launching a SaaS — my first 4 months as a solo founder',
    body: `I'm a PLC/SCADA engineer in Spain. I program industrial robots in car factories. This year I decided to build my own thing.

First attempt: a mobile game. Downloaded 12 times, 11 of those were me testing on different devices.

Second attempt: a fintech app. Hit regulatory walls before I wrote a single line of code.

Third attempt: YTubViral. A platform with 14 AI tools for YouTube creators — SEO analyzer, title generator, keyword research, competitor tracking, content calendar, A/B testing, and more.

Why YouTube tools? I spent weeks in creator communities and noticed the same complaints everywhere: "I make great videos but nobody watches them." Turns out most small creators have zero SEO strategy. And the existing tools (VidIQ, TubeBuddy) charge $49+/mo.

Where I am now (being honest):
- Product: live, 14 tools working
- Users: early stage, still in single digits
- Revenue: EUR 0
- Monthly costs: about EUR 30 (Neon DB + Vercel + OpenAI API)
- Marketing: the part I'm worst at

What I've learned:
1. Building is the easy part. Getting someone to care is the hard part.
2. Pricing at EUR 9.99/mo felt low until I realized I had 0 users paying $0. Low price > no users.
3. Every feature you add is a feature you maintain forever.

Currently offering 3 months free Pro to anyone who wants to test it and give honest feedback: https://ytubviral.com

What marketing channels worked for your first 100 users? That's the wall I'm hitting right now.`
  },
  // shamelessplug: BANNED — skipped
  {
    sub: 'SaaS',
    title: 'YTubViral — 14 AI tools for YouTube creators (free tier + Pro at EUR 9.99/mo)',
    body: `Built as a solo developer from Spain. My background is industrial automation (PLCs, not SaaS), so this has been a learning experience.

What it does: SEO scoring, title/description generator, keyword research, competitor analysis, A/B testing, content calendar, retention analyzer, revenue estimator, AI coach, and more. All in one platform.

Stack: Next.js, Prisma, PostgreSQL (Neon), Vercel, Claude API, Stripe.

Differentiator vs VidIQ/TubeBuddy: free tier with all 14 tools (usage-limited), Pro at EUR 9.99 vs their $49+, and the AI generators actually produce usable content instead of just keyword lists.

Current state: live product, early users, pre-Product Hunt launch. Offering 3 months free Pro to beta testers.

Link: https://ytubviral.com

Would appreciate feedback on the product, pricing, or positioning. First SaaS — thick skin ready.`
  },
  {
    sub: 'SmallYTChannel',
    title: 'I built a free YouTube SEO toolkit — would love feedback from small creators',
    body: `Hey everyone. I'm a developer (not a YouTuber) who spent the last few months building tools specifically for small creators. It's called YTubViral and it has 14 tools: SEO score checker, title generator, keyword research, competitor analysis, content calendar, and more.

I built it because the existing tools (VidIQ, TubeBuddy) charge $49+/mo and most of you are trying to reach your first 1,000 subs — that price doesn't make sense at that stage.

YTubViral has a free tier with all 14 tools (daily limits) and I'm offering 3 months free Pro to anyone who wants to test it properly and give me honest feedback.

https://ytubviral.com

What I'd really like to know: which of these tools would actually make a difference in your workflow? I want to double down on the ones that matter and drop the ones that don't.`
  },
  {
    sub: 'webdev',
    title: 'I built a SaaS with 14 AI tools as a solo dev — here\'s my stack and what I\'d change',
    body: `Background: I'm a PLC/SCADA programmer (industrial automation). JavaScript wasn't even my main language a year ago. Built YTubViral — a platform with 14 AI-powered tools for YouTube creators.

The stack:
- Next.js 16 (App Router, server components everywhere, client only where needed)
- Prisma ORM + PostgreSQL on Neon (serverless driver)
- Vercel for hosting (Edge functions for some API routes)
- Claude API for AI generations (switched from OpenAI mid-project — better output quality for structured content)
- Stripe for billing (webhook-based subscription management)
- NextAuth for authentication
- Puppeteer + PM2 on a local Windows machine for social media automation agents

Decisions I'm happy with:
- Server components by default. My pages load fast because almost nothing ships JS to the client.
- Rate limiting via DB upsert instead of Redis. On Vercel serverless there's no shared memory, and adding Redis felt like overkill for my scale.
- Neon's serverless driver. Cold starts are real but acceptable. Connection pooling just works.
- Bilingual from day 1 (ES + EN). Internationalization is painful to add later.

Decisions I'd reconsider:
- 14 features = 14 API routes = 14 things to maintain. I should have launched with 4.
- Prisma generates huge query engines. Bundle size is a thing.
- Using local Puppeteer agents for social media. Works but it's fragile — Chrome profiles corrupt, sessions expire, lock files pile up.

If anyone's interested in the product side: https://ytubviral.com — it's free to try.

Curious what stack others are using for AI-heavy SaaS projects. Anyone gone the self-hosted LLM route instead of API calls?`
  },
];

async function postToReddit(page, sub, title, body) {
  const url = `https://old.reddit.com/r/${sub}/submit?selftext=true`;
  const ok = await safeGoto(page, url, { timeout: 60000 });
  if (!ok) throw new Error(`Failed to load submit page for r/${sub}`);
  await new Promise(r => setTimeout(r, 3000));

  const loggedIn = await safeEval(page, () => {
    const u = document.querySelector('.user a');
    return !!u && !u.textContent?.includes('login');
  });
  if (!loggedIn) throw new Error('Not logged in');

  // Check restrictions
  const restricted = await safeEval(page, () => {
    const b = document.body.innerText || '';
    if (b.includes('restricted') || b.includes("you aren't allowed")) return true;
    return false;
  });
  if (restricted) throw new Error(`r/${sub} is restricted`);

  // Title
  const titleInput = await page.$('textarea[name="title"], input[name="title"]');
  if (!titleInput) throw new Error('Title input not found');
  await titleInput.click();
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.type(title, { delay: 20 });
  await new Promise(r => setTimeout(r, 500));

  // Body — set value directly for speed
  const bodyInput = await page.$('textarea[name="text"], div.usertext-edit textarea');
  if (!bodyInput) throw new Error('Body textarea not found');
  await bodyInput.click();
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate((t) => {
    const ta = document.querySelector('textarea[name="text"], div.usertext-edit textarea');
    if (ta) { ta.value = t; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }, body);
  await new Promise(r => setTimeout(r, 1000));

  // Submit
  const submitted = await safeEval(page, () => {
    const selectors = ['#newlink button.btn[type="submit"]', 'button[type="submit"]'];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) { btn.click(); return true; }
    }
    return false;
  });
  if (!submitted) throw new Error('Submit button not found');
  await new Promise(r => setTimeout(r, 6000));

  const currentUrl = page.url();
  if (currentUrl.includes('/submit')) {
    const err = await safeEval(page, () => {
      const e = document.querySelector('.error, .status-msg');
      return e?.textContent?.trim() || null;
    });
    throw new Error(`Still on submit: ${err || 'unknown'}`);
  }
  return currentUrl;
}

(async () => {
  const page = await newPageForProfile(PROFILE, { headless: true });

  for (let i = 0; i < POSTS.length; i++) {
    const post = POSTS[i];
    console.log(`[${i + 1}/${POSTS.length}] Posting to r/${post.sub}...`);
    try {
      const url = await postToReddit(page, post.sub, post.title, post.body);
      console.log(`  SUCCESS: ${url}`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
    // Wait 45-75s between posts
    if (i < POSTS.length - 1) {
      const delay = 45000 + Math.random() * 30000;
      console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  await closeBrowserForProfile(PROFILE);
  console.log('Done.');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
