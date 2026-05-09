'use strict';

const fs = require('fs');
const path = require('path');
const { closeBrowserForProfile } = require('./browser');
const { generatePersonaComment } = require('./claude');

const twitter = require('./twitter');
const reddit = require('./reddit');

function loadPersonas() {
  const file = path.join(__dirname, 'personas.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Shared error log — collected during runs, read by reports
const _errors = [];
function getAndClearErrors() {
  return _errors.splice(0);
}

// Run all personas sequentially (1 browser at a time to limit memory)
async function runAllPersonas() {
  const personas = loadPersonas();
  console.log(`[persona-runner] Starting run for ${personas.length} personas`);

  for (const persona of personas) {
    console.log(`[persona-runner] === ${persona.name} (${persona.id}) ===`);

    // Build comment generator bound to this persona
    const makeCommentGen = (platform) => {
      return (authorName, postContent) => generatePersonaComment(persona, platform, authorName, postContent);
    };

    // Twitter
    if (persona.platforms.twitter) {
      const cfg = persona.platforms.twitter;
      try {
        console.log(`[persona-runner] ${persona.name} → Twitter`);
        await twitter.engageWithTweets({
          accountId: persona.id,
          cookieFile: cfg.cookieFile,
          profileDir: persona.profileDir,
          commentGenerator: makeCommentGen('twitter'),
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Twitter error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Twitter', error: msg, at: new Date().toISOString() });
      }
    }

    // Close browser between platforms to save memory
    await closeBrowserForProfile(persona.profileDir).catch(() => {});

    // Reddit
    if (persona.platforms.reddit) {
      try {
        console.log(`[persona-runner] ${persona.name} → Reddit`);
        await reddit.engageWithPosts({
          accountId: persona.id,
          cookieFile: persona.platforms.reddit.cookieFile,
          profileDir: persona.profileDir,
          persona,
        });
      } catch (err) {
        const msg = err.message || String(err);
        console.error(`[persona-runner] ${persona.name} Reddit error: ${msg}`);
        _errors.push({ persona: persona.name, platform: 'Reddit', error: msg, at: new Date().toISOString() });
      }
    }

    await closeBrowserForProfile(persona.profileDir).catch(() => {});
    console.log(`[persona-runner] ${persona.name} done`);
  }

  // Summary
  if (_errors.length > 0) {
    console.log(`[persona-runner] All personas complete — ${_errors.length} error(s) this run`);
  } else {
    console.log('[persona-runner] All personas complete — no errors');
  }
}

module.exports = { runAllPersonas, loadPersonas, getAndClearErrors };
