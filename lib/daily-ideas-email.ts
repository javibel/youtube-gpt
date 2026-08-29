/**
 * Daily ideas briefing.
 *
 * The morning cron generated personalized ideas and only ever wrote them to the
 * database — no email, no notification — so users who connected a channel got
 * nothing back and stopped returning. This delivers them.
 *
 * Deliberately NOT the paused reengagement email (lib/agent/reengagement-email.ts):
 * that one asks people to come back, and the "react" lifecycle sequence proved that
 * asking does not work (53 sends, 0 returns). This one carries the product itself.
 */
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';
import { signUnsubscribe } from '@/lib/email-token';
import { analyzeTitle, detectCreatorLang, type Lang } from '@/lib/title-score';
import { isInternalAccount } from '@/lib/internal-accounts';

// Hardcoded like lib/lifecycle-emails.ts, NOT read from NEXTAUTH_URL: an email is
// always opened outside this process, so a localhost link is never useful. Deriving
// it from the environment sent a real batch with every link — including unsubscribe —
// pointing at http://localhost:3011 when the send was run from a dev machine.
const BASE = 'https://ytubviral.com';

export interface DailyIdea {
  title_es?: string;
  title_en?: string;
  idea_es?: string;
  idea_en?: string;
}

const T = {
  es: {
    toolName: 'Analizador de Títulos',
    heading: (n: number) => `${n} ideas para tu canal`,
    why: 'Conectaste tu canal, así que cada mañana miramos lo que has ido publicando y te proponemos qué podría funcionar a continuación.',
    scoreLine: (tool: string, href: string) =>
      `El número junto a cada título es su puntuación en nuestro <a href="${href}" style="color:#e84d5b;text-decoration:none;font-weight:600;">${tool}</a> gratuito — la comprobación de 0 a 100 que puedes pasarle a cualquier título antes de publicar.`,
    cta: 'Montar una de estas →',
    footerWhy: (d: string) => `Recibes esto porque conectaste tu canal el ${d}. Un email cada mañana.`,
    terms: 'Términos',
    privacy: 'Privacidad',
    unsub: 'Dejar de recibir las ideas diarias',
    subjectTail: (n: number) => `y ${n} ideas más para hoy`,
  },
  en: {
    toolName: 'Title Analyzer',
    heading: (n: number) => `${n} ideas for your channel`,
    why: "You connected your channel, so every morning we look at what you've been publishing and suggest what could work next.",
    scoreLine: (tool: string, href: string) =>
      `The number beside each title is its score in our free <a href="${href}" style="color:#e84d5b;text-decoration:none;font-weight:600;">${tool}</a> — the 0-100 check you can run on any title before you publish.`,
    cta: 'Build one of these →',
    footerWhy: (d: string) => `You get this because you connected your channel on ${d}. One email each morning.`,
    terms: 'Terms',
    privacy: 'Privacy',
    unsub: 'Stop the daily ideas',
    subjectTail: (n: number) => `and ${n} more for today`,
  },
} as const;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pickTitle(idea: DailyIdea, lang: Lang): string {
  return (lang === 'es' ? idea.title_es : idea.title_en) || idea.title_en || idea.title_es || '';
}
function pickBody(idea: DailyIdea, lang: Lang): string {
  return (lang === 'es' ? idea.idea_es : idea.idea_en) || idea.idea_en || idea.idea_es || '';
}

function formatDate(d: Date, lang: Lang): string {
  const s = d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ideaCard(idea: DailyIdea, lang: Lang, isLast: boolean): string {
  const title = pickTitle(idea, lang);
  // Score the title in the language it is actually written in — reusing the other
  // language's score would print a number that does not match the title shown.
  const { score, checks } = analyzeTitle(title);
  const good = score >= 85;
  const badge = `<span style="display:inline-block;background:${good ? 'rgba(34,197,94,0.14)' : 'rgba(250,204,21,0.14)'};color:${good ? '#4ade80' : '#fbbf24'};font-size:12px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:4px;">${score}</span>`;
  const weakest = checks.filter(c => c.earned < c.weight && c.tip[lang]).sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned))[0];
  const hint = !good && weakest
    ? `<p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;font-style:italic;">${esc(weakest.tip[lang])}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${isLast ? 28 : 14}px;"><tr><td style="background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-left:3px solid #e84d5b;border-radius:8px;padding:18px 20px;">
  <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#ffffff;line-height:1.4;">${esc(title)} ${badge}</p>
  <p style="margin:0${hint ? ' 0 8px' : ''};font-size:13px;color:#a1a1aa;line-height:1.65;">${esc(pickBody(idea, lang))}</p>
  ${hint}
</td></tr></table>`;
}

export function buildDailyIdeasEmail(
  ideas: DailyIdea[], lang: Lang, connectedAt: Date, unsubUrl: string,
): { subject: string; html: string } {
  const t = T[lang];
  const lead = pickTitle(ideas[0], lang);
  const subject = `${lang === 'es' ? '«' : '“'}${lead}${lang === 'es' ? '»' : '”'} ${t.subjectTail(ideas.length - 1)}`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
        <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">${formatDate(new Date(), lang)}</p>
        <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">${t.heading(ideas.length)}</p>
        <p style="margin:0 0 12px;font-size:15px;color:#a1a1aa;line-height:1.7;">${t.why}</p>
        <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.7;">${t.scoreLine(t.toolName, `${BASE}/title-analyzer`)}</p>
        ${ideas.map((i, n) => ideaCard(i, lang, n === ideas.length - 1)).join('\n')}
        <a href="${BASE}/dashboard" style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:10px;">${t.cta}</a>
        <p style="margin:24px 0 0;font-size:14px;color:#71717a;">YTubViral</p>
      </td></tr>
      <tr><td style="padding:24px 8px 0;text-align:center;">
        <p style="margin:0 0 8px;font-size:11px;color:#52525b;font-family:monospace;line-height:1.6;">${t.footerWhy(formatDate(connectedAt, lang))}</p>
        <p style="margin:0 0 6px;font-size:11px;color:#3f3f46;font-family:monospace;">
          <a href="${BASE}/terms" style="color:#52525b;text-decoration:none;">${t.terms}</a> &middot;
          <a href="${BASE}/privacy" style="color:#52525b;text-decoration:none;">${t.privacy}</a>
        </p>
        <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">
          <a href="${unsubUrl}" style="color:#52525b;text-decoration:underline;">${t.unsub}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

/** Sends today's briefing. Returns how many went out. */
export async function sendDailyIdeasEmails(opts: { dryRun?: boolean; onlyUserIds?: string[] } = {}): Promise<number> {
  // Last line of defence: never let a batch go out with dead links, whatever BASE
  // ends up being.
  if (!opts.dryRun && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(BASE)) {
    throw new Error(`[daily-ideas-email] Refusing to send: BASE is not a public URL (${BASE})`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await prisma.dailyIdea.findMany({
    where: { date: today, ...(opts.onlyUserIds ? { userId: { in: opts.onlyUserIds } } : {}) },
    include: { user: { select: { id: true, email: true, lang: true, marketingOptOut: true } } },
  });

  let sent = 0;
  for (const row of rows) {
    const u = row.user;
    if (!u?.email || u.marketingOptOut) continue;
    if (isInternalAccount(u.email)) continue; // cuentas internas/de prueba — no gastar envío

    const ideas = (Array.isArray(row.ideas) ? row.ideas : []) as unknown as DailyIdea[];
    if (!ideas.length) continue;

    const token = await prisma.youtubeToken.findUnique({ where: { userId: u.id }, select: { createdAt: true } });
    if (!token) continue; // ideas only make sense for a connected channel

    // Judge language by what the creator actually publishes, not by User.lang,
    // which defaults to "es" for every account that never changed it.
    const recent = await prisma.generation.findMany({
      where: { userId: u.id, template: { in: ['title', 'description'] } },
      orderBy: { createdAt: 'desc' }, take: 10, select: { output: true },
    });
    const lang = detectCreatorLang(recent.map(r => r.output).filter(Boolean), u.lang);

    const unsubUrl = `${BASE}/api/email/unsubscribe?token=${signUnsubscribe(u.id)}`;
    const { subject, html } = buildDailyIdeasEmail(ideas, lang, token.createdAt, unsubUrl);

    if (opts.dryRun) {
      console.log(`[daily-ideas-email] DRY-RUN ${u.email} [${lang}] — ${subject}`);
      sent++;
      continue;
    }

    // Claim the slot BEFORE sending. EmailLog is unique on (userId, sequence, step),
    // so a second run on the same day loses the race and skips instead of sending a
    // duplicate — a daily briefing that arrives twice reads as broken.
    try {
      await prisma.emailLog.create({ data: { userId: u.id, sequence: 'daily-ideas', step: today } });
    } catch {
      console.log(`[daily-ideas-email] Already sent to ${u.email} today — skipping`);
      continue;
    }

    try {
      await sendTransactionalEmail({ to: u.email, subject, html });
      console.log(`[daily-ideas-email] Sent to ${u.email} [${lang}]`);
      sent++;
    } catch (err) {
      // Release the slot so the next run can retry.
      await prisma.emailLog.deleteMany({ where: { userId: u.id, sequence: 'daily-ideas', step: today } }).catch(() => {});
      console.error(`[daily-ideas-email] Failed for ${u.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
