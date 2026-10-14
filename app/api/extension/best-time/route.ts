import { NextResponse } from 'next/server';
import { authorizeExtensionBestTimeRead,checkExtensionBestTimeRead,readExtensionBestTime,validBestTimeReadRef } from '@/lib/extension-best-time-native-authorization';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(request:Request) {
 const deadline=performance.now()+25000;let retired=false,rejectWait!:(error:Error)=>void,nativeCheck:(()=>void)|undefined;
 const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
 const retire=()=>{if(!retired){retired=true;rejectWait(Error('Best time read unconfirmed'));}};
 const timer=setTimeout(retire,25000);request.signal.addEventListener('abort',retire,{once:true});
 const check=()=>{if(request.signal.aborted||performance.now()>=deadline)retire();if(retired)throw Error('Best time read unconfirmed');nativeCheck?.();};
 const run=async<T,>(operation:()=>Promise<T>)=>{check();const original=Promise.resolve().then(()=>{check();return operation();});const result=await Promise.race([original,stopped]);check();return result;};
 const readRef=request.headers.get('x-ytv-read-ref'),json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try {
  check();if(!validBestTimeReadRef(readRef))return json({code:'invalid_read_ref'},400);
  const original=await run(()=>authorizeExtensionBestTimeRead(request));
  if(!original)return json({code:'not_logged_in',error:'not_logged_in',readRef},401);
  nativeCheck=()=>checkExtensionBestTimeRead(original);check();
  const data=await run(()=>readExtensionBestTime(original,readRef,check));check();const response=json(data);check();return response;
 }catch{return json({code:'best_time_unconfirmed',error:'best_time_unconfirmed',readRef},503);}
 finally{clearTimeout(timer);request.signal.removeEventListener('abort',retire);}
}
