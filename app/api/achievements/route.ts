import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// ── Achievement definitions ───────────────────────────────────────────────

export interface AchievementDef {
  key: string;
  icon: string;
  label: { es: string; en: string };
  desc: { es: string; en: string };
  category: 'milestone' | 'improvement' | 'streak' | 'learning';
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Milestones ──
  { key: 'first_video', icon: '/icons/clapperboard.webp', label: { es: 'Primer paso', en: 'First Step' }, desc: { es: 'Conecta tu canal de YouTube', en: 'Connect your YouTube channel' }, category: 'milestone' },
  { key: 'ten_videos', icon: '/icons/target.webp', label: { es: 'Creador constante', en: 'Consistent Creator' }, desc: { es: '10+ vídeos en tu canal', en: '10+ videos on your channel' }, category: 'milestone' },
  { key: 'hundred_subs', icon: '/icons/community.webp', label: { es: 'Primera comunidad', en: 'First Community' }, desc: { es: 'Alcanza 100 suscriptores', en: 'Reach 100 subscribers' }, category: 'milestone' },
  { key: 'thousand_subs', icon: '/icons/trophy.webp', label: { es: 'Club de los 1K', en: '1K Club' }, desc: { es: 'Alcanza 1.000 suscriptores', en: 'Reach 1,000 subscribers' }, category: 'milestone' },

  // ── Improvement ──
  { key: 'first_optimize', icon: '/icons/magic-wand.webp', label: { es: 'Optimizador', en: 'Optimizer' }, desc: { es: 'Optimiza tu primer vídeo', en: 'Optimize your first video' }, category: 'improvement' },
  { key: 'seo_70', icon: '/icons/magnifying-glass.webp', label: { es: 'SEO Pro', en: 'SEO Pro' }, desc: { es: 'Consigue un SEO Score de 70+', en: 'Get a SEO Score of 70+' }, category: 'improvement' },
  { key: 'seo_90', icon: '/icons/diamond.webp', label: { es: 'SEO Master', en: 'SEO Master' }, desc: { es: 'Consigue un SEO Score de 90+', en: 'Get a SEO Score of 90+' }, category: 'improvement' },
  { key: 'score_up_20', icon: '/icons/chart-up.webp', label: { es: 'Gran mejora', en: 'Big Improvement' }, desc: { es: 'Mejora un SEO Score en 20+ puntos', en: 'Improve a SEO Score by 20+ points' }, category: 'improvement' },
  { key: 'ab_winner', icon: '/icons/flask.webp', label: { es: 'Científico', en: 'Scientist' }, desc: { es: 'Completa un A/B test con ganador', en: 'Complete an A/B test with a winner' }, category: 'improvement' },

  // ── Streaks ──
  { key: 'streak_3', icon: '/icons/flame.webp', label: { es: 'En racha', en: 'On Fire' }, desc: { es: '3 días seguidos usando YTubViral', en: '3 consecutive days using YTubViral' }, category: 'streak' },
  { key: 'streak_7', icon: '/icons/lightning.webp', label: { es: 'Semana perfecta', en: 'Perfect Week' }, desc: { es: '7 días seguidos usando YTubViral', en: '7 consecutive days using YTubViral' }, category: 'streak' },
  { key: 'streak_30', icon: '/icons/crown.webp', label: { es: 'Dedicación total', en: 'Total Dedication' }, desc: { es: '30 días seguidos usando YTubViral', en: '30 consecutive days using YTubViral' }, category: 'streak' },

  // ── Learning ──
  { key: 'first_audit', icon: '/icons/clipboard.webp', label: { es: 'Autoconsciente', en: 'Self-Aware' }, desc: { es: 'Completa tu primera auditoría de canal', en: 'Complete your first channel audit' }, category: 'learning' },
  { key: 'trend_explorer', icon: '/icons/globe.webp', label: { es: 'Explorador', en: 'Explorer' }, desc: { es: 'Explora tendencias en 3 países diferentes', en: 'Explore trends in 3 different countries' }, category: 'learning' },
  { key: 'coach_5', icon: '/icons/brain.webp', label: { es: 'Aprendiz', en: 'Learner' }, desc: { es: 'Envía 5 mensajes al AI Coach', en: 'Send 5 messages to AI Coach' }, category: 'learning' },
  { key: 'coach_50', icon: '/icons/graduation.webp', label: { es: 'Estudiante avanzado', en: 'Advanced Student' }, desc: { es: 'Envía 50 mensajes al AI Coach', en: 'Send 50 messages to AI Coach' }, category: 'learning' },
  { key: 'all_tools', icon: '/icons/wrench.webp', label: { es: 'Herramientas dominadas', en: 'Tool Master' }, desc: { es: 'Usa todas las herramientas al menos una vez', en: 'Use every tool at least once' }, category: 'learning' },
];

// ── Check and unlock achievements ─────────────────────────────────────────

async function checkAndUnlock(userId: string): Promise<string[]> {
  const newlyUnlocked: string[] = [];

  // Get existing achievements
  const existing = await prisma.achievement.findMany({
    where: { userId },
    select: { key: true },
  });
  const unlocked = new Set(existing.map(a => a.key));

  // Helper
  async function tryUnlock(key: string, condition: boolean) {
    if (!unlocked.has(key) && condition) {
      await prisma.achievement.create({ data: { userId, key } }).catch(() => {});
      newlyUnlocked.push(key);
    }
  }

  // ── Check milestones ──
  const yt = await prisma.youtubeToken.findUnique({
    where: { userId },
    select: { channelId: true, subscribers: true, videoCount: true },
  });

  await tryUnlock('first_video', !!yt?.channelId);
  const videoCount = parseInt(String(yt?.videoCount || '0'), 10) || 0;
  const subscribers = parseInt(String(yt?.subscribers || '0'), 10) || 0;
  await tryUnlock('ten_videos', videoCount >= 10);
  await tryUnlock('hundred_subs', subscribers >= 100);
  await tryUnlock('thousand_subs', subscribers >= 1000);

  // ── Check improvement ──
  const optimizeCount = await prisma.optimizeHistory.count({ where: { userId } });
  await tryUnlock('first_optimize', optimizeCount > 0);

  const seoScores = await prisma.videoSeoScore.findMany({
    where: { userId },
    select: { score: true },
  });
  const maxSeo = seoScores.length > 0 ? Math.max(...seoScores.map(s => s.score)) : 0;
  await tryUnlock('seo_70', maxSeo >= 70);
  await tryUnlock('seo_90', maxSeo >= 90);

  // Check score improvement (optimize history)
  const improvements = await prisma.optimizeHistory.findMany({
    where: { userId, scoreBefore: { not: null }, scoreAfter: { not: null } },
    select: { scoreBefore: true, scoreAfter: true },
  });
  const bigImprovement = improvements.some(h => (h.scoreAfter || 0) - (h.scoreBefore || 0) >= 20);
  await tryUnlock('score_up_20', bigImprovement);

  // A/B test winner
  const abWinner = await prisma.abTest.count({
    where: { userId, winner: { not: null } },
  });
  await tryUnlock('ab_winner', abWinner > 0);

  // ── Check streaks ──
  const recentGens = await prisma.generation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { createdAt: true },
  });
  const recentChats = await prisma.chatMessage.findMany({
    where: { userId, role: 'user' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { createdAt: true },
  });

  // Merge all activity dates
  const activityDates = new Set<string>();
  for (const g of recentGens) activityDates.add(g.createdAt.toISOString().slice(0, 10));
  for (const c of recentChats) activityDates.add(c.createdAt.toISOString().slice(0, 10));

  // Calculate streak from today backwards
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 31; i++) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (activityDates.has(d)) {
      streak++;
    } else if (i > 0) {
      break; // Gap found
    }
  }

  await tryUnlock('streak_3', streak >= 3);
  await tryUnlock('streak_7', streak >= 7);
  await tryUnlock('streak_30', streak >= 30);

  // ── Check learning ──
  const chatCount = await prisma.chatMessage.count({ where: { userId, role: 'user' } });
  await tryUnlock('coach_5', chatCount >= 5);
  await tryUnlock('coach_50', chatCount >= 50);

  return newlyUnlocked;
}

// ── GET: list user's achievements + check for new ones ─────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Check and unlock any new achievements
  const newlyUnlocked = await checkAndUnlock(session.user.id);

  // Get all unlocked
  const unlocked = await prisma.achievement.findMany({
    where: { userId: session.user.id },
    select: { key: true, unlockedAt: true },
    orderBy: { unlockedAt: 'desc' },
  });

  const unlockedMap = new Map(unlocked.map(a => [a.key, a.unlockedAt]));

  const achievements = ACHIEVEMENTS.map(def => ({
    ...def,
    unlocked: unlockedMap.has(def.key),
    unlockedAt: unlockedMap.get(def.key)?.toISOString() || null,
  }));

  return NextResponse.json({
    achievements,
    totalUnlocked: unlocked.length,
    totalAvailable: ACHIEVEMENTS.length,
    newlyUnlocked,
  });
}
