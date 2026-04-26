import { prisma } from '@/lib/prisma';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';
const IG_GRAPH = 'https://graph.facebook.com/v19.0';
const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s/g, '');
}

// Day of week → image category folder (0=Sun, 1=Mon, ...)
const DAY_CATEGORY: Record<number, string> = {
  0: 'inspiracion',
  1: 'motivacion',
  2: 'tips-youtube',
  3: 'casos-exito',
  4: 'herramientas',
  5: 'reflexion',
  6: 'comunidad',
};

export function getSocialImageUrl(): string {
  const day = new Date().getDay();
  const category = DAY_CATEGORY[day] ?? 'motivacion';
  // Convention: images named 01.png, 02.png... up to 05.png per category
  const num = String((Math.floor(Math.random() * 5) + 1)).padStart(2, '0');
  return `${BASE_URL}/social-images/${category}/${num}.png`;
}

function getFallbackImageUrl(): string {
  return `${BASE_URL}/social-images/default.png`;
}

async function alreadyPublishedToday(platform: string): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const count = await prisma.socialPost.count({
    where: { platform, status: 'published', publishedAt: { gte: start } },
  });
  return count > 0;
}

export async function publishToFacebook(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { success: false, error: 'META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured' };
  }

  if (await alreadyPublishedToday('facebook')) {
    return { success: false, error: 'Already published to Facebook today — skipping to avoid duplicate' };
  }

  try {
    const message = stripMarkdown(content);
    const res = await fetch(`${FB_GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: token }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Facebook API error ${res.status}: ${JSON.stringify(data)}`);
    }

    await prisma.socialPost.create({
      data: {
        platform: 'facebook',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: data.id ?? '',
      },
    });

    return { success: true, postId: data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[meta-agent/facebook]', errorMsg);

    await prisma.socialPost.create({
      data: { platform: 'facebook', content, status: 'failed', errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}

export async function publishToFacebookWithImage(
  content: string,
  imageUrl: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { success: false, error: 'META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured' };
  }

  if (await alreadyPublishedToday('facebook')) {
    return { success: false, error: 'Already published to Facebook today — skipping to avoid duplicate' };
  }

  try {
    const caption = stripMarkdown(content);
    const res = await fetch(`${FB_GRAPH}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, url: imageUrl, access_token: token }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Fallback to text-only on image error
      console.warn('[meta-agent/facebook] Image post failed, falling back to text-only:', JSON.stringify(data));
      return publishToFacebook(content);
    }

    await prisma.socialPost.create({
      data: {
        platform: 'facebook',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: data.post_id ?? data.id ?? '',
      },
    });

    return { success: true, postId: data.post_id ?? data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[meta-agent/facebook/image]', errorMsg);

    await prisma.socialPost.create({
      data: { platform: 'facebook', content, status: 'failed', errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}

export async function publishToInstagram(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!igId || !token) {
    return { success: false, error: 'INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN not configured' };
  }

  if (await alreadyPublishedToday('instagram')) {
    return { success: false, error: 'Already published to Instagram today — skipping to avoid duplicate' };
  }

  try {
    const caption = stripMarkdown(content);

    // Try category image first, fall back to default.jpg
    async function createContainer(imageUrl: string) {
      return fetch(`${IG_GRAPH}/${igId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
      });
    }

    let containerRes = await createContainer(getSocialImageUrl());
    let containerData = await containerRes.json();

    if (!containerRes.ok && (containerData?.error?.code === 9004 || containerRes.status === 400)) {
      containerRes = await createContainer(getFallbackImageUrl());
      containerData = await containerRes.json();
    }

    if (!containerRes.ok) {
      throw new Error(`Instagram container error ${containerRes.status}: ${JSON.stringify(containerData)}`);
    }

    const creationId: string = containerData.id;

    // Wait for container to be ready (poll status_code until FINISHED)
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(
        `${IG_GRAPH}/${creationId}?fields=status_code&access_token=${token}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === 'FINISHED') { ready = true; break; }
      if (statusData.status_code === 'ERROR' || statusData.status_code === 'EXPIRED') {
        throw new Error(`Instagram container status: ${statusData.status_code}`);
      }
    }
    if (!ready) throw new Error('Instagram container timed out (not FINISHED after 30s)');

    // Step 2: publish
    const publishRes = await fetch(`${IG_GRAPH}/${igId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
    });

    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      throw new Error(`Instagram publish error ${publishRes.status}: ${JSON.stringify(publishData)}`);
    }

    await prisma.socialPost.create({
      data: {
        platform: 'instagram',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: publishData.id ?? '',
      },
    });

    return { success: true, postId: publishData.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[meta-agent/instagram]', errorMsg);

    await prisma.socialPost.create({
      data: { platform: 'instagram', content, status: 'failed', errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}
