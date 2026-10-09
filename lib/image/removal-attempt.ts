import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { assertRemovalPng } from '@/lib/image/remove-background-provider';
type Saved={id:string;userId:string;digest:string;state:string;output:Uint8Array|null};
// Pending is never a lease or recovered authority. Only the live invocation
// receiving a fresh admission return may execute its original local closure.
export async function keyedRemoval(userId:string,key:string,file:File,signal:AbortSignal,prepare:()=>Promise<Response|(()=>Promise<Uint8Array>)>,readOnly=false) {
 const id='removal_'+createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
 try{
  if(signal.aborted)throw Error('Unconfirmed');
  const bytes=new Uint8Array(await file.arrayBuffer());if(signal.aborted)throw Error('Unconfirmed');
  const digest=createHash('sha256').update(JSON.stringify([file.type])).update(bytes).digest('hex');
  const pending=()=>Response.json({code:'removal_attempt_pending',operationPending:true,id,userId,operationKey:key},{status:409,headers:{'Cache-Control':'no-store'}});
  const replay=(saved:Saved)=>{
   if(saved.id!==id||saved.userId!==userId||saved.digest!==digest)return Response.json({code:'removal_attempt_conflict'},{status:409,headers:{'Cache-Control':'no-store'}});
   if(saved.state==='pending'&&saved.output===null)return pending();
   if(saved.state!=='complete'||!(saved.output instanceof Uint8Array))throw Error('Unconfirmed');
   assertRemovalPng(saved.output);
   return new Response(new Blob([new Uint8Array(saved.output)],{type:'image/png'}),{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Removal-Id':id,'X-Operation-Key':key,'X-User-Id':userId}});
  };
  const existing=await prisma.removalAttempt.findUnique({where:{id}});if(existing)return replay(existing);
  if(readOnly)return Response.json({code:'removal_attempt_not_retained',retryMayConsume:false},{status:409,headers:{'Cache-Control':'no-store'}});
  const generate=await prepare();if(generate instanceof Response)return generate;
  try{
   const admission=await prisma.$transaction(async tx=>{
    const owner=await tx.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM users WHERE id=$1 FOR UPDATE',userId);
    if(owner.length!==1||signal.aborted)throw Error('Unconfirmed');
    const row=await tx.removalAttempt.findUnique({where:{id}});if(row)return replay(row);
    if(!isPaid(await getUserPlan(userId)))return Response.json({error:'pro_required'},{status:403});
    if(!await rateLimitDb('remove-bg:'+userId,20,60,true))return Response.json({error:'Solicitud no admitida'},{status:429});
    await tx.removalAttempt.create({data:{id,userId,digest,state:'pending'}});
    return true as const;
   },{maxWait:10_000,timeout:15_000});
   if(admission!==true)return admission;
   if(signal.aborted)return pending();
   const png=await generate();assertRemovalPng(png);
   const saved=await prisma.removalAttempt.updateMany({where:{id,userId,digest,state:'pending',output:null},data:{state:'complete',output:Buffer.from(png)}});
   if(saved.count!==1)throw Error('Unconfirmed');
   const completed=await prisma.removalAttempt.findUnique({where:{id}});if(!completed)throw Error('Unconfirmed');return replay(completed);
  }catch{
   const row=await prisma.removalAttempt.findUnique({where:{id}});if(row)return replay(row);
   throw Error('Unconfirmed');
  }
 }catch{return Response.json({code:'image_result_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
