import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAccessToken } from '@/lib/youtube-auth';
import { type Prisma } from '@prisma/client';
import { getUserPlan, isPaid } from '@/lib/plans';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const maxDuration = 60;

interface TopSlot {
  day: number;
  hour: number;
  score: number;
  videoCount: number;
}

// ── GET: return cached analysis ────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cached = await prisma.bestTimeAnalysis.findUnique({
    where: { userId: session.user.id },
  });

  if (!cached) return NextResponse.json({ data: null });

  return NextResponse.json({
    data: {
      heatmap: cached.heatmap,
      topSlots: cached.topSlots,
      videoCount: cached.videoCount,
      aiTip: cached.aiTip,
      analyzedAt: cached.analyzedAt.toISOString(),
    },
  });
}

// ── POST: run full analysis ────────────────────────────────────────────────

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Pro check
  const plan = await getUserPlan(session.user.id);
  if (!isPaid(plan)) {
    return NextResponse.json({ error: 'pro_required' }, { status: 403 });
  }

  const token = await getAccessToken(session.user.id);
  if (!token) {
    return NextResponse.json({ error: 'youtube_not_connected' }, { status: 400 });
  }

  try {
    // 1. Fetch last 50 video IDs
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!searchRes.ok) throw new Error(`YouTube search API error: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const videoIds: string[] = (searchData.items || []).map((i: { id: { videoId: string } }) => i.id.videoId);

    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'no_videos' }, { status: 400 });
    }

    // 2. Fetch video details (snippet + statistics)
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!videosRes.ok) throw new Error(`YouTube videos API error: ${videosRes.status}`);
    const videosData = await videosRes.json();

    // 3. Filter to last 6 months (extend to 12 if <10 videos)
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60 * 1000;

    interface VideoPoint {
      day: number;    // 0=Mon, 6=Sun
      hour: number;   // 0-23
      views: number;
      ageDays: number;
    }

    let points: VideoPoint[] = [];

    for (const v of videosData.items || []) {
      const publishedAt = new Date(v.snippet.publishedAt);
      const ts = publishedAt.getTime();
      if (ts < twelveMonthsAgo) continue;

      const views = parseInt(v.statistics.viewCount || '0', 10);
      const ageDays = Math.max(1, (now - ts) / (24 * 60 * 60 * 1000));

      // Convert to UTC day of week (0=Mon to 6=Sun)
      const jsDay = publishedAt.getUTCDay(); // 0=Sun
      const day = jsDay === 0 ? 6 : jsDay - 1;
      const hour = publishedAt.getUTCHours();

      points.push({ day, hour, views, ageDays });
    }

    // If we have enough recent videos, filter to 6 months only
    const recentPoints = points.filter(p => {
      const videoTs = now - p.ageDays * 24 * 60 * 60 * 1000;
      return videoTs >= sixMonthsAgo;
    });
    if (recentPoints.length >= 10) {
      points = recentPoints;
    }

    if (points.length < 3) {
      return NextResponse.json({ error: 'not_enough_videos', videoCount: points.length }, { status: 400 });
    }

    // 4. Normalize: viewVelocity = views / sqrt(ageDays)
    const velocities = points.map(p => ({
      ...p,
      velocity: p.views / Math.sqrt(p.ageDays),
    }));

    // 5. Build 7x24 matrix
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const v of velocities) {
      matrix[v.day][v.hour] += v.velocity;
      counts[v.day][v.hour]++;
    }

    // Average velocity per cell
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (counts[d][h] > 0) {
          matrix[d][h] = matrix[d][h] / counts[d][h];
        }
      }
    }

    // Scale to 0-100
    let maxVal = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (matrix[d][h] > maxVal) maxVal = matrix[d][h];
      }
    }
    const heatmap: number[][] = matrix.map(row =>
      row.map(val => (maxVal > 0 ? Math.round((val / maxVal) * 100) : 0)),
    );

    // 6. Top 3 slots (at least 4 hours apart)
    const allSlots: TopSlot[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (heatmap[d][h] > 0) {
          allSlots.push({ day: d, hour: h, score: heatmap[d][h], videoCount: counts[d][h] });
        }
      }
    }
    allSlots.sort((a, b) => b.score - a.score);

    const topSlots: TopSlot[] = [];
    for (const slot of allSlots) {
      if (topSlots.length >= 3) break;
      const tooClose = topSlots.some(
        t => t.day === slot.day && Math.abs(t.hour - slot.hour) < 4,
      );
      if (!tooClose) topSlots.push(slot);
    }

    // 7. AI tip
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const slotsDesc = topSlots
      .map((s, i) => `${i + 1}. ${dayNames[s.day]} at ${s.hour}:00 UTC (score: ${s.score}, ${s.videoCount} videos)`)
      .join('\n');

    let aiTip: { es: string; en: string } | null = null;
    try {
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `A YouTube creator's best publishing times based on ${points.length} videos analyzed:\n${slotsDesc}\n\nWrite a brief, actionable recommendation (1-2 sentences) about when they should publish and why these times work. Respond ONLY with JSON: {"es": "tip en español", "en": "tip in english"}`,
        }],
      });
      const raw = (aiRes.content[0].type === 'text' ? aiRes.content[0].text : '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      aiTip = JSON.parse(raw);
    } catch {
      // AI tip is optional — skip on error
    }

    // 8. Save
    await prisma.bestTimeAnalysis.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        heatmap: heatmap as unknown as Prisma.InputJsonValue,
        topSlots: topSlots as unknown as Prisma.InputJsonValue,
        videoCount: points.length,
        aiTip: aiTip as unknown as Prisma.InputJsonValue,
      },
      update: {
        heatmap: heatmap as unknown as Prisma.InputJsonValue,
        topSlots: topSlots as unknown as Prisma.InputJsonValue,
        videoCount: points.length,
        aiTip: aiTip as unknown as Prisma.InputJsonValue,
        analyzedAt: new Date(),
      },
    });

    return NextResponse.json({
      data: {
        heatmap,
        topSlots,
        videoCount: points.length,
        aiTip,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[best-time]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
