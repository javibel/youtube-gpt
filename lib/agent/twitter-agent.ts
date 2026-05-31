import { createHmac, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

const X_API = 'https://api.x.com/2';

function getCredentials() {
  return {
    apiKey: process.env.X_API_KEY?.trim() ?? '',
    apiSecret: process.env.X_API_SECRET?.trim() ?? '',
    accessToken: process.env.X_ACCESS_TOKEN?.trim() ?? '',
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET?.trim() ?? '',
  };
}

// ── OAuth 1.0a signing ──────────────────────────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthHeader(method: string, url: string, body?: Record<string, unknown>): string {
  const creds = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // Collect all params (OAuth + body for form-encoded, but for JSON body we don't include it)
  const allParams = { ...oauthParams };

  // Build base string
  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${header}`;
}

// ── Media upload (v1.1) ─────────────────────────────────────────────────────

const UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

function generateOAuthHeaderForForm(method: string, url: string, formParams: Record<string, string>): string {
  const creds = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // For multipart, only OAuth params go into signature base (not body params)
  // For form-urlencoded INIT/FINALIZE, include form params
  const allParams = { ...oauthParams, ...formParams };

  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams['oauth_signature'] = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${header}`;
}

async function uploadMediaFromUrl(imageUrl: string): Promise<string | null> {
  try {
    // Fetch the image bytes
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const totalBytes = buffer.length;

    // INIT
    const initParams: Record<string, string> = {
      command: 'INIT',
      media_type: 'image/png',
      total_bytes: totalBytes.toString(),
      media_category: 'tweet_image',
    };
    const initAuth = generateOAuthHeaderForForm('POST', UPLOAD_URL, initParams);
    const initRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': initAuth,
      },
      body: new URLSearchParams(initParams).toString(),
    });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(`Media INIT failed: ${JSON.stringify(initData)}`);
    const mediaId = initData.media_id_string;

    // APPEND (single chunk for images < 5MB)
    const boundary = `----boundary${randomBytes(8).toString('hex')}`;
    const appendOauthParams: Record<string, string> = {}; // multipart: no body params in signature
    const appendAuth = generateOAuthHeaderForForm('POST', UPLOAD_URL, appendOauthParams);

    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="command"\r\n\r\nAPPEND`,
      `--${boundary}\r\nContent-Disposition: form-data; name="media_id"\r\n\r\n${mediaId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n0`,
      `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${buffer.toString('base64')}`,
      `--${boundary}--`,
    ];
    const multipartBody = parts.join('\r\n');

    const appendRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': appendAuth,
      },
      body: multipartBody,
    });
    if (!appendRes.ok && appendRes.status !== 204) {
      const appendErr = await appendRes.text();
      throw new Error(`Media APPEND failed: ${appendErr}`);
    }

    // FINALIZE
    const finalizeParams: Record<string, string> = {
      command: 'FINALIZE',
      media_id: mediaId,
    };
    const finalizeAuth = generateOAuthHeaderForForm('POST', UPLOAD_URL, finalizeParams);
    const finalizeRes = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': finalizeAuth,
      },
      body: new URLSearchParams(finalizeParams).toString(),
    });
    const finalizeData = await finalizeRes.json();
    if (!finalizeRes.ok) throw new Error(`Media FINALIZE failed: ${JSON.stringify(finalizeData)}`);

    return mediaId;
  } catch (err) {
    console.error('[twitter-agent/media]', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Tweet publishing ────────────────────────────────────────────────────────

async function postTweet(
  text: string,
  replyToId?: string,
  mediaId?: string
): Promise<{ id: string; text: string }> {
  const url = `${X_API}/tweets`;
  const body: Record<string, unknown> = { text };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }
  if (mediaId) {
    body.media = { media_ids: [mediaId] };
  }

  const authHeader = generateOAuthHeader('POST', url, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Twitter API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return { id: data.data.id, text: data.data.text };
}

// ── Thread parsing ──────────────────────────────────────────────────────────

function parseThread(content: string): string[] {
  // Match patterns like "TWEET 1:", "TWEET 2:", "1/", "2/", etc.
  const tweets: string[] = [];

  // Try "TWEET N:" format first
  const tweetBlocks = content.split(/TWEET\s+\d+\s*:/i);
  if (tweetBlocks.length > 2) {
    for (let i = 1; i < tweetBlocks.length; i++) {
      const text = tweetBlocks[i].trim();
      if (text) tweets.push(text);
    }
    return tweets.map(t => t.slice(0, 280));
  }

  // Try "N/" numbered format
  const numbered = content.split(/\n\s*\d+\//);
  if (numbered.length > 2) {
    for (let i = 1; i < numbered.length; i++) {
      const text = numbered[i].trim();
      if (text) tweets.push(`${i}/ ${text}`);
    }
    return tweets.map(t => t.slice(0, 280));
  }

  // Fallback: split by double newlines
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  for (const p of paragraphs) {
    const cleaned = p.trim();
    if (cleaned && cleaned.length <= 280) {
      tweets.push(cleaned);
    } else if (cleaned) {
      tweets.push(cleaned.slice(0, 280));
    }
  }

  return tweets.length > 0 ? tweets : [content.slice(0, 280)];
}

// ── Public API ──────────────────────────────────────────────────────────────

async function alreadyPublishedToday(): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const count = await prisma.socialPost.count({
    where: { platform: 'twitter', status: { in: ['published', 'scheduled'] }, createdAt: { gte: start } },
  });
  return count > 0;
}

export async function publishThreadToTwitter(
  content: string,
  imageUrl?: string
): Promise<{ success: boolean; tweetIds?: string[]; error?: string }> {
  const creds = getCredentials();
  if (!creds.apiKey || !creds.accessToken) {
    return { success: false, error: 'X_API_KEY or X_ACCESS_TOKEN not configured' };
  }

  if (await alreadyPublishedToday()) {
    return { success: false, error: 'Already published to Twitter today — skipping to avoid duplicate' };
  }

  const tweets = parseThread(content);
  if (tweets.length === 0) {
    return { success: false, error: 'No tweets parsed from content' };
  }

  try {
    // Upload infographic image for the first tweet
    const mediaId = imageUrl ? await uploadMediaFromUrl(imageUrl) : null;

    const tweetIds: string[] = [];
    let previousId: string | undefined;

    for (let i = 0; i < tweets.length; i++) {
      // Small delay between tweets to look natural
      if (previousId) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      }

      // Attach image only to first tweet
      const result = await postTweet(tweets[i], previousId, i === 0 ? mediaId ?? undefined : undefined);
      tweetIds.push(result.id);
      previousId = result.id;
    }

    await prisma.socialPost.create({
      data: {
        platform: 'twitter',
        content,
        status: 'published',
        publishedAt: new Date(),
        bufferId: tweetIds[0],
      },
    });

    return { success: true, tweetIds };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[twitter-agent]', errorMsg);

    await prisma.socialPost.create({
      data: { platform: 'twitter', content, status: 'failed', errorMsg },
    });

    return { success: false, error: errorMsg };
  }
}
