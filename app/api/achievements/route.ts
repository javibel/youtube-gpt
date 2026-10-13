import { NextResponse } from 'next/server';
import { authorizeNativeAchievements, checkNativeAchievements, produceNativeAchievements } from '@/lib/achievements-native-authorization';
import type { NativeAchievementsOriginal } from '@/lib/achievements-native-authorization';

export const maxDuration = 60;
export async function GET(request?: Request) {
  const deadline = performance.now() + 55_000;
  let retired=false,rejectWait!: (error: Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(!retired){retired=true;rejectWait(Error('Achievements unavailable'));}};
  const timer=setTimeout(retire,55_000);request?.signal.addEventListener('abort',retire,{once:true});
  const check=()=>{if(request?.signal.aborted||performance.now()>=deadline)retire();if(retired)throw Error('Achievements unavailable');};
  const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
  let retained: NativeAchievementsOriginal | null = null;
  const checkAuthorized=()=>{check();if(retained)checkNativeAchievements(retained);};
  try {
    const original=Promise.resolve().then(async()=>{
      check();const authorization=await authorizeNativeAchievements();retained=authorization;checkAuthorized();
      if(!authorization)return reply({error:'unauthorized'},401);
      const body=await produceNativeAchievements(authorization,checkAuthorized);checkAuthorized();
      const response=await reply(body);checkAuthorized();return response;
    });
    const response=await Promise.race([original,stopped]);checkAuthorized();return response;
  }catch{return reply({error:'achievements_unconfirmed'},503);}
  finally{clearTimeout(timer);request?.signal.removeEventListener('abort',retire);}
}
