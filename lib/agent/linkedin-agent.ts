import { prisma } from '@/lib/prisma';

const LI_API = 'https://api.linkedin.com/v2';

async function getAuthorUrn(): Promise<string> {
  // Prefer env var (set once after OAuth) to avoid extra API call + scope issues
  const envId = process.env.LINKEDIN_MEMBER_ID;
  if (envId) return `urn:li:person:${envId}`;

  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN not configured');

  // Fallback: try OpenID userinfo (requires openid scope)
  const res = await fetch(`${LI_API}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`LinkedIn /userinfo error: ${res.status} — set LINKEDIN_MEMBER_ID env var`);
  const data = await res.json();
  const id: string = data.sub ?? '';
  if (!id) throw new Error('LinkedIn /userinfo returned no sub — set LINKEDIN_MEMBER_ID env var');
  return `urn:li:person:${id}`;
}

export async function publishToLinkedIn(content: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    return { success: false, error: 'LINKEDIN_ACCESS_TOKEN not configured' };
  }

  try {
    const authorUrn = await getAuthorUrn();

    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const res = await fetch(`${LI_API}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LinkedIn ugcPosts error ${res.status}: ${err}`);
    }

    const postId = res.headers.get('x-restli-id') ?? '';

    await prisma.socialPost.create({
      data: {
        platform: 'linkedin',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: postId,
      },
    });

    return { success: true, postId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[linkedin-agent]', errorMsg);

    await prisma.socialPost.create({
      data: { platform: 'linkedin', content, status: 'failed', errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}
