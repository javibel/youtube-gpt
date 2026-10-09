import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { put } from '@vercel/blob';

function validUrl(value:unknown):value is string {
  if(typeof value!=='string'||!value||value.length>4096)return false;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}
}
export async function uploadBackgroundReceipt(userId:string,key:string,file:File,lang:string,signal:AbortSignal,readOnly=false) {
  const bytes=Buffer.from(await file.arrayBuffer());
  const id='background_'+createHash('sha256').update(JSON.stringify([userId,key])).digest('hex');
  const digest=createHash('sha256').update(JSON.stringify([file.type,lang])).update(bytes).digest('hex');
  // Hashes identify the business input; never establish operational recovery authority.
  type Saved={id:string;userId:string;digest:string;output:string};
  const replay=(saved:Saved)=>{
    if(saved.userId!==userId||saved.id!==id||saved.digest!==digest)return Response.json({error:'La subida no coincide',code:'image_upload_conflict'},{status:409});
    if(!validUrl(saved.output))throw Error('Unconfirmed');
    return Response.json({backgroundUrl:saved.output,prompt:null,id,userId,operationKey:key},{headers:{'Cache-Control':'no-store'}});
  };
  if(readOnly){
    try{if(signal.aborted)throw Error('Unconfirmed');const saved=await prisma.backgroundUpload.findUnique({where:{id}});
      if(signal.aborted)throw Error('Unconfirmed');return saved?replay(saved):Response.json({code:'image_upload_not_retained',retryMayConsume:false},{status:409,headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({code:'image_upload_unconfirmed',retryMayConsume:false},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  try{
    return await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      if(locked.length!==1)throw Error('Unconfirmed');
      const saved=await tx.backgroundUpload.findUnique({where:{id}});if(saved)return replay(saved);
      // Exact committed replay precedes plan/throttle. Upload receipts never count as generations.
      if(!isPaid(await getUserPlan(userId)))return Response.json({error:'Plan Pro requerido',limitReached:true},{status:403});
      if(signal.aborted)throw Error('Unconfirmed');
      if(!await rateLimitDb('upload-thumb-bg:'+userId,20,1,true))return Response.json({error:'Solicitud no admitida'},{status:429});
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      let stop:(error:Error)=>void=()=>{};
      const interrupted=new Promise<never>((_,reject)=>{stop=reject;});
      const abort=()=>stop(Error('Unconfirmed'));signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15_000);
      try{
        // Blob/DB are not atomic. Rollback may leave an object; exact retry overwrites
        // the same path with the same bytes. Late writes are not claimed cancelled.
        const result=await Promise.race([put('thumbnails/bg/'+userId+'/'+id+'-'+digest+'.'+ext,bytes,{access:'public',contentType:file.type,addRandomSuffix:false,allowOverwrite:true}),interrupted]);
        if(signal.aborted||!validUrl(result?.url))throw Error('Unconfirmed');
        return replay(await tx.backgroundUpload.create({data:{id,userId,digest,output:result.url}}));
      }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
    },{maxWait:10_000,timeout:30_000});
  }catch{
    // Lost commit ack: only an actual committed, exact own receipt permits replay.
    try{const saved=await prisma.backgroundUpload.findUnique({where:{id}});if(saved)return replay(saved);}catch{}
    return Response.json({error:'Subida sin confirmar. Reintenta la misma captura.',code:'image_upload_unconfirmed'},{status:503});
  }
}
