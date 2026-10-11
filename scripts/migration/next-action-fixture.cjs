'use strict';
const {load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const identity={id:'next-action-own',email:'next-action-own@example.invalid'};
const channelId='UC'+'a'.repeat(22),videoId='a'.repeat(11),otherVideoId='b'.repeat(11);
const allIds=['first_generation','score_recent_video','optimize_low_score','track_competitors','best_time_stale','trend_alert_unseen','plan_week','start_ab_test','daily_idea'];
function fixture(options={}){
 let now=0,serial=0;const calls=[],replies=[],timers=new Map(),running=[],controller=new AbortController(),entered=deferred(),gate=deferred();
 const owner=options.owner||identity,session=options.session===undefined?{user:{...owner}}:options.session;
 const values={user:{...owner},plan:null,channel:{channelId,videoCount:4},token:{channelId,videoCount:4,accessToken:'SYNTHETIC_TOKEN',refreshToken:'SYNTHETIC_REFRESH',expiresAt:new Date(0)},generation:0,scoreList:[],last:{videoId,score:35},competitors:0,bestTime:null,alert:{title:'Synthetic trend'},calendar:0,ab:0,daily:{ideas:[{title_es:'Idea sintética',title_en:'Synthetic idea'}]},...options.values};
 async function invoke(name,q,fn){
  calls.push({name,q});
  const p=(async()=>{
   if(options.onDispatch)options.onDispatch(name,q);
   let value=options.stages?.[name]?await options.stages[name](q):fn?await fn():values[name];
   if(options.held===name){entered.resolve();await gate.promise;}
   if(options.reject===name)throw Error('NEVER_PUBLIC private '+name);
   return value;
  })();running.push(p);void p.catch(()=>{});return p;
 }
 const real=options.prisma;
 const method=(model,method,name)=>q=>invoke(typeof name==='function'?name(q):name,q,real?()=>real[model][method](q):undefined);
 const db={
  user:{findUnique:method('user','findUnique','user')},subscription:{findUnique:method('subscription','findUnique','plan')},
  youtubeToken:{findUnique:method('youtubeToken','findUnique',q=>!q.select?'token':q.select.channelId&&q.select.videoCount?'channelBest':q.select.videoCount?'channelAb':'channel'),update:method('youtubeToken','update','tokenUpdate')},
  generation:{count:method('generation','count','generation')},
  videoSeoScore:{findMany:method('videoSeoScore','findMany','scoreList'),findFirst:method('videoSeoScore','findFirst','last')},
  trackedCompetitor:{count:method('trackedCompetitor','count','competitors')},
  bestTimeAnalysis:{findUnique:method('bestTimeAnalysis','findUnique','bestTime')},
  trendAlert:{findFirst:method('trendAlert','findFirst','alert')},
  calendarEntry:{count:method('calendarEntry','count','calendar')},
  abTest:{count:method('abTest','count','ab')},dailyIdea:{findUnique:method('dailyIdea','findUnique','daily')},
 };
 values.channelBest=values.channel;values.channelAb=values.channel;
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,init)=>{
   if(url==='https://oauth2.googleapis.com/token'){
    if(!options.oauth)throw Error('Unexpected OAuth');
    return invoke('oauthHeaders',{url,init},async()=>({ok:true,json:()=>invoke('oauthBody',null,async()=>({access_token:'SYNTHETIC_REFRESHED',expires_in:3600}))}));
   }
   if(!url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems?'))throw Error('Unexpected network destination');
   return invoke('google',{url,init},async()=>({ok:options.googleOk!==false,json:()=>invoke('body',null,async()=>options.body===undefined?{items:[{snippet:{resourceId:{videoId},publishedAt:new Date().toISOString()}}]}:options.body)}));
  }};
 const oauth=options.oauth?load('lib/youtube-auth.ts',{'@/lib/prisma':{prisma:db}},globals):{getAccessToken:(userId,check)=>invoke('token',{userId},async()=>{check();return options.noToken?null:'SYNTHETIC_TOKEN';})};
 const engine=load('lib/next-action.ts',{'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':oauth},globals);
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:db}});
 const route=load('app/api/next-action/route.ts',{
  'next/server':{NextResponse:{json(body,init){replies.push({body,init});if(init.status===200&&options.held==='JSON'){entered.resolve();return gate.promise.then(()=>Response.json(body,init));}if(options.reply)return options.reply(body,init);return Response.json(body,init);}}},
  '@/auth':{auth:()=>invoke('auth',null,async()=>session)},'@/lib/prisma':{prisma:db},'@/lib/plans':plans,'@/lib/next-action':engine
 },globals);
 if(options.aborted)controller.abort();
 const request={nextUrl:new URL('https://example.invalid/api/next-action'+(options.search||'')),signal:controller.signal},original=route.GET(request);running.push(original);void original.catch(()=>{});
 return{original,request,session,values,calls,replies,gate,entered,timers,controller,running,
  advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  async settle(){let n=0;while(n<running.length){const pending=running.slice(n);n=running.length;await Promise.allSettled(pending);await flush();}},
 };
}
module.exports={fixture,identity,channelId,videoId,otherVideoId,allIds,deferred,flush};
