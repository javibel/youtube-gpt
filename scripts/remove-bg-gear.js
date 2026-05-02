/**
 * Download gear product images and remove white backgrounds.
 * Run once: node scripts/remove-bg-gear.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'gear');

const IMAGES = [
  { id: 'dji-osmo-pocket-3', url: 'https://m.media-amazon.com/images/I/61tukvVUMiL._AC_SL1500_.jpg' },
  { id: 'sony-zv-e10ii', url: 'https://m.media-amazon.com/images/I/81ww9NIIRRL._AC_SL1500_.jpg' },
  { id: 'sony-a6700', url: 'https://m.media-amazon.com/images/I/61plU2NSrEL._AC_SL1500_.jpg' },
  { id: 'samson-q2u', url: 'https://m.media-amazon.com/images/I/81OmG6409ML._AC_SL1500_.jpg' },
  { id: 'rode-podmic-usb', url: 'https://m.media-amazon.com/images/I/61ElAcEsHiL._AC_SL1080_.jpg' },
  { id: 'shure-mv7plus', url: 'https://m.media-amazon.com/images/I/81SkpwyPZnL._AC_SL1500_.jpg' },
  { id: 'shure-sm7db', url: 'https://m.media-amazon.com/images/I/51Wvs2GxZ1L._AC_SL1000_.jpg' },
  { id: 'neewer-660', url: 'https://m.media-amazon.com/images/I/71DZvCEIFOL._AC_SL1500_.jpg' },
  { id: 'elgato-key-light', url: 'https://m.media-amazon.com/images/I/617mzv+iKjL._AC_SL1500_.jpg' },
  { id: 'elgato-green-screen', url: 'https://m.media-amazon.com/images/I/61GlaHCM85L._AC_SL1500_.jpg' },
  { id: 'rode-wireless-go-ii', url: 'https://m.media-amazon.com/images/I/519TvRDJyYL._AC_SL1080_.jpg' },
  { id: 'samsung-t7', url: 'https://m.media-amazon.com/images/I/A1sHjPpz6fL._AC_SL1500_.jpg' },
  { id: 'beyerdynamic-dt770', url: 'https://m.media-amazon.com/images/I/61e306LgiuL._AC_SL1438_.jpg' },
  { id: 'focusrite-scarlett-2i2', url: 'https://cdn11.bigcommerce.com/s-7exlzlf13h/images/stencil/1280x1280/products/307/785/scarlett-2i2-top-image-2400-2400__78159.1693324453.png' },
  { id: 'elgato-stream-deck', url: 'https://m.media-amazon.com/images/I/61gtdFnK+UL._AC_SL1500_.jpg' },
  { id: 'manfrotto-pixi', url: 'https://cdn.manfrotto.com/media/catalog/product/cache/16a7253a27a4188a5cc006d92677ae2a/m/t/mtpixi-b-v4.jpg' },
  { id: 'davinci-resolve', url: 'https://images.blackmagicdesign.com/images/products/davinciresolve/product-grid/davinci-resolve-speed-editor.jpg' },
  // Apple/Logitech/Dell — likely already have transparent or dark backgrounds
  { id: 'apple-macbook-air-m3', url: 'https://www.apple.com/v/macbook-air/z/images/overview/design/design_hero_static__e56c1v71mr6u_large.png' },
  { id: 'apple-macbook-pro-m4', url: 'https://www.apple.com/v/macbook-pro/ax/images/overview/product-viewer/pv_hero_endframe__gc89p7dw1syi_large.jpg' },
  { id: 'dell-s2722qc', url: 'https://i.dell.com/is/image/DellContent//content/dam/ss2/product-images/dell-client-products/peripherals/monitors/s-series/s2722qc/spi/ng/monitor-s2722qc-relsize-500-ng.psd?fmt=jpg&wid=500&hei=381' },
  { id: 'logitech-mx-master-3s', url: 'https://resource.logitech.com/c_fill,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-3s/2025-update/mx-master-3s-bluetooth-edition-top-view-black-new-1.png' },
  { id: 'logitech-mx-keys-s', url: 'https://resource.logitech.com/w_544,h_466,ar_7:6,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/keyboards/mx-keys-s/migration-assets-for-delorean-2025/gallery/mx-keys-s-top-view-black-us.png' },
];

// Threshold: pixels with R,G,B all above this value are considered "white"
const WHITE_THRESHOLD = 235;
// Soft edge: pixels between SOFT_LOW and WHITE_THRESHOLD get partial transparency
const SOFT_LOW = 210;

async function processImage(id, url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) {
      console.error(`  ✗ ${id}: HTTP ${res.status}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    // Resize to max 800px wide for web performance, and get raw RGBA
    const image = sharp(buffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let whitePixels = 0;
    const totalPixels = info.width * info.height;

    // First pass: count white pixels to decide if background removal is needed
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
        whitePixels++;
      }
    }

    const whiteRatio = whitePixels / totalPixels;
    const needsRemoval = whiteRatio > 0.15; // More than 15% white = has white bg

    if (needsRemoval) {
      // Remove white background with soft edges
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const minChannel = Math.min(r, g, b);

        if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
          // Pure white → fully transparent
          data[i + 3] = 0;
        } else if (minChannel >= SOFT_LOW && r >= SOFT_LOW && g >= SOFT_LOW && b >= SOFT_LOW) {
          // Near-white → partial transparency for smooth edges
          const brightness = (r + g + b) / 3;
          const alpha = Math.round(255 * (1 - (brightness - SOFT_LOW) / (255 - SOFT_LOW)));
          data[i + 3] = Math.max(0, Math.min(255, alpha));
        }
      }
      console.log(`  ✓ ${id}: removed bg (${Math.round(whiteRatio * 100)}% white)`);
    } else {
      console.log(`  ○ ${id}: kept as-is (${Math.round(whiteRatio * 100)}% white)`);
    }

    const outPath = path.join(OUT_DIR, `${id}.png`);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    return `/gear/${id}.png`;
  } catch (err) {
    console.error(`  ✗ ${id}: ${err.message}`);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Processing ${IMAGES.length} images...\n`);

  const results = {};
  for (const { id, url } of IMAGES) {
    const localPath = await processImage(id, url);
    if (localPath) results[id] = localPath;
  }

  console.log(`\nDone. ${Object.keys(results).length}/${IMAGES.length} processed.`);
  console.log('\nUpdate gear-data.ts image paths:');
  for (const [id, localPath] of Object.entries(results)) {
    console.log(`  ${id}: '${localPath}'`);
  }
}

main();
