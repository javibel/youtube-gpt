'use strict';

// Usage: node login-helper.js <profile> <url>
// Examples:
//   node login-helper.js chrome-profile https://x.com
//   node login-helper.js chrome-profile https://www.facebook.com
//   node login-helper.js chrome-profiles/persona-ferran https://x.com
//   node login-helper.js chrome-profiles/persona-ferran https://www.linkedin.com

require('dotenv').config();
const path = require('path');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const profileDir = process.argv[2] || 'chrome-profile';
const url = process.argv[3] || 'https://x.com';
const absDir = path.resolve(__dirname, profileDir);

console.log(`Opening ${url} with profile: ${profileDir}`);
console.log('Log in manually, then press Ctrl+C to close.\n');

(async () => {
  const browser = await puppeteerExtra.launch({
    headless: false,
    userDataDir: absDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
    protocolTimeout: 60000,
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  console.log(`Page loaded: ${page.url()}`);
  console.log('Waiting for you to log in... Press Ctrl+C when done.');

  // Keep alive until Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\nClosing browser and saving session...');
    await browser.close();
    process.exit(0);
  });

  // On Windows, also handle terminal close
  process.stdin.resume();
})();
