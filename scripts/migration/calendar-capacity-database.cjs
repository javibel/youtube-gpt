'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'calendar-capacity-'+randomUUID()+'@example.invalid',name:'Synthetic capacity '+i}})));
 const date=new Date().toISOString().slice(0,10),plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const route=(user,db=prisma)=>load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:user.id}})},'@/lib/prisma':{prisma:db},'@/lib/plans':plans});
 const post=(api,title)=>api.POST(new Request('https://example.invalid/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,date})}));
 const count=user=>prisma.calendarEntry.count({where:{userId:user.id}});
 try{
  await prisma.subscription.createMany({data:users.map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.calendarEntry.createMany({data:Array.from({length:199},(_,i)=>({userId:users[0].id,title:'Synthetic existing '+i,date,status:'idea'}))});
  const first=route(users[0]),second=route(users[1]);
  const race=async()=>{
   const responses=await Promise.all([post(first,'Synthetic contender A'),post(first,'Synthetic contender B')]);
   assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);
   assert.deepEqual(await responses.find(r=>r.status===400).json(),{error:'max_entries'});
   const winner=(await responses.find(r=>r.status===201).json()).entry;
   assert.equal(winner.userId,users[0].id);assert.equal(await count(users[0]),200);return winner;
  };
  const winner=await race();assert.equal(await count(users[1]),0);
  assert.equal((await post(second,'Synthetic independent owner')).status,201);assert.equal(await count(users[1]),1);
  assert.equal((await first.DELETE(new Request('https://example.invalid/api/calendar?id='+winner.id))).status,200);
  assert.equal(await count(users[0]),199);await race();assert.equal(await count(users[1]),1);
  results.push('actual calendar POST/plans/PostgreSQL serializes simultaneous admissions at199 to one201/one400 and200 rows; another owner and a freed calendar slot remain independent');

  const rollback={$transaction:(run,options)=>prisma.$transaction(tx=>run({
   $queryRawUnsafe:tx.$queryRawUnsafe.bind(tx),calendarEntry:{count:tx.calendarEntry.count.bind(tx.calendarEntry),create:async args=>{await tx.calendarEntry.create(args);throw Error('Synthetic failure after insertion inside original transaction');}},
  }),options)};
  const failed=await post(route(users[1],rollback),'Synthetic rolled back');
  assert.equal(failed.status,503);assert.equal(failed.headers.get('Cache-Control'),'no-store');assert.equal(await count(users[1]),1);
  assert.equal((await post(second,'Synthetic fresh action')).status,201);assert.equal(await count(users[1]),2);assert.equal(await count(users[0]),200);
  results.push('calendar admission failure after real PostgreSQL insertion rolls back the transaction; explicit separate action uses its own slot without changing the full owner');

  const lost={$transaction:async(run,options)=>{await prisma.$transaction(run,options);throw Error('Synthetic lost acknowledgement after original commit');}};
  assert.equal((await post(route(users[1],lost),'Synthetic committed without acknowledgement')).status,503);
  assert.equal(await count(users[1]),3);assert.equal(await prisma.calendarEntry.count({where:{userId:users[1].id,title:'Synthetic committed without acknowledgement'}}),1);
  assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
  results.push('calendar lost transaction acknowledgement remains503 with exactly one committed PostgreSQL row, no fallback or retry and no generations; capacity locking does not claim durable idempotency');
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
