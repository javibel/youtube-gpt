'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{taskFixture}=require('./task-fixture.cjs');
const {deferred,flush}=require('./chat-widget-harness.cjs'),{video,opportunity}=require('./competitor-intel-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'intel-native-'+randomUUID()+'@example.invalid'}}))),owner=users[0].id,neighbor=users[1].id;
 try{
  await prisma.subscription.create({data:{userId:owner,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  await prisma.trackedCompetitor.createMany({data:users.map(u=>({userId:u.id,channelId:'UC_'+u.id,channelName:'Original native '+u.id,subscribers:10,totalViews:100,videoCount:3}))});
  await prisma.youtubeToken.createMany({data:users.map(u=>({userId:u.id,channelId:'UC_own_'+u.id,channelName:'Synthetic own',accessToken:'synthetic-'+u.id,refreshToken:'synthetic-refresh-'+u.id,expiresAt:new Date(0)}))});
  const snapshot=async()=>({competitors:await prisma.trackedCompetitor.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),tokens:await prisma.youtubeToken.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}})}),before=await snapshot();
  for(const held of ['plan','competitors','token','create','create-abort','none']){
   const entered=deferred(),gate=deferred(),owned=[],calls=[],queries=[],identities=[],timers=new Map(),controller=new AbortController();let now=0;
   const step=(stage,operation)=>{calls.push(stage);const p=(async()=>{const v=await operation();if(stage===held||held==='create-abort'&&stage==='create'){entered.resolve();await gate.promise;}return v;})();owned.push(p);return p;};
   const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:{subscription:{findUnique:q=>step('plan',()=>{assert.equal(q.where.userId,owner);return prisma.subscription.findUnique(q);})}}}});
   const runtime=taskFixture({userId:owner,taskType:'youtube.competitor-opportunities',respond:()=>step('create',async()=>({content:[{type:'text',text:JSON.stringify([opportunity])}],stop_reason:'end_turn'}))});
   const db={trackedCompetitor:{findMany:q=>step('competitors',async()=>{queries.push(q);assert.equal(q.where.userId,owner);return prisma.trackedCompetitor.findMany(q);})},youtubeToken:{findUnique:q=>step('token',async()=>{queries.push(q);assert.equal(q.where.userId,owner);assert.deepEqual(structuredClone(q.select),{channelId:true});return prisma.youtubeToken.findUnique(q);})}};
   const route=load('app/api/youtube/competitor-intel/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/plans':plans,'@/lib/prisma':{prisma:db},'@/lib/ai/task-runtime':{getMessagesTask:identity=>{identities.push(identity);return runtime.getMessagesTask(identity);}}},{process:{env:{YOUTUBE_API_KEY:'synthetic'}},performance:{now:()=>now},Date:class extends Date{static now(){return Date.parse('2026-10-10T00:00:00Z');}},setTimeout(fn){const id={};timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),fetch:async url=>{
    calls.push('Google');const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');if(u.pathname.endsWith('/videos'))return Response.json({items:u.searchParams.get('id').split(',').map(video)});assert(['UC_'+owner,'UC_own_'+owner].includes(u.searchParams.get('channelId')));return Response.json({items:u.searchParams.get('channelId')==='UC_own_'+owner?[{snippet:{title:'Native original own title'}}]:[0,1,2].map(i=>({id:{videoId:'native_'+i}}))});
   }});
   const original=route.GET(new Request('https://example.invalid/api/youtube/competitor-intel?lang=en',{headers:{'Idempotency-Key':'native-intel-original'},signal:controller.signal}));
   if(held==='none'){
    const response=await original,b=await response.json();assert.equal(response.status,200);assert.equal(b.userId,owner);assert.deepEqual(b.channelIds,['UC_'+owner]);assert.equal(b.language,'en');assert.equal(b.collectionStatus,'complete');assert.equal(b.opportunitiesStatus,'ready');assert.equal(b.trending.length,3);assert(b.trending.every(v=>v.channelName==='Original native '+owner));assert.deepEqual(b.opportunities,[opportunity]);assert.equal(identities[0].userId,owner);assert.equal(runtime.events.filter(x=>x==='provider').length,1);
   }else{
    await entered.promise;const beforeCalls=[...calls];if(held==='create-abort')controller.abort();else{now=55000;for(const fn of [...timers.values()])fn();}
    const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'competitor_intel_unavailable'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
    if(held.startsWith('create'))assert.deepEqual(runtime.events,['admit','provider']);else assert.deepEqual(runtime.events,[]);
    gate.resolve();await Promise.allSettled(owned);await flush();assert.deepEqual(calls,beforeCalls);assert.equal(response.status,503);
    assert.equal(runtime.events.filter(x=>x==='provider').length,held.startsWith('create')?1:0);
   }
   assert.equal(timers.size,0);assert.deepEqual(await snapshot(),before);
   results.push('Competitor intel native '+held+': actual owner-scoped PostgreSQL/stored-Pro helper and GET; synthetic common facade/model transport only; original waiter/selection preserved, no successor or OAuth/token mutation, neighboring rows intact');
  }
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
