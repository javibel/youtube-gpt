import { prisma } from '@/lib/prisma';

const GRAPH = 'https://graph.facebook.com/v19.0';
const BASE_URL = process.env.NEXTAUTH_URL ?? 'https://ytubviral.com';

function buildInstagramImageUrl(text: string): string {
  const encoded = encodeURIComponent(text.slice(0, 220));
  return `${BASE_URL}/api/og/instagram?text=${encoded}`;
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
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, access_token: token }),
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
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!igId || !token) {
    return { success: false, error: 'INSTAGRAM_ACCOUNT_ID or META_PAGE_ACCESS_TOKEN not configured' };
  }

  try {
    const imageUrl = buildInstagramImageUrl(content);

    // Step 1: create media container
    const containerRes = await fetch(`${GRAPH}/${igId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: content,
        access_token: token,
      }),
    });

    const containerData = await containerRes.json();

    if (!containerRes.ok) {
      throw new Error(`Instagram container error ${containerRes.status}: ${JSON.stringify(containerData)}`);
    }

    const creationId: string = containerData.id;

    // Step 2: publish
    const publishRes = await fetch(`${GRAPH}/${igId}/media_publish`, {
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
