'use strict';
/**
 * Envío de la ola 2 de outreach del data study "Anatomía de un título de
 * YouTube" — 10 objetivos verificados con email real (de los 30 candidatos
 * de docs/outreach-ola2-2026-07-09.md, verificados en
 * docs/outreach-ola2-verificacion-2026-07-11.md). Mismo patrón que la ola 1
 * (local-agent/reports/study-outreach-pitches-2026-06-27.md): ángulo "datos
 * originales que puedes citar", NO "incluye mi herramienta", sin pedir nada
 * a cambio. Datos actualizados al dataset v2 (09/07/2026, N=1.723).
 *
 *   node study-outreach-ola2-send.js            → envía
 *   node study-outreach-ola2-send.js --dry-run  → solo muestra qué enviaría
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
    key: 'fluxnote',
    to: 'support@fluxnote.io',
    subject: 'A fresh data point for your title character limit piece',
    body: `Hi, I'm Javier, founder of YTubViral. I came across your piece on YouTube title character limits and thought this might be a useful data point.

I pulled 1,723 real titles via the YouTube API (936 from global trending across 30 countries, 787 from the most-viewed videos within 8 creator niches). The contrast: trending titles run short (median 47 chars), but the top-viewed videos within a niche run to 70, with far more numbers (43% vs 31%) and nearly 3x more listicles. So "ideal length" really depends on whether you're chasing mass virality or competing for a topic.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Use any of it if it's useful — happy to share the per-niche breakdown too.
— Javier, ytubviral.com`,
  },
  {
    key: 'veefly',
    to: 'support@veefly.com',
    subject: 'A fresh data point for your YouTube title length guide',
    body: `Hi, I'm Javier, founder of YTubViral. Your piece on YouTube title length for creators is right up my alley — I ran a similar analysis and thought the numbers might interest you.

1,723 real titles from the YouTube API: 936 from global trending (30 countries), 787 from the most-viewed videos within 8 creator niches. Trending titles have a median of 47 characters, but top niche videos run to 70, with nearly 3x more listicles and far more numbers in the title. The "ideal length" really depends on what you're competing for.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Use any of it if it's useful — happy to share the per-niche breakdown.
— Javier, ytubviral.com`,
  },
  {
    key: 'tubeanalytics',
    to: 'support@tubeanalytics.net',
    subject: 'A complementary data point for your CTR optimization guide',
    body: `Hi, I'm Javier, founder of YTubViral. I read your YouTube CTR optimization piece and thought this might complement it.

I analyzed 1,723 real titles via the YouTube API — 936 from global trending, 787 from the most-viewed videos within 8 creator niches. One pattern that ties into CTR: titles that win within a competitive niche use nearly 3x more hook words and listicles than mass-trending titles do. Title structure correlates with what actually gets clicked when you're competing for a topic, not chasing virality.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the per-niche breakdown if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'artiphik',
    to: 'hi@artiphik.com',
    subject: 'A fresh data point for your CTR benchmarks by niche',
    body: `Hi, I'm Javier, founder of YTubViral. Your CTR benchmarks by niche piece is exactly the kind of data-driven content I was hoping to find — thought I'd share something that might add to it.

I pulled 1,723 real YouTube titles via the API and broke them down by niche too: 936 from global trending, 787 from the most-viewed videos within 8 creator niches (gaming, fitness, tech, beauty, travel, finance, cooking, studying). The niche breakdown shows title structure (length, numbers, listicles) varies a lot by category — which lines up with CTR varying by niche the way your piece shows.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the raw per-niche numbers if useful for a follow-up.
— Javier, ytubviral.com`,
  },
  {
    key: 'creatorscience',
    to: 'jay@creatorscience.com',
    subject: 'A data point on niche competition vs. title length',
    body: `Hi Jay, I'm Javier, founder of YTubViral. Long-time reader of Creator Science — thought this might be an interesting data point for the newsletter.

I analyzed 1,723 real YouTube titles via the API: 936 from global trending (30 countries), 787 from the most-viewed videos within 8 creator niches. The finding: titles that win mass trending are short (median 47 chars) and mostly viral entertainment. But the most-viewed videos *within* a competitive niche run longer (median 70), with nearly 3x more listicles and hook words. It's a decent illustration of "optimizing for virality" vs "optimizing for search/competition" being genuinely different games.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the raw per-niche breakdown if it's useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'fortheinterested',
    to: 'josh@joshspector.com',
    subject: 'A data point for an upcoming issue',
    body: `Hi Josh, I'm Javier, founder of YTubViral. Reader of For The Interested — thought this might be a good fit for a future issue.

I ran a real-data study on YouTube titles: 1,723 titles pulled via the API, split between global trending (936, 30 countries) and the most-viewed videos within 8 creator niches (787). The interesting bit: trending titles are short and generic (median 47 chars), but the videos that win *within* a specific niche run longer (median 70) and use nearly 3x more listicles and hook words. Different game depending on what you're optimizing for.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to send the per-niche numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'juanmerodio',
    to: 'info@juanmerodio.com',
    subject: 'Un dato real sobre longitud de títulos de YouTube',
    body: `Hola Juan, soy Javier, fundador de YTubViral. Vi tu artículo sobre crear contenido en YouTube y creo que esto puede aportarte un dato concreto.

Analicé 1.723 títulos reales de YouTube vía la API: 936 del trending global (30 países) y 787 de los vídeos más vistos dentro de 8 nichos de creador. El hallazgo: los títulos que triunfan en trending son cortos (mediana 47 caracteres), pero los vídeos más vistos DENTRO de un nicho concreto usan títulos más largos (mediana 70), con casi el triple de listicles y palabras gancho. Es decir, competir por viralidad y competir por un tema son juegos distintos.

Estudio completo, gratis, con metodología: https://ytubviral.com/youtube-title-study

Úsalo si te sirve — puedo pasarte el desglose por nicho si te interesa.
— Javier, ytubviral.com`,
  },
  {
    key: 'storylab',
    to: 'team@storylab.ai',
    subject: 'A data point for your gaming YouTube title examples',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your gaming YouTube title examples piece — thought this might add a data point.

I analyzed 787 of the most-viewed videos within 8 creator niches (gaming included) via the YouTube API, alongside 936 global trending titles. Gaming specifically: 53% of the top-viewed gaming titles include a number, and 26% use a hook word — both well above the trending baseline (31% and 11%). We built a gaming-specific breakdown here: https://ytubviral.com/youtube-title-study/gaming

Full study with all 8 niches: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful.
— Javier, ytubviral.com`,
  },
  {
    key: 'origym',
    to: 'support@origym.co.uk',
    subject: 'A data point for your fitness YouTube channels piece',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your "Best Fitness YouTube Channels" piece — thought this data point on fitness titles specifically might interest you.

I analyzed 787 of the most-viewed videos within 8 creator niches via the YouTube API. Fitness stood out the most: 62% of top fitness titles include a number and 52% are listicles — both the highest of any niche we measured (vs. 31% and 8% on trending overall). Full fitness breakdown: https://ytubviral.com/youtube-title-study/fitness

Complete study with all 8 niches: https://ytubviral.com/youtube-title-study

Happy to share the raw numbers if useful for a follow-up piece.
— Javier, ytubviral.com`,
  },
  {
    key: 'subsub',
    to: 'creators@subsub.io',
    subject: 'A data point on title structure and channel growth',
    body: `Hi, I'm Javier, founder of YTubViral. Saw your content on creator strategy and growth — thought this data point might be useful.

I analyzed 1,723 real YouTube titles via the API: 936 from global trending, 787 from the most-viewed videos within 8 creator niches. The pattern: titles that win within a specific niche use nearly 3x more numbers, listicles, and hook words than titles that go mass-trending. It's a decent illustration of why "what works" depends on whether a creator is optimizing for virality or for competing within their niche.

Full study, free, methodology included: https://ytubviral.com/youtube-title-study

Happy to share the per-niche breakdown if useful.
— Javier, ytubviral.com`,
  },
];

(async () => {
  console.log(`[study-outreach-ola2] ${DRY_RUN ? 'DRY RUN — ' : ''}${targets.length} objetivos a enviar\n`);
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
    // Espaciado suave entre envíos, cortesía con la API de Resend.
    await new Promise((r) => setTimeout(r, 1500));
  }
})();
