'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness}=require('./calendar-client-retry.test.cjs');
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
module.exports=async(prisma,results)=>{
 async function test(name,fn){
  const epoch=Date.now(),own=await prisma.user.create({data:{email:'calendar-suggest-client-'+randomUUID()+'@example.invalid'}});let wall=epoch,creates=0,retrieves=0,originalParameters,originalResult;
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
  const date=new Date(epoch+86400000).toISOString().slice(0,10),plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},{Date:ClockDate});
  // Only this physically retained synthetic test producer can return its result.
  // No JSON/PID/hash/time/reset reconstructs an original application capability.
  const task={create:async parameters=>{creates++;originalParameters=JSON.stringify(parameters);originalResult={content:[{type:'text',text:JSON.stringify([{title:'Native original proposal',date,hour:0,reason:'Synthetic',description:'Synthetic outline'}])}]};return originalResult;},
   retrieve:async parameters=>{retrieves++;if(!originalResult)return null;if(JSON.stringify(parameters)!==originalParameters){const e=Error('Original input changed');e.code='invalid_format';throw e;}return originalResult;}};
  const api=load('app/api/calendar/suggest/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:own.id,email:own.email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:async()=>task}},{Date:ClockDate});
  const invoke=init=>api.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:init.headers,body:init.body,signal:init.signal}));
  const client=storage=>{const h=harness(storage);h.state.user=own.id;h.state.email=own.email;h.state.wall=wall;h.state.send=invoke;return h;};
  const snapshot=async()=>({user:await prisma.user.findUnique({where:{id:own.id}}),subscription:await prisma.subscription.findUnique({where:{userId:own.id}}),entries:await prisma.calendarEntry.findMany({where:{userId:own.id}}),times:await prisma.bestTimeAnalysis.findUnique({where:{userId:own.id}}),creation:await prisma.calendarCreationReceipt.count({where:{userId:own.id}}),mutation:await prisma.calendarMutationReceipt.count({where:{userId:own.id}}),generation:await prisma.generation.count({where:{userId:own.id}})});
  try{
   await prisma.subscription.create({data:{userId:own.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(epoch+86400000)}});
   await prisma.bestTimeAnalysis.create({data:{userId:own.id,heatmap:[],topSlots:[],videoCount:0,analyzedAt:new Date('2000-01-01')}});
   await prisma.calendarEntry.create({data:{userId:own.id,title:'Own original scheduled',date}});
   await fn({own,epoch,date,client,invoke,snapshot,setWall(t){wall=t;},get calls(){return{creates,retrieves};}});
   results.push('Calendar suggestion client native '+name);
  }finally{await prisma.user.delete({where:{id:own.id}});}
 }
 await test('complete own server ACK adopted once without business writes or declared-date renewal',async h=>{
  const before=await h.snapshot(),c=h.client();await c.click();assert.match(c.text(),/Native original proposal/);assert.equal(c.storage.size,0);assert.equal(c.timers.size,0);assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,0);assert.deepEqual(await h.snapshot(),before);assert.equal(before.times.analyzedAt.toISOString(),'2000-01-01T00:00:00.000Z');
 });
 await test('foreign ACK delivery is rejected while own SQL and exact selector remain intact',async h=>{
  const before=await h.snapshot(),c=h.client();c.state.send=async init=>{const r=await h.invoke(init),b=await r.json();b.ack.userId='foreign';return{ok:true,status:200,json:async()=>b};};await c.click();assert(c.alert());assert.equal(c.storage.size,1);assert.doesNotMatch(c.text(),/Native original proposal/);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('lost delivery then identical original retrieval keeps key/body and never creates twice',async h=>{
  const before=await h.snapshot(),c=h.client();c.state.send=async init=>{assert.equal((await h.invoke(init)).status,200);throw Error('Synthetic lost delivery');};await c.click();assert(c.alert());const first=c.requests[0];c.state.send=h.invoke;await c.click();assert.match(c.text(),/Native original proposal/);assert.equal(c.requests[1].headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(c.requests[1].body,first.body);assert.equal(c.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('different new capture stays conflict/uncertainty and cannot renew or readmit',async h=>{
  const before=await h.snapshot(),c=h.client();c.state.send=async init=>{await h.invoke(init);throw Error('Lost');};await c.click();h.setWall(h.epoch+1);c.state.wall=h.epoch+1;c.state.send=h.invoke;await c.click();await c.click();assert(c.alert());assert.doesNotMatch(c.text(),/Native original proposal/);assert.equal(c.storage.size,1);assert.equal(new Set(c.requests.map(r=>r.headers['Idempotency-Key'])).size,1);assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,2);assert.deepEqual(await h.snapshot(),before);
 });
 await test('client30s ends hung delivery after original result while ignoring late ACK',async h=>{
  const before=await h.snapshot(),c=h.client();let release,ready;const held=new Promise(r=>release=r),started=new Promise(r=>ready=r);
  c.state.send=async init=>{const r=await h.invoke(init);ready(r);return held;};const pending=c.click(),original=await started;c.advance(30000);await pending;assert(c.alert());assert.equal(c.timers.size,0);c.state.send=h.invoke;await c.click();release(original);await flush();assert.match(c.text(),/Native original proposal/);assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('malformed proposal delivery is not repaired or accepted from a plausible own ACK',async h=>{
  const before=await h.snapshot(),c=h.client();c.state.send=async init=>{const r=await h.invoke(init),b=await r.json();b.suggestions[0].date='2020-01-01';return{ok:true,status:200,json:async()=>b};};await c.click();assert(c.alert());assert.equal(c.storage.size,1);assert.doesNotMatch(c.text(),/Native original proposal/);assert.equal(h.calls.creates,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('StrictMode retires old callback and only queries the physically retained synthetic original',async h=>{
  const before=await h.snapshot(),c=h.client();let release,ready;const held=new Promise(r=>release=r),started=new Promise(r=>ready=r);
  c.state.send=async init=>{const r=await h.invoke(init);ready(r);return held;};const callback=c.handler(),pending=callback(),original=await started;c.strictEffects();await pending;await callback();assert.equal(c.requests.length,1);c.state.send=h.invoke;await c.click();release(original);await flush();assert.match(c.text(),/Native original proposal/);assert.equal(c.requests[1].headers['Idempotency-Key'],c.requests[0].headers['Idempotency-Key']);assert.equal(c.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,1);assert.deepEqual(await h.snapshot(),before);
 });
 await test('slow local selector removal retires adoption and retry keeps same original rather than fresh key',async h=>{
  const before=await h.snapshot(),c=h.client();c.state.onStorageRemove=()=>c.elapseWithoutTimers(30000);await c.click();assert(c.alert());assert.equal(c.storage.size,1);const first=c.requests[0];c.state.onStorageRemove=null;await c.click();assert.equal(c.requests[1].headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(c.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');assert.match(c.text(),/Native original proposal/);assert.equal(h.calls.creates,1);assert.equal(h.calls.retrieves,1);assert.deepEqual(await h.snapshot(),before);
 });
};
