import { createHmac } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getHumanImageUrl } from '@/lib/agent/linkedin-agent';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';
const IG_GRAPH = 'https://graph.instagram.com/v19.0';
const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');

// --- Anti-detection helpers ---

// appsecret_proof: HMAC-SHA256(app_secret, access_token)
// Proves to Meta that the call comes from a server holding the app secret,
// not from a leaked token. Elevates trust level and reduces security challenges.
function appsecretProof(accessToken: string): string | null {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return null;
  return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

// Build body with appsecret_proof injected when available
function buildFbBody(fields: Record<string, unknown>, token: string): string {
  const proof = appsecretProof(token);
  return JSON.stringify({
    ...fields,
    access_token: token,
    ...(proof ? { appsecret_proof: proof } : {}),
  });
}

// Random delay (0..maxSeconds) to break predictable timing patterns
function randomDelay(maxSeconds: number): Promise<void> {
  const ms = Math.floor(Math.random() * maxSeconds * 1000);
  return new Promise(r => setTimeout(r, ms));
}

// --- Content helpers ---

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
    where: { platform, status: { in: ['published', 'scheduled'] }, createdAt: { gte: start } },
  });
  return count > 0;
}

// --- Facebook publishing ---

export async function publishToFacebook(
  content: string,
  opts: { skipDuplicateCheck?: boolean } = {}
): Promise<{ success: boolean; postId?: string; blocked?: boolean; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { success: false, error: 'META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured' };
  }

  if (!opts.skipDuplicateCheck && await alreadyPublishedToday('facebook')) {
    return { success: false, error: 'Already published to Facebook today — skipping to avoid duplicate' };
  }

  try {
    await randomDelay(12);

    const message = stripMarkdown(content);
    const res = await fetch(`${FB_GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildFbBody({ message }, token),
    });

    const data = await res.json();

    if (!res.ok) {
      const isBlocked = data?.error?.code === 190;
      const errorMsg = `Facebook API error ${res.status}: ${JSON.stringify(data)}`;

      if (isBlocked) {
        await prisma.socialPost.create({
          data: { platform: 'facebook', content, status: 'pending_retry', errorMsg },
        });
        return { success: false, blocked: true, error: errorMsg };
      }

      throw new Error(errorMsg);
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
): Promise<{ success: boolean; postId?: string; blocked?: boolean; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { success: false, error: 'META_PAGE_ID or META_PAGE_ACCESS_TOKEN not configured' };
  }

  if (await alreadyPublishedToday('facebook')) {
    return { success: false, error: 'Already published to Facebook today — skipping to avoid duplicate' };
  }

  try {
    await randomDelay(12);

    const caption = stripMarkdown(content);
    const res = await fetch(`${FB_GRAPH}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildFbBody({ caption, url: imageUrl }, token),
    });

    const data = await res.json();

    if (!res.ok) {
      console.warn('[meta-agent/facebook] Image post failed, falling back to text-only:', JSON.stringify(data));
      return publishToFacebook(content, { skipDuplicateCheck: true });
    }

    await prisma.socialPost.create({
      data: {
        platform: 'facebook',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: data.post_id ?? data.id ?? '',
        imageUrl,
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

// Retry the most recent pending_retry Facebook post — called from evening cron
export async function retryPendingFacebookPost(): Promise<{ success: boolean; postId?: string; skipped?: boolean; error?: string }> {
  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) return { success: false, error: 'META credentials not configured' };

  const pending = await prisma.socialPost.findFirst({
    where: { platform: 'facebook', status: 'pending_retry' },
    orderBy: { createdAt: 'desc' },
  });

  if (!pending) return { success: false, skipped: true };

  try {
    await randomDelay(15);

    const message = stripMarkdown(pending.content);
    const res = await fetch(`${FB_GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildFbBody({ message }, token),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = `Facebook retry error ${res.status}: ${JSON.stringify(data)}`;
      await prisma.socialPost.update({
        where: { id: pending.id },
        data: { status: 'failed', errorMsg },
      });
      return { success: false, error: errorMsg };
    }

    await prisma.socialPost.update({
      where: { id: pending.id },
      data: { status: 'published', publishedAt: new Date(), bufferId: data.id ?? '' },
    });

    return { success: true, postId: data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.socialPost.update({
      where: { id: pending.id },
      data: { status: 'failed', errorMsg },
    });
    return { success: false, error: errorMsg };
  }
}

// --- Instagram publishing ---

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

    const humanImg = await getHumanImageUrl('instagram');
    const primaryImageUrl = humanImg ?? getSocialImageUrl();

    async function createContainer(imgUrl: string) {
      return fetch(`${IG_GRAPH}/${igId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imgUrl, caption, access_token: token }),
      });
    }

    let usedImageUrl = primaryImageUrl;
    let containerRes = await createContainer(primaryImageUrl);
    let containerData = await containerRes.json();

    if (!containerRes.ok && (containerData?.error?.code === 9004 || containerRes.status === 400)) {
      usedImageUrl = getFallbackImageUrl();
      containerRes = await createContainer(usedImageUrl);
      containerData = await containerRes.json();
    }

    if (!containerRes.ok) {
      throw new Error(`Instagram container error ${containerRes.status}: ${JSON.stringify(containerData)}`);
    }

    const creationId: string = containerData.id;

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
        imageUrl: usedImageUrl,
        bufferId: publishData.id ?? '',
      },
    });

    return { success: true, postId: publishData.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[meta-agent/instagram]', errorMsg);

    const humanImg = await getHumanImageUrl('instagram').catch(() => null);
    const attemptedImage = humanImg ?? getSocialImageUrl();
    await prisma.socialPost.create({
      data: { platform: 'instagram', content, status: 'failed', errorMsg, imageUrl: attemptedImage },
    });

    return { success: false, error: errorMsg };
  }
}
