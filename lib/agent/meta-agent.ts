import { prisma } from '@/lib/prisma';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';
const IG_GRAPH = 'https://graph.instagram.com/v19.0';
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

function getInstagramImageUrl(): string {
  const day = new Date().getDay();
  const category = DAY_CATEGORY[day] ?? 'motivacion';
  // Convention: images named 01.jpg, 02.jpg... up to 08.jpg per category
  // Falls back to default.jpg if category folder is empty
  const num = String((Math.floor(Math.random() * 8) + 1)).padStart(2, '0');
  // Use default until bank images are added
  return `${BASE_URL}/social-images/${category}/${num}.jpg`;
}

function getFallbackImageUrl(): string {
  return `${BASE_URL}/social-images/default.jpg`;
}

export async function publishToFacebook(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { success: false, error: 'META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured' };
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

export async function publishToInstagram(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!igId || !token) {
    return { success: false, error: 'INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN not configured' };
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

    let containerRes = await createContainer(getInstagramImageUrl());
    let containerData = await containerRes.json();

    if (!containerRes.ok && (containerData?.error?.code === 9004 || containerRes.status === 400)) {
      containerRes = await createContainer(getFallbackImageUrl());
      containerData = await containerRes.json();
    }

    if (!containerRes.ok) {
      throw new Error(`Instagram container error ${containerRes.status}: ${JSON.stringify(containerData)}`);
    }

    const creationId: string = containerData.id;

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
