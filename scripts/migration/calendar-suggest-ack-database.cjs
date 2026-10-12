'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 async function test(name,fn){
  const epoch=Date.now(),own=await prisma.user.create({data:{email:'calendar-suggest-ack-'+randomUUID()+'@example.invalid'}});let wall=epoch,creates=0,retrieves=0;const prompts=[];
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
  const date=new Date(epoch+86400000).toISOString().slice(0,10);
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:ClockDate});
  const api=(fetch,globals={})=>load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:own.id,email:own.email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async parameters=>{creates++;prompts.push(parameters.messages[0].content);return{content:[{type:'text',text:JSON.stringify([{title:'Synthetic own idea',date,hour:0,reason:'Synthetic',description:'Synthetic outline'}])}]};},retrieve:async()=>{retrieves++;return null;}})}},{Date:ClockDate,process:{env:{YOUTUBE_API_KEY:'synthetic-only'}},fetch,...globals});
  const invoke=(route,recovery=false)=>route.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'own-ack-key',...(recovery?{'X-Calendar-Recovery':'retained-only-v1'}:{})},body:JSON.stringify({lang:'en'})}));
  const video=channelId=>({id:{kind:'youtube#video',videoId:'video000000'},snippet:{channelId,title:'Own original selected upload',channelTitle:'Synthetic public source',publishedAt:new Date(epoch-86400000).toISOString()}});
  const snapshot=async()=>({user:await prisma.user.findUnique({where:{id:own.id}}),sub:await prisma.subscription.findUnique({where:{userId:own.id}}),token:await prisma.youtubeToken.findUnique({where:{userId:own.id}}),watch:await prisma.trackedCompetitor.findMany({where:{userId:own.id}}),times:await prisma.bestTimeAnalysis.findUnique({where:{userId:own.id}}),entries:await prisma.calendarEntry.findMany({where:{userId:own.id}}),generation:await prisma.generation.count({where:{userId:own.id}}),creation:await prisma.calendarCreationReceipt.count({where:{userId:own.id}}),mutation:await prisma.calendarMutationReceipt.count({where:{userId:own.id}})});
  try{
   await prisma.subscription.create({data:{userId:own.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(epoch+86400000)}});
   await prisma.youtubeToken.create({data:{userId:own.id,channelId:'own_native_channel',channelName:'Synthetic own channel',accessToken:'synthetic-unused',refreshToken:'synthetic-unused',expiresAt:new Date(epoch+86400000)}});
   await prisma.trackedCompetitor.create({data:{userId:own.id,channelId:'watched_native_channel',channelName:'Synthetic watched channel'}});
   await prisma.bestTimeAnalysis.create({data:{userId:own.id,heatmap:[],topSlots:[],videoCount:0,analyzedAt:new Date('2000-01-01')}});
   await prisma.calendarEntry.create({data:{userId:own.id,title:'Original scheduled own',date}});
   await fn({own,epoch,date,api,invoke,video,snapshot,prompts,setWall(t){wall=t;},get calls(){return{creates,retrieves};}});
   results.push('Calendar suggestion ACK native '+name);
  }finally{await prisma.user.delete({where:{id:own.id}});}
 }
 await test('ACK identifies the original own SQL selection and preserves dates without business writes',async h=>{
  const before=await h.snapshot(),requests=[];
  const r=await h.invoke(h.api(async(url,init)=>{const u=new URL(url);requests.push({u,init});return Response.json({items:[h.video(u.searchParams.get('channelId'))]});}));
  assert.equal(r.status,200);const b=await r.json();assert.equal(b.ack.userId,h.own.id);assert.equal(b.ack.operationKey,'own-ack-key');assert.equal(b.ack.input.lang,'en');assert.equal(b.ack.context.coverage.calendarCount,1);assert.equal(b.ack.context.coverage.watchlistCount,1);
  assert.equal(b.ack.context.bestTimeAnalyzedAt,'2000-01-01T00:00:00.000Z');assert.equal(b.ack.context.competitorSearch.channelId,'watched_native_channel');assert.equal(b.ack.context.ownSearch.channelId,'own_native_channel');
  assert.equal(b.ack.context.ownSearch.status,'selected');assert.equal(b.ack.context.ownSearch.selectedCount,1);assert.equal(b.ack.context.ownSearch.publishedThrough,new Date(h.epoch).toISOString());
  assert.match(h.prompts[0],/Original scheduled own/);assert.match(h.prompts[0],/Own original selected upload/);assert.doesNotMatch(JSON.stringify(b),/synthetic-unused/);assert.equal(h.calls.creates,1);
  for(const{u,init}of requests){assert.equal(u.searchParams.get('publishedBefore'),new Date(h.epoch).toISOString());assert.equal(init.redirect,'error');}
  assert.deepEqual(await h.snapshot(),before);
 });
 await test('foreign optional response is marked unconfirmed without partial adoption or business writes',async h=>{
  const before=await h.snapshot(),r=await h.invoke(h.api(async()=>Response.json({items:[h.video('foreign_channel')]})));assert.equal(r.status,200);
  const a=(await r.json()).ack;assert.equal(a.context.competitorSearch.status,'unconfirmed');assert.equal(a.context.ownSearch.status,'unconfirmed');assert.doesNotMatch(h.prompts[0],/Own original selected upload/);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('complete selected public facts survive late mutation during a later response',async h=>{
  const first={items:[h.video('watched_native_channel')]},started=deferred(),ack=deferred();
  const before=await h.snapshot(),original=h.invoke(h.api(async url=>{if(new URL(url).searchParams.get('maxResults')==='5')return Response.json(first);started.resolve();await ack.promise;return Response.json({items:[]});}));
  try{await Promise.race([started.promise,original.then(()=>{throw Error('Original ended before own search');})]);first.items[0].snippet.title='Changed late public data';ack.resolve();const r=await original;assert.equal(r.status,200);assert.match(h.prompts[0],/Own original selected upload/);assert.doesNotMatch(h.prompts[0],/Changed late/);assert.deepEqual(await h.snapshot(),before);}finally{ack.resolve();}
 });
 await test('retained-only miss has no successful ACK and cannot create or write',async h=>{
  const before=await h.snapshot(),r=await h.invoke(h.api(async()=>Response.json({items:[]})),true);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});assert.equal(h.calls.creates,0);assert.equal(h.calls.retrieves,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('expired declared permission during public response is not renewed by ACK or inference',async h=>{
  const before=await h.snapshot(),r=await h.invoke(h.api(async()=>{h.setWall(h.epoch+2*86400000);return Response.json({items:[]});}));assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'pro_required'});assert.equal(h.calls.creates,0);assert.deepEqual(await h.snapshot(),before);
 });
 await test('retired original stream wait starts no later public dependency or task',async h=>{
  const before=await h.snapshot(),started=deferred(),ack=deferred(),timers=new Map();let now=0,calls=0,cancelled=false,released=false;
  const original=h.invoke(h.api(async()=>{calls++;return{status:200,redirected:false,headers:new Headers({'Content-Type':'application/json'}),body:{getReader:()=>({read:async()=>{started.resolve();await ack.promise;return{done:true};},cancel:async()=>{cancelled=true;},releaseLock(){released=true;}})}};},{performance:{now:()=>now},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}}));
  try{await Promise.race([started.promise,original.then(()=>{throw Error('Original ended before stream wait');})]);now=55000;ack.resolve();const r=await original;assert.equal(r.status,503);await flush();assert.equal(calls,1);assert.equal(h.calls.creates,0);assert.equal(cancelled,true);assert.equal(released,true);assert.equal(timers.size,0);assert.deepEqual(await h.snapshot(),before);}finally{ack.resolve();}
 });
};
