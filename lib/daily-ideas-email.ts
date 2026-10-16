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
import { randomUUID } from 'node:crypto';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';
import { runCronDailyIdeasEmail, type NativeCronDailyIdeasEmail } from '@/lib/cron-dispatch-original';
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
  ideas: DailyIdea[], lang: Lang, connectedAt: Date, unsubUrl: string, asOf = new Date(),
): { subject: string; html: string } {
  const t = T[lang];
  const lead = pickTitle(ideas[0], lang);
  const subject = `${lang === 'es' ? '«' : '“'}${lead}${lang === 'es' ? '»' : '”'} ${t.subjectTail(ideas.length - 1)}`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
        <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">${formatDate(asOf, lang)}</p>
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

const sourceSelect={id:true,userId:true,date:true,ideas:true,createdAt:true,user:{select:{id:true,email:true,lang:true,emailVerified:true,marketingOptOut:true,youtubeToken:{select:{id:true,channelId:true,createdAt:true}}}}} as const;
const readSource=(id:string)=>prisma.dailyIdea.findUnique({where:{id},select:sourceSelect});
type Source=NonNullable<Awaited<ReturnType<typeof readSource>>>;
function validIdeas(value:unknown):value is DailyIdea[] {
  return Array.isArray(value)&&value.length>0&&value.length<=5&&value.every(v=>!!v&&typeof v==='object'&&!Array.isArray(v)
    &&Object.keys(v).sort().join(',')==='idea_en,idea_es,title_en,title_es'&&Object.values(v).every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000));
}
function eligible(row:Source,date:string) {
  const u=row.user,t=u?.youtubeToken;
  return !!row.id&&row.date===date&&u?.id===row.userId&&!!u.email&&u.marketingOptOut===false
    &&u.emailVerified instanceof Date&&Number.isFinite(u.emailVerified.getTime())&&!isInternalAccount(u.email)
    &&!!t?.id&&!!t.channelId&&Number.isFinite(t.createdAt.getTime())&&Number.isFinite(row.createdAt.getTime())&&validIdeas(row.ideas);
}
function same(a:Source,b:Source|null,date:string) {
  return !!b&&eligible(b,date)&&a.id===b.id&&a.userId===b.userId&&a.date===b.date&&a.createdAt.getTime()===b.createdAt.getTime()
    &&JSON.stringify(a.ideas)===JSON.stringify(b.ideas)&&a.user.email===b.user.email&&a.user.lang===b.user.lang
    &&a.user.emailVerified?.getTime()===b.user.emailVerified?.getTime()&&a.user.youtubeToken?.id===b.user.youtubeToken?.id
    &&a.user.youtubeToken?.channelId===b.user.youtubeToken?.channelId&&a.user.youtubeToken?.createdAt.getTime()===b.user.youtubeToken?.createdAt.getTime();
}
const sourceCondition=`EXISTS(SELECT 1 FROM daily_ideas i JOIN users u ON u.id=i."userId" JOIN youtube_tokens t ON t."userId"=u.id
  WHERE i.id=$4 AND i."userId"=$2 AND i.date=$3 AND i.ideas=$5::jsonb AND i."createdAt"=timezone('UTC',$6::timestamptz)
    AND u.email=$7 AND u.lang=$8 AND u."emailVerified"=timezone('UTC',$9::timestamptz) AND u."marketingOptOut"=false
    AND t.id=$10 AND t."channelId"=$11 AND t."createdAt"=timezone('UTC',$12::timestamptz))`;
const noPriorLog=`NOT EXISTS(SELECT 1 FROM email_logs WHERE "userId"=$2 AND sequence='daily-ideas' AND step=$3)`;

async function deliver(row:Source,date:string,at:number,check:()=>void):Promise<boolean> {
  check();const channel=row.user.youtubeToken;if(!eligible(row,date)||!channel||!same(row,await readSource(row.id),date))throw Error('daily_ideas_email_unconfirmed');check();
  const recent=await prisma.generation.findMany({where:{userId:row.userId,template:{in:['title','description']}},orderBy:{createdAt:'desc'},take:10,select:{output:true}});check();
  const lang=detectCreatorLang(recent.map(r=>r.output).filter(Boolean),row.user.lang),unsubUrl=BASE+'/api/email/unsubscribe?token='+signUnsubscribe(row.userId);
  const {subject,html}=buildDailyIdeasEmail(row.ideas as unknown as DailyIdea[],lang,channel.createdAt,unsubUrl,new Date(at));
  const attemptId=randomUUID();let admitted=false,armed=false,issued=false;
  const mail=prepareDomainEmailOriginal({to:row.user.email,subject,html,isTransactional:false,idempotencyKey:attemptId},()=>{
    check();if(!admitted||!armed||issued)throw Error('daily_ideas_email_unconfirmed');issued=true;
  });
  if(!mail)throw Error('daily_ideas_email_unconfirmed');
  const args=[attemptId,row.userId,date,row.id,JSON.stringify(row.ideas),row.createdAt,row.user.email,row.user.lang,row.user.emailVerified,channel.id,channel.channelId,channel.createdAt];
  check();
  const admission=await prisma.$queryRawUnsafe<{id:string;userId:string;date:string;ideaId:string;state:string}[]>(`
    INSERT INTO daily_ideas_email_attempts(id,"userId",date,"ideaId")
    SELECT $1,$2,$3,$4 WHERE ${sourceCondition} AND ${noPriorLog}
    ON CONFLICT("userId",date) DO NOTHING RETURNING id,"userId",date,"ideaId",state`,...args);
  if(!Array.isArray(admission)||admission.length!==1||Object.keys(admission[0]).length!==5||admission[0].id!==attemptId||admission[0].userId!==row.userId||admission[0].date!==date||admission[0].ideaId!==row.id||admission[0].state!=='pending')throw Error('daily_ideas_email_unconfirmed');
  admitted=true;check();
  const negative=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM daily_ideas_email_attempts a
    WHERE a.id=$1 AND a."userId"=$2 AND a.date=$3 AND a."ideaId"=$4 AND a.state='pending'
      AND ${sourceCondition} AND ${noPriorLog}) AS eligible`,...args);check();
  if(!Array.isArray(negative)||negative.length!==1||Object.keys(negative[0]).length!==1||negative[0].eligible!==true||!same(row,await readSource(row.id),date))throw Error('daily_ideas_email_unconfirmed');check();
  armed=true;
  // The transport checks this same live original immediately before native HTTP.
  // Keep its exact HTTP/body promise; no cancellation/retry/lookup can replace it.
  const outcome=await dispatchDomainEmailOriginal(mail);
  if(outcome!=='provider-accepted')return false;
  const closed=await prisma.$queryRawUnsafe<{id:string}[]>(`
    WITH own AS MATERIALIZED(SELECT id FROM daily_ideas_email_attempts WHERE id=$1 AND "userId"=$2 AND date=$3 AND "ideaId"=$4 AND state='pending' FOR UPDATE),
    accepted AS(INSERT INTO email_logs(id,"userId",sequence,step,"sentAt") SELECT id,$2,'daily-ideas',$3,timezone('UTC',clock_timestamp()) FROM own
      ON CONFLICT("userId",sequence,step) DO NOTHING RETURNING id),
    completed AS(UPDATE daily_ideas_email_attempts SET state='provider-accepted',"acceptedAt"=timezone('UTC',clock_timestamp())
      WHERE id=$1 AND "userId"=$2 AND date=$3 AND "ideaId"=$4 AND state='pending' AND EXISTS(SELECT 1 FROM accepted WHERE id=$1) RETURNING id)
    SELECT id FROM completed`,attemptId,row.userId,date,row.id);
  if(!Array.isArray(closed)||closed.length!==1||Object.keys(closed[0]).length!==1||closed[0].id!==attemptId)throw Error('daily_ideas_email_unconfirmed');
  return true;
}
export type DailyIdeasEmailScan={providerAccepted:number;unconfirmed:number;scanned:number;pages:number;hasMore:boolean;coverage:'pages-within-original-budget';acceptance:'provider-only-not-delivery'};
export function sendDailyIdeasEmails(original?:NativeCronDailyIdeasEmail):Promise<DailyIdeasEmailScan> {
  return runCronDailyIdeasEmail(original,async({date,at,checkBeforeDispatch:check})=>{
    const result:DailyIdeasEmailScan={providerAccepted:0,unconfirmed:0,scanned:0,pages:0,hasMore:false,coverage:'pages-within-original-budget',acceptance:'provider-only-not-delivery'};
    let cursor:string|undefined;const seen=new Set<string>();
    for(let page=0;page<32;page++){
      check();const rows=await prisma.dailyIdea.findMany({where:{date,...(cursor?{id:{gt:cursor}}:{}),user:{marketingOptOut:false,emailVerified:{not:null},emailLogs:{none:{sequence:'daily-ideas',step:date}}}},orderBy:{id:'asc'},take:25,select:sourceSelect});check();
      if(!Array.isArray(rows)||rows.length>25)throw Error('daily_ideas_email_unconfirmed');result.pages++;result.hasMore=rows.length===25;
      for(const row of rows){check();if(!row.id||seen.has(row.id))throw Error('daily_ideas_email_unconfirmed');seen.add(row.id);cursor=row.id;result.scanned++;if(!eligible(row,date))continue;
        try{if(await deliver(row,date,at,check))result.providerAccepted++;else result.unconfirmed++;}catch{result.unconfirmed++;check();}check();
      }
      if(!result.hasMore)return result;
    }
    return result;
  });
}
