/** Native morning reengagement. Paused by default since2026-06-18;
 * local migration does not activate the overlapping lifecycle campaign.
 * Existing rows only veto;uncertain admissions are never resumed or cleared.
 */
import {prisma} from '@/lib/prisma';
import {randomUUID} from 'node:crypto';
import {prepareDomainEmailOriginal,dispatchDomainEmailOriginal} from '@/lib/send-email';
import {isInternalAccount} from '@/lib/internal-accounts';
import {signUnsubscribe} from '@/lib/email-token';
import {runCronReengagement,type NativeCronReengagement} from '@/lib/cron-dispatch-original';
const BASE_URL='https://ytubviral.com',ENABLED=process.env.REENGAGEMENT_ENABLED,LIVE=ENABLED==='true';
const TOKEN=process.env.EMAIL_TOKEN_SECRET,AUTH=process.env.NEXTAUTH_SECRET,SECRET=(TOKEN||AUTH||'').trim();
function buildHtml(name: string, lang: 'es' | 'en',userId:string): string {
  const firstName = ((name || '').split(' ')[0] || (lang === 'es' ? 'Hola' : 'Hi')).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const unsubscribe=BASE_URL+'/api/email/unsubscribe?token='+encodeURIComponent(signUnsubscribe(userId));
  const ctaUrl = `${BASE_URL}/generate`;

  if (lang === 'es') {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>Probaste YTubViral hace unas semanas y luego no volviste — sin presión, sé que el día a día se come todo.</p>
  <p>Pero si sigues subiendo vídeos, hay un hábito que marca la diferencia de verdad: antes de publicar, revisa el título. No el contenido — el título. Es lo que decide si alguien hace clic o sigue haciendo scroll. Y es literalmente un minuto.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Revisar un título ahora</a>
  </div>
  <p style="color:#666;font-size:13px">Tienes tus 10 generaciones gratis de este mes esperándote.</p>
  <p style="color:#666;font-size:13px">Y si algo no te encajó la primera vez, respóndeme a este email y lo miro — lo leo yo.</p>
  <p style="color:#666;font-size:13px">— Javier, fundador de YTubViral</p>
  <p style="font-size:12px"><a href="${unsubscribe}">Darme de baja</a></p>
</div>`.trim();
  }

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="text-align:center;padding:24px 0">
    <img src="${BASE_URL}/logo.png" alt="YTubViral" width="140" style="display:inline-block" />
  </div>
  <p style="font-size:18px;font-weight:600">Hey ${firstName} 👋</p>
  <p>You tried YTubViral a few weeks back and didn't come back — no pressure, I know everyday life eats your time.</p>
  <p>But if you're still uploading videos, there's one habit that genuinely moves the needle: before you publish, check the title. Not the content — the title. It's what decides whether someone clicks or keeps scrolling. And it takes a minute.</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${ctaUrl}" style="display:inline-block;background:#e84d5b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Check a title now</a>
  </div>
  <p style="color:#666;font-size:13px">Your 10 free generations this month are waiting.</p>
  <p style="color:#666;font-size:13px">And if something didn't click the first time, just reply to this email and I'll look into it — I read every one.</p>
  <p style="color:#666;font-size:13px">— Javier, founder of YTubViral</p>
  <p style="font-size:12px"><a href="${unsubscribe}">Unsubscribe</a></p>
</div>`.trim();
}


type Source={id:string;email:string;name:string|null;lang:string;emailVerified:Date;verifiedStamp:string;marketingOptOut:boolean;generationId:string;generationAt:Date;generationStamp:string};
export type ReengagementScan=Readonly<{providerAccepted:number;unconfirmed:number;scanned:number;pages:number;hasMore:boolean;disabled:boolean;coverage:'pages-within-original-budget';acceptance:'provider-only-not-delivery'}>;
const originals=new WeakMap<object,Promise<ReengagementScan>>(),scans=new WeakMap<object,object>();
const from=`FROM users u JOIN LATERAL(SELECT id,"createdAt" FROM generations WHERE "userId"=u.id ORDER BY "createdAt" DESC,id DESC LIMIT 1)g ON true`;
const select=`SELECT u.id,u.email,u.name,u.lang,u."emailVerified",u."emailVerified"::text AS "verifiedStamp",u."marketingOptOut",g.id AS "generationId",g."createdAt" AS "generationAt",g."createdAt"::text AS "generationStamp" `+from;
const exclusions=`NOT EXISTS(SELECT 1 FROM reengagement_emails WHERE user_id=$2) AND NOT EXISTS(SELECT 1 FROM email_logs WHERE "userId"=$2 AND (sequence IN ('react','reengagement') OR "sentAt">timezone('UTC',$9::timestamptz)-INTERVAL '1 day'))`;
const sourceCondition=`EXISTS(SELECT 1 `+from+` WHERE u.id=$2 AND u.email=$3 AND u.name IS NOT DISTINCT FROM $4::text AND u.lang=$5 AND u."emailVerified"::text=$6 AND u."marketingOptOut"=false AND g.id=$7 AND g."createdAt"::text=$8 AND g."createdAt"<timezone('UTC',$9::timestamptz)-INTERVAL '7 days' AND g."createdAt">=timezone('UTC',$9::timestamptz)-INTERVAL '60 days')`;
const read=async(id:string)=>{const rows=await prisma.$queryRawUnsafe<Source[]>(`/* reengagement:read */ `+select+' WHERE u.id=$1',id);if(!Array.isArray(rows)||rows.length>1)throw Error('reengagement_unconfirmed');return rows[0]??null;};
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,128}$/.test(v);
const email=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
function eligible(r:Source,at:number):boolean{return validId(r.id)&&email(r.email)&&!isInternalAccount(r.email)&&(r.name===null||typeof r.name==='string'&&r.name.length<=512)&&['es','en'].includes(r.lang)&&r.marketingOptOut===false&&r.emailVerified instanceof Date&&Number.isFinite(r.emailVerified.getTime())&&r.emailVerified.getTime()<=at&&typeof r.verifiedStamp==='string'&&r.verifiedStamp.length<=64&&validId(r.generationId)&&r.generationAt instanceof Date&&Number.isFinite(r.generationAt.getTime())&&at-r.generationAt.getTime()>7*86400000&&at-r.generationAt.getTime()<=60*86400000&&typeof r.generationStamp==='string'&&r.generationStamp.length<=64;}
function same(a:Source,b:Source|null,at:number):boolean{return !!b&&eligible(b,at)&&a.id===b.id&&a.email===b.email&&a.name===b.name&&a.lang===b.lang&&a.emailVerified.getTime()===b.emailVerified.getTime()&&a.verifiedStamp===b.verifiedStamp&&a.generationId===b.generationId&&a.generationAt.getTime()===b.generationAt.getTime()&&a.generationStamp===b.generationStamp;}
async function deliver(row:Source,at:number,check:()=>void):Promise<boolean>{
 check();if(SECRET.length<32||!same(row,await read(row.id),at))throw Error('reengagement_unconfirmed');check();
 const id=randomUUID(),args=[id,row.id,row.email,row.name,row.lang,row.verifiedStamp,row.generationId,row.generationStamp,new Date(at)];let admitted=false,armed=false,issued=false;
 const mail=prepareDomainEmailOriginal({to:row.email,subject:row.lang==='en'?'Want to give your channel another shot?':'¿Le damos otra vuelta a tu canal?',html:buildHtml(row.name??'',row.lang as 'es'|'en',row.id),isTransactional:false,idempotencyKey:id},()=>{check();if(!admitted||!armed||issued)throw Error('reengagement_unconfirmed');issued=true;});if(!mail)throw Error('reengagement_unconfirmed');
 const admission=await prisma.$transaction(async tx=>{check();await tx.$queryRawUnsafe('/* reengagement:lock */ SELECT id FROM users WHERE id=$1 FOR UPDATE',row.id);check();return tx.$queryRawUnsafe<{userId:string;noticeId:string;sequence:string;step:string}[]>(`/* reengagement:admit */ INSERT INTO lifecycle_email_admissions("userId","noticeId",sequence,step) SELECT $2,$1,'reengagement','initial' WHERE `+sourceCondition+' AND '+exclusions+` ON CONFLICT("userId") DO NOTHING RETURNING "userId","noticeId",sequence,step`,...args);},{isolationLevel:'ReadCommitted'});
 if(!Array.isArray(admission)||admission.length!==1||Object.keys(admission[0]).length!==4||admission[0].userId!==row.id||admission[0].noticeId!==id||admission[0].sequence!=='reengagement'||admission[0].step!=='initial')throw Error('reengagement_unconfirmed');admitted=true;check();
 const negative=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`/* reengagement:negative */ SELECT EXISTS(SELECT 1 FROM lifecycle_email_admissions a WHERE a."userId"=$2 AND a."noticeId"=$1 AND a.sequence='reengagement' AND a.step='initial' AND `+sourceCondition+' AND '+exclusions+') AS eligible',...args);check();
 if(!Array.isArray(negative)||negative.length!==1||Object.keys(negative[0]).length!==1||negative[0].eligible!==true||!same(row,await read(row.id),at))throw Error('reengagement_unconfirmed');check();armed=true;
 const outcome=await dispatchDomainEmailOriginal(mail);if(outcome!=='provider-accepted')return false;
 // This is completion of the already-issued transport,even if its parent retired.
 const complete=await prisma.$transaction(async tx=>{await tx.$queryRawUnsafe('/* reengagement:completion-lock */ SELECT id FROM users WHERE id=$1 FOR UPDATE',row.id);return tx.$queryRawUnsafe<{noticeId:string}[]>(`/* reengagement:complete */
  WITH own AS MATERIALIZED(SELECT "userId","noticeId" FROM lifecycle_email_admissions WHERE "userId"=$2 AND "noticeId"=$1 AND sequence='reengagement' AND step='initial' FOR UPDATE),
  marked AS(INSERT INTO reengagement_emails(user_id,sent_at) SELECT $2,timezone('UTC',clock_timestamp()) FROM own WHERE NOT EXISTS(SELECT 1 FROM email_logs WHERE "userId"=$2 AND sequence='reengagement' AND step='initial') ON CONFLICT(user_id) DO NOTHING RETURNING user_id),
  accepted AS(INSERT INTO email_logs(id,"userId",sequence,step,"sentAt") SELECT $1,$2,'reengagement','initial',timezone('UTC',clock_timestamp()) FROM marked ON CONFLICT("userId",sequence,step) DO NOTHING RETURNING id)
  DELETE FROM lifecycle_email_admissions WHERE "userId"=$2 AND "noticeId"=$1 AND sequence='reengagement' AND step='initial' AND EXISTS(SELECT 1 FROM accepted WHERE id=$1) RETURNING "noticeId"`,id,row.id);},{isolationLevel:'ReadCommitted'});
 if(!Array.isArray(complete)||complete.length!==1||Object.keys(complete[0]).length!==1||complete[0].noticeId!==id)throw Error('reengagement_unconfirmed');return true;
}
export function sendReengagementEmails(original?:NativeCronReengagement):Promise<ReengagementScan>{
 if(!original||typeof original!=='object')return Promise.reject(Error('reengagement_unconfirmed'));const previous=originals.get(original);if(previous)return previous;
 const pending=runCronReengagement(original,async({at,checkBeforeDispatch:nativeCheck})=>{const check=()=>{nativeCheck();if(process.env.REENGAGEMENT_ENABLED!==ENABLED||process.env.EMAIL_TOKEN_SECRET!==TOKEN||process.env.NEXTAUTH_SECRET!==AUTH)throw Error('reengagement_unconfirmed');};
 const result={providerAccepted:0,unconfirmed:0,scanned:0,pages:0,hasMore:false,disabled:!LIVE,coverage:'pages-within-original-budget' as const,acceptance:'provider-only-not-delivery' as const};check();
 if(LIVE){let cursor='';const seen=new Set<string>();for(let page=0;page<32;page++){check();const rows=await prisma.$queryRawUnsafe<Source[]>(`/* reengagement:scan */ `+select+` WHERE u.id>$1 AND u."emailVerified" IS NOT NULL AND u."marketingOptOut"=false AND g."createdAt"<timezone('UTC',$2::timestamptz)-INTERVAL '7 days' AND g."createdAt">=timezone('UTC',$2::timestamptz)-INTERVAL '60 days' AND NOT EXISTS(SELECT 1 FROM reengagement_emails WHERE user_id=u.id) AND NOT EXISTS(SELECT 1 FROM email_logs l WHERE l."userId"=u.id AND (l.sequence IN ('react','reengagement') OR l."sentAt">timezone('UTC',$2::timestamptz)-INTERVAL '1 day')) ORDER BY u.id ASC LIMIT 25`,cursor,new Date(at));check();
 if(!Array.isArray(rows)||rows.length>25)throw Error('reengagement_unconfirmed');result.pages++;result.hasMore=rows.length===25;for(const row of rows){check();if(typeof row.id!=='string'||row.id<=cursor||seen.has(row.id))throw Error('reengagement_unconfirmed');seen.add(row.id);cursor=row.id;result.scanned++;if(!eligible(row,at))continue;try{if(await deliver(row,at,check))result.providerAccepted++;else result.unconfirmed++;}catch{result.unconfirmed++;check();}check();}if(!result.hasMore)break;}}
 check();const receipt=Object.freeze(result);scans.set(receipt,original);return receipt;}).then(value=>{if(!value||typeof value!=='object'||scans.get(value)!==original)throw Error('reengagement_unconfirmed');return value;}).catch(()=>{throw Error('reengagement_unconfirmed');});originals.set(original,pending);return pending;
}
