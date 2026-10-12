'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{harness,flush}=require('./stripe-webhook-intake.test.cjs');
const env={STRIPE_PRO_PRICE_ID:'price_pro_month',STRIPE_PRO_YEARLY_PRICE_ID:'price_pro_year',STRIPE_BUSINESS_PRICE_ID:'price_business_month',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_business_year'};
function data(plan='pro',interval='month',currency='eur',status='active'){
 const checkout={sessionId:'cs_synthetic',userId:'synthetic_user',customerId:'cus_synthetic',subscriptionId:'sub_synthetic',paymentStatus:status==='trialing'?'no_payment_required':'paid'};
 const customer={object:'customer',id:'cus_synthetic',email:'synthetic@example.invalid',metadata:{userId:checkout.userId}};
 const subscription={object:'subscription',id:'sub_synthetic',customer:checkout.customerId,metadata:{userId:checkout.userId,service:'YTubViral.com',plan},currency,status,cancel_at_period_end:false,
  current_period_start:0,current_period_end:86400,...(status==='trialing'?{trial_start:0,trial_end:86400}:{}),
  items:{object:'list',has_more:false,data:[{object:'subscription_item',id:'si_synthetic',quantity:1,price:{object:'price',id:'price_'+plan+'_'+interval,currency,recurring:{interval,interval_count:1}}}]}};
 return{checkout,customer,subscription};
}
function binding(options={}){
 const core=load('lib/stripe-webhook-contract.ts'),calls=[];
 const owner={id:'synthetic_user',email:'synthetic@example.invalid',subscription:{id:'linked_row',userId:'synthetic_user',stripeCustomerId:'cus_synthetic'}};
 const linked=[{id:'linked_row',userId:'synthetic_user',stripeCustomerId:'cus_synthetic'}];
 const prisma={$transaction:async(fn,settings)=>{calls.push({type:'transaction',settings});return options.transaction?options.transaction(fn,settings):fn({user:{findUnique:async()=>{calls.push({type:'owner'});return options.owner===undefined?owner:options.owner;}},subscription:{findMany:async q=>{calls.push({type:'linked',query:q});return options.linked===undefined?linked:options.linked;}}});}};
 const api=load('lib/checkout-webhook-business.ts',{'@/lib/prisma':{prisma},'@/lib/stripe-webhook-contract':core});
 return{api,core,calls,prisma,owner,linked,prices:api.captureCheckoutPrices(env)};
}
async function run(){
 const results=[];const test=async(name,fn)=>{await fn();results.push(name);};
 for(const plan of ['pro','business'])for(const interval of ['month','year'])for(const currency of ['eur','usd'])for(const status of ['active','trialing'])await test('declared '+[plan,interval,currency,status].join('/')+' is immutable data and never write authority',async()=>{
  const h=binding(),d=data(plan,interval,currency,status),r=await h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{});
  assert.equal(r.plan,plan);assert.equal(r.currency,currency);assert.equal(r.periodStartSeconds,0);assert.equal(r.periodEndSeconds,86400);assert.equal(r.writeAuthorized,false);assert.equal(r.linkedRowId,'linked_row');assert(Object.isFrozen(r));
  assert.deepEqual(structuredClone(h.calls[0].settings),{isolationLevel:'RepeatableRead',maxWait:5000,timeout:10000});assert.equal(h.calls.length,3);assert.equal(d.subscription.current_period_start,0);
 });
 const invalid=[
 ['subscription id',d=>d.subscription.id='sub_foreign'],['subscription object',d=>d.subscription.object='customer'],['subscription customer',d=>d.subscription.customer='cus_foreign'],
 ['subscription metadata',d=>d.subscription.metadata.userId='foreign'],['service',d=>d.subscription.metadata.service='other'],['declared plan',d=>d.subscription.metadata.plan='business'],
 ['customer id',d=>d.customer.id='cus_foreign'],['customer object',d=>d.customer.object='subscription'],['deleted',d=>d.customer.deleted=true],['malformed deletion flag',d=>d.customer.deleted='false'],
 ['customer metadata',d=>d.customer.metadata.userId='foreign'],['customer email',d=>d.customer.email={value:'synthetic@example.invalid'}],
 ['unpaid',d=>d.checkout.paymentStatus='unpaid'],['past_due',d=>d.subscription.status='past_due'],['cancellation flag',d=>d.subscription.cancel_at_period_end=0],
 ['incomplete item list',d=>d.subscription.items.has_more=true],['multiple items',d=>d.subscription.items.data.push(structuredClone(d.subscription.items.data[0]))],['missing item',d=>d.subscription.items.data=[]],
 ['item id',d=>d.subscription.items.data[0].id='sub_bad'],['item object',d=>d.subscription.items.data[0].object='price'],['quantity',d=>d.subscription.items.data[0].quantity=2],
 ['unknown price never defaults Pro',d=>d.subscription.items.data[0].price.id='price_unknown'],['interval',d=>d.subscription.items.data[0].price.recurring.interval='year'],['interval count',d=>d.subscription.items.data[0].price.recurring.interval_count=2],
 ['currency',d=>d.subscription.items.data[0].price.currency='gbp'],['subscription currency differs',d=>d.subscription.currency='usd'],
 ['missing start',d=>delete d.subscription.current_period_start],['missing end no historical trial fallback',d=>{delete d.subscription.current_period_end;d.subscription.trial_end=86400;}],
 ['fractional timestamp',d=>d.subscription.current_period_start=0.1],['negative timestamp',d=>d.subscription.current_period_start=-1],['unsafe end',d=>d.subscription.current_period_end=253402300800],
 ['inverted period',d=>d.subscription.current_period_start=86401],['equal period',d=>d.subscription.current_period_start=86400],
 ['conflicting item/sub start',d=>d.subscription.items.data[0].current_period_start=1],['conflicting item/sub end',d=>d.subscription.items.data[0].current_period_end=86401],
 ['selected field accessor',d=>Object.defineProperty(d.subscription,'status',{get(){throw Error('Must not execute getter');}})]
 ];
 for(const[name,mutate]of invalid)await test('deny '+name+' before SQL',async()=>{const h=binding(),d=data();mutate(d);await assert.rejects(h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{}),e=>e.status===400);assert.equal(h.calls.length,0);});
 for(const change of [d=>delete d.subscription.trial_end,d=>d.subscription.trial_end=86401])await test('trial requires explicit consistent trial_end',async()=>{const h=binding(),d=data('pro','month','eur','trialing');change(d);await assert.rejects(h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{}),e=>e.status===400);assert.equal(h.calls.length,0);});
 await test('item periods retained exactly without now',async()=>{const h=binding(),d=data();delete d.subscription.current_period_start;delete d.subscription.current_period_end;d.subscription.items.data[0].current_period_start=0;d.subscription.items.data[0].current_period_end=86400;const r=h.api.projectCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{});assert.equal(r.periodStartSeconds,0);assert.equal(r.periodEndSeconds,86400);assert.equal(r.writeAuthorized,false);});
 for(const altered of [{STRIPE_PRO_PRICE_ID:undefined},{STRIPE_PRO_PRICE_ID:'price_pro_year'},{STRIPE_PRO_PRICE_ID:'price bad'}])await test('unavailable/ambiguous catalog denies before SQL',async()=>{const h=binding(),d=data(),p=h.api.captureCheckoutPrices({...env,...altered});assert.equal(p,null);await assert.rejects(h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,p,()=>{}),e=>e.status===503);assert.equal(h.calls.length,0);});
 await test('SDK lastResponse transport object ignored while selected business data retained',async()=>{const h=binding(),d=data();Object.defineProperty(d.subscription,'lastResponse',{value:{transport:function(){throw Error('Not business data');}}});const s=h.api.captureCheckoutSubscription(d.subscription,()=>{});assert.equal(s.id,'sub_synthetic');assert(!Object.hasOwn(s,'lastResponse'));assert(Object.isFrozen(s.items.data[0].price));});
 for(const owner of [null,{id:'foreign',email:'synthetic@example.invalid'}, {id:'synthetic_user',email:'changed@example.invalid'}, {id:'synthetic_user',email:'synthetic@example.invalid',subscription:null},{id:'synthetic_user',email:'synthetic@example.invalid',subscription:{id:'linked_row',userId:'foreign',stripeCustomerId:'cus_synthetic'}}])await test('own linked SQL projection required without metadata admission',async()=>{const h=binding({owner}),d=data();await assert.rejects(h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{}),e=>e.status===503);assert.equal(h.calls.length,2);});
 for(const linked of [[],[{id:'linked_row',userId:'foreign',stripeCustomerId:'cus_synthetic'}],[{id:'linked_row',userId:'synthetic_user',stripeCustomerId:'cus_synthetic'},{id:'second',userId:'foreign',stripeCustomerId:'cus_synthetic'}]])await test('ambiguous/foreign customer link rejects without write authority',async()=>{const h=binding({linked}),d=data();await assert.rejects(h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{}),e=>e.status===503);});
 await test('SQL first row copied before second read can mutate its returned object',async()=>{let h;h=binding({transaction:async fn=>fn({user:{findUnique:async()=>h.owner},subscription:{findMany:async()=>{h.owner.email='changed';h.owner.subscription.id='changed';return h.linked;}}})});const d=data(),r=await h.api.preflightCheckoutBusiness(d.checkout,d.subscription,d.customer,h.prices,()=>{});assert.equal(r.email,'synthetic@example.invalid');assert.equal(r.linkedRowId,'linked_row');assert.equal(r.writeAuthorized,false);});
 await test('full matching data still ends HTTP503 with no upsert or other effect',async()=>{const d=data(),b=binding(),h=harness({retrieve:async()=>d.subscription,customer:async()=>d.customer,preflight:(...a)=>b.api.preflightCheckoutBusiness(...a)});assert.equal((await h.post()).status,503);assert.equal(h.calls.upsert.length,0);assert.equal(h.calls.other.length,0);assert.equal(b.calls.length,3);assert.equal(h.timers.size,0);});
 await test('captured subscription cannot change while customer read is held',async()=>{const d=data(),b=binding();let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),h=harness({retrieve:async()=>d.subscription,customer:async()=>{start();await gate;return d.customer;},preflight:(...a)=>b.api.preflightCheckoutBusiness(...a)});const p=h.post();await started;d.subscription.id='sub_foreign';d.subscription.metadata.userId='foreign';d.subscription.items.data[0].price.id='price_unknown';release();assert.equal((await p).status,503);assert.equal(b.calls.length,3);assert.equal(h.calls.upsert.length,0);});
 await test('deadline before original customer result never starts SQL or acknowledges',async()=>{const d=data(),b=binding();let release,start;const gate=new Promise(r=>release=r),started=new Promise(r=>start=r),h=harness({retrieve:async()=>d.subscription,customer:async()=>{start();return gate;},preflight:(...a)=>b.api.preflightCheckoutBusiness(...a)});const p=h.post();await started;h.advance(55000);assert.equal((await p).status,503);release(d.customer);await flush();assert.equal(b.calls.length,0);assert.equal(h.calls.upsert.length,0);});
 console.log(JSON.stringify({status:'PASS',scope:'Local business projection and SQL read-only preflight; matching data never admits a writer or grants recovery/entitlement/provenance/freshness',results},null,2));return results;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={binding,data,run};
