'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{harness,event,subscription,flush}=require('./stripe-webhook-intake.test.cjs');
const offline=require('../../lib/migration-payments.cjs');
module.exports=async(prisma,results)=>{
 const own=await prisma.user.create({data:{email:'webhook-intake-'+randomUUID()+'@example.invalid'}});
 try {
  await prisma.subscription.create({data:{userId:own.id,plan:'pro',status:'active',stripeCustomerId:'cus_synthetic',currentPeriodStart:new Date('2000-01-01'),currentPeriodEnd:new Date('2000-01-02')}});
  const snapshot=async()=>({user:await prisma.user.findUnique({where:{id:own.id}}),sub:await prisma.subscription.findUnique({where:{userId:own.id}}),calendar:await prisma.calendarEntry.count({where:{userId:own.id}}),history:await prisma.generation.count({where:{userId:own.id}})});
  const before=await snapshot();
  async function test(name,fn){await fn();assert.deepEqual(await snapshot(),before);results.push('Stripe webhook intake native '+name);}
  const original=()=>{const e=event();e.data.object.metadata.userId=own.id;return e;};
  await test('actual isolation guard remains closed and own SQL intact',async()=>{const h=harness({event:original(),prisma,verify:offline.stripe.webhooks.constructEvent});assert.equal((await h.post()).status,400);assert.equal(h.calls.retrieve.length,0);});
  await test('signature absent has no verifier or SQL',async()=>{const h=harness({event:original(),prisma});assert.equal((await h.post(h.request('{}',{}))).status,400);assert.equal(h.calls.verify.length,0);});
  await test('actual oversized body cannot reach SDK or SQL',async()=>{const h=harness({event:original(),prisma});assert.equal((await h.post(h.request('x'.repeat(262145)))).status,413);assert.equal(h.calls.verify.length,0);});
  await test('malformed user metadata denied before retrieve',async()=>{const e=original();e.data.object.metadata.userId={id:own.id};const h=harness({event:e,prisma});assert.equal((await h.post()).status,400);assert.equal(h.calls.retrieve.length,0);});
  await test('wrong expanded customer object denied before effects',async()=>{const e=original();e.data.object.customer={object:'subscription',id:'cus_synthetic'};const h=harness({event:e,prisma});assert.equal((await h.post()).status,400);assert.equal(h.calls.retrieve.length,0);});
  await test('hung body retires its owned reader without writes',async()=>{let cancelled=0;const h=harness({event:original(),prisma}),p=h.post(h.request(new ReadableStream({cancel(){cancelled++;}})));await flush();h.advance(55000);assert.equal((await p).status,503);assert.equal(cancelled,1);assert.equal(h.calls.verify.length,0);});
  await test('late original simulated retrieve cannot start own SQL',async()=>{let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),h=harness({event:original(),prisma,retrieve:async()=>{start();return gate;}}),p=h.post();await started;h.advance(55000);assert.equal((await p).status,503);release(subscription());await flush();assert.equal(h.calls.retrieve.length,1);});
  await test('already issued SQL read finishes once but late result is never acknowledged',async()=>{
   let release,start,queries=0;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);
   // This physically retained read belongs only to this test. It does not recover, cancel or commit a business writer.
   const observed={subscription:{upsert:async()=>{queries++;const row=await prisma.subscription.findUnique({where:{userId:own.id}});start();await gate;return row;}}};
   const h=harness({event:original(),prisma:observed}),p=h.post();await started;h.advance(55000);assert.equal((await p).status,503);release();await flush();assert.equal(queries,1);assert.equal(h.calls.other.length,0);assert.equal(h.timers.size,0);
  });
 }finally{await prisma.user.delete({where:{id:own.id}});}
};
