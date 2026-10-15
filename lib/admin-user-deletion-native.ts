import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { emptyAdminDeletionWhere } from '@/lib/admin-user-deletion-policy';
import type { Prisma } from '@prisma/client';

declare const userDeletionBrand: unique symbol;
export type NativeAdminUserDeletion = { readonly [userDeletionBrand]: true };
type Command = Readonly<{ userId:string; email:string }>;
type AdminRow = { id: string; email: string | null; emailVerified: Date | null };
type TargetRow = { id: string; email: string | null };
type Original = { id: string; email: string; sessionRef: string; verifiedAt: number; command: Command; commandRef: string;
  startedAt: number; deadline: number; expiresAt: number;
  origin: string; signal: AbortSignal; used: boolean; closed: boolean; admitted: boolean; createEntered: boolean; databaseAcknowledged: boolean;
  phase: 'new' | 'admission' | 'transaction' | 'denied' | 'database-ack' | 'response-created' | 'uncertain' };
const originals = new WeakMap<object, Original>();
// Fast negative fences only. The separate permanent command/target ledger also
// denies independent workers/restarts. No stored row can originate or resume us.
const commands = new Map<string, Original>(), targets = new Map<string, Original>();
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const address = (v: string) => v.length <= 254 && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const account = (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } });
function eligible(row: AdminRow | null, id: string, email: string) {
  return !!row && row.id === id && row.email === email && row.emailVerified instanceof Date
    && Number.isFinite(row.emailVerified.getTime()) && row.emailVerified.getTime() >= 0 && row.emailVerified.getTime() <= Date.now();
}
function retained(original: NativeAdminUserDeletion) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.closed || own.signal.aborted || Date.now() < own.startedAt || Date.now() >= own.expiresAt
    || performance.now() >= own.deadline || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== own.origin) throw Error('Admin user deletion unconfirmed');
  return own;
}
export function adminUserDeletionInput(input: unknown):Command|null {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'userId')||!Object.hasOwn(input,'email'))return null;
  const {userId,email}=input as Record<string,unknown>;
  if(!identifier(userId)||typeof email!=='string'||email.length>254)return null;
  const canonical=email.trim().toLowerCase();return address(canonical)?Object.freeze({userId,email:canonical}):null;
}
export async function authorizeNativeAdminUserDeletion(request: Request, input: unknown, commandRef: string): Promise<NativeAdminUserDeletion | null> {
  const startedAt = Date.now(), deadline = performance.now() + 25000, signal = request.signal, command = adminUserDeletionInput(input);
  if (!command || !uuid(commandRef)) return null;
  const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL, cookie = request.headers.get('cookie');
  if (!origin || !cookie || signal.aborted || !ADMIN_EMAIL || ADMIN_EMAIL !== ADMIN_EMAIL.trim().toLowerCase() || !address(ADMIN_EMAIL)) return null;
  let configured: URL, incoming: URL; try { configured = new URL(origin); incoming = new URL(request.url); } catch { return null; }
  if (configured.username || configured.password || configured.search || configured.hash || configured.protocol !== 'https:'
    && !(configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname))) return null;
  if (request.method !== 'DELETE' || incoming.username || incoming.password || incoming.origin !== configured.origin || incoming.pathname !== '/api/admin/delete-user'
    || incoming.search || incoming.hash || request.headers.get('origin') !== configured.origin) return null;
  const decoded = await readNativeSessionCookie(new Request(new URL('/api/auth/session', configured.origin), { headers: { cookie }, signal }));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
  const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = decoded;
  if (!identifier(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef) || isAdmin !== true
    || requiresVerification !== false || requiresTotp !== false || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
    || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return null;
  if(command.userId===id||command.email===ADMIN_EMAIL)return null;
  const own: Original = { id, email, sessionRef: authSessionRef, verifiedAt: 0, command, commandRef,
    startedAt, deadline, expiresAt: Math.min(startedAt + 25000, exp * 1000),
    origin, signal, used: false, closed: false, admitted: false, createEntered: false, databaseAcknowledged: false, phase: 'new' };
  // Capture is native and precedes the dependent lookup. Dates never come from
  // input/old subscription rows or a later retry/renewal clock.
  if (signal.aborted || Date.now() < startedAt || Date.now() >= own.expiresAt || performance.now() >= deadline) return null;
  const row = await account(id);
  if (signal.aborted || Date.now() < startedAt || Date.now() >= own.expiresAt || performance.now() >= deadline
    || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== origin || !eligible(row, id, email) || !row) return null;
  own.verifiedAt = row.emailVerified!.getTime();
  const original = Object.freeze({}) as NativeAdminUserDeletion; originals.set(original, own); return original;
}
export function checkNativeAdminUserDeletion(original: NativeAdminUserDeletion): void { retained(original); }
export function closeNativeAdminUserDeletion(original: NativeAdminUserDeletion): void {
  const own = originals.get(original); if (!own) return;
  own.closed = true; if (own.createEntered && own.phase !== 'response-created') own.phase = 'uncertain'; originals.delete(original);
}
export async function applyNativeAdminUserDeletion(original:NativeAdminUserDeletion){
  const own=retained(original);if(own.used)throw Error('Admin user deletion unconfirmed');own.used=true;
  if(commands.has(own.commandRef)||targets.has(own.command.userId)||commands.size>=10000)throw Error('Admin user deletion unconfirmed');
  commands.set(own.commandRef,own);targets.set(own.command.userId,own);
  const targetId=own.command.userId,targetEmail=own.command.email;
  try{
    const inspect=async(tx:Prisma.TransactionClient)=>{
      retained(original);
      const admins=await tx.$queryRaw<AdminRow[]>`SELECT id,email,"emailVerified" FROM users WHERE id=${own.id} FOR UPDATE`;
      retained(original);const admin=admins[0];
      if(admins.length!==1||!admin||!eligible(admin,own.id,own.email)||admin.emailVerified?.getTime()!==own.verifiedAt)throw Error('Admin user deletion unconfirmed');
      const rows=await tx.$queryRaw<TargetRow[]>`SELECT id,email FROM users WHERE id=${targetId} FOR UPDATE`;
      retained(original);if(rows.length===0)return 'missing' as const;
      if(rows.length!==1||rows[0].id!==targetId||rows[0].email!==targetEmail||targetId===own.id||targetEmail===ADMIN_EMAIL)throw Error('Admin user deletion unconfirmed');
      const empty=await tx.user.findFirst({where:emptyAdminDeletionWhere(targetId,targetEmail),select:{id:true,email:true}});
      retained(original);if(!empty)return 'blocked' as const;
      if(empty.id!==targetId||empty.email!==targetEmail)throw Error('Admin user deletion unconfirmed');
      const credentials=await tx.$queryRaw<{blocked:boolean}[]>`SELECT EXISTS (
        SELECT 1 FROM password_reset_tokens WHERE email=${targetEmail}
        UNION ALL SELECT 1 FROM email_verification_tokens WHERE email=${targetEmail}
        UNION ALL SELECT 1 FROM verification_tokens WHERE identifier=${targetEmail}
        UNION ALL SELECT 1 FROM password_reset_request_admissions WHERE email=${targetEmail}
        UNION ALL SELECT 1 FROM email_verification_resend_admissions WHERE email=${targetEmail}
        UNION ALL SELECT 1 FROM affiliate_commissions WHERE referred_user_id=${targetId}
        UNION ALL SELECT 1 FROM users WHERE "referredBy"=${targetId}
      ) AS blocked`;
      retained(original);if(credentials.length!==1||typeof credentials[0].blocked!=='boolean')throw Error('Admin user deletion unconfirmed');
      return credentials[0].blocked?'blocked' as const:'empty' as const;
    };
    own.phase='admission';
    const admitted=await prisma.$transaction(async tx=>{
      const state=await inspect(tx);if(state!=='empty')return state;
      const rows=await tx.$queryRaw<{id:string}[]>`INSERT INTO admin_user_deletion_attempts
        (id,"userId",email,"sessionRef","targetUserId","targetEmail","createdAt",state)
        VALUES (${own.commandRef},${own.id},${own.email},${own.sessionRef},${targetId},${targetEmail},(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC'),'pending') RETURNING id`;
      retained(original);if(rows.length!==1||rows[0].id!==own.commandRef)throw Error('Admin user deletion unconfirmed');return 'admitted' as const;
    },{maxWait:5000,timeout:15000});
    retained(original);if(admitted!=='admitted'){own.phase='denied';return{ok:false as const,error:admitted};}
    own.admitted=true;own.phase='transaction';
    const deleted=await prisma.$transaction(async tx=>{
      retained(original);if(!own.admitted)throw Error('Admin user deletion unconfirmed');
      const state=await inspect(tx);if(state!=='empty')return state;
      const pending=await tx.$queryRaw<{id:string}[]>`SELECT id FROM admin_user_deletion_attempts WHERE id=${own.commandRef}
        AND "userId"=${own.id} AND email=${own.email} AND "sessionRef"=${own.sessionRef} AND "targetUserId"=${targetId}
        AND "targetEmail"=${targetEmail} AND "createdAt"=(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC')
        AND state='pending' AND "completedAt" IS NULL FOR UPDATE`;
      retained(original);if(pending.length!==1||pending[0].id!==own.commandRef)throw Error('Admin user deletion unconfirmed');
      own.createEntered=true;
      const value=await tx.user.delete({where:{id:targetId},select:{id:true,email:true}});
      if(!value||value.id!==targetId||value.email!==targetEmail)throw Error('Admin user deletion unconfirmed');
      // Same original SQL producer settles its own atomic delete/completion even
      // after HTTP retires. This is never a new or recovered dependent effect.
      const completed=await tx.$queryRaw<{id:string}[]>`UPDATE admin_user_deletion_attempts SET state='completed',"completedAt"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE id=${own.commandRef} AND "userId"=${own.id} AND email=${own.email} AND "sessionRef"=${own.sessionRef}
        AND "targetUserId"=${targetId} AND "targetEmail"=${targetEmail} AND "createdAt"=(CAST(${new Date(own.startedAt)} AS timestamptz) AT TIME ZONE 'UTC')
        AND state='pending' AND "completedAt" IS NULL RETURNING id`;
      if(completed.length!==1||completed[0].id!==own.commandRef)throw Error('Admin user deletion unconfirmed');return 'deleted' as const;
    },{maxWait:5000,timeout:15000});
    own.databaseAcknowledged=true;retained(original);if(deleted!=='deleted'){own.phase='denied';return{ok:false as const,error:deleted};}
    own.phase='database-ack';return{ok:true as const,adminUserDeletion:{commandRef:own.commandRef,targetUserId:targetId,targetEmail,userId:own.id,email:own.email,asOf:own.startedAt,expiresAt:own.expiresAt}};
  }catch{own.phase='uncertain';throw Error('Admin user deletion unconfirmed');}
}
export function confirmNativeAdminUserDeletion(original:NativeAdminUserDeletion):void{
  const own=retained(original);
  if(own.phase!=='database-ack'||!own.admitted||!own.createEntered||!own.databaseAcknowledged||commands.get(own.commandRef)!==own||targets.get(own.command.userId)!==own)throw Error('Admin user deletion unconfirmed');
  own.phase='response-created';
}
