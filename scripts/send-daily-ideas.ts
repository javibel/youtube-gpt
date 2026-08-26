/**
 * Regenerate today's daily ideas with the current prompt and deliver them.
 *
 * Today's rows were written by the 06:03 UTC cron, before the prompt was aligned to
 * the Title Analyzer rubric, so they carry the weaker titles. This drops them and
 * regenerates before sending.
 *
 * Run:  npx tsx scripts/send-daily-ideas.ts --dry
 *       npx tsx scripts/send-daily-ideas.ts --send
 */
import { readFileSync } from 'fs';

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* optional */ }
}

async function main() {
  const send = process.argv.includes('--send');
  const dry = process.argv.includes('--dry') || !send;

  const { prisma } = await import('../lib/prisma');
  const { generateDailyIdeas } = await import('../lib/daily-ideas');
  const { sendDailyIdeasEmails } = await import('../lib/daily-ideas-email');

  const today = new Date().toISOString().slice(0, 10);

  const connected = await prisma.youtubeToken.findMany({
    where: { channelId: { not: null } },
    select: { userId: true, user: { select: { email: true } } },
  });
  console.log(`Canales conectados: ${connected.length}`);

  const stale = await prisma.dailyIdea.deleteMany({
    where: { date: today, userId: { in: connected.map(c => c.userId) } },
  });
  console.log(`Ideas de hoy eliminadas (pre-arreglo): ${stale.count}`);

  const generated = await generateDailyIdeas();
  console.log(`Ideas regeneradas con el prompt nuevo: ${generated}`);

  const sent = await sendDailyIdeasEmails({ dryRun: dry });
  console.log(`\n${dry ? 'DRY-RUN — se habrían enviado' : 'ENVIADOS'}: ${sent}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
