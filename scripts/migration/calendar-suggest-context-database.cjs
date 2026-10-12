'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 async function test(name,fn){
  const epoch=Date.now(),users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'calendar-suggest-context-'+randomUUID()+'@example.invalid'}}))),own=users[0],ids=users.map(u=>u.id);
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
  const date=new Date(epoch+86400000).toISOString().slice(0,10),plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:ClockDate});let factories=0,creates=0,queries=0;const prompts=[];
  const api=(db=prisma,globals={})=>load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:own.id,email:own.email}})},'@/lib/prisma':{prisma:db},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{factories++;assert.equal(identity.userId,own.id);return{create:async parameters=>{creates++;prompts.push(parameters.messages[0].content);return{content:[{type:'text',text:JSON.stringify([{title:'Original synthetic idea',date,hour:0,reason:'Synthetic',description:'Synthetic outline'}])}]};},retrieve:async()=>null};}}},{Date:ClockDate,...globals});
  const invoke=(route,signal)=>route.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'own-context-key'},body:JSON.stringify({lang:'en'}),signal}));
  const snapshot=async()=>({users:await prisma.user.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}}),subs:await prisma.subscription.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}}),times:await prisma.bestTimeAnalysis.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),trends:await prisma.trendAlert.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),competitors:await prisma.trackedCompetitor.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),entries:await prisma.calendarEntry.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),tokens:await prisma.youtubeToken.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),creations:await prisma.calendarCreationReceipt.count({where:{userId:{in:ids}}}),mutations:await prisma.calendarMutationReceipt.count({where:{userId:{in:ids}}}),generations:await prisma.generation.count({where:{userId:{in:ids}}})});
  try{
   await prisma.subscription.create({data:{userId:own.id,plan:'business',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(epoch+86400000)}});
   await prisma.bestTimeAnalysis.create({data:{userId:own.id,heatmap:[],topSlots:[{day:0,hour:0,score:80,videoCount:2}],videoCount:2,analyzedAt:new Date('2000-01-01')}});
   await prisma.calendarEntry.createMany({data:[{userId:own.id,title:'Own original scheduled',date},{userId:users[1].id,title:'Foreign context must not enter',date}]});
   await fn({own,users,ids,date,epoch,api,invoke,snapshot,prompts,get calls(){return{factories,creates,queries};}});
   results.push('Calendar suggestion context native '+name);
  }finally{await prisma.user.deleteMany({where:{id:{in:ids}}});}
 }
 await test('own source is read without business writes or analysis date renewal',async h=>{
  const before=await h.snapshot(),r=await h.invoke(h.api());assert.equal(r.status,200);assert.equal(h.calls.creates,1);assert.match(h.prompts[0],/Own original scheduled/);assert.doesNotMatch(h.prompts[0],/Foreign context must not enter/);assert.deepEqual(await h.snapshot(),before);assert.equal(before.times[0].analyzedAt.toISOString(),'2000-01-01T00:00:00.000Z');
 });
 await test('entry beyond old 15/30 caps is included in the complete upcoming context',async h=>{
  await prisma.calendarEntry.createMany({data:Array.from({length:45},(_,i)=>({userId:h.own.id,title:'Own extra scheduled '+i,date:h.date}))});
  const before=await h.snapshot();assert.equal((await h.invoke(h.api())).status,200);assert.match(h.prompts[0],/Own extra scheduled 44/);assert.deepEqual(await h.snapshot(),before);
 });
 await test('exactly200 entries accepted;201st sentinel prevents partial inference',async h=>{
  await prisma.calendarEntry.createMany({data:Array.from({length:199},(_,i)=>({userId:h.own.id,title:'Own capacity '+i,date:h.date}))});const before=await h.snapshot();
  assert.equal((await h.invoke(h.api())).status,200);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
  await prisma.calendarEntry.create({data:{userId:h.own.id,title:'Own sentinel',date:h.date}});const extra=await h.snapshot();assert.equal((await h.invoke(h.api())).status,503);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),extra);
 });
 await test('exactly20 watched channels accepted;21st sentinel prevents incomplete watchlist',async h=>{
  await prisma.trackedCompetitor.createMany({data:Array.from({length:20},(_,i)=>({userId:h.own.id,channelId:'own_channel_'+i,channelName:'Own channel '+i}))});const before=await h.snapshot();
  assert.equal((await h.invoke(h.api())).status,200);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
  await prisma.trackedCompetitor.create({data:{userId:h.own.id,channelId:'own_channel_20',channelName:'Own sentinel'}});const extra=await h.snapshot();assert.equal((await h.invoke(h.api())).status,503);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),extra);
 });
 await test('ten deterministic selected trends are distinct from complete all-trend coverage',async h=>{
  await prisma.trendAlert.createMany({data:Array.from({length:12},(_,i)=>({userId:h.own.id,title:'Own selected trend '+i,description:'Synthetic',category:'test',relevance:80,createdAt:new Date(h.epoch-i*1000)}))});
  const before=await h.snapshot();assert.equal((await h.invoke(h.api())).status,200);assert.match(h.prompts[0],/Own selected trend 9 /);assert.doesNotMatch(h.prompts[0],/Own selected trend 10 /);assert.deepEqual(await h.snapshot(),before);
 });
 await test('only own channel fields selected; no access/refresh credentials enter task',async h=>{
  await prisma.youtubeToken.create({data:{userId:h.own.id,channelId:'own_channel',channelName:'Own original channel',accessToken:'synthetic-unused-access',refreshToken:'synthetic-unused-refresh',expiresAt:new Date(h.epoch+86400000)}});
  const before=await h.snapshot();assert.equal((await h.invoke(h.api())).status,200);assert.match(h.prompts[0],/Own original channel/);assert.doesNotMatch(h.prompts[0],/synthetic-unused/);assert.deepEqual(await h.snapshot(),before);
 });
 await test('single repeatable snapshot keeps captured facts across concurrent own SQL changes',async h=>{
  const selected=deferred(),ack=deferred(),updatedTitle='Own concurrently changed title';let sawOptions;
  const db={$transaction:(fn,options)=>{sawOptions=options;return prisma.$transaction(tx=>fn({...tx,trendAlert:{findMany:async input=>{selected.resolve();await ack.promise;return tx.trendAlert.findMany(input);}}}),options);}};
  const original=h.invoke(h.api(db));
  try{await Promise.race([selected.promise,original.then(()=>{throw Error('Original HTTP ended before trend SELECT gate');})]);await prisma.bestTimeAnalysis.update({where:{userId:h.own.id},data:{topSlots:[{day:0,hour:23,score:1}]}});await prisma.calendarEntry.updateMany({where:{userId:h.own.id},data:{title:updatedTitle}});ack.resolve();assert.equal((await original).status,200);
   assert.equal(sawOptions.isolationLevel,'RepeatableRead');assert.match(h.prompts[0],/Monday at 0:00 UTC \(score: 80\)/);assert.match(h.prompts[0],/Own original scheduled/);assert.doesNotMatch(h.prompts[0],/concurrently changed/);
   const after=await h.snapshot();assert.equal(after.times[0].topSlots[0].hour,23);assert.equal(after.entries.find(e=>e.userId===h.own.id).title,updatedTitle);assert.equal(after.creations,0);assert.equal(after.mutations,0);assert.equal(after.generations,0);
  }finally{ack.resolve();}
 });
 await test('foreign actual calendar row acknowledgement cannot enter own captured context',async h=>{
  const db={$transaction:(fn,options)=>prisma.$transaction(tx=>fn({...tx,calendarEntry:{findMany:()=>tx.calendarEntry.findMany({where:{userId:h.users[1].id}})}}),options)};
  const before=await h.snapshot();assert.equal((await h.invoke(h.api(db))).status,503);assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);
 });
 await test('persisted malformed upcoming civil date stays unconfirmed without repair',async h=>{
  await prisma.calendarEntry.create({data:{userId:h.own.id,title:'Own invalid future',date:'9999-99-99'}});const before=await h.snapshot();
  assert.equal((await h.invoke(h.api())).status,503);assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);
 });
 await test('persisted malformed time slots stay unconfirmed without renewal',async h=>{
  await prisma.bestTimeAnalysis.update({where:{userId:h.own.id},data:{topSlots:[{day:0,hour:'0',score:80}]}});const before=await h.snapshot();
  assert.equal((await h.invoke(h.api())).status,503);assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);
 });
 for(const stage of ['bestTimeAnalysis','trendAlert','trackedCompetitor','calendarEntry','youtubeToken'])await test('original deadline during '+stage+' SELECT starts no later query or factory',async h=>{
  const selected=deferred(),ack=deferred(),done=deferred(),timers=new Map();let elapsed=0;const calls=[];
  const db={$transaction:async(fn,options)=>{try{return await prisma.$transaction(tx=>{const wrapped={...tx};for(const table of ['bestTimeAnalysis','trendAlert','trackedCompetitor','calendarEntry','youtubeToken']){const method=table==='bestTimeAnalysis'||table==='youtubeToken'?'findUnique':'findMany';wrapped[table]={[method]:async input=>{calls.push(table);const value=await tx[table][method](input);if(table===stage){selected.resolve();await ack.promise;}return value;}};}return fn(wrapped);},options);}finally{done.resolve();}}};
  const before=await h.snapshot(),original=h.invoke(h.api(db,{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}}));
  try{await Promise.race([selected.promise,original.then(()=>{throw Error('Original HTTP ended before expected '+stage+' SELECT gate');})]);const prior=[...calls];elapsed=55000;for(const fn of [...timers.values()])fn();assert.equal((await original).status,503);ack.resolve();await done.promise;await flush();assert.deepEqual(calls,prior);assert.equal(h.calls.factories,0);assert.equal(timers.size,0);assert.deepEqual(await h.snapshot(),before);}
  finally{ack.resolve();}
 });
};
