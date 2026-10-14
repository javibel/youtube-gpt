import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { hasPaidAccess } from '@/lib/plans';
import { readScorecardYoutube } from '@/lib/extension-scorecard-youtube';
declare const scorecardBrand: unique symbol;
export type ExtensionScorecardSession = { readonly [scorecardBrand]: true };
type Owner = { kind: 'public' | 'authenticated'; principal: string; id?: string; email?: string; token?: string; tokenId?: string; expires: number; capturedAt: number; tokenExpires?: number; used: boolean; quotaKey?: string; isPro: boolean; subscriptionSignature?: string };
const originals = new WeakMap<object, Owner>();
const acknowledgedEvents = new Map<string, number>();
// This in-memory reference is created only after our exact native transaction
// ACK. A persisted row is negative coherence evidence, never its replacement.
type Sample = Readonly<{operationId:string;principal:string;key:string;eventId:string;videoId:string;views:number;capturedAt:number}>;
const acknowledgedSamples = new Map<string, Sample>();
function plan(userId:string,sub:{userId:string;status:string;stripeCustomerId:string|null;currentPeriodEnd:Date|null}|null|undefined) {
 if(sub===null||sub===undefined)return {isPro:false,signature:'none',expires:Infinity};
 if(sub.userId!==userId||typeof sub.status!=='string'||sub.status.length>64||!(sub.stripeCustomerId===null||typeof sub.stripeCustomerId==='string'&&sub.stripeCustomerId.length<=255)||!(sub.currentPeriodEnd===null||sub.currentPeriodEnd instanceof Date&&Number.isFinite(sub.currentPeriodEnd.getTime())))throw Error('Scorecard plan unconfirmed');
 const isPro=hasPaidAccess(sub),expires=isPro&&sub.stripeCustomerId==='manual_admin'?sub.currentPeriodEnd!.getTime():Infinity;
 return {isPro,expires,signature:JSON.stringify([sub.userId,sub.status,sub.stripeCustomerId,sub.currentPeriodEnd?.getTime()??null])};
}
export const validScorecardKey = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const lookup = (token: string, db: Pick<Prisma.TransactionClient, 'extensionToken'> = prisma) => db.extensionToken.findUnique({
  where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true, subscription: {select:{userId:true,status:true,stripeCustomerId:true,currentPeriodEnd:true}} } } },
});
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id && !!row.user
    && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}

export async function authorizeExtensionScorecard(request: Request): Promise<ExtensionScorecardSession | null> {
  const capturedAt = Date.now(), header = request.headers.get('Authorization');
  if (!Number.isSafeInteger(capturedAt) || capturedAt < 0) return null;
  const original = Object.freeze({}) as ExtensionScorecardSession;
  if (header === null) {
    // Preserve the public policy. Forwarded headers are only an untrusted quota
    // partition hint: they never identify an authenticated user or recover work.
    // Authentic ingress/IP provenance remains an operational dependency.
    const raw = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
    const partition = raw.length <= 64 && isIP(raw) ? raw : 'unknown';
    originals.set(original, { kind: 'public', principal: 'public:'+partition, quotaKey:'ext-pub-scorecard:'+partition, expires:capturedAt+55_000, capturedAt, used:false,isPro:false });
    return original;
  }
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const capturedPlan=plan(row.user.id,row.user.subscription);
  originals.set(original, { kind:'authenticated', principal:'user:'+row.user.id, id:row.user.id, email:row.user.email, token, tokenId:row.id, capturedAt, tokenExpires:row.expiresAt.getTime(), expires:Math.min(capturedAt+55_000,row.expiresAt.getTime(),capturedPlan.expires),used:false,isPro:capturedPlan.isPro,subscriptionSignature:capturedPlan.signature });
  return original;
}
function retained(original: ExtensionScorecardSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now()) throw Error('Scorecard authentication unconfirmed');
  return own;
}
export function checkExtensionScorecard(original: ExtensionScorecardSession): void { retained(original); }
export function extensionScorecardMeta(original: ExtensionScorecardSession) { const own=retained(original);return {mode:own.kind,expires:own.expires,isPro:own.isPro,capturedAt:own.capturedAt}; }
export async function runExtensionScorecard(original: ExtensionScorecardSession, key: string, videoId:string, apiKey:string, beforeStep: () => void, signal:AbortSignal) {
  const own=retained(original), capturedAt=own.capturedAt;if(own.used||!validScorecardKey(key)||!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw Error('Scorecard operation unconfirmed');own.used=true;
  const check=()=>{retained(original);beforeStep();},captured=Object.freeze({id:randomUUID(),principal:own.principal,key,eventId:randomUUID()});
  const matches=(row:Record<string,unknown>|null)=>!!row&&row.state==='pending'&&Object.entries(captured).every(([k,v])=>row[k]===v);
  const lock=async(tx:Prisma.TransactionClient)=>{
    check();
    if(own.kind==='public') {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock', 'extension-scorecard:'+own.principal);check();return;
    }
    const users=await tx.$queryRawUnsafe<Array<{id:string;email:string}>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',own.id);check();
    if(users.length!==1||users[0].id!==own.id||users[0].email!==own.email)throw Error('Scorecard account unconfirmed');
    const token=await lookup(own.token!,tx);check();
    if(!eligible(token,own.token!)||!token||token.id!==own.tokenId||token.userId!==own.id||token.user.email!==own.email||token.expiresAt.getTime()!==own.tokenExpires)throw Error('Scorecard token unconfirmed');
    const currentPlan=plan(own.id!,token.user.subscription);if(currentPlan.signature!==own.subscriptionSignature||currentPlan.isPro!==own.isPro)throw Error('Scorecard plan unconfirmed');
  };
  check();
  const admission=await prisma.$transaction(async tx=>{
    await lock(tx);
    const prior=await tx.extensionScorecardOperation.findFirst({where:{OR:[{key},{principal:own.principal,state:{not:'complete'}}]}});check();if(prior)throw Error('Scorecard original retained');
    const row=await tx.extensionScorecardOperation.create({data:{...captured,state:'pending'}});check();
    let allowed=true;
    if(own.kind==='public') {
      const hits=await tx.$queryRawUnsafe<Array<{hits:number}>>(
        "INSERT INTO rate_limits (key,hits,window_start) VALUES ($1,1,NOW()) ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<NOW()-INTERVAL '10 minutes' THEN 1 ELSE rate_limits.hits+1 END, window_start=CASE WHEN rate_limits.window_start<NOW()-INTERVAL '10 minutes' THEN NOW() ELSE rate_limits.window_start END RETURNING hits",own.quotaKey);check();
      if(!Array.isArray(hits)||hits.length!==1||!Number.isSafeInteger(hits[0]?.hits)||hits[0].hits<1)throw Error('Scorecard quota unconfirmed');allowed=hits[0].hits<=60;
    }
    return {row,allowed};
  },{maxWait:10_000,timeout:15_000});
  if(!matches(admission.row)||typeof admission.allowed!=='boolean')throw Error('Scorecard admission unconfirmed');check();
  if(own.kind==='authenticated'&&Date.now()-(acknowledgedEvents.get(own.id!)??-Infinity)>=600_000) {
    const event=await prisma.$transaction(async tx=>{await lock(tx);const row=await tx.extensionScorecardOperation.findUnique({where:{id:captured.id}});check();if(!matches(row))throw Error('Scorecard original unconfirmed');return tx.extensionEvent.create({data:{id:captured.eventId,userId:own.id!,action:'video-scorecard'}});},{maxWait:10_000,timeout:15_000});
    if(event.id!==captured.eventId||event.userId!==own.id||event.action!=='video-scorecard')throw Error('Scorecard event unconfirmed');acknowledgedEvents.set(own.id!,Date.now());
  }
  check();
  const result=admission.allowed?await readScorecardYoutube(videoId,apiKey,capturedAt,check,signal):null;check();
  const measurement=result?.views===null||result===null?null:Object.freeze({operationId:captured.id,principal:captured.principal,key:captured.key,eventId:captured.eventId,videoId,views:result.views,capturedAt});
  let nextSample:Sample|null=null;
  let interval:{from:string;to:string;fromViews:number;toViews:number}|null=null;
  const completed=await prisma.$transaction(async tx=>{
    await lock(tx);
    const row=await tx.extensionScorecardOperation.findUnique({where:{id:captured.id}});check();if(!matches(row))throw Error('Scorecard original unconfirmed');
    let snapshot:{videoId:string;viewCount:bigint;capturedAt:Date}|undefined;
    if(measurement){
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock','scorecard-snapshot:'+videoId);check();
      const prior=acknowledgedSamples.get(videoId);
      let coherent=false;
      if(prior){const stored=await tx.extensionScorecardOperation.findUnique({where:{id:prior.operationId}});check();coherent=!!stored&&stored.id===prior.operationId&&stored.principal===prior.principal&&stored.key===prior.key&&stored.eventId===prior.eventId&&stored.state==='complete'&&stored.videoId===prior.videoId&&stored.viewCount===BigInt(prior.views)&&stored.capturedAt instanceof Date&&stored.capturedAt.getTime()===prior.capturedAt;}
      if(prior&&coherent&&result){
        const hours=(measurement.capturedAt-prior.capturedAt)/3600000,delta=measurement.views-prior.views;
        if(hours>=0.5&&hours<=24*30&&delta>=0){
          const vph=Math.round(delta/hours*10)/10;if(!Number.isSafeInteger(Math.round(vph*10)))throw Error('Scorecard velocity unconfirmed');
          result.vph=vph;result.vphRecent=true;result.dataQuality.velocity='interval-average';
          interval={from:new Date(prior.capturedAt).toISOString(),to:new Date(measurement.capturedAt).toISOString(),fromViews:prior.views,toViews:measurement.views};
        }
      }
      if(!prior||!coherent||measurement.capturedAt-prior.capturedAt>2*3600000){snapshot={videoId,viewCount:BigInt(measurement.views),capturedAt:new Date(measurement.capturedAt)};nextSample=measurement;}
      if(result)result.dataQuality.snapshot=prior&&coherent?'original-acknowledged':snapshot?'new-original-awaiting-ack':'unconfirmed';
    }
    return tx.extensionScorecardOperation.updateMany({where:{...captured,state:'pending'},data:{state:'complete',...snapshot}});
  },{maxWait:10_000,timeout:15_000});
  if(completed.count!==1)throw Error('Scorecard completion unconfirmed');check();
  if(nextSample){acknowledgedSamples.set(videoId,nextSample);while(acknowledgedSamples.size>256)acknowledgedSamples.delete(acknowledgedSamples.keys().next().value!);if(result)result.dataQuality.snapshot='original-acknowledged';}
  check();
  if(!admission.allowed)return {kind:'rate-limited'} as const;
  if(!result)return {kind:'not-found'} as const;
  return {kind:'available',data:{...result,isPro:own.isPro,mode:own.kind,velocityInterval:interval}} as const;
}
