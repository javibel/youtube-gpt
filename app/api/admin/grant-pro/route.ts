import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';
export const dynamic='force-dynamic';
export const maxDuration=30;

export async function POST(request:Request){
  const startedAt=Date.now(),deadline=performance.now()+25000,signal=request.signal,controller=new AbortController();
  let native:typeof import('@/lib/admin-manual-grant-native')|null=null,original:import('@/lib/admin-manual-grant-native').NativeAdminManualGrant|null=null;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,retired=false,rejectWait!:(error:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();rejectWait(Error('Admin manual grant unconfirmed'));if(reader)void reader.cancel().catch(()=>{});};
  const timer=setTimeout(retire,25000);signal.addEventListener('abort',retire,{once:true});
  const check=()=>{if(signal.aborted||Date.now()<startedAt||Date.now()>=startedAt+25000||performance.now()>=deadline)retire();if(retired)throw Error('Admin manual grant unconfirmed');if(original&&native)native.checkNativeAdminManualGrant(original);};
  const run=async<T,>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
  const invalid=()=>json({error:'invalid_admin_manual_grant'},400);
  try{
    // Capture the original stream and all ingress values before the first yield.
    const cookie=request.headers.get('cookie'),origin=request.headers.get('origin'),commandRef=request.headers.get('X-YTV-Grant-Command'),type=request.headers.get('content-type'),length=request.headers.get('content-length'),url=request.url;
    reader=request.body?.getReader();
    if(request.method!=='POST'||!reader||type?.split(';')[0].trim().toLowerCase()!=='application/json'||!commandRef||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(commandRef)||length!==null&&(!/^\d+$/.test(length)||Number(length)>4096))return invalid();
    const headers=new Headers(cookie?{cookie}:{});if(origin)headers.set('origin',origin);
    const captured=new Request(url,{method:'POST',headers,signal:controller.signal});
    const gate=await run(()=>requireAdmin());if(!gate.ok)return gate.response;
    native=await run(()=>import('@/lib/admin-manual-grant-native'));
    let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
    while(true){const chunk=await run(()=>reader!.read());if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)return invalid();try{text+=decoder.decode(chunk.value,{stream:true});}catch{return invalid();}}
    let input:unknown;try{text+=decoder.decode();input=JSON.parse(text);}catch{return invalid();}check();
    const command=native.adminManualGrantInput(input);if(!command)return invalid();
    original=await run(()=>native!.authorizeNativeAdminManualGrant(captured,command,commandRef));if(!original)return json({error:'No autorizado'},403);
    const result=await run(()=>native!.applyNativeAdminManualGrant(original!));
    if(!result.ok)return result.error==='missing'?json({error:'Usuario no encontrado'},404):json({error:'La cuenta ya tiene una suscripción; requiere un contrato propio'},409);
    const response=json(result);check();native.confirmNativeAdminManualGrant(original);check();return response;
  }catch{return json({error:'admin_manual_grant_unconfirmed'},503);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',retire);if(original&&native)native.closeNativeAdminManualGrant(original);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
