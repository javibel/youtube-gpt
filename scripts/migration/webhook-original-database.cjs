'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness,flush}=require('./stripe-webhook-intake.test.cjs'),{data}=require('./checkout-webhook-business.test.cjs'),offline=require('../../lib/migration-payments.cjs');
module.exports=async(prisma,results)=>{
 async function test(name,fn){
  const own=await prisma.user.create({data:{email:'webhook-custody-'+randomUUID()+'@example.invalid'}}),d=data();
  d.checkout.userId=own.id;d.checkout.customerId='cus_'+own.id;d.subscription.customer=d.checkout.customerId;d.subscription.metadata.userId=own.id;d.customer.id=d.checkout.customerId;d.customer.metadata.userId=own.id;d.customer.email=own.email;
  try{
   await prisma.subscription.create({data:{userId:own.id,stripeCustomerId:d.checkout.customerId,stripePriceId:'price_prior',plan:'pro',status:'active',currentPeriodStart:new Date('2000-01-01'),currentPeriodEnd:new Date('2000-01-02')}});
   const snapshot=async()=>({user:await prisma.user.findUnique({where:{id:own.id}}),sub:await prisma.subscription.findUnique({where:{userId:own.id}}),checkout:await prisma.checkoutAttempt.count({where:{userId:own.id}}),sync:await prisma.subscriptionSyncAttempt.count({where:{userId:own.id}}),cancel:await prisma.subscriptionCancellationAttempt.count({where:{userId:own.id}}),downgrade:await prisma.subscriptionDowngradeAttempt.count({where:{userId:own.id}})});
   const before=await snapshot();
   function bind(extra={}){
    const core=load('lib/stripe-webhook-contract.ts'),business=load('lib/checkout-webhook-business.ts',{'@/lib/prisma':{prisma},'@/lib/stripe-webhook-contract':core});
    const h=harness({retrieve:async()=>d.subscription,customer:async()=>d.customer,preflight:(...a)=>business.preflightCheckoutBusiness(...a),...extra});
    h.current.data.object.metadata.userId=own.id;h.current.data.object.customer=d.checkout.customerId;
    const p=h.original.prepareWebhookVerification(()=>{}),token=p.verify('{"local":"custody"}','synthetic-signature');
    return{h,p,token};
   }
   await fn({own,d,bind,snapshot});assert.deepEqual(await snapshot(),before);results.push('Webhook original custody native '+name);
  }finally{await prisma.user.delete({where:{id:own.id}});}
 }
 await test('own linked SQL can be read once but still has no admission/write authority',async x=>{const{h,p,token}=x.bind(),r=await h.original.preflightCheckoutOriginal(token);assert.equal(r.userId,x.own.id);assert.equal(r.writeAuthorized,false);assert.equal(r.periodStartSeconds,0);assert.equal(r.periodEndSeconds,86400);await assert.rejects(h.original.preflightCheckoutOriginal(token),e=>e.status===503);assert.equal(h.calls.preflight.length,1);assert.equal(h.calls.upsert.length,0);p.close();});
 await test('matching own JSON/id/metadata cannot reconstruct opaque custody or read SQL',async x=>{const{h,p,token}=x.bind();for(const value of [JSON.parse(JSON.stringify(token)),structuredClone(token),h.original.snapshotWebhookOriginal(token),{userId:x.own.id,eventId:'evt_synthetic'}])await assert.rejects(h.original.preflightCheckoutOriginal(value),e=>e.status===503);assert.equal(h.calls.retrieve.length,0);assert.equal(h.calls.preflight.length,0);p.close();});
 await test('independent module/same source cannot recover original ownership',async x=>{const a=x.bind(),b=x.bind();await assert.rejects(b.h.original.preflightCheckoutOriginal(a.token),e=>e.status===503);assert.equal(b.h.calls.retrieve.length,0);a.p.close();b.p.close();});
 await test('explicit original retirement before provider prevents every API/SQL next step',async x=>{const{h,p,token}=x.bind();p.close();await assert.rejects(h.original.preflightCheckoutOriginal(token),e=>e.status===503);assert.equal(h.calls.retrieve.length,0);assert.equal(h.calls.preflight.length,0);});
 await test('retirement while original subscription API pending permits only settlement',async x=>{let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),{h,p,token}=x.bind({retrieve:async()=>{start();return gate;}}),work=h.original.preflightCheckoutOriginal(token);await started;p.close();release(x.d.subscription);await assert.rejects(work,e=>e.status===503);assert.equal(h.calls.customer.length,0);assert.equal(h.calls.preflight.length,0);});
 await test('concurrent second consumer cannot replace original native read-only preflight',async x=>{let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),{h,p,token}=x.bind({customer:async()=>{start();await gate;return x.d.customer;}}),first=h.original.preflightCheckoutOriginal(token);await started;await assert.rejects(h.original.preflightCheckoutOriginal(token),e=>e.status===503);release();assert.equal((await first).writeAuthorized,false);assert.equal(h.calls.preflight.length,1);p.close();});
 await test('native SQL original settles after explicit retirement without confirming or repeating',async x=>{
  let release,start,reads=0;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),core=load('lib/stripe-webhook-contract.ts');
  const observed={$transaction:(fn,settings)=>prisma.$transaction(tx=>fn({user:tx.user,subscription:{findMany:async q=>{reads++;const rows=await tx.subscription.findMany(q);start();await gate;return rows;}}}),settings)};
  const helper=load('lib/checkout-webhook-business.ts',{'@/lib/prisma':{prisma:observed},'@/lib/stripe-webhook-contract':core}),{h,p,token}=x.bind({preflight:(...a)=>helper.preflightCheckoutBusiness(...a)}),work=h.original.preflightCheckoutOriginal(token);await started;p.close();release();await assert.rejects(work,e=>e.status===503);assert.equal(reads,1);await assert.rejects(h.original.preflightCheckoutOriginal(token),e=>e.status===503);assert.equal(h.calls.upsert.length,0);
 });
 await test('unchanged actual SDK isolation guard refuses custody before any business/SQL',async x=>{const h=harness({verify:offline.stripe.webhooks.constructEvent,prisma}),p=h.original.prepareWebhookVerification(()=>{});assert.throws(()=>p.verify(JSON.stringify(h.current),'synthetic-signature'),h.original.WebhookSignatureFailure);await assert.rejects(h.original.preflightCheckoutOriginal(x.d.checkout),e=>e.status===503);assert.equal(h.calls.retrieve.length,0);assert.equal(h.calls.preflight.length,0);p.close();});
};
