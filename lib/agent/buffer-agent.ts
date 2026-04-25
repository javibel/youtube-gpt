import { prisma } from '@/lib/prisma';

const BUFFER_REST = 'https://api.bufferapp.com/1';

const PROFILE_IDS: Record<'facebook' | 'instagram' | 'linkedin', string> = {
  facebook: process.env.BUFFER_FACEBOOK_ID ?? '',
  instagram: process.env.BUFFER_INSTAGRAM_ID ?? '',
  linkedin: process.env.BUFFER_LINKEDIN_ID ?? '',
};

type BufferPlatform = 'facebook' | 'instagram' | 'linkedin';

// ── REST API v1 helper ────────────────────────────────────────────────────────

async function bufferPost(path: string, body: Record<string, string>) {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error('BUFFER_ACCESS_TOKEN not configured');

  const params = new URLSearchParams(body);

  const res = await fetch(`${BUFFER_REST}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    },
    body: params.toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Buffer API error ${res.status}: ${data?.message ?? JSON.stringify(data)}`
    );
  }

  return data;
}

// ── Publish a post to a single profile ───────────────────────────────────────

async function createUpdate(profileId: string, text: string): Promise<string> {
  const data = await bufferPost('/updates/create.json', {
    'profile_ids[]': profileId,
    text,
    now: 'true', // publish to queue immediately
  });

  // Buffer returns { updates: [{ id, ... }] }
  const updateId: string = data?.updates?.[0]?.id ?? data?.id ?? '';
  return updateId;
}

// ── Public function ───────────────────────────────────────────────────────────

export interface BufferResult {
  platform: BufferPlatform;
  success: boolean;
  bufferId?: string;
  error?: string;
}

export async function publishToBuffer(
  platform: BufferPlatform,
  content: string
): Promise<BufferResult> {
  const profileId = PROFILE_IDS[platform];
  if (!profileId) {
    return {
      platform,
      success: false,
      error: `BUFFER_${platform.toUpperCase()}_ID not configured`,
    };
  }

  try {
    const bufferId = await createUpdate(profileId, content);

    await prisma.socialPost.create({
      data: {
        platform,
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId,
      },
    });

    return { platform, success: true, bufferId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[buffer-agent] ${platform}:`, errorMsg);

    await prisma.socialPost.create({
      data: { platform, content, status: 'failed', errorMsg },
    });

    return { platform, success: false, error: errorMsg };
  }
}

export async function publishToAllChannels(
  contents: Partial<Record<BufferPlatform, string>>
): Promise<BufferResult[]> {
  const results: BufferResult[] = [];
  for (const [platform, content] of Object.entries(contents) as [
    BufferPlatform,
    string,
  ][]) {
    if (content) {
      const result = await publishToBuffer(platform, content);
      results.push(result);
    }
  }
  return results;
}
