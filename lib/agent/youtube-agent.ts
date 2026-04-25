import { prisma } from '@/lib/prisma';
import { generateYoutubeReply } from './content-generator';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const API_KEY = () => process.env.YOUTUBE_API_KEY ?? '';
const CHANNEL_ID = () => process.env.YOUTUBE_CHANNEL_ID ?? '';

// ── OAuth helper (for posting replies) ───────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`YouTube OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

// ── YouTube API helpers ───────────────────────────────────────────────────────

interface CommentThread {
  id: string;
  snippet: {
    topLevelComment: {
      id: string;
      snippet: {
        textDisplay: string;
        authorDisplayName: string;
        publishedAt: string;
        likeCount: number;
      };
    };
    totalReplyCount: number;
    videoId: string;
  };
}

async function getNewCommentThreads(): Promise<CommentThread[]> {
  const channelId = CHANNEL_ID();
  const apiKey = API_KEY();
  if (!channelId || !apiKey) return [];

  const url = new URL(`${YT_BASE}/commentThreads`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('allThreadsRelatedToChannelId', channelId);
  url.searchParams.set('order', 'time');
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube commentThreads error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return (data.items ?? []) as CommentThread[];
}

async function postCommentReply(
  parentCommentId: string,
  replyText: string,
  accessToken: string
): Promise<string> {
  const res = await fetch(`${YT_BASE}/comments?part=snippet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      snippet: {
        parentId: parentCommentId,
        textOriginal: replyText,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube reply error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.id as string;
}

// ── Check if already replied ──────────────────────────────────────────────────

async function alreadyReplied(commentId: string): Promise<boolean> {
  const existing = await prisma.socialMessage.findFirst({
    where: { platform: 'youtube', fromUser: { contains: commentId } },
  });
  return !!existing;
}

// ── Main agent function ───────────────────────────────────────────────────────

export interface YoutubeAgentResult {
  processed: number;
  replied: number;
  errors: string[];
}

export async function runYoutubeAgent(): Promise<YoutubeAgentResult> {
  const result: YoutubeAgentResult = { processed: 0, replied: 0, errors: [] };

  const threads = await getNewCommentThreads();
  if (threads.length === 0) return result;

  // Only get access token if there's something to reply to
  let accessToken: string | null = null;

  for (const thread of threads) {
    const comment = thread.snippet.topLevelComment;
    const commentId = comment.id;
    const authorName = comment.snippet.authorDisplayName;
    const text = comment.snippet.textDisplay;

    try {
      result.processed++;

      // Skip already processed comments
      if (await alreadyReplied(commentId)) continue;

      // Skip very short or spam-like comments
      if (text.length < 3) continue;

      // Get access token lazily
      if (!accessToken) {
        try {
          accessToken = await getAccessToken();
        } catch (err) {
          result.errors.push(`OAuth failed: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
      }

      // Generate reply
      const replyText = await generateYoutubeReply(text, authorName);

      // Post reply
      await postCommentReply(commentId, replyText, accessToken);

      // Save to DB
      await prisma.socialMessage.create({
        data: {
          platform: 'youtube',
          fromUser: `${authorName} (${commentId})`,
          content: text.slice(0, 1000),
          replied: true,
          replyContent: replyText,
          repliedAt: new Date(),
        },
      });

      result.replied++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Comment ${commentId}: ${errMsg}`);
      console.error('[youtube-agent]', errMsg);
    }
  }

  return result;
}
