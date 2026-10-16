import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess, type PlanType } from '@/lib/plans';
import { createAbTest } from '@/lib/ab-test';
import { selectionChannel,selectionObject } from '@/lib/ab-selection-contract';
import { abEditorialTitle } from '@/lib/ab-suggestions-contract';

declare const extensionAbCreationBrand: unique symbol;
export type ExtensionAbCreation = { readonly [extensionAbCreationBrand]: true };
type Input = { videoId: string; variantA: string; variantB: string; hoursPerVariant?: number };
type Original = { token: string; tokenId: string; userId: string; email: string; verifiedAt: number;
  tokenExpires: number; capturedAt: number; expires: number; request: Request; used: boolean;
  subscription?: string; plan?: PlanType; youtube?: string; admitted?: boolean };
const originals = new WeakMap<object, Original>(), retainedOwners = new Set<string>(), retainedKeys = new Set<string>();
const lookup = (token: string, db: Pick<Prisma.TransactionClient, 'extensionToken'> = prisma) => db.extensionToken.findUnique({
  where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true } } },
});
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128
    && !!row.user && typeof row.user.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id) && row.userId === row.user.id
    && typeof row.user.email === 'string' && row.user.email.length <= 254 && row.user.email === row.user.email.trim().toLowerCase()
    && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime()) && row.user.emailVerified.getTime() <= now;
}
export const validExtensionAbKey = (v: unknown): v is string => typeof v === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function extensionAbInput(value: unknown): Input | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>, title = abEditorialTitle;
  if (typeof v.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || !title(v.variantA) || !title(v.variantB) || v.variantA.normalize('NFKC').replace(/\s+/gu,' ').toLowerCase()===v.variantB.normalize('NFKC').replace(/\s+/gu,' ').toLowerCase()
    || (v.hoursPerVariant !== undefined && (typeof v.hoursPerVariant !== 'number' || !Number.isInteger(v.hoursPerVariant) || v.hoursPerVariant < 12 || v.hoursPerVariant > 168))) return null;
  return Object.freeze({ videoId: v.videoId, variantA: v.variantA, variantB: v.variantB,
    ...(v.hoursPerVariant === undefined ? {} : { hoursPerVariant: v.hoursPerVariant as number }) });
}
export async function authorizeExtensionAbCreation(request: Request): Promise<ExtensionAbCreation | null> {
  const capturedAt = Date.now(), header = request.headers.get('Authorization');
  if (request.signal.aborted || !Number.isSafeInteger(capturedAt) || capturedAt < 0 || !header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  const tokenExpires = row.expiresAt.getTime(), expires = Math.min(tokenExpires, capturedAt + 55000);
  if (request.signal.aborted || Date.now() < capturedAt || expires <= Date.now()) return null;
  const original = Object.freeze({}) as ExtensionAbCreation;
  originals.set(original, { token, tokenId: row.id, userId: row.user.id, email: row.user.email,
    verifiedAt: row.user.emailVerified!.getTime(), tokenExpires, capturedAt, expires, request, used: false });
  return original;
}
function retained(original: ExtensionAbCreation) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined, now = Date.now();
  if (!own || own.request.signal.aborted || now < own.capturedAt || own.expires <= now) throw Error('AB creation unconfirmed');
  return own;
}
export function checkExtensionAbCreation(original: ExtensionAbCreation): void { retained(original); }
export async function createExtensionAbOriginal(original: ExtensionAbCreation, key: string, input: Input, beforeStep: () => void) {
  const own = retained(original), accepted = extensionAbInput(input);
  if (own.used || !validExtensionAbKey(key) || !accepted) throw Error('AB creation unconfirmed');
  const nativeFetch=fetch;
  own.used = true;
  const check = () => { retained(original); beforeStep(); }; check();
  if (retainedOwners.has(own.userId) || retainedKeys.has(key)) throw Error('AB creation original retained');
  retainedOwners.add(own.userId); retainedKeys.add(key);
  const nativeCheck = async (tx: Prisma.TransactionClient, plan: PlanType, youtubeToken?: string) => {
    check();
    const owner = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.userId); check();
    if (owner.length !== 1 || owner[0].id !== own.userId || owner[0].email !== own.email) throw Error('AB owner changed');
    const row = await lookup(own.token, tx); check();
    if (!eligible(row, own.token) || !row || row.id !== own.tokenId || row.userId !== own.userId || row.user.email !== own.email
      || row.expiresAt.getTime() !== own.tokenExpires || row.user.emailVerified!.getTime() !== own.verifiedAt) throw Error('AB credential changed');
    const existing = await tx.abTestCreationAttempt.findUnique({ where: { id: key } }); check();
    if (existing && (!own.admitted || existing.userId !== own.userId || existing.videoId !== accepted.videoId || existing.state !== 'pending')) throw Error('AB key retained');
    if (own.admitted && !existing) throw Error('AB original reservation changed');
    const pending = await tx.abTestCreationAttempt.findFirst({ where: { userId: own.userId, state: { not: 'complete' }, ...(own.admitted ? { id: { not: key } } : {}) } }); check();
    if (pending) throw Error('AB predecessor unconfirmed');
    const mutationKey=await tx.abTestMutationAttempt.findUnique({where:{id:key}});check();
    const mutationPending=await tx.abTestMutationAttempt.findFirst({where:{userId:own.userId,state:{not:'complete'}}});check();if(mutationKey||mutationPending)throw Error('AB mutation predecessor retained');
    const sub = await tx.subscription.findUnique({ where: { userId: own.userId }, select: { userId: true, status: true, plan: true, stripeCustomerId: true, currentPeriodEnd: true } }); check();
    if (!sub || sub.userId !== own.userId || (sub.plan !== 'pro' && sub.plan !== 'business') || !hasPaidAccess(sub) || typeof sub.stripeCustomerId !== 'string' || !sub.stripeCustomerId
      || !(sub.currentPeriodEnd instanceof Date) || !Number.isFinite(sub.currentPeriodEnd.getTime())
      || plan !== (sub.plan === 'business' ? 'business' : 'pro')) throw Error('AB plan changed');
    const subscription = JSON.stringify([sub.status, sub.plan, sub.stripeCustomerId, sub.currentPeriodEnd.getTime()]);
    if (own.subscription !== undefined && (own.subscription !== subscription || own.plan !== plan)) throw Error('AB plan changed');
    own.subscription = subscription; own.plan = plan;
    if (own.youtube !== undefined || youtubeToken !== undefined) {
      const yt = await tx.youtubeToken.findUnique({ where: { userId: own.userId }, select: { id:true,userId: true, channelId:true,accessToken: true, expiresAt: true } }); check();
      if (!yt || yt.userId !== own.userId || youtubeToken!==undefined&&yt.accessToken !== youtubeToken || !(yt.expiresAt instanceof Date)
        || !Number.isFinite(yt.expiresAt.getTime()) || yt.expiresAt.getTime() <= Date.now()) throw Error('AB channel credential changed');
      const channel = JSON.stringify([yt.id,yt.userId,yt.channelId,yt.accessToken,yt.expiresAt.getTime()]);
      if (own.youtube !== undefined && own.youtube !== channel) throw Error('AB channel credential changed');
      own.youtube = channel;
    }
  };
  let prepared=false;
  const prepare=async()=>{
    if(prepared)throw Error('AB source already captured');prepared=true;check();
    // These reads only veto a predecessor. A fresh locked admission below is
    // still mandatory and alone may dispatch the original title producer.
    const prior=await prisma.abTestCreationAttempt.findUnique({where:{id:key}});check();
    const pending=await prisma.abTestCreationAttempt.findFirst({where:{userId:own.userId,state:{not:'complete'}}});check();
    const mutationKey=await prisma.abTestMutationAttempt.findUnique({where:{id:key}});check();
    const mutation=await prisma.abTestMutationAttempt.findFirst({where:{userId:own.userId,state:{not:'complete'}}});check();
    if(prior||pending||mutationKey||mutation)throw Error('AB predecessor retained');
    const p=await prisma.subscription.findUnique({where:{userId:own.userId},select:{userId:true,status:true,plan:true,stripeCustomerId:true,currentPeriodEnd:true}});check();
    if(!p||!['free','pro','business'].includes(p.plan))throw Error('AB native plan unavailable');
    if(p.plan==='free'||!hasPaidAccess(p))return{plan:'free' as PlanType,token:'',video:{}};
    if(p.userId!==own.userId||typeof p.stripeCustomerId!=='string'||!p.stripeCustomerId||!(p.currentPeriodEnd instanceof Date)||!Number.isFinite(p.currentPeriodEnd.getTime()))throw Error('AB native plan unavailable');
    own.subscription=JSON.stringify([p.status,p.plan,p.stripeCustomerId,p.currentPeriodEnd.getTime()]);own.plan=p.plan as PlanType;
    if(p.stripeCustomerId==='manual_admin')own.expires=Math.min(own.expires,p.currentPeriodEnd.getTime());check();
    const yt=await prisma.youtubeToken.findUnique({where:{userId:own.userId},select:{id:true,userId:true,channelId:true,accessToken:true,expiresAt:true}});check();
    if(!yt||typeof yt.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(yt.id)||yt.userId!==own.userId||!selectionChannel(yt.channelId)||typeof yt.accessToken!=='string'||!yt.accessToken||yt.accessToken.length>8192||/[\r\n]/.test(yt.accessToken)||!(yt.expiresAt instanceof Date)||!Number.isFinite(yt.expiresAt.getTime())||yt.expiresAt.getTime()<=Date.now())throw Error('AB native channel unavailable');
    const token=yt.accessToken,channelId=yt.channelId;own.youtube=JSON.stringify([yt.id,yt.userId,channelId,token,yt.expiresAt.getTime()]);own.expires=Math.min(own.expires,yt.expiresAt.getTime());check();
    const current=async()=>{const row=await lookup(own.token);check();if(!eligible(row,own.token)||!row||row.id!==own.tokenId||row.userId!==own.userId||row.user.email!==own.email||row.expiresAt.getTime()!==own.tokenExpires||row.user.emailVerified!.getTime()!==own.verifiedAt)throw Error('AB credential changed');
      const sub=await prisma.subscription.findUnique({where:{userId:own.userId}});check();if(!sub||JSON.stringify([sub.status,sub.plan,sub.stripeCustomerId,sub.currentPeriodEnd?.getTime()])!==own.subscription)throw Error('AB plan changed');
      const t=await prisma.youtubeToken.findUnique({where:{userId:own.userId}});check();if(!t||JSON.stringify([t.id,t.userId,t.channelId,t.accessToken,t.expiresAt?.getTime()])!==own.youtube)throw Error('AB channel changed');};
    const source=async(path:string,params:Record<string,string>)=>{await current();const u=new URL(path,'https://www.googleapis.com');u.search=new URLSearchParams(params).toString();
      const r=await nativeFetch(u.href,{cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token},signal:own.request.signal});check();
      if(r.status!==200||!r.ok||r.redirected||!/^application\/json(?:;|$)/i.test(r.headers.get('content-type')??'')||!r.body)throw Error('AB source unavailable');
      const reader=r.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,body='';try{for(;;){check();const part=await reader.read();check();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576)throw Error('AB source unavailable');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{void reader.cancel().catch(()=>{});}return selectionObject(JSON.parse(body));};
    const actor=await source('/youtube/v3/channels',{part:'id',mine:'true',maxResults:'50'});
    if(actor.kind!=='youtube#channelListResponse'||!Array.isArray(actor.items)||actor.items.length>50||actor.nextPageToken)throw Error('AB actor unavailable');
    const matches=actor.items.map(selectionObject).filter(v=>v.id===channelId);if(matches.length!==1||matches[0].kind!=='youtube#channel')throw Error('AB actor changed');
    const videos=await source('/youtube/v3/videos',{part:'snippet,statistics',id:accepted.videoId});
    if(videos.kind!=='youtube#videoListResponse'||!Array.isArray(videos.items)||videos.items.length!==1||videos.nextPageToken)throw Error('AB video unavailable');
    const video=selectionObject(videos.items[0]),snippet=selectionObject(video.snippet);
    if(video.kind!=='youtube#video'||video.id!==accepted.videoId||snippet.channelId!==channelId)throw Error('AB video owner changed');
    await current();return{plan:own.plan,token,video};
  };
  const result = await createAbTest(own.userId, accepted, check, { attemptId: key, check: nativeCheck, admitted: () => { check(); own.admitted = true; },prepare });
  // The original helper owns completion after dispatch even when this waiter
  // retires. A lost/malformed/failed ACK keeps our negative reservation too.
  check();
  if (result.ok && (typeof result.test.id !== 'string' || !result.test.id || result.test.userId !== own.userId
    || result.test.videoId !== accepted.videoId || result.test.variantA !== accepted.variantA || result.test.variantB !== accepted.variantB
    || result.test.hoursPerVariant !== (accepted.hoursPerVariant ?? 48) || result.test.status !== 'variant_a'
    || !(result.test.startedAt instanceof Date) || !Number.isFinite(result.test.startedAt.getTime())
    || result.test.startedAt.getTime() < own.capturedAt || result.test.startedAt.getTime() > Date.now())) throw Error('AB completion ACK unconfirmed');
  if (result.ok || (result.status < 500 && !['youtube_reconnect_required'].includes(result.error))) retainedOwners.delete(own.userId);
  return result;
}
