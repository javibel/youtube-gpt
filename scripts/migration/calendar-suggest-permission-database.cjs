'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 async function test(name,fn){
  const wallStart=Date.now(),users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'calendar-suggest-permission-'+randomUUID()+'@example.invalid'}})));
  const ids=users.map(u=>u.id),end=new Date(wallStart+86400000);let wall=wallStart,creates=0,retrieves=0,factories=0;
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:ClockDate});
  const own=users[0],proposal={title:'Own original proposal',date:new Date(wallStart+86400000).toISOString().slice(0,10),hour:0,reason:'Synthetic',description:'Synthetic outline'};
  const authUser={id:own.id,email:own.email};
  const api=(db=prisma,user=authUser,globals={})=>load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user})},'@/lib/prisma':{prisma:db},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{factories++;assert.equal(identity.userId,own.id);return{create:async()=>{creates++;return{content:[{type:'text',text:JSON.stringify([proposal])}]};},retrieve:async()=>{retrieves++;return null;}};}}},{Date:ClockDate,...globals});
  const invoke=(route,body={lang:'en'},signal)=>route.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'own-permission-key'},body:JSON.stringify(body),signal}));
  const snapshot=async()=>({users:await prisma.user.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}}),subscriptions:await prisma.subscription.findMany({where:{userId:{in:ids}},orderBy:{userId:'asc'}}),entries:await prisma.calendarEntry.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),creations:await prisma.calendarCreationReceipt.count({where:{userId:{in:ids}}}),mutations:await prisma.calendarMutationReceipt.count({where:{userId:{in:ids}}}),generations:await prisma.generation.count({where:{userId:{in:ids}}})});
  try{
   await prisma.subscription.create({data:{userId:own.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:end}});
   await prisma.calendarEntry.createMany({data:users.map((u,i)=>({userId:u.id,title:'Synthetic context '+i,date:proposal.date}))});
   await fn({users,own,ids,end,proposal,authUser,api,invoke,snapshot,get calls(){return{creates,retrieves,factories};},advanceWall(ms){wall+=ms;},setWall(value){wall=value;}});
   results.push('Calendar suggestion permission native '+name);
  }finally{await prisma.user.deleteMany({where:{id:{in:ids}}});}
 }
 await test('own stored ID/email and declared paid permission allow original task with no business mutation',async h=>{
  const before=await h.snapshot(),r=await h.invoke(h.api());assert.equal(r.status,200);assert.deepEqual((await r.json()).suggestions,[h.proposal]);assert.deepEqual(h.calls,{creates:1,retrieves:0,factories:1});assert.deepEqual(await h.snapshot(),before);
 });
 for(const mode of ['missing-email','foreign-id','foreign-email','missing-owner'])await test('rejects '+mode+' before constructing a task',async h=>{
  const user=mode==='missing-email'?{id:h.own.id}:mode==='foreign-id'?{id:h.users[1].id,email:h.own.email}:mode==='foreign-email'?{id:h.own.id,email:h.users[1].email}:{id:h.own.id,email:'missing-'+randomUUID()+'@example.invalid'};
  const before=await h.snapshot();assert.equal((await h.invoke(h.api(prisma,user))).status,mode==='missing-owner'?404:401);assert.deepEqual(h.calls,{creates:0,retrieves:0,factories:0});assert.deepEqual(await h.snapshot(),before);
 });
 await test('already expired declared manual permission stays expired without renewal',async h=>{
  await prisma.subscription.update({where:{userId:h.own.id},data:{currentPeriodEnd:new Date('2000-01-01')}});const before=await h.snapshot();assert.equal((await h.invoke(h.api())).status,403);assert.deepEqual(h.calls,{creates:0,retrieves:0,factories:0});assert.deepEqual(await h.snapshot(),before);
 });
 for(const body of [{lang:'fr'},{lang:'en',userId:'foreign'},{lang:null}])await test('closed language input rejects '+JSON.stringify(body)+' without task or business writes',async h=>{
  const before=await h.snapshot();assert.equal((await h.invoke(h.api(),body)).status,400);assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);
 });
 await test('foreign actual subscription acknowledgement cannot authorize this owner',async h=>{
  await prisma.subscription.create({data:{userId:h.users[1].id,plan:'business',status:'active'}});
  const db={$transaction:(fn,options)=>prisma.$transaction(tx=>fn({...tx,subscription:{findUnique:()=>tx.subscription.findUnique({where:{userId:h.users[1].id}})}}),options),bestTimeAnalysis:prisma.bestTimeAnalysis,trendAlert:prisma.trendAlert,trackedCompetitor:prisma.trackedCompetitor,calendarEntry:prisma.calendarEntry,youtubeToken:prisma.youtubeToken};
  const before=await h.snapshot();assert.equal((await h.invoke(h.api(db))).status,503);assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);
 });
 await test('original owner fields survive mutable auth after actual own SQL SELECT',async h=>{
  const db={$transaction:(fn,options)=>prisma.$transaction(tx=>fn({...tx,user:{findUnique:async input=>{const selected=await tx.user.findUnique(input);h.authUser.id=h.users[1].id;h.authUser.email=h.users[1].email;return selected;}}}),options),bestTimeAnalysis:prisma.bestTimeAnalysis,trendAlert:prisma.trendAlert,trackedCompetitor:prisma.trackedCompetitor,calendarEntry:prisma.calendarEntry,youtubeToken:prisma.youtubeToken};
  const before=await h.snapshot();assert.equal((await h.invoke(h.api(db))).status,200);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('late permission transaction acknowledgement cannot renew declared expiry',async h=>{
  const committed=deferred(),ack=deferred(),done=deferred(),db={$transaction:async(fn,options)=>{const original=await prisma.$transaction(fn,options);committed.resolve();await ack.promise;done.resolve();return original;}};
  const before=await h.snapshot(),original=h.invoke(h.api(db));
  try{await Promise.race([committed.promise,original.then(()=>{throw Error('Original HTTP terminated before expected own SQL ACK gate');})]);h.setWall(h.end.getTime()+1);ack.resolve();assert.equal((await original).status,403);await done.promise;assert.equal(h.calls.factories,0);assert.deepEqual(await h.snapshot(),before);}
  finally{ack.resolve();}
 });
 for(const reason of ['deadline','abort'])await test('original '+reason+' during owner SELECT retires HTTP without later SQL/task',async h=>{
  const selected=deferred(),ack=deferred(),done=deferred(),controller=new AbortController(),timers=new Map();let elapsed=0,subscriptions=0;
  const db={$transaction:async(fn,options)=>{try{return await prisma.$transaction(tx=>fn({...tx,user:{findUnique:async input=>{const row=await tx.user.findUnique(input);selected.resolve();await ack.promise;return row;}},subscription:{findUnique:async input=>{subscriptions++;return tx.subscription.findUnique(input);}}}),options);}finally{done.resolve();}}};
  const before=await h.snapshot(),original=h.invoke(h.api(db,h.authUser,{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}}),{lang:'en'},controller.signal);
  try{await Promise.race([selected.promise,original.then(()=>{throw Error('Original HTTP terminated before expected owner SELECT gate');})]);if(reason==='abort')controller.abort();else{elapsed=55000;for(const fn of [...timers.values()])fn();}
   const r=await original;assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});ack.resolve();await done.promise;await flush();assert.equal(subscriptions,0);assert.equal(h.calls.factories,0);assert.equal(timers.size,0);assert.deepEqual(await h.snapshot(),before);
  }finally{ack.resolve();}
 });
};
