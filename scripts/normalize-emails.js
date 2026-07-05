'use strict';
/**
 * Normaliza User.email a minúsculas (A9, 2026-07-05) — signup/login/Google ya escriben
 * en minúsculas desde ahora; este script limpia las cuentas creadas antes del fix.
 *
 *   node scripts/normalize-emails.js            → dry-run, no toca nada
 *   node scripts/normalize-emails.js --apply    → aplica los cambios
 *
 * Las tablas de tokens (email_verification_tokens, password_reset_tokens) son de vida
 * corta (15 min / 1h) y se regeneran ya en minúsculas — no necesitan migración.
 */
const fs = require('fs');
for (const f of ['.env.local', '.env', '.env.production']) {
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const apply = process.argv.includes('--apply');

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const toFix = users.filter(u => u.email !== u.email.toLowerCase());

  if (toFix.length === 0) {
    console.log('Nada que normalizar — todos los emails ya están en minúsculas.');
    await prisma.$disconnect();
    return;
  }

  // Detectar colisiones: si dos cuentas distintas comparten la misma versión en minúsculas,
  // no las tocamos — hay que decidir a mano cuál es la "real" (fusión manual, no automática).
  const byLower = new Map();
  for (const u of users) {
    const lower = u.email.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, []);
    byLower.get(lower).push(u);
  }
  const collisions = [...byLower.entries()].filter(([, group]) => group.length > 1);

  if (collisions.length > 0) {
    console.log(`⚠️  ${collisions.length} colisión(es) detectada(s) — NO se tocan, decide a mano:\n`);
    for (const [lower, group] of collisions) {
      console.log(`  ${lower}:`);
      for (const u of group) console.log(`    - id=${u.id} email="${u.email}"`);
    }
    console.log('');
  }

  const collidingIds = new Set(collisions.flatMap(([, group]) => group.map(u => u.id)));
  const safeToFix = toFix.filter(u => !collidingIds.has(u.id));

  console.log(`${safeToFix.length} cuenta(s) para normalizar${apply ? '' : ' (dry-run, nada aplicado)'}:\n`);
  for (const u of safeToFix) {
    console.log(`  "${u.email}" → "${u.email.toLowerCase()}"`);
    if (apply) {
      await prisma.user.update({ where: { id: u.id }, data: { email: u.email.toLowerCase() } });
    }
  }

  console.log(apply ? '\n✅ Aplicado.' : '\n(pasa --apply para ejecutar de verdad)');
  await prisma.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
