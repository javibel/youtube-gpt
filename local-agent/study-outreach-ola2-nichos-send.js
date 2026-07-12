'use strict';
/**
 * Segunda tanda de la ola 2 — los 4 nichos que faltaban (cocina, viajes,
 * finanzas, estudio). Mismo patron que study-outreach-ola2-send.js: dato
 * citable, sin pedir nada a cambio. Fuente:
 * docs/outreach-ola2-nichos-faltantes-2026-07-12.md.
 *
 *   node study-outreach-ola2-nichos-send.js            -> envia
 *   node study-outreach-ola2-nichos-send.js --dry-run  -> solo muestra
 */
const fs = require('fs');
for (const f of ['.env.local', '.env']) {
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { sendViaResend } = require('./resend');

const DRY_RUN = process.argv.includes('--dry-run');
const BCC = 'javijimenoplata@gmail.com';
const FROM = 'javier';
const REPLY_TO = 'hello@ytubviral.com';

const targets = [
  {
    key: 'socialcubicle',
    to: 'team@socialcubicle.com',
    subject: 'A data point for your YouTube SEO piece for food creators',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your "YouTube SEO Secrets for Food Creators" piece — thought this data point might add to it.

I analyzed 787 of the most-viewed videos within 8 creator niches via the YouTube API, cooking included. Cooking titles that win run notably longer than mass-trending ones (median 80 chars vs 47) and are the least number-heavy niche we measured (13% vs 31% baseline) — food creators seem to win more on descriptive, appetizing titles than on numbered listicles. Full cooking breakdown: https://ytubviral.com/youtube-title-study/cocina

Complete study, free, all 8 niches: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'eggcellent',
    to: 'support@eggcellent.io',
    subject: 'A data point for your best YouTube cooking channels list',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your "Best YouTube Cooking Channels" piece — since your product lives and breathes YouTube cooking content, thought this might interest you.

I pulled the most-viewed videos within 8 creator niches via the YouTube API. Cooking titles run notably longer than mass-trending ones (median 80 chars vs 47 baseline) and lean less on numbers than almost any other niche (13% vs 31%) — descriptive titles seem to win over listicle-style ones in this category. Full cooking breakdown: https://ytubviral.com/youtube-title-study/cocina

Complete study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'closerlives',
    to: 'contactus@closerlives.com',
    subject: 'A data point for your YouTube travel channel tips',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your YouTube travel channel growth tips — thought this data point might add to it.

I analyzed the most-viewed videos within 8 creator niches via the YouTube API, travel included. Travel titles that win run shorter and punchier than most niches (median 59 chars) but lean heavily on ALL-CAPS emphasis words — 55% of top travel titles use one, the highest of any niche we measured (vs 48% baseline). Full travel breakdown: https://ytubviral.com/youtube-title-study/viajes

Complete study, free, all 8 niches: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'contentworks',
    to: 'hello@contentworks.agency',
    subject: 'A data point for your financial services YouTube piece',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your piece on growing subscribers for financial services YouTube channels — thought this data point might add to it.

I analyzed the most-viewed videos within 8 creator niches via the YouTube API. Personal finance titles that win run long (median 75 chars vs 47 baseline) and use nearly 3x more hook words than mass-trending titles (32% vs 11%) — finance creators seem to win by promising a clear, specific outcome in the title. Full finance breakdown: https://ytubviral.com/youtube-title-study/finanzas

Complete study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'besuretocook',
    to: 'besuretocook@gmail.com',
    subject: 'A data point for your YouTube cooking channel beginner plan',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your beginner plan for starting a YouTube cooking channel — thought this data point might be useful for it.

I analyzed the most-viewed videos within 8 creator niches via the YouTube API. Cooking titles that win run notably longer than most niches (median 80 chars vs 47 baseline) and use far fewer numbers than almost any other category (13% vs 31%) — descriptive, appetizing titles seem to beat listicle-style ones here. Full cooking breakdown: https://ytubviral.com/youtube-title-study/cocina

Complete study, free, all 8 niches: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'familystuff',
    to: 'srisivam@zohomail.in',
    subject: 'A data point for your travel keywords piece',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your piece on travel keywords to boost YouTube reach — thought this data point might add to it.

I analyzed the most-viewed videos within 8 creator niches via the YouTube API, travel included. Travel titles that win are shorter than most niches (median 59 chars) but the heaviest users of ALL-CAPS emphasis words of any category (55% vs 48% baseline) — a different pattern than most SEO advice around keyword density alone. Full travel breakdown: https://ytubviral.com/youtube-title-study/viajes

Complete study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
];

(async () => {
  console.log(`[study-outreach-ola2-nichos] ${DRY_RUN ? 'DRY RUN — ' : ''}${targets.length} objetivos a enviar\n`);
  for (const t of targets) {
    if (DRY_RUN) {
      console.log(`--- ${t.key} → ${t.to} ---`);
      console.log(`Subject: ${t.subject}`);
      console.log(t.body);
      console.log('');
      continue;
    }
    try {
      const res = await sendViaResend({
        to: t.to,
        subject: t.subject,
        body: t.body,
        from: FROM,
        replyTo: REPLY_TO,
        bcc: BCC,
      });
      console.log(`✅ ${t.key} → ${t.to} (id ${res.id})`);
    } catch (err) {
      console.error(`❌ ${t.key} → ${t.to}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
})();
