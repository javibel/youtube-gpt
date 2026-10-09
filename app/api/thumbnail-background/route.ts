import { keyedBackgroundImage } from '@/lib/image/background-image-attempt';
import { uploadBackgroundReceipt } from '@/lib/image/background-upload';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { put } from '@vercel/blob';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { backgroundImageAvailable, generateBackgroundImage } from '@/lib/image/background-image-provider';

export const maxDuration = 60;

// Bounded local storage wait; late put completion is not recovered or declared cancelled.
async function storeBackground(path:string,bytes:Uint8Array,contentType:string,signal:AbortSignal) {
  if(signal.aborted)throw Error('Unconfirmed');
  let rejectWait:(error:Error)=>void=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{rejectWait=reject;});
  const stop=()=>rejectWait(Error('Unconfirmed'));
  signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,15_000);
  try{
    const result=await Promise.race([put(path,Buffer.from(bytes),{access:'public',contentType}),interrupted]);
    if(signal.aborted || typeof result?.url!=='string' || result.url.length>4096)throw Error('Unconfirmed');
    const url=new URL(result.url);if(url.protocol!=='https:' || url.username || url.password || url.hash)throw Error('Unconfirmed');
    return result.url;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
}

export async function POST(request: Request) {
  try {
    const session=await auth();
    if(!session?.user?.id || !session.user.email)return Response.json({error:'No autorizado'},{status:401});
    const user=await prisma.user.findUnique({where:{email:session.user.email},select:{id:true}});
    if(!user)return Response.json({error:'Usuario no encontrado'},{status:404});
    if(user.id!==session.user.id)return Response.json({error:'No autorizado'},{status:401});
    let form:FormData;
    try{form=await request.formData();}catch{return Response.json({error:'invalid_input'},{status:400});}
    if(['source','lang','tema','estilo'].some(name=>form.has(name)&&typeof form.get(name)!=='string'))return Response.json({error:'invalid_input'},{status:400});
    const source=form.get('source')||'ai',lang=form.get('lang')||'en',isEn=lang==='en';
    if(!['ai','upload'].includes(source as string)||!['es','en'].includes(lang as string))return Response.json({error:'invalid_input'},{status:400});
    const tema=((form.get('tema') as string)||'').trim(),estilo=((form.get('estilo') as string)||'viral').trim();
    const file=form.get('backgroundFile');
    if(source==='upload'){
      if(!file||typeof file==='string'||!file.size||!['image/png','image/jpeg','image/webp'].includes(file.type))return Response.json({error:'invalid_input'},{status:400});
      if(file.size>15*1024*1024)return Response.json({error:isEn?'File must be under 15 MB':'Máx 15 MB'},{status:400});
    }else if(tema.length<3||tema.length>500||!['viral','cinematic','minimal','bold'].includes(estilo)){
      return Response.json({error:isEn?'Describe your video topic (3–500 chars)':'Describe el tema (mín 3, máx 500 caracteres)'},{status:400});
    }
    const key=request.headers.get('Idempotency-Key');
    if(key!==null && !/^[-A-Za-z0-9._:]{1,128}$/.test(key))return Response.json({error:'Clave inválida'},{status:400});
    const recovery=request.headers.get('X-Background-Recovery');
    if(recovery!==null && (recovery!=='retained-only-v1'||key===null))return Response.json({error:'Consulta de recuperación inválida'},{status:400});

    if(key!==null && source==='upload' && file && typeof file!=='string')return await uploadBackgroundReceipt(user.id,key,file,lang as string,request.signal,recovery==='retained-only-v1');
    const generate=async (task:Awaited<ReturnType<typeof getMessagesTask>>)=>{
    const promptResult=await task.create({max_tokens:400,messages:[{role:'user',content:`Generate an Ideogram v3 image prompt for a YouTube thumbnail background.
VIDEO TOPIC: ${tema}
VISUAL STYLE: ${estilo}

Rules:
- NO text in the image (will be added as overlay later)
- NO people, faces or characters (user's photo will be composited later)
- Bold, high-contrast colors optimised for YouTube thumbnails
- 16:9 ratio, 1312×736 px
- Professional cinematic look, dramatic lighting

Respond with ONLY the image generation prompt in English.`}]});
    const imagePrompt=promptResult.content?.[0]?.text?.trim();
    if(typeof imagePrompt!=='string'||!imagePrompt||imagePrompt.length>4000||promptResult.incomplete===true||request.signal.aborted)throw Error('Unconfirmed');
    const image=await generateBackgroundImage(imagePrompt,request.signal);
    const backgroundUrl=await storeBackground('thumbnails/bg/'+user.id+'/'+Date.now()+'.'+image.extension,image.bytes,image.contentType,request.signal);
    return {backgroundUrl,prompt:imagePrompt};
    };
    if(key!==null && source==='ai')return await keyedBackgroundImage(user.id,key,{topic:tema,style:estilo,lang:lang as string},request.signal,async()=>{
      if(!isPaid(await getUserPlan(user.id)))return Response.json({error:isEn?'Pro plan required':'Se requiere plan Pro',limitReached:true},{status:403});
      if(request.signal.aborted)throw Error('Unconfirmed');
      if(!backgroundImageAvailable())return Response.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});
      let task;try{task=await getMessagesTask({taskType:'thumbnail.background-prompt',userId:user.id,language:'en',instructionsVersion:'background-prompt-v1'});}catch{return Response.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});}
      return ()=>generate(task);
    },recovery==='retained-only-v1');
    if(!isPaid(await getUserPlan(user.id)))return Response.json({error:isEn?'Pro plan required':'Se requiere plan Pro',limitReached:true},{status:403});
    if(request.signal.aborted)throw Error('Unconfirmed');
    if(source==='upload'&&file&&typeof file!=='string'){
      if(!await rateLimitDb('upload-thumb-bg:'+user.id,20,1,true))return Response.json({error:'Solicitud no admitida'},{status:429});
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const backgroundUrl=await storeBackground('thumbnails/bg/'+user.id+'/'+Date.now()+'.'+ext,new Uint8Array(await file.arrayBuffer()),file.type,request.signal);
      return Response.json({backgroundUrl,prompt:null},{headers:{'Cache-Control':'no-store'}});
    }
    if(!backgroundImageAvailable())return Response.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});
    let task;
    try{task=await getMessagesTask({taskType:'thumbnail.background-prompt',userId:user.id,language:'en',instructionsVersion:'background-prompt-v1'});}
    catch{return Response.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});}
    if(!await rateLimitDb('gen-thumb-bg:'+user.id,5,1,true))return Response.json({error:isEn?'Too many requests — wait a moment':'Demasiadas solicitudes — espera un momento'},{status:429});
    const result=await generate(task);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch{
    return Response.json({error:'Fondo sin confirmar. Repetir puede consumir de nuevo.',code:'image_result_unconfirmed',retryMayConsume:true},{status:503});
  }
}
