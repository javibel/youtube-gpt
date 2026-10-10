'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'calendar-suggest-wait-'+randomUUID()+'@example.invalid'}}))),owner=users[0].id,neighbor=users[1].id;
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),req=signal=>new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'native-context-wait'},body:'{"lang":"es"}',signal});
 const snapshot=async()=>({entries:await prisma.calendarEntry.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),creations:await prisma.calendarCreationReceipt.count({where:{userId:owner}}),mutations:await prisma.calendarMutationReceipt.count({where:{userId:owner}}),generations:await prisma.generation.count({where:{userId:owner}})});
 try{
  await prisma.subscription.create({data:{userId:owner,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  await prisma.calendarEntry.createMany({data:[{userId:owner,title:'Native owner context',date:'2026-10-11',status:'idea'},{userId:neighbor,title:'Native neighboring context',date:'2026-10-11',status:'idea'}]});
  for(const reason of ['deadline','abort']){
   const selected=deferred(),ack=deferred(),finished=deferred(),controller=new AbortController(),timers=new Map();let elapsed=0,creates=0,retrieves=0,queries=0,factories=0;
   const db={bestTimeAnalysis:prisma.bestTimeAnalysis,trendAlert:prisma.trendAlert,trackedCompetitor:prisma.trackedCompetitor,youtubeToken:prisma.youtubeToken,calendarEntry:{findMany:async input=>{queries++;const rows=await prisma.calendarEntry.findMany(input);assert.equal(rows.length,1);assert.equal(rows[0].userId,owner);selected.resolve(rows);await ack.promise;finished.resolve();return rows;}}};
   const route=load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/plans':plans,'@/lib/prisma':{prisma:db},'@/lib/ai/task-runtime':{getMessagesTask:async()=>{factories++;return {create:async()=>{creates++;throw Error('Retired context must not dispatch');},retrieve:async()=>{retrieves++;throw Error('Retired context must not retrieve');}};}}},{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)});
   const before=await snapshot(),original=route.POST(req(controller.signal));await selected.promise;
   if(reason==='abort')controller.abort();else{elapsed=55000;for(const fn of [...timers.values()])fn();}
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await finished.promise;await flush();assert.equal(creates,0);assert.equal(retrieves,0);assert.equal(queries,1);assert.equal(factories,1);assert.deepEqual(await snapshot(),before);
   results.push('calendar suggestions '+reason+' after actual owner-scoped PostgreSQL SELECT retires HTTP; late context never invokes synthetic task create/retrieve, all owner and neighboring business rows unchanged (task runtime mocked; no native AI admission claim)');
  }
  {
   const body=deferred(),started=deferred(),controller=new AbortController();let factories=0;
   const route=load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/plans':plans,'@/lib/prisma':{prisma},'@/lib/ai/task-runtime':{getMessagesTask:async()=>{factories++;throw Error('Late body must not construct task');}}});
   const request=req(controller.signal);request.json=()=>{started.resolve();return body.promise;};const before=await snapshot(),original=route.POST(request);await started.promise;controller.abort();assert.equal((await original).status,503);body.resolve({lang:'es'});await flush();assert.equal(factories,0);assert.deepEqual(await snapshot(),before);
   results.push('calendar suggestions original body abort after stored-Pro PostgreSQL authorization prevents a late body from constructing a task and leaves native business rows unchanged');
  }
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
