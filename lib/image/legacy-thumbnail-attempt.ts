import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';
import type { Prisma } from '@prisma/client';

export type ThumbnailResult={imageUrl:string;prompt:string;inputs:Prisma.InputJsonValue;tokensUsed:number;ipAddress:string|null};
type Saved={id:string;userId:string;digest:string;state:string;output:string|null;prompt:string|null};
function valid(value:{output:unknown;prompt:unknown}) {
 if(typeof value.output!=='string'||!value.output||value.output.length>4096||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>4000)return false;
 try{const u=new URL(value.output);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}
}
// A pending business receipt never permits reclaim. Only the live invocation
// receiving fresh admission can run its original closure; no reset or lease.
export async function keyedLegacyThumbnail(userId:string,key:string,fields:readonly unknown[],photo:{type:string;bytes:Uint8Array}|null,signal:AbortSignal,prepare:()=>Promise<Response|(()=>Promise<ThumbnailResult>)>) {
 const id='legacy_thumbnail_'+createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
 const digest=createHash('sha256').update(JSON.stringify([fields,photo?.type??null])).update(photo?.bytes??new Uint8Array()).digest('hex');
 const pending=()=>Response.json({code:'thumbnail_attempt_pending',operationPending:true,id,userId,operationKey:key},{status:409,headers:{'Cache-Control':'no-store'}});
 const replay=(row:Saved)=>{
  if(row.id!==id||row.userId!==userId||row.digest!==digest)return Response.json({code:'thumbnail_attempt_conflict'},{status:409,headers:{'Cache-Control':'no-store'}});
  if(row.state==='pending'&&row.output===null&&row.prompt===null)return pending();
  if(row.state!=='complete'||!valid(row))throw Error('Unconfirmed');
  return Response.json({imageUrl:row.output,prompt:row.prompt,id,userId,operationKey:key},{headers:{'Cache-Control':'no-store'}});
 };
 try{
  if(signal.aborted)throw Error('Unconfirmed');
  const existing=await prisma.legacyThumbnailAttempt.findUnique({where:{id}});if(existing)return replay(existing);
  const generate=await prepare();if(generate instanceof Response)return generate;
  const admission=await prisma.$transaction(async tx=>{
   const owner=await tx.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM users WHERE id=$1 FOR UPDATE',userId);
   if(owner.length!==1||signal.aborted)throw Error('Unconfirmed');
   const row=await tx.legacyThumbnailAttempt.findUnique({where:{id}});if(row)return replay(row);
   const plan=await getUserPlan(userId);if(!isPaid(plan))return Response.json({limitReached:true,error:'pro_required'},{status:403});
   const month=new Date();month.setDate(1);month.setHours(0,0,0,0);
   // Existing history policy only. Distinct attempts still need a shared monthly
   // reservation policy; neither this receipt nor the background is a new charge.
   if(await tx.generation.count({where:{userId,createdAt:{gte:month}}})>=getLimits(plan).generationsPerMonth)return Response.json({limitReached:true},{status:429});
   if(!await rateLimitDb('gen-thumb:'+userId,3,1,true))return Response.json({error:'Solicitud no admitida'},{status:429});
   await tx.legacyThumbnailAttempt.create({data:{id,userId,digest,state:'pending'}});
   return true as const;
  },{maxWait:10_000,timeout:15_000});
  if(admission!==true)return admission;
  if(signal.aborted)return pending();
  const result=await generate();if(!valid({output:result.imageUrl,prompt:result.prompt})||!Number.isSafeInteger(result.tokensUsed)||result.tokensUsed<0)throw Error('Unconfirmed');
  // Storage cannot be rolled back. History and the completed receipt are one
  // PostgreSQL transaction; an ambiguous commit is read, never rerun.
  await prisma.$transaction(async tx=>{
   await tx.generation.create({data:{id,userId,template:'thumbnail',inputs:result.inputs,output:result.imageUrl,tokensUsed:result.tokensUsed,ipAddress:result.ipAddress}});
   const changed=await tx.legacyThumbnailAttempt.updateMany({where:{id,userId,digest,state:'pending',output:null,prompt:null},data:{state:'complete',output:result.imageUrl,prompt:result.prompt}});
   if(changed.count!==1)throw Error('Unconfirmed');
  },{maxWait:10_000,timeout:15_000});
  const complete=await prisma.legacyThumbnailAttempt.findUnique({where:{id}});if(!complete)throw Error('Unconfirmed');return replay(complete);
 }catch{
  try{const row=await prisma.legacyThumbnailAttempt.findUnique({where:{id}});if(row)return replay(row);}catch{}
  return Response.json({code:'image_result_unconfirmed',error:'Miniatura sin confirmar. Conserva el mismo intento antes de iniciar otro.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
