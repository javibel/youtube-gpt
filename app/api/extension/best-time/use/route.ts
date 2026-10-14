import { NextResponse } from 'next/server';
import { authorizeExtensionBestTimeUse,checkExtensionBestTimeUse,recordExtensionBestTimeUse,validBestTimeUseKey } from '@/lib/extension-best-time-use-native-authorization';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request) {
 const deadline=performance.now()+25000;let retired=false,rejectWait!:(error:Error)=>void,nativeCheck:(()=>void)|undefined;
 const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
 const retire=()=>{if(!retired){retired=true;rejectWait(Error('Best time use unconfirmed'));}};
 const timer=setTimeout(retire,25000);request.signal.addEventListener('abort',retire,{once:true});
 const check=()=>{if(request.signal.aborted||performance.now()>=deadline)retire();if(retired)throw Error('Best time use unconfirmed');nativeCheck?.();};
 const run=async<T,>(operation:()=>Promise<T>)=>{check();const original=Promise.resolve().then(()=>{check();return operation();});const result=await Promise.race([original,stopped]);check();return result;};
 const key=request.headers.get('idempotency-key'),json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try {
  check();if(!validBestTimeUseKey(key))return json({code:'invalid_use_key'},400);
  if(request.body!==null||!['0',null].includes(request.headers.get('content-length')))return json({code:'invalid_use_body',key},400);
  const original=await run(()=>authorizeExtensionBestTimeUse(request));
  if(!original)return json({code:'not_logged_in',error:'not_logged_in',key},401);
  nativeCheck=()=>checkExtensionBestTimeUse(original);check();
  const receipt=await run(()=>recordExtensionBestTimeUse(original,key,check));check();const response=json(receipt);check();return response;
 }catch{return json({code:'best_time_use_unconfirmed',error:'best_time_use_unconfirmed',key},503);}
 finally{clearTimeout(timer);request.signal.removeEventListener('abort',retire);}
}
