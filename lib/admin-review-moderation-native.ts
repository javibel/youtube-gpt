import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const adminReviewModerationBrand: unique symbol;
export type NativeAdminReviewModeration = { readonly [adminReviewModerationBrand]: true };
type Original = { id: string; email: string; sessionRef: string; issuedAt: number; tokenExpires: number;
  verifiedAt: number; startedAt: number; deadline: number; expiresAt: number; signal: AbortSignal; origin: string; used: boolean; command:Command; commandRef:string; closed:boolean;
  effectEntered:boolean; mutationEntered:boolean; databaseAcknowledged:boolean; phase:'new'|'transaction'|'database-ack'|'response-created'|'uncertain'|'denied' };
type Command = Readonly<{id:string;status:'approved'|'rejected'}>;
type AdminRow = {id:string;email:string|null;emailVerified:Date|null};
const originals = new WeakMap<object, Original>();
// Process-local denial reservations only. They neither recover an operation nor
// coordinate workers/restarts; durable coordination remains an activation gate.
const commands = new Map<string,Original>(), targets = new Map<string,Original>();
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const account = (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
function eligible(row: AdminRow|null, id: string, email: string) {
  return !!row && row.id === id && row.email === email && row.emailVerified instanceof Date
    && Number.isFinite(row.emailVerified.getTime()) && row.emailVerified.getTime() >= 0 && row.emailVerified.getTime() <= Date.now();
}
function check(own: Original) {
  if (own.closed || own.signal.aborted || Date.now() < own.startedAt || Date.now() >= own.expiresAt
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin review moderation unconfirmed');
}
function retained(original: NativeAdminReviewModeration) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own) throw Error('Admin review moderation unconfirmed');
  check(own); return own;
}

export function adminReviewModerationInput(value:unknown):Command|null {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'id')||!Object.hasOwn(value,'status'))return null;
  const {id,status}=value as Record<string,unknown>;
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||(status!=='approved'&&status!=='rejected'))return null;
  return Object.freeze({id,status});
}
// Only this installed native cookie/account path originates a moderation grant.
// A command reference, input DTO or read grant can only restrict, never grant.
export async function authorizeNativeAdminReviewModeration(request: Request, input:unknown, commandRef:string): Promise<NativeAdminReviewModeration | null> {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal;
  const command=adminReviewModerationInput(input);if(!command||!uuid(commandRef))return null;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, cookie = request.headers.get('cookie');
  if (!origin || !cookie || signal.aborted || !ADMIN_EMAIL || ADMIN_EMAIL !== ADMIN_EMAIL.trim().toLowerCase()
    || ADMIN_EMAIL.length > 254 || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL)) return null;
  let configured: URL;
  try { configured = new URL(origin); } catch { return null; }
  if (configured.username || configured.password || configured.search || configured.hash || configured.protocol !== 'https:'
    && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))) return null;
  let incoming:URL;try{incoming=new URL(request.url);}catch{return null;}
  if(request.method!=='PATCH'||incoming.origin!==configured.origin||incoming.pathname!=='/api/admin/reviews'||incoming.search||incoming.hash||request.headers.get('origin')!==configured.origin)return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', configured.origin), { headers: { cookie }, signal }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = decoded;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL
    || !uuid(authSessionRef) || isAdmin !== true || requiresVerification !== false || requiresTotp !== false
    || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
    || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return null;
  const own: Original = { id, email, sessionRef: authSessionRef, issuedAt: iat, tokenExpires: exp,
    verifiedAt: 0, startedAt, deadline, expiresAt: Math.min(startedAt + 25_000, exp * 1000), signal, origin, used:false,command,commandRef,closed:false,effectEntered:false,mutationEntered:false,databaseAcknowledged:false,phase:'new' };
  check(own);
  const row = await account(id); check(own);
  if (!eligible(row, id, email) || !row) return null;
  own.verifiedAt = row.emailVerified!.getTime();
  const original = Object.freeze({}) as NativeAdminReviewModeration;
  originals.set(original, own); return original;
}
export function checkNativeAdminReviewModeration(original: NativeAdminReviewModeration): void { retained(original); }
export function closeNativeAdminReviewModeration(original: NativeAdminReviewModeration): void {
  const own=originals.get(original);if(!own)return;own.closed=true;
  if(own.effectEntered&&own.phase!=='response-created')own.phase='uncertain';
  if(!own.effectEntered&&targets.get(own.command.id)===own)targets.delete(own.command.id);
  originals.delete(original);
}


// The fixed transaction owns its original completion after update invocation.
// The HTTP waiter can retire; that never proves rollback, permits replay, or
// clears an uncertain target. No stored key/phase can resume this capability.
export async function applyNativeAdminReviewModeration(original:NativeAdminReviewModeration){
  const own=retained(original);if(own.used)throw Error('Admin review moderation unconfirmed');own.used=true;
  if(commands.has(own.commandRef)||targets.has(own.command.id)||commands.size>=10000)throw Error('Admin review moderation unconfirmed');
  commands.set(own.commandRef,own);targets.set(own.command.id,own);
  try{
    retained(original);own.effectEntered=true;own.phase='transaction';
    const changed=await prisma.$transaction(async tx=>{
      retained(original);
      const rows=await tx.$queryRaw<AdminRow[]>`SELECT id,email,"emailVerified" FROM users WHERE id=${own.id} FOR UPDATE`;
      retained(original);const row=rows[0];
      if(rows.length!==1||!row||!eligible(row,own.id,own.email)||row.emailVerified?.getTime()!==own.verifiedAt)throw Error('Admin review moderation unconfirmed');
      // No asynchronous gap between the last retained check and this exact
      // update. The locked native account cannot change before SQL commit.
      retained(original);own.mutationEntered=true;
      const updated=await tx.review.update({where:{id:own.command.id},data:{status:own.command.status},select:{id:true,status:true}});
      if(!updated||updated.id!==own.command.id||updated.status!==own.command.status)throw Error('Admin review moderation unconfirmed');
      // After dispatch there is no dependent action or late auth refresh. Let
      // this same SQL producer complete atomically even if HTTP has retired.
      return{id:updated.id,status:updated.status};
    },{maxWait:5000,timeout:15000});
    own.databaseAcknowledged=true;retained(original);
    if(changed.id!==own.command.id||changed.status!==own.command.status)throw Error('Admin review moderation unconfirmed');
    own.phase='database-ack';
    return{ok:true as const,adminReviewModeration:{commandRef:own.commandRef,reviewId:own.command.id,status:own.command.status,userId:own.id,email:own.email,asOf:own.startedAt,expiresAt:own.expiresAt}};
  }catch{
    own.phase=own.effectEntered?'uncertain':'denied';
    if(!own.effectEntered&&targets.get(own.command.id)===own)targets.delete(own.command.id);
    throw Error('Admin review moderation unconfirmed');
  }
}
// Acknowledges only the original SQL ACK plus successfully constructed response,
// never delivery to a browser. The reference remains a permanent negative key.
export function confirmNativeAdminReviewModeration(original:NativeAdminReviewModeration):void{
  const own=retained(original);
  if(own.phase!=='database-ack'||!own.databaseAcknowledged||targets.get(own.command.id)!==own)throw Error('Admin review moderation unconfirmed');
  own.phase='response-created';targets.delete(own.command.id);
}
