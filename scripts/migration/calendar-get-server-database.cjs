'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'calendar-get-'+randomUUID()+'@example.invalid',name:'Synthetic calendar snapshot '+i}}))),ids=users.map(u=>u.id);
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),test=async(name,fn)=>{await fn();results.push('Calendar GET native '+name);};
 const api=(user=users[0],db=prisma,globals={},policy=plans)=>load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user})},'@/lib/prisma':{prisma:db},'@/lib/plans':policy},globals);
 const invoke=(route,query='',signal)=>route.GET(new Request('https://example.invalid/api/calendar'+query,{signal}));
 let rows,foreign;
 try{
  await prisma.subscription.createMany({data:users.map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  rows=await Promise.all(['2026-10-01','2026-10-10','2026-10-31'].map((date,i)=>prisma.calendarEntry.create({data:{userId:users[0].id,title:'Synthetic own '+i,date,status:'idea'}})));
  foreign=await prisma.calendarEntry.create({data:{userId:users[1].id,title:'Synthetic foreign',date:'2026-10-10'}});
  await test('own ID/email and inclusive range have complete coverage while excluding foreign rows',async()=>{const r=await invoke(api(),'?from=2026-10-10&to=2026-10-31');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();assert.deepEqual(b.owner,{id:users[0].id,email:users[0].email});assert.deepEqual(b.range,{from:'2026-10-10',to:'2026-10-31'});assert.deepEqual(b.coverage,{complete:true,count:2,limit:200});assert.deepEqual(b.entries.map(e=>e.id),rows.slice(1).map(r=>r.id));});
  await test('empty range is a complete own observation with count zero',async()=>{const r=await invoke(api(),'?from=2027-01-01&to=2027-01-31');assert.equal(r.status,200);const b=await r.json();assert.deepEqual(b.entries,[]);assert.deepEqual(b.coverage,{complete:true,count:0,limit:200});});
  for(const [query,expected]of [['',3],['?from=2026-10-10',2],['?to=2026-10-10',2]])await test('optional range '+query+' retains explicit coverage',async()=>{const r=await invoke(api(),query);assert.equal(r.status,200);assert.equal((await r.json()).coverage.count,expected);});
  for(const query of ['?from=2026-02-30','?from=2026-10-31&to=2026-10-01','?from=2026-10-01&from=2026-10-01','?userId='+users[1].id])await test('invalid or duplicated range does not enter SQL '+query,async()=>{let entered=0;const r=await invoke(api(users[0],{$transaction(){entered++;throw Error('Unexpected SQL');}}),query);assert.equal(r.status,400);assert.equal(entered,0);});
  for(const user of [{id:users[0].id,email:users[1].email},{id:users[1].id,email:users[0].email},{id:users[0].id}])await test('SQL owner cannot follow foreign or incomplete session '+JSON.stringify(user),async()=>{const r=await invoke(api(user));assert.equal(r.status,401);assert.equal(await prisma.calendarEntry.count({where:{userId:{in:ids}}}),4);});
  await test('missing selected owner is unavailable without accepting another account',async()=>{const r=await invoke(api({id:users[0].id,email:'absent-'+randomUUID()+'@example.invalid'}));assert.equal(r.status,404);});
  await test('declared expired manual access remains expired with no date renewal',async()=>{await prisma.subscription.update({where:{userId:users[1].id},data:{currentPeriodEnd:new Date('2000-01-01')}});const before=await prisma.subscription.findUnique({where:{userId:users[1].id}});const r=await invoke(api(users[1]));assert.equal(r.status,403);assert.deepEqual(await prisma.subscription.findUnique({where:{userId:users[1].id}}),before);});
  await test('native read transaction is repeatable even when own email and calendar change between selects',async()=>{
   const selected=deferred(),release=deferred(),newEmail='calendar-get-changed-'+randomUUID()+'@example.invalid';let entered=0;
   const db={$transaction:(fn,opts)=>{assert.equal(opts.isolationLevel,'RepeatableRead');return prisma.$transaction(tx=>fn({...tx,calendarEntry:{...tx.calendarEntry,findMany:async input=>{entered++;selected.resolve();await release.promise;return tx.calendarEntry.findMany(input);}}}),opts);}};
   const original=invoke(api(users[0],db));await selected.promise;
   await prisma.user.update({where:{id:users[0].id},data:{email:newEmail}});const added=await prisma.calendarEntry.create({data:{userId:users[0].id,title:'Synthetic concurrent entry',date:'2026-10-20'}});release.resolve();
   const response=await original;assert.equal(response.status,200);const b=await response.json();assert.deepEqual(b.owner,{id:users[0].id,email:users[0].email});assert.equal(b.coverage.count,3);assert.equal(b.entries.some(r=>r.id===added.id),false);assert.equal(entered,1);
   assert.equal((await invoke(api(users[0]))).status,404);const latest=await invoke(api({...users[0],email:newEmail}));assert.equal(latest.status,200);assert.equal((await latest.json()).coverage.count,4);
   await prisma.user.update({where:{id:users[0].id},data:{email:users[0].email}});await prisma.calendarEntry.delete({where:{id:added.id}});
  });
  await test('sentinel row distinguishes exactly 200 complete entries from 201 truncated rows',async()=>{
   const additions=[];for(let i=0;i<197;i++)additions.push({id:'calendar-cap-'+randomUUID(),userId:users[0].id,title:'Synthetic capacity '+i,date:'2026-10-10'});await prisma.calendarEntry.createMany({data:additions});
   try{const full=await invoke(api());assert.equal(full.status,200);assert.deepEqual((await full.json()).coverage,{complete:true,count:200,limit:200});const extra=await prisma.calendarEntry.create({data:{userId:users[0].id,title:'Synthetic sentinel',date:'2026-10-10'}});
    try{const capped=await invoke(api());assert.equal(capped.status,503);assert.deepEqual(await capped.json(),{error:'calendar_read_unconfirmed'});assert.equal(await prisma.calendarEntry.count({where:{userId:users[0].id}}),201);}finally{await prisma.calendarEntry.delete({where:{id:extra.id}});}
   }finally{await prisma.calendarEntry.deleteMany({where:{id:{in:additions.map(r=>r.id)},userId:users[0].id}});}
  });
  await test('native malformed persisted date cannot acknowledge complete coverage',async()=>{const invalid=await prisma.calendarEntry.create({data:{userId:users[0].id,title:'Synthetic invalid date',date:'2026-02-30'}});try{assert.equal((await invoke(api())).status,503);}finally{await prisma.calendarEntry.delete({where:{id:invalid.id}});}});
  for(const mode of ['foreign','duplicate','range'])await test('unconfirmed '+mode+' native row acknowledgement is rejected',async()=>{
   const db={$transaction:(fn,opts)=>prisma.$transaction(tx=>fn({...tx,calendarEntry:{...tx.calendarEntry,findMany:async input=>{const own=await tx.calendarEntry.findMany(input);return mode==='foreign'?[await tx.calendarEntry.findUnique({where:{id:foreign.id}})]:mode==='duplicate'?[own[0],own[0]]:[await tx.calendarEntry.findUnique({where:{id:rows[0].id}})];}}}),opts)};
   const r=await invoke(api(users[0],db),'?from=2026-10-10&to=2026-10-31');assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'calendar_read_unconfirmed'});
  });
  await test('delayed original commit acknowledgement cannot confirm a read after shared deadline',async()=>{
   const committed=deferred(),release=deferred(),done=deferred(),timers=new Map();let elapsed=0,entered=0;
   const db={$transaction:async(fn,opts)=>{entered++;const original=await prisma.$transaction(fn,opts);committed.resolve();await release.promise;done.resolve();return original;}};
   const original=invoke(api(users[0],db,{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}}));await committed.promise;elapsed=25000;for(const fn of [...timers.values()])fn();const r=await original;assert.equal(r.status,503);release.resolve();await done.promise;await flush();assert.equal(r.status,503);assert.equal(entered,1);assert.equal(timers.size,0);
  });
  await test('declared manual period can expire during original commit acknowledgement without renewal',async()=>{
   const observed=deferred(),release=deferred(),epoch=Date.now(),end=new Date(epoch+60000);let wall=epoch;
   class ClockDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
   const policy=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:ClockDate});await prisma.subscription.update({where:{userId:users[0].id},data:{currentPeriodEnd:end}});
   const db={$transaction:async(fn,opts)=>{const result=await prisma.$transaction(fn,opts);observed.resolve();await release.promise;return result;}};
   const original=invoke(api(users[0],db,{},policy));await observed.promise;wall=epoch+60000;release.resolve();const r=await original;assert.equal(r.status,403);assert.equal((await prisma.subscription.findUnique({where:{userId:users[0].id}})).currentPeriodEnd.toISOString(),end.toISOString());
  });
  await test('GET leaves entries, creation/mutation receipts, generations and attempts unchanged',async()=>{assert.equal(await prisma.calendarEntry.count({where:{userId:{in:ids}}}),4);for(const table of ['calendarCreationReceipt','calendarMutationReceipt','generation','textGenerationAttempt'])assert.equal(await prisma[table].count({where:{userId:{in:ids}}}),0);});
 }finally{await prisma.user.deleteMany({where:{id:{in:ids}}});}
};
