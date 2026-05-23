'use strict';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { newPageForProfile, closeBrowserForProfile } = require('./browser');
const { safeGoto } = require('./resilience');
const { guardedCall } = require('./api-guard');

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PATH = path.join(__dirname, 'reports', 'quora-comments-log.json');
const PROFILE = 'brand-quora';

const MAX_ANSWERS_PER_RUN = 3;
const MIN_DELAY_BETWEEN = 60000; // 60s between answers
const MAX_DELAY_BETWEEN = 120000;

const SEARCH_QUERIES = [
  'best youtube seo tool',
  'how to grow youtube channel',
  'youtube keyword research',
  'youtube title optimization',
  'youtube analytics tools',
  'youtube thumbnail tips',
  'how to get more views youtube',
  'youtube description optimization',
  'best free youtube tools',
  'youtube algorithm tips',
];

// ── Log management ──────────────────────────────────────────────────────────

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    const log = { answers: [], lastRun: null, totalAnswers: 0 };
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    return log;
  }
}

function saveLog(log) {
  log.lastRun = new Date().toISOString();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ── Quora session verification ──────────────────────────────────────────────

async function verifyQuoraSession(page) {
  const ok = await safeGoto(page, 'https://www.quora.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!ok) return false;

  await new Promise(r => setTimeout(r, 3000));

  // Check if logged in by looking for profile/add question elements
  const isLoggedIn = await page.evaluate(() => {
    // If we see a login prompt or signup modal, we're not logged in
    const loginModal = document.querySelector('[class*="SignupModal"]') || document.querySelector('[class*="LoginModal"]');
    if (loginModal) return false;
    // Check for elements that only appear when logged in
    const profileIcon = document.querySelector('[class*="profile_image"]') || document.querySelector('img[alt*="Profile"]');
    const addQuestion = document.querySelector('[class*="AddQuestion"]') || document.querySelector('a[href="/answer"]');
    return !!(profileIcon || addQuestion);
  });

  return isLoggedIn;
}

// ── Search for questions ────────────────────────────────────────────────────

async function searchQuoraQuestions(page, query) {
  const searchUrl = `https://www.quora.com/search?q=${encodeURIComponent(query)}&type=question`;
  const ok = await safeGoto(page, searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!ok) return [];

  await new Promise(r => setTimeout(r, 3000));

  // Scroll to load results
  await page.evaluate(() => window.scrollBy(0, 800));
  await new Promise(r => setTimeout(r, 2000));

  const questions = await page.evaluate(() => {
    const results = [];
    // Quora search results — question links
    const links = document.querySelectorAll('a[href*="/"]');
    const seen = new Set();

    for (const a of links) {
      const href = a.href || '';
      const text = (a.textContent || '').trim();

      // Filter for question-like URLs (Quora questions are at root path)
      if (!href.includes('quora.com/') || text.length < 20 || text.length > 300) continue;
      if (href.includes('/search') || href.includes('/profile') || href.includes('/topic')) continue;
      if (href.includes('/answer') || href.includes('/log')) continue;
      if (seen.has(href)) continue;

      // Must look like a question
      if (!text.includes('?') && !/^(What|How|Why|Which|Is|Are|Can|Do|Should|Best|Top)/i.test(text)) continue;

      seen.add(href);
      results.push({ url: href, title: text });
    }

    return results.slice(0, 10);
  });

  return questions;
}

// ── Generate answer with Claude ─────────────────────────────────────────────

async function generateQuoraAnswer(questionTitle, mentionYtubviral) {
  const system = `You are a YouTube growth expert answering questions on Quora. Write helpful, detailed answers based on real experience. Your tone is conversational but authoritative. Never use markdown headers or bullet points — write in flowing paragraphs like a real Quora answer. Keep answers 200-400 words.`;

  const mentionInstruction = mentionYtubviral
    ? `\nNaturally mention YTubViral (ytubviral.com) once as a tool you've found useful — but only if it fits the answer organically. Never be salesy. Frame it as one option among several.`
    : '\nDo NOT mention any specific tools by name.';

  const prompt = `Write a helpful Quora answer for this question: "${questionTitle}"

Requirements:
- Answer the question directly and practically
- Include specific tips, examples, or data points
- Write like a real person sharing their experience, not a generic AI response
- Use "I" occasionally — share a personal perspective
- Keep it 200-400 words
- No markdown formatting (no ##, no **, no bullet lists)
- Write in plain paragraphs${mentionInstruction}

Output ONLY the answer text, nothing else.`;

  const { text } = await guardedCall(prompt, {
    maxTokens: 600,
    agentId: 'quora-commenter',
    system,
  });

  return text.trim();
}

// ── Post answer on Quora ────────────────────────────────────────────────────

async function postQuoraAnswer(page, questionUrl, answerText) {
  const ok = await safeGoto(page, questionUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (!ok) throw new Error('Failed to navigate to question');

  await new Promise(r => setTimeout(r, 3000));

  // Click "Answer" button
  const answerBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const answerButton = buttons.find(b =>
      /^Answer$/i.test((b.textContent || '').trim()) ||
      /^Responder$/i.test((b.textContent || '').trim())
    );
    if (answerButton) {
      answerButton.click();
      return true;
    }
    return false;
  });

  if (!answerBtn) {
    // Try clicking the "Write your answer" placeholder
    const placeholder = await page.$('[class*="AnswerEditor"], [placeholder*="Write"], [class*="editable"]');
    if (placeholder) await placeholder.click();
    else throw new Error('Cannot find answer input');
  }

  await new Promise(r => setTimeout(r, 2000));

  // Find the editor and type
  const editor = await page.$('[contenteditable="true"], [class*="editor"] [contenteditable], .doc');
  if (!editor) throw new Error('Cannot find editor');

  await editor.click();
  await new Promise(r => setTimeout(r, 500));

  // Type with human-like delay
  await page.keyboard.type(answerText, { delay: 35 });

  await new Promise(r => setTimeout(r, 2000));

  // Click submit button
  const submitted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const submitBtn = buttons.find(b => {
      const text = (b.textContent || '').trim().toLowerCase();
      return text === 'submit' || text === 'post' || text === 'publicar' || text === 'enviar';
    });
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
      return true;
    }
    return false;
  });

  if (!submitted) throw new Error('Cannot find or click submit button');

  await new Promise(r => setTimeout(r, 3000));

  // Check for CAPTCHA or error
  const hasCaptcha = await page.evaluate(() => {
    return !!(document.querySelector('[class*="captcha"]') ||
              document.querySelector('iframe[src*="captcha"]') ||
              document.querySelector('[class*="Captcha"]'));
  });

  if (hasCaptcha) throw new Error('CAPTCHA detected — aborting');

  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function runQuoraCommenter() {
  console.log(`[quora-commenter] Starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  // Check if profile directory exists
  const profileDir = path.join(__dirname, 'chrome-profiles', PROFILE);
  if (!fs.existsSync(profileDir)) {
    console.log(`[quora-commenter] Chrome profile "${PROFILE}" not found. Create it and log in to Quora manually first.`);
    return;
  }

  const log = loadLog();
  const answeredUrls = new Set(log.answers.map(a => a.url));

  let page;
  try {
    page = await newPageForProfile(PROFILE, { headless: true });
  } catch (err) {
    console.error(`[quora-commenter] Browser launch failed: ${err.message}`);
    return;
  }

  try {
    // Verify session
    const isLoggedIn = await verifyQuoraSession(page);
    if (!isLoggedIn) {
      console.log('[quora-commenter] Not logged in to Quora. Please log in manually in the brand-quora profile.');
      return;
    }
    console.log('[quora-commenter] Quora session verified');

    // Pick today's queries (rotate)
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const hourSlot = now.getHours() >= 16 ? 1 : 0;
    const startIdx = ((dayOfYear * 2) + hourSlot) % SEARCH_QUERIES.length;
    const queries = [
      SEARCH_QUERIES[startIdx % SEARCH_QUERIES.length],
      SEARCH_QUERIES[(startIdx + 1) % SEARCH_QUERIES.length],
    ];

    console.log(`[quora-commenter] Searching: ${queries.join(', ')}`);

    // Collect candidate questions
    const allQuestions = [];
    for (const q of queries) {
      try {
        const questions = await searchQuoraQuestions(page, q);
        allQuestions.push(...questions.filter(q => !answeredUrls.has(q.url)));
      } catch (err) {
        console.error(`[quora-commenter] Search failed for "${q}": ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    // Dedupe
    const seen = new Set();
    const unique = allQuestions.filter(q => {
      if (seen.has(q.url)) return false;
      seen.add(q.url);
      return true;
    });

    console.log(`[quora-commenter] Found ${unique.length} unanswered questions`);

    let count = 0;
    for (const question of unique.slice(0, MAX_ANSWERS_PER_RUN)) {
      // ~60% chance to mention ytubviral
      const mentionYtubviral = Math.random() < 0.6;

      console.log(`[quora-commenter] Answering: "${question.title.slice(0, 80)}..."`);

      try {
        const answer = await generateQuoraAnswer(question.title, mentionYtubviral);
        if (!answer || answer.length < 100) {
          console.log('[quora-commenter] Answer too short, skipping');
          continue;
        }

        if (DRY_RUN) {
          console.log(`[quora-commenter] DRY RUN — would post (${answer.length} chars, mention: ${mentionYtubviral}):`);
          console.log(`  ${answer.slice(0, 150)}...`);
        } else {
          await postQuoraAnswer(page, question.url, answer);
          console.log(`[quora-commenter] Posted answer (${answer.length} chars)`);
        }

        log.answers.push({
          url: question.url,
          title: question.title,
          answeredAt: new Date().toISOString(),
          mentionedYtubviral: mentionYtubviral,
          length: answer.length,
        });
        log.totalAnswers++;
        count++;

        // Delay between answers
        if (count < MAX_ANSWERS_PER_RUN) {
          const delay = MIN_DELAY_BETWEEN + Math.random() * (MAX_DELAY_BETWEEN - MIN_DELAY_BETWEEN);
          console.log(`[quora-commenter] Waiting ${Math.round(delay / 1000)}s before next answer...`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (err) {
        console.error(`[quora-commenter] Failed to answer "${question.title.slice(0, 50)}": ${err.message}`);
        if (err.message.includes('CAPTCHA')) {
          console.error('[quora-commenter] CAPTCHA detected — stopping run');
          break;
        }
      }
    }

    saveLog(log);
    console.log(`[quora-commenter] Done. ${count} answer(s) ${DRY_RUN ? 'validated' : 'posted'}.`);
  } finally {
    try { await closeBrowserForProfile(PROFILE); } catch {}
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
  runQuoraCommenter().catch(err => {
    console.error('[quora-commenter] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runQuoraCommenter };
