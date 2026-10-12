'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness,flush}=require('./stripe-webhook-intake.test.cjs'),{data}=require('./checkout-webhook-business.test.cjs');
module.exports=async(prisma,results)=>{
 async function test(name,fn,options={}){
  const users=[];const own=await prisma.user.create({data:{email:'checkout-business-'+randomUUID()+'@example.invalid'}});users.push(own.id);
  const customerId='cus_'+own.id,d=data();d.checkout.userId=own.id;d.checkout.customerId=customerId;d.subscription.customer=customerId;d.subscription.metadata.userId=own.id;d.customer.id=customerId;d.customer.metadata.userId=own.id;d.customer.email=own.email;
  try{
   if(!options.missing)await prisma.subscription.create({data:{userId:own.id,stripeCustomerId:customerId,stripePriceId:'price_prior',plan:'pro',status:'active',currentPeriodStart:new Date('2000-01-01'),currentPeriodEnd:new Date('2000-01-02')}});
   if(options.ambiguous){const other=await prisma.user.create({data:{email:'checkout-business-ambiguous-'+randomUUID()+'@example.invalid'}});users.push(other.id);await prisma.subscription.create({data:{userId:other.id,stripeCustomerId:customerId,plan:'pro',status:'active'}});}
   const snapshot=async()=>({users:await prisma.user.findMany({where:{id:{in:users}},orderBy:{id:'asc'}}),subs:await prisma.subscription.findMany({where:{userId:{in:users}},orderBy:{id:'asc'}}),attempts:await prisma.checkoutAttempt.count({where:{userId:{in:users}}}),sync:await prisma.subscriptionSyncAttempt.count({where:{userId:{in:users}}}),cancellation:await prisma.subscriptionCancellationAttempt.count({where:{userId:{in:users}}}),downgrade:await prisma.subscriptionDowngradeAttempt.count({where:{userId:{in:users}}})});
   const before=await snapshot(),core=load('lib/stripe-webhook-contract.ts'),helper=load('lib/checkout-webhook-business.ts',{'@/lib/prisma':{prisma},'@/lib/stripe-webhook-contract':core});
   const prices=helper.captureCheckoutPrices({STRIPE_PRO_PRICE_ID:'price_pro_month',STRIPE_PRO_YEARLY_PRICE_ID:'price_pro_year',STRIPE_BUSINESS_PRICE_ID:'price_business_month',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_business_year'});
   const direct=()=>helper.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,prices,()=>{});
   function route(extra={}){
    let h;h=harness({retrieve:async()=>d.subscription,customer:async()=>d.customer,preflight:(...a)=>helper.preflightCheckoutBusiness(...a),...extra});
    h.current.data.object.metadata.userId=own.id;h.current.data.object.customer=customerId;return h;
   }
   await fn({own,users,d,helper,prices,direct,route,core});assert.deepEqual(await snapshot(),before);results.push('Checkout webhook business native '+name);
  }finally{await prisma.user.deleteMany({where:{id:{in:users}}});}
 }
 await test('complete linked data is only read-only projection; route503 and no account/admission writes',async h=>{const r=await h.direct();assert.equal(r.userId,h.own.id);assert.equal(r.email,h.own.email);assert.equal(r.writeAuthorized,false);assert.equal(r.periodStartSeconds,0);assert.equal(r.periodEndSeconds,86400);const route=h.route();assert.equal((await route.post()).status,503);assert.equal(route.calls.upsert.length,0);assert.equal(route.calls.other.length,0);});
 await test('unknown provider price rejected, never default Pro',async h=>{h.d.subscription.items.data[0].price.id='price_unknown';await assert.rejects(h.direct(),e=>e.status===400);});
 await test('missing periods rejected, never fabricated from now or historical trial end',async h=>{delete h.d.subscription.current_period_end;h.d.subscription.trial_end=86400;await assert.rejects(h.direct(),e=>e.status===400);});
 await test('foreign subscription metadata cannot reach linked SQL',async h=>{h.d.subscription.metadata.userId='foreign';await assert.rejects(h.direct(),e=>e.status===400);});
 await test('email discrepancy rejected against own SQL without replacement',async h=>{h.d.customer.email='foreign@example.invalid';await assert.rejects(h.direct(),e=>e.status===503);});
 await test('initial customer without own durable SQL link is not bootstrapped from metadata',async h=>{await assert.rejects(h.direct(),e=>e.status===503);},{missing:true});
 await test('multiple SQL owners for customer rejected, not selected by first match',async h=>{await assert.rejects(h.direct(),e=>e.status===503);},{ambiguous:true});
 await test('changed provider customer cannot overwrite own link',async h=>{h.d.subscription.customer='cus_foreign';await assert.rejects(h.direct(),e=>e.status===400);});
 await test('hung original customer after subscription capture retires before any SQL',async h=>{let release,start,reads=0;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),route=h.route({customer:async()=>{start();return gate;},preflight:async(...a)=>{reads++;return h.helper.preflightCheckoutBusiness(...a);}});const p=route.post();await started;route.advance(55000);assert.equal((await p).status,503);release(h.d.customer);await flush();assert.equal(reads,0);assert.equal(route.calls.upsert.length,0);});
 await test('already issued read-only SQL settles once after retirement without authority/ack',async h=>{
  let release,start,queries=0;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r);
  const observed={$transaction:(fn,settings)=>prisma.$transaction(tx=>fn({user:tx.user,subscription:{findMany:async q=>{queries++;const rows=await tx.subscription.findMany(q);start();await gate;return rows;}}}),settings)};
  const helper=load('lib/checkout-webhook-business.ts',{'@/lib/prisma':{prisma:observed},'@/lib/stripe-webhook-contract':h.core});let original;
  const route=h.route({preflight:(...a)=>{original=helper.preflightCheckoutBusiness(...a);void original.catch(()=>{});return original;}}),p=route.post();await started;route.advance(55000);assert.equal((await p).status,503);release();await Promise.allSettled([original]);assert.equal(queries,1);assert.equal(route.calls.upsert.length,0);
 });
 await test('original provider subscription copied before customer await cannot redirect own projection',async h=>{let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),route=h.route({customer:async()=>{start();await gate;return h.d.customer;}}),p=route.post();await started;h.d.subscription.id='sub_foreign';h.d.subscription.customer='cus_foreign';h.d.subscription.items.data[0].price.id='price_unknown';release();assert.equal((await p).status,503);assert.equal(route.calls.preflight.length,1);assert.equal(route.calls.upsert.length,0);});
 await test('incomplete catalog denies before simulated provider or SQL',async h=>{const route=h.route();delete route.globals.process.env.STRIPE_PRO_PRICE_ID;assert.equal((await route.post()).status,503);assert.equal(route.calls.retrieve.length,0);assert.equal(route.calls.customer.length,0);assert.equal(route.calls.preflight.length,0);});
};
