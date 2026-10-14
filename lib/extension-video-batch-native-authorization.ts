import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
declare const batchBrand: unique symbol;
export type ExtensionBatchSession = { readonly [batchBrand]: true };
type Owner = { kind: 'public' | 'authenticated'; principal: string; id?: string; email?: string; token?: string; tokenId?: string; expires: number; used: boolean; quotaKey?: string };
const originals = new WeakMap<object, Owner>();
const acknowledgedEvents = new Map<string, number>();
export const validBatchKey = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const lookup = (token: string, db: Pick<Prisma.TransactionClient, 'extensionToken'> = prisma) => db.extensionToken.findUnique({
  where: { token }, include: { user: { select: { id: true, email: true, emailVerified: true } } },
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

export async function authorizeExtensionBatch(request: Request): Promise<ExtensionBatchSession | null> {
  const header = request.headers.get('Authorization');
  const original = Object.freeze({}) as ExtensionBatchSession;
  if (header === null) {
    // Preserve the public policy. Forwarded headers are only an untrusted quota
    // partition hint: they never identify an authenticated user or recover work.
    // Authentic ingress/IP provenance remains an operational dependency.
    const raw = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
    const partition = raw.length <= 64 && isIP(raw) ? raw : 'unknown';
    originals.set(original, { kind: 'public', principal: 'public:'+partition, quotaKey:'ext-pub-batch:'+partition, expires:Date.now()+55_000, used:false });
    return original;
  }
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email) return null;
  originals.set(original, { kind:'authenticated', principal:'user:'+row.user.id, id:row.user.id, email:row.user.email, token, tokenId:row.id, expires:row.expiresAt.getTime(), used:false });
  return original;
}
function retained(original: ExtensionBatchSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now()) throw Error('Batch authentication unconfirmed');
  return own;
}
export function checkExtensionBatch(original: ExtensionBatchSession): void { retained(original); }
export function extensionBatchMeta(original: ExtensionBatchSession) { const own=retained(original);return {mode:own.kind,expires:own.expires}; }
export async function runExtensionBatch<T>(original: ExtensionBatchSession, key: string, beforeStep: () => void, action: (check: () => void) => Promise<T>): Promise<T | null> {
  const own=retained(original);if(own.used||!validBatchKey(key))throw Error('Batch operation unconfirmed');own.used=true;
  const check=()=>{retained(original);beforeStep();},captured=Object.freeze({id:randomUUID(),principal:own.principal,key,eventId:randomUUID()});
  const matches=(row:Record<string,unknown>|null)=>!!row&&row.state==='pending'&&Object.entries(captured).every(([k,v])=>row[k]===v);
  const lock=async(tx:Prisma.TransactionClient)=>{
    check();
    if(own.kind==='public') {
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock', 'extension-video-batch:'+own.principal);check();return;
    }
    const users=await tx.$queryRawUnsafe<Array<{id:string;email:string}>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',own.id);check();
    if(users.length!==1||users[0].id!==own.id||users[0].email!==own.email)throw Error('Batch account unconfirmed');
    const token=await lookup(own.token!,tx);check();
    if(!eligible(token,own.token!)||!token||token.id!==own.tokenId||token.userId!==own.id||token.user.email!==own.email||token.expiresAt.getTime()!==own.expires)throw Error('Batch token unconfirmed');
  };
  check();
  const admission=await prisma.$transaction(async tx=>{
    await lock(tx);
    const prior=await tx.extensionBatchOperation.findFirst({where:{OR:[{key},{principal:own.principal,state:{not:'complete'}}]}});check();if(prior)throw Error('Batch original retained');
    const row=await tx.extensionBatchOperation.create({data:{...captured,state:'pending'}});check();
    let allowed=true;
    if(own.kind==='public') {
      const hits=await tx.$queryRawUnsafe<Array<{hits:number}>>(
        "INSERT INTO rate_limits (key,hits,window_start) VALUES ($1,1,NOW()) ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<NOW()-INTERVAL '10 minutes' THEN 1 ELSE rate_limits.hits+1 END, window_start=CASE WHEN rate_limits.window_start<NOW()-INTERVAL '10 minutes' THEN NOW() ELSE rate_limits.window_start END RETURNING hits",own.quotaKey);check();
      if(!Array.isArray(hits)||hits.length!==1||!Number.isSafeInteger(hits[0]?.hits)||hits[0].hits<1)throw Error('Batch quota unconfirmed');allowed=hits[0].hits<=300;
    }
    return {row,allowed};
  },{maxWait:10_000,timeout:15_000});
  if(!matches(admission.row)||typeof admission.allowed!=='boolean')throw Error('Batch admission unconfirmed');check();
  if(own.kind==='authenticated'&&Date.now()-(acknowledgedEvents.get(own.id!)??-Infinity)>=600_000) {
    const event=await prisma.$transaction(async tx=>{await lock(tx);const row=await tx.extensionBatchOperation.findUnique({where:{id:captured.id}});check();if(!matches(row))throw Error('Batch original unconfirmed');return tx.extensionEvent.create({data:{id:captured.eventId,userId:own.id!,action:'video-batch'}});},{maxWait:10_000,timeout:15_000});
    if(event.id!==captured.eventId||event.userId!==own.id||event.action!=='video-batch')throw Error('Batch event unconfirmed');acknowledgedEvents.set(own.id!,Date.now());
  }
  check();const result=admission.allowed?await action(check):null;check();
  const complete=await prisma.$transaction(async tx=>{await lock(tx);const row=await tx.extensionBatchOperation.findUnique({where:{id:captured.id}});check();if(!matches(row))throw Error('Batch original unconfirmed');return tx.extensionBatchOperation.updateMany({where:{...captured,state:'pending'},data:{state:'complete'}});},{maxWait:10_000,timeout:15_000});
  if(complete.count!==1)throw Error('Batch completion unconfirmed');check();return result;
}
