/**
 * Captures screenshots of key YTubViral pages for Product Hunt gallery.
 *
 * Prerequisites:
 *   1. Dev server running: npm run dev
 *   2. Logged in session cookies (or use a test account)
 *
 * Usage:
 *   node scripts/ph-screenshots.mjs [sessionToken]
 *
 * If no sessionToken, captures only public pages.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use puppeteer from local-agent where it's installed
const puppeteer = require('../../local-agent/node_modules/puppeteer');
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'ph-assets', 'screenshots');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL || 'https://ytubviral.com';
const sessionToken = process.argv[2] || null;
const csrfToken = process.argv[3] || null;

const PAGES = [
  { name: '01-generator', path: '/generate', title: 'AI Content Generator' },
  { name: '02-seo-score', path: '/seo-score', title: 'SEO Score Analyzer' },
  { name: '03-competitors', path: '/competitors', title: 'Competitor Analysis' },
  { name: '04-dashboard', path: '/dashboard', title: 'Dashboard' },
  { name: '05-keywords', path: '/research', title: 'Keyword Research' },
  { name: '06-calendar', path: '/calendar', title: 'Content Calendar' },
];

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  // Set session cookie if provided
  if (sessionToken) {
    const isLocal = BASE.includes('localhost');
    const cookies = [
      {
        name: isLocal ? 'next-auth.session-token' : '__Secure-authjs.session-token',
        value: sessionToken,
        domain: isLocal ? 'localhost' : '.ytubviral.com',
        path: '/',
        ...(isLocal ? {} : { secure: true, sameSite: 'None' }),
      },
    ];
    if (csrfToken) {
      cookies.push({
        name: isLocal ? 'next-auth.csrf-token' : '__Host-authjs.csrf-token',
        value: csrfToken,
        domain: isLocal ? 'localhost' : 'ytubviral.com',
        path: '/',
        ...(isLocal ? {} : { secure: true, sameSite: 'None' }),
      });
    }
    // Force English language
    cookies.push({
      name: 'ytubviral_lang',
      value: 'en',
      domain: isLocal ? 'localhost' : '.ytubviral.com',
      path: '/',
    });
    await page.setCookie(...cookies);
    console.log('Session cookies set (lang=en)');
  }

  // Dark mode
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  for (const { name, path, title } of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
      // Wait a bit for animations
      await new Promise(r => setTimeout(r, 1500));

      const file = join(outDir, `${name}.png`);
      await page.screenshot({ path: file, type: 'png' });
      console.log(`✓ ${name}.png — ${title}`);
    } catch (err) {
      console.log(`✗ ${name} — ${err.message}`);
    }
  }

  // Also capture the landing page (no auth needed)
  try {
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: join(outDir, '00-landing.png'), type: 'png' });
    console.log('✓ 00-landing.png — Landing Page');
  } catch (err) {
    console.log(`✗ landing — ${err.message}`);
  }

  await browser.close();
  console.log(`\nScreenshots saved to public/ph-assets/screenshots/`);
  console.log('Tip: For PH gallery, use 1270x760 crops or upload as-is (1440x900).');
}

run().catch(console.error);
