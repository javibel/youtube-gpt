/**
 * One-off: resend today's briefing to the three real users whose first copy went
 * out with localhost links. Reuses the ideas already stored (they came from the
 * corrected prompt) — only the links were wrong.
 *
 * Run: npx tsx scripts/resend-daily-ideas.ts --send
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

const TARGETS = ['elenduobiora001@gmail.com', 'huzaifakyz123@gmail.com', 'go99vv@gmail.com'];

async function main() {
  const send = process.argv.includes('--send');
  const { prisma } = await import('../lib/prisma');
  const { sendDailyIdeasEmails } = await import('../lib/daily-ideas-email');

  const today = new Date().toISOString().slice(0, 10);
  const users = await prisma.user.findMany({
    where: { email: { in: TARGETS } },
    select: { id: true, email: true },
  });
  console.log(`Destinatarios encontrados: ${users.length}/${TARGETS.length}`);
  users.forEach(u => console.log(`   ${u.email}`));

  // Release today's idempotency claim for these three only, so the resend is allowed.
  const cleared = await prisma.emailLog.deleteMany({
    where: { userId: { in: users.map(u => u.id) }, sequence: 'daily-ideas', step: today },
  });
  console.log(`Marcas de envío liberadas: ${cleared.count}`);

  const sent = await sendDailyIdeasEmails({ dryRun: !send, onlyUserIds: users.map(u => u.id) });
  console.log(`\n${send ? 'REENVIADOS' : 'DRY-RUN — se reenviarían'}: ${sent}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
