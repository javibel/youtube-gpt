'use strict';

/**
 * Captures screenshots of ytubviral.com key pages for social media content.
 * Usage: node screenshot-product.js [page-key]
 * If no page-key given, captures all pages.
 * Output: screenshots/product-{key}-{date}.png (1080x1080 crop)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'https://ytubviral.com';

const PAGES = {
  'dashboard': { path: '/login', desc: 'Login page' },
  'landing': { path: '/', desc: 'Landing page hero' },
  'seo-score': { path: '/features/seo-score', desc: 'SEO Score feature' },
  'title-gen': { path: '/features/ai-generator', desc: 'AI Title Generator' },
  'pricing': { path: '/pricing', desc: 'Pricing plans' },
  'blog': { path: '/blog', desc: 'Blog listing' },
};

async function captureScreenshot(pageKey) {
  const page = PAGES[pageKey];
  if (!page) {
    console.error(`Unknown page key: ${pageKey}. Available: ${Object.keys(PAGES).join(', ')}`);
    return null;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1080,1080'],
    defaultViewport: { width: 1080, height: 1080 },
  });

  try {
    const tab = await browser.newPage();
    await tab.goto(`${BASE_URL}${page.path}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000)); // Let animations settle

    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(SCREENSHOT_DIR, `product-${pageKey}-${date}.png`);
    await tab.screenshot({ path: filePath, type: 'png' });
    console.log(`✓ ${pageKey}: ${filePath}`);
    return filePath;
  } finally {
    await browser.close();
  }
}

async function main() {
  const requestedKey = process.argv[2];

  if (requestedKey) {
    await captureScreenshot(requestedKey);
  } else {
    for (const key of Object.keys(PAGES)) {
      try {
        await captureScreenshot(key);
      } catch (err) {
        console.error(`✗ ${key}: ${err.message}`);
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
