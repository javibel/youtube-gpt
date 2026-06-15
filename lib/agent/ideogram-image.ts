/**
 * Ideogram v3 TURBO image generator for social media posts.
 *
 * Generates unique AI images based on post content and returns a public URL
 * (via Vercel Blob) suitable for Meta Graph API (Instagram, Facebook).
 *
 * Falls back to the old Satori infographic URL if Ideogram fails.
 */

import { put } from '@vercel/blob';
import { buildInfographicUrl } from './infographic-generator';
import { prisma } from '@/lib/prisma';

const IDEOGRAM_KEY = (process.env.IDEOGRAM_API_KEY || process.env.ideogram)?.trim();
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();

// Rotating visual styles for daily variety
const IMAGE_STYLES = [
  { scene: 'a sleek dark workspace with neon monitor glow, YouTube analytics dashboard visible', palette: 'dark blue, cyan neon, deep black' },
  { scene: 'a creator studio with camera, ring light, and laptop showing video editing software', palette: 'warm orange, soft white, dark gray' },
  { scene: 'an abstract data visualization with glowing nodes and connections, tech aesthetic', palette: 'electric purple, teal, dark background' },
  { scene: 'a modern minimalist desk with a phone showing a trending YouTube video', palette: 'coral red, clean white, charcoal' },
  { scene: 'a dramatic aerial view of a city at night with screens showing social media metrics', palette: 'gold, deep navy, bright white highlights' },
  { scene: 'a futuristic holographic display showing growth charts and video thumbnails', palette: 'green glow, deep black, white accents' },
  { scene: 'a cozy creative space with mood lighting, journal and laptop, inspiration board on wall', palette: 'warm amber, soft cream, rich brown' },
];

/**
 * Generate an image prompt from post content using Claude.
 */
async function generateImagePrompt(postContent: string): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Given this social media post about YouTube:\n"${postContent.slice(0, 300)}"\n\nWrite a concise image generation prompt (max 200 chars) for a 1:1 social media visual.\nThe image should be eye-catching and related to the post's topic.\n\nRULES:\n- NO text, NO words, NO letters, NO numbers in the image\n- Focus on a strong visual scene/metaphor related to the topic\n- Modern, premium, editorial photography or 3D render style\n- Dramatic lighting, rich colors, professional composition\n- Think: what image would make someone stop scrolling?\n\nReturn ONLY the image prompt, nothing else.`,
      }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data.content?.[0]?.text ?? '').trim() || null;
}

/**
 * Generate a unique AI image for a social post and upload to Vercel Blob.
 *
 * @returns Public URL of the generated image, or null if generation fails.
 */
export async function generateSocialImage(postContent: string): Promise<string | null> {
  if (!IDEOGRAM_KEY) {
    console.log('[ideogram-image] No IDEOGRAM_API_KEY — skipping AI image');
    return null;
  }

  try {
    // Pick today's style
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const style = IMAGE_STYLES[dayOfYear % IMAGE_STYLES.length];

    // Generate content-based prompt via Claude
    let imagePrompt = await generateImagePrompt(postContent).catch(() => null);

    if (!imagePrompt) {
      imagePrompt = `${style.scene}, professional photography, dramatic lighting`;
    }

    const fullPrompt = `${imagePrompt}. Color palette: ${style.palette}. No text, no words, no letters. Cinematic lighting, 4K quality, editorial style.`;

    console.log(`[ideogram-image] Prompt: "${fullPrompt.slice(0, 100)}..."`);

    // Call Ideogram v3 TURBO — 1:1 for Instagram compatibility
    const form = new FormData();
    form.append('prompt', fullPrompt);
    form.append('resolution', '1024x1024');
    form.append('rendering_speed', 'TURBO');
    form.append('magic_prompt', 'ON');
    form.append('style_type', 'REALISTIC');
    form.append('negative_prompt', 'text, words, letters, numbers, watermark, logo, blurry, low quality, distorted');

    const res = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: { 'Api-Key': IDEOGRAM_KEY },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[ideogram-image] Ideogram error ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) {
      console.error('[ideogram-image] No image URL in Ideogram response');
      return null;
    }

    // Download and upload to Vercel Blob for a permanent public URL
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.error(`[ideogram-image] Failed to download image: ${imageRes.status}`);
      return null;
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const filename = `social-ai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/png',
    });

    console.log(`[ideogram-image] AI image uploaded to Blob: ${blob.url}`);
    return blob.url;
  } catch (err) {
    console.error(`[ideogram-image] Failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Generate an AI image, falling back to old Satori infographic URL.
 */
export async function generateSocialImageWithFallback(postContent: string): Promise<string> {
  const aiUrl = await generateSocialImage(postContent);
  if (aiUrl) return aiUrl;

  // Fallback to Satori infographic
  console.log('[ideogram-image] Falling back to Satori infographic');
  return buildInfographicUrl(postContent);
}

/**
 * Returns the brand's shared AI image for today, generating it once if needed.
 *
 * One image per UTC day is reused across all brand channels (Facebook,
 * Instagram morning + evening, and the local-agent Twitter post) to avoid
 * paying for several Ideogram generations of the same daily content. The URL
 * is cached in the shared `daily_brand_image` table; the first caller of the
 * day generates + stores it, everyone else reads it.
 *
 * @returns the cached/new AI image URL, or null if Ideogram failed (caller
 *          should fall back to a Satori infographic).
 */
async function ensureDailyBrandImageTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS daily_brand_image (
      image_date DATE PRIMARY KEY,
      url TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function getOrCreateDailyBrandImage(postContent: string): Promise<string | null> {
  const date = new Date().toISOString().slice(0, 10); // UTC day, matches local-agent

  // 1. Reuse today's cached image if present
  try {
    await ensureDailyBrandImageTable();
    const rows = await prisma.$queryRawUnsafe<{ url: string }[]>(
      `SELECT url FROM daily_brand_image WHERE image_date = $1::date LIMIT 1`,
      date,
    );
    if (rows?.[0]?.url) {
      console.log(`[ideogram-image] Reusing cached daily brand image for ${date}`);
      return rows[0].url;
    }
  } catch (err) {
    console.error(`[ideogram-image] daily cache read failed: ${err instanceof Error ? err.message : err}`);
  }

  // 2. None yet today — generate once and store it for the other channels
  const url = await generateSocialImage(postContent);
  if (url) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO daily_brand_image (image_date, url, source) VALUES ($1::date, $2, 'vercel') ON CONFLICT (image_date) DO NOTHING`,
        date, url,
      );
    } catch (err) {
      console.error(`[ideogram-image] daily cache write failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return url;
}
