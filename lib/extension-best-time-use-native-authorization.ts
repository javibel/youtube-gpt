import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

declare const bestTimeUseBrand: unique symbol;
export type ExtensionBestTimeUse = { readonly [bestTimeUseBrand]: true };
type Owner = { token:string; tokenId:string; userId:string; email:string; tokenExpires:number; capturedAt:number; expires:number; used:boolean };
type Attempt = { id:string; key:string; userId:string; email:string; tokenId:string; eventId:string; state:string; createdAt:Date; eventAt:Date|null };
const originals = new WeakMap<object,Owner>();
// These receipts come only from this module's actual terminal SQL ACKs. Rows,
// process restarts, timestamps and request keys cannot rebuild them.
const completed = new Map<string,Attempt>();
const retainedOwners = new Set<string>();
const acknowledgedEvents = new Map<string,number>();
const lookup = (token:string,db:Pick<Prisma.TransactionClient,'extensionToken'>=prisma) => db.extensionToken.findUnique({where:{token},include:{user:{select:{id:true,email:true,emailVerified:true}}}});
function eligible(row:Awaited<ReturnType<typeof lookup>>,token:string) {
 const now=Date.now();
 return !!row&&row.token===token&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=128&&!!row.user
  &&typeof row.user.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(row.user.id)&&row.userId===row.user.id
  &&typeof row.user.email==='string'&&row.user.email.length<=254&&row.user.email===row.user.email.trim().toLowerCase()
  &&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
  &&row.expiresAt instanceof Date&&Number.isFinite(row.expiresAt.getTime())&&row.expiresAt.getTime()>now
  &&row.user.emailVerified instanceof Date&&Number.isFinite(row.user.emailVerified.getTime())&&row.user.emailVerified.getTime()<=now;
}
export const validBestTimeUseKey = (v:unknown):v is string => typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export async function authorizeExtensionBestTimeUse(request:Request):Promise<ExtensionBestTimeUse|null> {
 const capturedAt=Date.now(),header=request.headers.get('Authorization');
 if(!Number.isSafeInteger(capturedAt)||capturedAt<0||!header||!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const token=header.slice(7),row=await lookup(token);
 if(!eligible(row,token)||!row||!row.user.email)return null;
 const tokenExpires=row.expiresAt.getTime(),expires=Math.min(tokenExpires,capturedAt+25000);
 if(expires<=Date.now())return null;
 const original=Object.freeze({}) as ExtensionBestTimeUse;
 originals.set(original,{token,tokenId:row.id,userId:row.user.id,email:row.user.email,tokenExpires,capturedAt,expires,used:false});return original;
}
function retained(original:ExtensionBestTimeUse) {
 const own=original&&typeof original==='object'?originals.get(original):undefined;
 if(!own||own.expires<=Date.now())throw Error('Best time use unconfirmed');return own;
}
export function checkExtensionBestTimeUse(original:ExtensionBestTimeUse) {retained(original);}
function same(row:Attempt|null,expected:Attempt) {
 return !!row&&['id','key','userId','email','tokenId','eventId','state'].every(k=>row[k as keyof Attempt]===expected[k as keyof Attempt])
  &&row.createdAt instanceof Date&&row.createdAt.getTime()===expected.createdAt.getTime()
  &&(expected.eventAt===null?row.eventAt===null:row.eventAt instanceof Date&&row.eventAt.getTime()===expected.eventAt.getTime());
}
export async function recordExtensionBestTimeUse(original:ExtensionBestTimeUse,key:string,beforeStep:()=>void) {
 const own=retained(original);if(own.used||!validBestTimeUseKey(key))throw Error('Best time use unconfirmed');own.used=true;
 const check=()=>{retained(original);beforeStep();};check();
 if(retainedOwners.has(own.userId))throw Error('Best time use original retained');
 // Reserve before attempting SQL. Failure/abort/lost ACK keeps this reservation;
 // there is no finally cleanup, retry, reset, or recovery from a persisted row.
 retainedOwners.add(own.userId);
 const captured:Attempt={id:randomUUID(),key,userId:own.userId,email:own.email,tokenId:own.tokenId,eventId:randomUUID(),state:'pending',createdAt:new Date(own.capturedAt),eventAt:null};
 const lock=async(tx:Prisma.TransactionClient)=>{
  check();const users=await tx.$queryRawUnsafe<Array<{id:string;email:string}>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',own.userId);check();
  if(users.length!==1||users[0].id!==own.userId||users[0].email!==own.email)throw Error('Best time use account changed');
  const row=await lookup(own.token,tx);check();
  if(!eligible(row,own.token)||!row||row.id!==own.tokenId||row.userId!==own.userId||row.user.email!==own.email||row.expiresAt.getTime()!==own.tokenExpires)throw Error('Best time use credential changed');
 };
 const options={maxWait:10000,timeout:15000};
 const admission=await prisma.$transaction(async tx=>{
  await lock(tx);
  const duplicate=await tx.extensionBestTimeUseAttempt.findUnique({where:{key}});check();if(duplicate)throw Error('Best time use key retained');
  const prior=await tx.extensionBestTimeUseAttempt.findMany({where:{userId:own.userId}});check();
  // Every previous native row must still match an ACK retained by this exact
  // module. Complete rows from reloads or another executor remain negative.
  if(!Array.isArray(prior)||prior.some(row=>!completed.has(row.id)||!same(row,completed.get(row.id)!)))throw Error('Best time use predecessor unconfirmed');
  return tx.extensionBestTimeUseAttempt.create({data:captured});
 },options);
 if(!same(admission,captured))throw Error('Best time use admission ACK unconfirmed');check();
 let eventAt:Date|null=null;
 const last=acknowledgedEvents.get(own.userId);
 // One BEST_TIME event per account per ten minutes, from a native ACK only.
 // A backwards clock suppresses usage; elapsed time never clears uncertainty.
 if(last===undefined||Date.now()-last>=600000) {
  eventAt=new Date(own.capturedAt);
  const event=await prisma.$transaction(async tx=>{
   await lock(tx);const row=await tx.extensionBestTimeUseAttempt.findUnique({where:{id:captured.id}});check();if(!same(row,captured))throw Error('Best time use original changed');
   const result=await tx.extensionEvent.create({data:{id:captured.eventId,userId:own.userId,action:'best-time',createdAt:eventAt!}});check();return result;
  },options);
  if(event.id!==captured.eventId||event.userId!==own.userId||event.action!=='best-time'||!(event.createdAt instanceof Date)||event.createdAt.getTime()!==eventAt.getTime())throw Error('Best time use event ACK unconfirmed');check();
 }
 const expected:Attempt={...captured,state:'complete',eventAt};
 const terminal=await prisma.$transaction(async tx=>{
  await lock(tx);const row=await tx.extensionBestTimeUseAttempt.findUnique({where:{id:captured.id}});check();if(!same(row,captured))throw Error('Best time use original changed');
  const changed=await tx.extensionBestTimeUseAttempt.updateMany({where:{...captured},data:{state:'complete',eventAt}});check();if(changed.count!==1)throw Error('Best time use completion unconfirmed');
  const result=await tx.extensionBestTimeUseAttempt.findUnique({where:{id:captured.id}});check();return result;
 },options);
 if(!same(terminal,expected))throw Error('Best time use terminal ACK unconfirmed');check();
 completed.set(captured.id,Object.freeze(expected));if(eventAt!==null)acknowledgedEvents.set(own.userId,eventAt.getTime());retainedOwners.delete(own.userId);
 return Object.freeze({key,observedAt:new Date(own.capturedAt).toISOString(),expiresAt:own.expires,usage:eventAt===null?'throttled' as const:'recorded' as const,eventAt:eventAt===null?null:eventAt.toISOString()});
}
