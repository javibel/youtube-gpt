import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const outDir = join(publicDir, 'ph-assets');

mkdirSync(outDir, { recursive: true });

// 1. Logo 240x240 from icon-512
await sharp(join(publicDir, 'icon-512.png'))
  .resize(240, 240)
  .png()
  .toFile(join(outDir, 'logo-240.png'));
console.log('✓ logo-240.png');

// 2. OG Image 1200x630 — dark bg with logo + tagline
const width = 1200;
const height = 630;

const svgOverlay = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#9B2020" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#0a0a0a"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>

  <!-- Play button circle -->
  <circle cx="600" cy="220" r="60" stroke="#9B2020" stroke-width="4" fill="none"/>
  <polygon points="585,190 585,250 625,220" fill="#9B2020"/>

  <!-- Brand name -->
  <text x="600" y="330" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="48" fill="white">
    YTubViral<tspan fill="#e84d5b">.com</tspan>
  </text>

  <!-- Tagline -->
  <text x="600" y="380" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="22" fill="#a1a1aa">
    14 AI tools to grow your YouTube channel
  </text>

  <!-- Tool pills row 1 -->
  <text x="600" y="440" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#71717a">
    Title Generator · SEO Score · Keyword Research · Competitor Analysis · A/B Testing · AI Coach · Calendar
  </text>
  <!-- Tool pills row 2 -->
  <text x="600" y="465" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#71717a">
    Retention · Revenue · Trends · Video Predictor · Best Time · Analytics · Learning Hub
  </text>

  <!-- CTA bar -->
  <rect x="420" y="510" width="360" height="44" rx="22" fill="#e84d5b"/>
  <text x="600" y="538" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="16" fill="white">
    Join the waitlist — 50% off for 1 year
  </text>

  <!-- Subtle border -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="0" fill="none" stroke="#1a1a1a" stroke-width="2"/>
</svg>`;

await sharp(Buffer.from(svgOverlay))
  .png()
  .toFile(join(outDir, 'og-image.png'));
console.log('✓ og-image.png (1200x630)');

// 3. PH Gallery thumbnail 1270x760 (same as OG but bigger)
const galW = 1270;
const galH = 760;

const svgGallery = `
<svg width="${galW}" height="${galH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow2" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#9B2020" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${galW}" height="${galH}" fill="#0a0a0a"/>
  <rect width="${galW}" height="${galH}" fill="url(#glow2)"/>

  <circle cx="635" cy="230" r="70" stroke="#9B2020" stroke-width="4.5" fill="none"/>
  <polygon points="617,195 617,265 667,230" fill="#9B2020"/>

  <text x="635" y="355" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="56" fill="white">
    YTubViral<tspan fill="#e84d5b">.com</tspan>
  </text>

  <text x="635" y="410" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="400" font-size="26" fill="#a1a1aa">
    14 AI tools to grow your YouTube channel — all in one place
  </text>

  <text x="635" y="480" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#71717a">
    Title Generator · SEO Score · Keyword Research · Competitor Analysis · A/B Testing · AI Coach · Calendar
  </text>
  <text x="635" y="510" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#71717a">
    Retention · Revenue · Trends · Video Predictor · Best Time · Analytics · Learning Hub
  </text>

  <rect x="475" y="570" width="320" height="48" rx="24" fill="#e84d5b"/>
  <text x="635" y="601" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="18" fill="white">
    Free plan available →
  </text>
</svg>`;

await sharp(Buffer.from(svgGallery))
  .png()
  .toFile(join(outDir, 'gallery-hero.png'));
console.log('✓ gallery-hero.png (1270x760)');

console.log('\nAll PH assets generated in public/ph-assets/');
