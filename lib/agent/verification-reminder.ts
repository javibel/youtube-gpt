/** Native morning reminder batch. Existing SQL tables only;no runtime DDL.
 * A fresh live purpose, own INSERT ACK, domain transport ACK and own SQL
 * completion are required. Unknown effects retain the admission indefinitely.
 */
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { prepareDomainEmailOriginal, dispatchDomainEmailOriginal } from '@/lib/send-email';
import { isInternalAccount } from '@/lib/internal-accounts';
import {runCronVerificationReminders,type NativeCronVerificationReminders} from '@/lib/cron-dispatch-original';

const BASE_URL = 'https://ytubviral.com';
const ENABLED=process.env.VERIFY_REMINDER_ENABLED,LIVE=ENABLED!=='false';

function buildHtml(name: string, lang: 'es' | 'en'): string {
  const firstName = ((name || '').split(' ')[0] || (lang === 'es' ? 'Hola' : 'Hi')).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const verifyUrl = `${BASE_URL}/verify-email`;

  if (lang === 'es') {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>Te registraste en YTubViral hace un rato, pero aún no has verificado tu email — así que la cuenta está a medias y no puedes usar nada todavía.</p>
  <p>Es literalmente un momento. Verifica y entras directo. Dentro tienes 10 generaciones gratis este mes para probar lo que más usa la gente: el generador de títulos optimizados para YouTube, pensado con keywords reales y CTR, no a ojo.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Verificar mi email</a>
  </div>
  <p style="color:#666;font-size:13px">Si ya no encuentras el código que te enviamos, en esa página puedes pedir uno nuevo.</p>
  <p style="color:#666;font-size:13px">¿Alguna duda? Responde a este email, lo leo yo.</p>
  <p style="color:#666;font-size:13px">— Javier, fundador de YTubViral</p>
</div>`.trim();
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>You signed up for YTubViral a little while ago but haven't verified your email yet — so your account is half-done and you can't use anything.</p>
  <p>It takes a second. Verify and you're in. Inside you've got 10 free generations this month to try what people use most: the YouTube title generator, built around real keywords and CTR, not guesswork.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Verify my email</a>
  </div>
  <p style="color:#666;font-size:13px">If you can't find the code we sent, you can request a new one on that page.</p>
  <p style="color:#666;font-size:13px">Questions? Just reply — I read these myself.</p>
  <p style="color:#666;font-size:13px">— Javier, founder of YTubViral</p>
</div>`.trim();
}


type Source={id:string;email:string;name:string|null;lang:string;createdAt:Date;emailVerified:Date|null;marketingOptOut:boolean;sent:number;lastSentAt:Date|null;lastSentStamp:string|null};
export type VerificationReminderScan=Readonly<{providerAccepted:number;unconfirmed:number;scanned:number;pages:number;hasMore:boolean;disabled:boolean;coverage:'pages-within-original-budget';acceptance:'provider-only-not-delivery'}>;
const originals=new WeakMap<object,Promise<VerificationReminderScan>>(),scans=new WeakMap<object,object>();
const select=`SELECT u.id,u.email,u.name,u.lang,u."createdAt",u."emailVerified",u."marketingOptOut",COALESCE(vr.reminders_sent,0) AS sent,vr.last_sent_at AS "lastSentAt",vr.last_sent_at::text AS "lastSentStamp" FROM users u LEFT JOIN verify_reminders vr ON vr.user_id=u.id`;
const noLog=`NOT EXISTS(SELECT 1 FROM email_logs WHERE "userId"=$2 AND sequence='verify-reminder' AND step=$3::text)`;
const sourceCondition=`EXISTS(SELECT 1 FROM users u LEFT JOIN verify_reminders vr ON vr.user_id=u.id
 WHERE u.id=$2 AND u.email=$4 AND u.name IS NOT DISTINCT FROM $5::text AND u.lang=$6
 AND u."createdAt"=timezone('UTC',$7::timestamptz) AND u."emailVerified" IS NULL AND u."marketingOptOut"=false
 AND COALESCE(vr.reminders_sent,0)=$8::integer AND vr.last_sent_at IS NOT DISTINCT FROM $9::timestamptz
 AND (($3::integer=1 AND $8::integer=0 AND u."createdAt"<=timezone('UTC',$10::timestamptz)-INTERVAL '2 hours' AND u."createdAt">=timezone('UTC',$10::timestamptz)-INTERVAL '5 days')
 OR ($3::integer=2 AND $8::integer=1 AND u."createdAt">=timezone('UTC',$10::timestamptz)-INTERVAL '14 days' AND vr.last_sent_at<=$10::timestamptz-INTERVAL '48 hours')))`;
const read=async(id:string)=>{const rows=await prisma.$queryRawUnsafe<Source[]>(`/* verify-reminder:read */ `+select+' WHERE u.id=$1',id);if(!Array.isArray(rows)||rows.length>1)throw Error('verification_reminder_unconfirmed');return rows[0]??null;};
const email=(value:unknown):value is string=>typeof value==='string'&&value.length<=254&&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(value);
function eligible(row:Source,at:number):boolean {
 const age=at-row.createdAt?.getTime();
 return typeof row.id==='string'&&/^[\w-]{1,128}$/.test(row.id)&&email(row.email)&&!isInternalAccount(row.email)
 &&(row.name===null||typeof row.name==='string'&&row.name.length<=512)&&['es','en'].includes(row.lang)
 &&row.emailVerified===null&&row.marketingOptOut===false&&row.createdAt instanceof Date&&Number.isFinite(age)
 &&(row.lastSentAt===null?row.lastSentStamp===null:row.lastSentAt instanceof Date&&Number.isFinite(row.lastSentAt.getTime())&&typeof row.lastSentStamp==='string'&&row.lastSentStamp.length<=64)
 &&(row.sent===0&&age>=2*3600000&&age<=5*86400000||row.sent===1&&age>=0&&age<=14*86400000&&row.lastSentAt!==null&&at-row.lastSentAt.getTime()>=48*3600000);
}
function same(a:Source,b:Source|null,at:number):boolean {
 return !!b&&eligible(b,at)&&a.id===b.id&&a.email===b.email&&a.name===b.name&&a.lang===b.lang&&a.createdAt.getTime()===b.createdAt.getTime()&&a.sent===b.sent&&a.lastSentAt?.getTime()===b.lastSentAt?.getTime()&&a.lastSentStamp===b.lastSentStamp;
}
async function deliver(row:Source,at:number,check:()=>void):Promise<boolean>{
 check();if(!same(row,await read(row.id),at))throw Error('verification_reminder_unconfirmed');check();
 const id=randomUUID(),ordinal=row.sent+1,args=[id,row.id,String(ordinal),row.email,row.name,row.lang,row.createdAt,row.sent,row.lastSentStamp,new Date(at)];
 let admitted=false,armed=false,issued=false;
 const mail=prepareDomainEmailOriginal({to:row.email,subject:row.lang==='en'?'One step left to get into YTubViral':'Te queda un paso para entrar a YTubViral',html:buildHtml(row.name??'',row.lang as 'es'|'en'),isTransactional:true,idempotencyKey:id},()=>{check();if(!admitted||!armed||issued)throw Error('verification_reminder_unconfirmed');issued=true;});
 if(!mail)throw Error('verification_reminder_unconfirmed');
 const admission=await prisma.$transaction(async tx=>{
  check();await tx.$queryRawUnsafe('/* verify-reminder:lock */ SELECT id FROM users WHERE id=$1 FOR UPDATE',row.id);check();
  return tx.$queryRawUnsafe<{userId:string;noticeId:string;sequence:string;step:string}[]>(`/* verify-reminder:admit */
   INSERT INTO lifecycle_email_admissions("userId","noticeId",sequence,step)
   SELECT $2,$1,'verify-reminder',$3::text WHERE `+sourceCondition+' AND '+noLog+`
   ON CONFLICT("userId") DO NOTHING RETURNING "userId","noticeId",sequence,step`,...args);
 },{isolationLevel:'ReadCommitted'});
 if(!Array.isArray(admission)||admission.length!==1||Object.keys(admission[0]).length!==4||admission[0].userId!==row.id||admission[0].noticeId!==id||admission[0].sequence!=='verify-reminder'||admission[0].step!==String(ordinal))throw Error('verification_reminder_unconfirmed');
 admitted=true;check();
 const negative=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`/* verify-reminder:negative */ SELECT EXISTS(SELECT 1 FROM lifecycle_email_admissions a WHERE a."userId"=$2 AND a."noticeId"=$1 AND a.sequence='verify-reminder' AND a.step=$3::text AND `+sourceCondition+' AND '+noLog+') AS eligible',...args);check();
 if(!Array.isArray(negative)||negative.length!==1||Object.keys(negative[0]).length!==1||negative[0].eligible!==true||!same(row,await read(row.id),at))throw Error('verification_reminder_unconfirmed');check();
 armed=true;const outcome=await dispatchDomainEmailOriginal(mail);if(outcome!=='provider-accepted')return false;
 // Only the already-issued original may settle its own marker/log. Retirement
 // cannot issue another effect, but does not replace its native completion.
 const complete=await prisma.$transaction(async tx=>{
  await tx.$queryRawUnsafe('/* verify-reminder:completion-lock */ SELECT id FROM users WHERE id=$1 FOR UPDATE',row.id);
  return tx.$queryRawUnsafe<{noticeId:string}[]>(`/* verify-reminder:complete */
   WITH own AS MATERIALIZED(SELECT "userId","noticeId" FROM lifecycle_email_admissions WHERE "userId"=$2 AND "noticeId"=$1 AND sequence='verify-reminder' AND step=$3::text FOR UPDATE),
   updated AS(INSERT INTO verify_reminders(user_id,reminders_sent,last_sent_at)
    SELECT $2,$3::integer,clock_timestamp() FROM own WHERE `+noLog+` AND
     (($4::integer=0 AND NOT EXISTS(SELECT 1 FROM verify_reminders WHERE user_id=$2))
      OR EXISTS(SELECT 1 FROM verify_reminders WHERE user_id=$2 AND reminders_sent=$4::integer AND last_sent_at IS NOT DISTINCT FROM $5::timestamptz))
    ON CONFLICT(user_id) DO UPDATE SET reminders_sent=EXCLUDED.reminders_sent,last_sent_at=EXCLUDED.last_sent_at
     WHERE verify_reminders.reminders_sent=$4::integer AND verify_reminders.last_sent_at IS NOT DISTINCT FROM $5::timestamptz RETURNING user_id),
   accepted AS(INSERT INTO email_logs(id,"userId",sequence,step,"sentAt") SELECT $1,$2,'verify-reminder',$3::text,timezone('UTC',clock_timestamp()) FROM updated
    ON CONFLICT("userId",sequence,step) DO NOTHING RETURNING id)
   DELETE FROM lifecycle_email_admissions WHERE "userId"=$2 AND "noticeId"=$1 AND sequence='verify-reminder' AND step=$3::text AND EXISTS(SELECT 1 FROM accepted WHERE id=$1) RETURNING "noticeId"`,id,row.id,String(ordinal),row.sent,row.lastSentStamp);
 },{isolationLevel:'ReadCommitted'});
 if(!Array.isArray(complete)||complete.length!==1||Object.keys(complete[0]).length!==1||complete[0].noticeId!==id)throw Error('verification_reminder_unconfirmed');return true;
}
export function sendVerificationReminders(original?:NativeCronVerificationReminders):Promise<VerificationReminderScan>{
 if(!original||typeof original!=='object')return Promise.reject(Error('verification_reminder_unconfirmed'));
 const previous=originals.get(original);if(previous)return previous;
 const pending=runCronVerificationReminders(original,async({at,checkBeforeDispatch:nativeCheck})=>{
  const check=()=>{nativeCheck();if(process.env.VERIFY_REMINDER_ENABLED!==ENABLED)throw Error('verification_reminder_unconfirmed');};
  const result={providerAccepted:0,unconfirmed:0,scanned:0,pages:0,hasMore:false,disabled:!LIVE,coverage:'pages-within-original-budget' as const,acceptance:'provider-only-not-delivery' as const};
  check();if(LIVE){let cursor='';const seen=new Set<string>();
   for(let page=0;page<32;page++){
    check();const rows=await prisma.$queryRawUnsafe<Source[]>(`/* verify-reminder:scan */ `+select+` WHERE u.id>$1 AND u."emailVerified" IS NULL AND u."marketingOptOut"=false
     AND ((COALESCE(vr.reminders_sent,0)=0 AND u."createdAt"<=timezone('UTC',$2::timestamptz)-INTERVAL '2 hours' AND u."createdAt">=timezone('UTC',$2::timestamptz)-INTERVAL '5 days')
      OR(COALESCE(vr.reminders_sent,0)=1 AND u."createdAt">=timezone('UTC',$2::timestamptz)-INTERVAL '14 days' AND vr.last_sent_at<=$2::timestamptz-INTERVAL '48 hours'))
     AND NOT EXISTS(SELECT 1 FROM email_logs l WHERE l."userId"=u.id AND l.sequence='verify-reminder' AND l.step=(COALESCE(vr.reminders_sent,0)+1)::text)
     ORDER BY u.id ASC LIMIT 25`,cursor,new Date(at));check();
    if(!Array.isArray(rows)||rows.length>25)throw Error('verification_reminder_unconfirmed');result.pages++;result.hasMore=rows.length===25;
    for(const row of rows){check();if(typeof row.id!=='string'||row.id<=cursor||seen.has(row.id))throw Error('verification_reminder_unconfirmed');seen.add(row.id);cursor=row.id;result.scanned++;if(!eligible(row,at))continue;
     try{if(await deliver(row,at,check))result.providerAccepted++;else result.unconfirmed++;}catch{result.unconfirmed++;check();}check();
    }
    if(!result.hasMore)break;
   }
  }
  check();const receipt=Object.freeze(result);scans.set(receipt,original);return receipt;
 }).then(value=>{if(!value||typeof value!=='object'||scans.get(value)!==original)throw Error('verification_reminder_unconfirmed');return value;});
 originals.set(original,pending);return pending;
}
