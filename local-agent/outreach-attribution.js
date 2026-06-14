'use strict';

/**
 * Outreach attribution — closes the measurement void found in the J1 audit.
 *
 * Cross-references outreach-tracker.json contacts against the production User table
 * (same Neon DB) to detect who actually signed up after we emailed them, and recomputes
 * meta.stats from the per-contact fields (which were hardcoded zeros nothing ever updated).
 *
 * A contact counts as REGISTERED if a User exists with the same email AND registered on or
 * after we emailed them. ACTIVATED if that user has verified their email. Replies are marked
 * separately, in real time, by gmail.js (markOutreachReply).
 *
 * Also reports signups carrying utm_source=outreach even if their email doesn't match a
 * contact (they may have signed up with a different address).
 *
 * Usage: node outreach-attribution.js [--dry-run]   |   require + runAttribution()
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');
const DRY_RUN = process.argv.includes('--dry-run');
const TAG = 'outreach-attribution';

async function runAttribution() {
  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  const contacts = tracker.contacts || [];
  const emails = [...new Set(contacts.map(c => (c.email || '').toLowerCase().trim()).filter(Boolean))];

  if (emails.length === 0) {
    console.log(`[${TAG}] No contacts with emails.`);
    return { registered: 0, activated: 0 };
  }

  // One query: all users whose email matches a contact (case-insensitive). Table is `users`
  // (Prisma @@map), columns are quoted camelCase. If this fails (DB cold/unreachable), we
  // still recompute the stats below from per-contact fields so gmail's reply marks count.
  let users = [];
  let dbOk = true;
  try {
    users = await db.query(
      `SELECT lower(email) AS email, "createdAt", "emailVerified", "utmSource"
       FROM users WHERE lower(email) = ANY($1::text[])`,
      [emails]
    );
  } catch (err) {
    dbOk = false;
    console.error(`[${TAG}] users query failed (signup attribution skipped this run): ${err.message}`);
  }
  const userByEmail = new Map(users.map(u => [u.email, u]));

  let newlyRegistered = 0, newlyActivated = 0;
  for (const c of contacts) {
    const email = (c.email || '').toLowerCase().trim();
    const u = userByEmail.get(email);
    if (!u) continue;

    // Only attribute signups that happened on/after we emailed them (avoid counting
    // pre-existing users who happened to already be registered).
    const createdDate = new Date(u.createdAt).toISOString().split('T')[0];
    if (c.dateSent && createdDate < c.dateSent) continue;

    if (!c.dateRegistered) {
      c.dateRegistered = createdDate;
      if (c.status !== 'replied') c.status = 'registered';
      newlyRegistered++;
      console.log(`[${TAG}] ✅ REGISTERED: ${c.name} <${email}> (signed up ${createdDate})`);
    }
    if (u.emailVerified && !c.dateActivated) {
      c.dateActivated = new Date(u.emailVerified).toISOString().split('T')[0];
      newlyActivated++;
      console.log(`[${TAG}] ⭐ ACTIVATED: ${c.name} <${email}>`);
    }
  }

  // Recompute the headline stats from per-contact fields — these were hardcoded zeros that
  // no code ever incremented (J1 finding). Now they reflect reality.
  tracker.meta = tracker.meta || {};
  tracker.meta.stats = tracker.meta.stats || {};
  tracker.meta.stats.totalReplied = contacts.filter(c => c.dateReplied).length;
  tracker.meta.stats.totalRegistered = contacts.filter(c => c.dateRegistered).length;
  tracker.meta.stats.totalActivated = contacts.filter(c => c.dateActivated).length;
  tracker.meta.stats.lastAttribution = new Date().toISOString();

  // Visibility: signups carrying utm_source=outreach (DB-side), incl. ones whose email
  // didn't match a contact (signed up with a different address).
  if (dbOk) {
    try {
      const utmOutreach = await db.query(
        `SELECT lower(email) AS email FROM users WHERE "utmSource" = 'outreach'`
      );
      if (utmOutreach.length) {
        const unmatched = utmOutreach.filter(u => !emails.includes(u.email)).length;
        console.log(`[${TAG}] utm_source=outreach signups: ${utmOutreach.length} (${unmatched} not matching any contact email)`);
      }
    } catch { /* non-fatal */ }
  }

  const stats = tracker.meta.stats;
  console.log(`[${TAG}] Stats — sent:${stats.totalSent} replied:${stats.totalReplied} registered:${stats.totalRegistered} activated:${stats.totalActivated}`);

  if (DRY_RUN) {
    console.log(`[${TAG}] DRY RUN — tracker not written (${newlyRegistered} new reg, ${newlyActivated} new act would be saved).`);
  } else {
    fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
    console.log(`[${TAG}] Tracker updated (+${newlyRegistered} registered, +${newlyActivated} activated).`);
  }

  return { registered: stats.totalRegistered, activated: stats.totalActivated, replied: stats.totalReplied };
}

if (require.main === module) {
  runAttribution()
    .then(() => db.disconnect())
    .catch(err => { console.error(`[${TAG}] Fatal:`, err); process.exit(1); });
}

module.exports = { runAttribution };
