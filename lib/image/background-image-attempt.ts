import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';

type Result={backgroundUrl:string;prompt:string};
type Saved={id:string;userId:string;digest:string;state:string;output:string|null;prompt:string|null};
function validResult(value:{output:unknown;prompt:unknown}) {
 if(typeof value.output!=='string'||!value.output||value.output.length>4096||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>4000)return false;
 try{const u=new URL(value.output);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}
}
// Only this invocation's successful fresh admission may execute its closure. No
// persisted token/JSON/hash/time/PID can reclaim a pending attempt or regenerate.
export async function keyedBackgroundImage(userId:string,key:string,inputs:{topic:string;style:string;lang:string},signal:AbortSignal,prepare:()=>Promise<Response|(()=>Promise<Result>)>,readOnly=false) {
 const id='background_ai_'+createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
 const digest=createHash('sha256').update(JSON.stringify([inputs.topic,inputs.style,inputs.lang])).digest('hex');
 const pending=()=>Response.json({error:'Generación pendiente de confirmar. Este intento no vuelve a ejecutar modelos.',code:'image_attempt_pending',operationPending:true,id,userId,operationKey:key},{status:409,headers:{'Cache-Control':'no-store'}});
 const replay=(saved:Saved)=>{
  if(saved.id!==id||saved.userId!==userId||saved.digest!==digest)return Response.json({error:'El intento no coincide',code:'image_attempt_conflict'},{status:409});
  if(saved.state==='pending' && saved.output===null && saved.prompt===null)return pending();
  if(saved.state!=='complete'||!validResult(saved))throw Error('Unconfirmed');
  return Response.json({backgroundUrl:saved.output,prompt:saved.prompt,id,userId,operationKey:key},{headers:{'Cache-Control':'no-store'}});
 };
 try{
  const existing=await prisma.backgroundImageAttempt.findUnique({where:{id}});if(existing)return replay(existing);
  // An explicit recovery may read only a retained own original receipt. A key
  // whose admission was never confirmed or has disappeared cannot create work.
  if(readOnly)return Response.json({error:'Intento no retenido. La consulta no genera otro fondo.',code:'image_attempt_not_retained',retryMayConsume:false},{status:409,headers:{'Cache-Control':'no-store'}});
  const generate=await prepare();if(generate instanceof Response)return generate;
  const admission=await prisma.$transaction(async tx=>{
   const locked=await tx.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM users WHERE id=$1 FOR UPDATE',userId);
   if(locked.length!==1||signal.aborted)throw Error('Unconfirmed');
   const saved=await tx.backgroundImageAttempt.findUnique({where:{id}});if(saved)return replay(saved);
   if(!isPaid(await getUserPlan(userId)))return Response.json({error:'Plan Pro requerido',limitReached:true},{status:403});
   if(!await rateLimitDb('gen-thumb-bg:'+userId,5,1,true))return Response.json({error:'Solicitud no admitida'},{status:429});
   await tx.backgroundImageAttempt.create({data:{id,userId,digest,state:'pending'}});
   // This flag exists only on the return path of a fresh live transaction.
   return true as const;
  },{maxWait:10_000,timeout:15_000});
  if(admission!==true)return admission;
  if(signal.aborted)return pending();
  const result=await generate();
  if(!validResult({output:result.backgroundUrl,prompt:result.prompt}))throw Error('Unconfirmed');
  // Only the original fresh invocation reaches this write. Ack loss may be
  // reconciled from a completed own receipt; a pending row never permits rerun.
  const saved=await prisma.backgroundImageAttempt.updateMany({where:{id,userId,digest,state:'pending',output:null,prompt:null},data:{state:'complete',output:result.backgroundUrl,prompt:result.prompt}});
  if(saved.count!==1)throw Error('Unconfirmed');
  const completed=await prisma.backgroundImageAttempt.findUnique({where:{id}});if(!completed)throw Error('Unconfirmed');return replay(completed);
 }catch{
  try{const saved=await prisma.backgroundImageAttempt.findUnique({where:{id}});if(saved)return replay(saved);}catch{}
  return Response.json({error:'Fondo sin confirmar. Conserva el intento y comprueba su resultado antes de descartarlo.',code:'image_result_unconfirmed'},{status:503});
 }
}
