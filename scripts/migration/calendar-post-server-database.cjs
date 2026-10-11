'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2,3].map(i=>prisma.user.create({data:{email:'post-contract-'+randomUUID()+'@example.invalid',name:'Synthetic POST '+i}}))),owner=users[0],neighbor=users[1],period=new Date(Date.now()+86400000);
 let session={user:{id:owner.id,email:owner.email}};
 await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:period}))});
 const payload={title:' Native original ',description:' captured input ',date:'2024-02-29',status:'idea',color:null};
 const key=()=>randomUUID(),request=(body=payload,k=key(),retained=false)=>new Request('https://example.invalid/api/calendar',{method:'POST',headers:{'Idempotency-Key':k,...(retained?{'X-Calendar-Write-Recovery':'retained-only-v1'}:{})},body:JSON.stringify(body)});
 function fixture(options={}){
  const started=deferred(),gate=deferred(),timers=new Map();let elapsed=0,wall=Date.now(),originalTx,committed,ownerPid,calls=[];
  class WallDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:WallDate});
  const step=async(stage,operation)=>{calls.push(stage);const value=await operation();if(options.held===stage){started.resolve(value);await gate.promise;}return value;};
  const wrapped={$transaction:(fn,opts)=>{originalTx=prisma.$transaction(async tx=>{
   ownerPid=(await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid;
   return fn({...tx,$queryRawUnsafe:(sql,...args)=>step(sql.includes('subscriptions')?'sub-lock':'owner',()=>tx.$queryRawUnsafe(sql,...args)),subscription:{...tx.subscription,findUnique:q=>step('plan',()=>tx.subscription.findUnique(q))},calendarEntry:{...tx.calendarEntry,count:q=>step('count',()=>tx.calendarEntry.count(q)),create:q=>step('create',()=>tx.calendarEntry.create(q))},calendarCreationReceipt:{...tx.calendarCreationReceipt,create:q=>step('receipt-write',()=>options.receiptFails?Promise.reject(Error('Synthetic receipt refusal')):tx.calendarCreationReceipt.create(q))}});
  },opts);void originalTx.catch(()=>{});const ack=originalTx.then(async value=>{committed=value;if(options.held==='ack'){started.resolve(value);await gate.promise;}return value;});void ack.catch(()=>{});return ack;}};
  const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma:wrapped},'@/lib/plans':plans},{performance:{now:()=>elapsed},setTimeout(fn,ms){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}});
  return {route,started,gate,timers,calls,get tx(){return originalTx;},get pid(){return ownerPid;},get committed(){return committed;},retire(){elapsed=30000;for(const fn of [...timers.values()])fn();},expire(){wall=Date.now()+2*86400000;}};
 }
 const normal=fixture();const post=(body,k,retained)=>normal.route.POST(request(body,k,retained));
 const own=()=>prisma.calendarEntry.count({where:{userId:owner.id}}),ownReceipts=()=>prisma.calendarCreationReceipt.count({where:{userId:owner.id}});
 try{
  for(const body of [{...payload,date:'2026-02-29'},{...payload,status:null},{...payload,unknown:true}])assert.equal((await post(body)).status,400);
  assert.equal(await own(),0);assert.equal(await ownReceipts(),0);results.push('POST canonical day/status/allowed input reject before native creation');
  for(const invalid of [{user:{id:owner.id}},{user:{id:owner.id,email:neighbor.email}},{user:{id:neighbor.id,email:owner.email}}]){session=invalid;assert.equal((await post()).status,401);}session={user:{id:owner.id,email:owner.email}};
  assert.equal(await own(),0);assert.equal(await ownReceipts(),0);results.push('POST requires captured ID and email matching the original locked SQL owner');
  const originalKey=key(),success=await post(payload,originalKey);assert.equal(success.status,201);const entry=(await success.json()).entry;assert.equal(entry.userId,owner.id);assert.equal(entry.title,'Native original');assert.equal(entry.date,'2024-02-29');assert.match(entry.createdAt,/Z$/);assert.equal(success.headers.get('cache-control'),'no-store');
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),read=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma},'@/lib/plans':plans});
  const visible=await read.GET(new Request('https://example.invalid/api/calendar?from=2024-02-01&to=2024-02-29'));assert.equal(visible.status,200);assert.equal((await visible.json()).entries[0].id,entry.id);
  results.push('native original POST normalized entry is visible in the complete own GET snapshot');
  const concurrentKey=key(),twice=await Promise.all([post(payload,concurrentKey),post(payload,concurrentKey)]);assert.deepEqual(twice.map(r=>r.status),[201,201]);assert.equal((await twice[0].json()).entry.id,(await twice[1].json()).entry.id);assert.equal(await own(),2);assert.equal(await ownReceipts(),2);
  results.push('native owner/subscription locks serialize same-key creations to one business row and receipt');
  for(const stage of ['owner','sub-lock','plan','count','create','receipt-write']){
   const h=fixture({held:stage}),before=[await own(),await ownReceipts()],pending=h.route.POST(request());await h.started.promise;h.retire();const response=await pending;assert.equal(response.status,503);const called=h.calls.length;h.gate.resolve();await assert.rejects(h.tx);await flush();assert.equal(h.calls.length,called);assert.deepEqual([await own(),await ownReceipts()],before);assert.equal(h.timers.size,0);
   results.push('native original POST '+stage+' held through HTTP retirement rolls back without dispatching any later SQL effect');
  }
  const held=fixture({held:'sub-lock'}),pending=held.route.POST(request());await held.started.promise;
  const writing=deferred();let updatePid;
  const updated=prisma.$transaction(async tx=>{updatePid=(await tx.$queryRawUnsafe('SELECT pg_backend_pid() AS pid'))[0].pid;writing.resolve();return tx.subscription.update({where:{userId:owner.id},data:{plan:'free',status:'canceled'}});},{timeout:15000});void updated.catch(()=>{});await writing.promise;
  let blockers=[];for(let i=0;i<100;i++){blockers=(await prisma.$queryRawUnsafe('SELECT pg_blocking_pids($1::int) AS blockers',updatePid))[0].blockers;if(blockers.includes(held.pid))break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(blockers.includes(held.pid),'native billing update must wait on original subscription lock');held.gate.resolve();assert.equal((await pending).status,201);await updated;const beforeDenied=await own();assert.equal((await post()).status,403);assert.equal(await own(),beforeDenied);
  await prisma.subscription.update({where:{userId:owner.id},data:{plan:'pro',status:'active'}});
  assert.equal((await prisma.subscription.findUnique({where:{userId:owner.id}})).currentPeriodEnd.toISOString(),period.toISOString());
  results.push('actual subscription update waits for original POST row lock; subsequent free source denies a fresh insert and original declared period is unchanged');
  const ackKey=key(),late=fixture({held:'ack'}),waiting=late.route.POST(request(payload,ackKey));await late.started.promise;const committedCount=await own(),committedReceipts=await ownReceipts();late.retire();assert.equal((await waiting).status,503);late.gate.resolve();await late.tx;await flush();assert.equal(late.calls.filter(s=>s==='create').length,1);
  const retained=await post(payload,ackKey,true);assert.equal(retained.status,201);assert.equal((await retained.json()).entry.id,late.committed.entry.id);assert.equal(await own(),committedCount);assert.equal(await ownReceipts(),committedReceipts);
  results.push('original native commit with late HTTP acknowledgement stays 503; explicit unchanged retained query selects only that original row without readmitting');
  const absentBefore=await own();assert.equal((await post(payload,key(),true)).status,503);assert.equal((await post({...payload,title:'Different'},ackKey,true)).status,409);assert.equal(await own(),absentBefore);
  await prisma.calendarEntry.update({where:{id:entry.id},data:{title:'Edited later'}});assert.equal((await post(payload,originalKey,true)).status,409);await prisma.calendarEntry.delete({where:{id:entry.id}});assert.equal((await post(payload,originalKey,true)).status,503);assert.equal((await post(payload,originalKey)).status,503);
  results.push('absent, conflicting, edited and deleted native original receipts never admit replacements or overwrite later state');
  const receiptBefore=[await own(),await ownReceipts()],refused=fixture({receiptFails:true});assert.equal((await refused.route.POST(request())).status,503);assert.deepEqual([await own(),await ownReceipts()],receiptBefore);
  results.push('native receipt failure rolls calendar insertion back without a fallback effect');
  for(const stage of ['count','create','ack']){
   const h=fixture({held:stage}),before=[await own(),await ownReceipts()],pending=h.route.POST(request());await h.started.promise;h.expire();h.gate.resolve();const response=await pending;assert.equal(response.status,stage==='count'?403:503);await h.tx.catch(()=>{});assert.deepEqual([await own(),await ownReceipts()],before.map(x=>x+(stage==='ack'?1:0)));assert.equal((await prisma.subscription.findUnique({where:{userId:owner.id}})).currentPeriodEnd.toISOString(),period.toISOString());
   results.push('original declared native manual period expires during '+stage+' without renewal or false HTTP acknowledgement');
  }
  assert.equal(await prisma.calendarEntry.count({where:{userId:{in:[neighbor.id,users[2].id]}}}),0);assert.equal(await prisma.calendarCreationReceipt.count({where:{userId:{in:[neighbor.id,users[2].id]}}}),0);assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
  results.push('native neighboring owners and generation records unchanged; no model, payment or operational recovery authority');
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
