import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

const LI_API = 'https://api.linkedin.com/v2';
const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');

async function getAuthorUrn(): Promise<string> {
  const envId = process.env.LINKEDIN_MEMBER_ID;
  if (envId) return `urn:li:person:${envId}`;

  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) throw new Error('LINKEDIN_ACCESS_TOKEN not configured');

  const res = await fetch(`${LI_API}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`LinkedIn /userinfo error: ${res.status} — set LINKEDIN_MEMBER_ID env var`);
  const data = await res.json();
  const id: string = data.sub ?? '';
  if (!id) throw new Error('LinkedIn /userinfo returned no sub — set LINKEDIN_MEMBER_ID env var');
  return `urn:li:person:${id}`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s/g, '');
}

// Carpetas con imágenes humanas/de marca (se irán ampliando)
const HUMAN_IMAGE_FOLDERS = ['javier', 'oficina'];

// Devuelve URL de imagen humana aleatoria si existe alguna, o null
// Convención de nombres:
//   169_* → formato 16:9 (LinkedIn y Facebook, NO Instagram)
//   43_*  → formato 4:3  (LinkedIn y Facebook, NO Instagram)
//   resto → square/portrait (todas las plataformas)

export async function getRecentlyUsedImages(days = 30): Promise<string[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const posts = await prisma.socialPost.findMany({
      where: { imageUrl: { not: null }, publishedAt: { gte: since } },
      select: { imageUrl: true },
    });
    return posts.map(p => p.imageUrl!).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getHumanImageUrl(platform: 'linkedin' | 'facebook' | 'instagram' = 'linkedin'): Promise<string | null> {
  try {
    const imagesBase = path.join(process.cwd(), 'public', 'social-images');
    const recentlyUsed = await getRecentlyUsedImages();
    const candidates: { folder: string; file: string }[] = [];

    for (const folder of HUMAN_IMAGE_FOLDERS) {
      const dir = path.join(imagesBase, folder);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(f)) return false;
        if (platform === 'instagram' && /\.webp$/i.test(f)) return false;
        if (platform === 'instagram' && (f.startsWith('169_') || f.startsWith('43_'))) return false;
        return true;
      });
      for (const file of files) candidates.push({ folder, file });
    }

    if (candidates.length === 0) return null;

    // Prefer images not used recently; fall back to all if all have been used
    const unused = candidates.filter(
      c => !recentlyUsed.includes(`${BASE_URL}/social-images/${c.folder}/${c.file}`)
    );
    const pool = unused.length > 0 ? unused : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return `${BASE_URL}/social-images/${pick.folder}/${pick.file}`;
  } catch {
    return null;
  }
}

// Sube imagen a LinkedIn y devuelve el asset URN
async function uploadImageToLinkedIn(imageUrl: string, authorUrn: string, token: string): Promise<string | null> {
  try {
    // Step 1: Register upload
    const registerRes = await fetch(`${LI_API}/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          }],
        },
      }),
    });

    if (!registerRes.ok) return null;
    const registerData = await registerRes.json();
    const uploadUrl: string = registerData?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl ?? '';
    const assetUrn: string = registerData?.value?.asset ?? '';
    if (!uploadUrl || !assetUrn) return null;

    // Step 2: Download image and upload to LinkedIn
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const imgBuffer = await imgRes.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: imgBuffer,
    });

    if (!uploadRes.ok) return null;
    return assetUrn;
  } catch {
    return null;
  }
}

export async function publishToLinkedIn(content: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  content = stripMarkdown(content);
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return { success: false, error: 'LINKEDIN_ACCESS_TOKEN not configured' };

  try {
    const authorUrn = await getAuthorUrn();
    const imageUrl = await getHumanImageUrl('linkedin');

    // Try to upload image if available
    let assetUrn: string | null = null;
    if (imageUrl) {
      assetUrn = await uploadImageToLinkedIn(imageUrl, authorUrn, token);
    }

    const shareContent = assetUrn
      ? {
          shareCommentary: { text: content },
          shareMediaCategory: 'IMAGE',
          media: [{
            status: 'READY',
            description: { text: '' },
            media: assetUrn,
            title: { text: '' },
          }],
        }
      : {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        };

    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
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
        imageUrl: imageUrl ?? null,
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
