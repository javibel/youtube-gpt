'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const pricing=load('lib/pricing.ts');
function harness(options={}){
 const calls=[],writes=[];
 const user={id:'synthetic',email:'synthetic@example.invalid',name:'Synthetic',subscription:options.subscription??null};
 let localWriteFailures=options.localWriteFailures??0;
 const subscriptions=options.subscriptions??[{id:'sub_synthetic',status:'active',cancel_at_period_end:false}];
 const stripe={customers:{create:async args=>{calls.push({op:'customer',args});return {id:'cus_synthetic'};}},checkout:{sessions:{create:async args=>{calls.push({op:'checkout',args});return {url:options.noUrl?null:'https://example.invalid/checkout'};}}},subscriptions:{list:async args=>{calls.push({op:'list',args});if(options.listError)throw Error('Synthetic failure');return {data:subscriptions};},update:async(...args)=>{calls.push({op:'update',args});if(options.persistProviderUpdate)subscriptions.find(sub=>sub.id===args[0]).cancel_at_period_end=true;return options.ambiguousUpdate?{id:args[0]}:{id:options.mismatchedUpdate?'sub_other':args[0],cancel_at_period_end:true};}}};
 const mocks={'node:crypto':require('node:crypto'),'@/auth':{auth:async()=>options.unauthorized?null:{user:{id:user.id,email:user.email}}},'@/lib/prisma':{prisma:{...require('./checkout-store-fixture.cjs')(options.missingUser?null:user),subscription:{update:async args=>{writes.push(args);if(localWriteFailures-->0)throw Error('Synthetic local write failure');user.subscription.cancelAtPeriodEnd=args.data.cancelAtPeriodEnd;return args.data;}}}},'@/lib/stripe':{stripe},'next/server':{NextResponse:Response},'@/lib/pricing':pricing,'@/lib/plans':{isPaidStatus:status=>['active','trialing'].includes(status)}};
 const env=options.noPrices?{}:{STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',STRIPE_PRO_YEARLY_PRICE_ID:'price_synthetic_yearly',STRIPE_BUSINESS_PRICE_ID:'price_synthetic_business_monthly',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_synthetic_business_yearly'};
 async function run(route,body={},country='ES'){
  if(route==='checkout') mocks['@/lib/checkout-session']=load('lib/checkout-session.ts',mocks,{process:{env}});
  const {POST}=load('app/api/stripe/'+route+'/route.ts',mocks,{process:{env}});
  if(route==='checkout')body={plan:'monthly',lang:'es',...body};
  const response=await POST(new Request('https://example.invalid/api/stripe/'+route,{method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':country},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};
 }
 return {calls,writes,user,run};
}
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('checkout requires authentication before payment effects',async()=>{const h=harness({unauthorized:true});assert.equal((await h.run('checkout')).status,401);assert.equal(h.calls.length,0);});
 await test('checkout requires configured price',async()=>{const h=harness({noPrices:true});assert.equal((await h.run('checkout')).status,500);assert.equal(h.calls.length,0);});
 await test('checkout requires existing user',async()=>{const h=harness({missingUser:true});assert.equal((await h.run('checkout')).status,401);assert.equal(h.calls.length,0);});
 await test('checkout returns synthetic URL and user metadata',async()=>{const h=harness();assert.deepEqual(await h.run('checkout'),{status:200,body:{userId:'synthetic',email:'synthetic@example.invalid',mode:'simulated',url:'https://example.invalid/checkout'}});assert.equal(h.calls[1].args.metadata.userId,'synthetic');});
 await test('existing customer reused',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing'}});await h.run('checkout');assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.customer,'cus_existing');});
 await test('manual customer identifier replaced',async()=>{const h=harness({subscription:{stripeCustomerId:'manual_admin'}});await h.run('checkout');assert.equal(h.calls[0].op,'customer');});
 await test('first Pro purchase retains seven-day trial',async()=>{const h=harness();await h.run('checkout');assert.equal(h.calls.at(-1).args.subscription_data.trial_period_days,7);});
 await test('previous subscription cannot repeat trial',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing',stripePriceId:'price_previous'}});await h.run('checkout');assert.equal(h.calls[0].args.subscription_data.trial_period_days,undefined);});
 await test('business checkout does not add trial',async()=>{const h=harness();await h.run('checkout',{plan:'business_monthly'});const args=h.calls.at(-1).args;assert.equal(args.subscription_data.metadata.plan,'business');assert.equal(args.subscription_data.trial_period_days,undefined);});
 await test('yearly selection uses yearly configured price',async()=>{const h=harness();await h.run('checkout',{plan:'yearly'});assert.equal(h.calls.at(-1).args.line_items[0].price,'price_synthetic_yearly');});
 await test('currency determined from server country',async()=>{const h=harness();await h.run('checkout',{},'US');assert.equal(h.calls.at(-1).args.currency,'usd');});
 await test('English checkout preserves locale',async()=>{const h=harness();await h.run('checkout',{lang:'en'});assert.equal(h.calls.at(-1).args.locale,'en');});
 await test('missing checkout URL returns failure',async()=>{assert.equal((await harness({noUrl:true}).run('checkout')).status,503);});
 await test('cancellation requires authentication',async()=>{const h=harness({unauthorized:true});assert.equal((await h.run('cancel')).status,401);assert.equal(h.calls.length,0);});
 await test('cancellation requires customer subscription',async()=>{const h=harness();assert.equal((await h.run('cancel')).status,400);assert.equal(h.calls.length,0);});
 await test('cancellation preserves state on provider read failure',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing'},listError:true});assert.equal((await h.run('cancel')).status,500);assert.equal(h.writes.length,0);});
 await test('cancellation requires active or trial subscription',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing'},subscriptions:[{id:'sub_synthetic',status:'canceled'}]});assert.equal((await h.run('cancel')).status,400);assert.equal(h.writes.length,0);});
 await test('already scheduled cancellation does not repeat mutation',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing',cancelAtPeriodEnd:true},subscriptions:[{id:'sub_synthetic',status:'active',cancel_at_period_end:true}]});assert.equal((await h.run('cancel')).status,200);assert.equal(h.calls.length,1);assert.equal(h.writes.length,0);});
 await test('provider cancellation reconciles a missed local write without repeating provider update',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing',cancelAtPeriodEnd:false},persistProviderUpdate:true,localWriteFailures:1});assert.equal((await h.run('cancel')).status,503);assert.equal(h.calls.filter(call=>call.op==='update').length,1);assert.equal(h.user.subscription.cancelAtPeriodEnd,false);assert.deepEqual(await h.run('cancel'),{status:200,body:{ok:true,userId:'synthetic',email:'synthetic@example.invalid',cancelAtPeriodEnd:true}});assert.equal(h.calls.filter(call=>call.op==='update').length,1);assert.equal(h.writes.length,2);assert.equal(h.user.subscription.cancelAtPeriodEnd,true);});
 await test('incomplete provider acknowledgement leaves local cancellation unchanged',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing',cancelAtPeriodEnd:false},ambiguousUpdate:true});assert.equal((await h.run('cancel')).status,502);assert.equal(h.writes.length,0);assert.equal(h.user.subscription.cancelAtPeriodEnd,false);});
 await test('mismatched provider acknowledgement leaves local cancellation unchanged',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing',cancelAtPeriodEnd:false},mismatchedUpdate:true});assert.equal((await h.run('cancel')).status,502);assert.equal(h.writes.length,0);assert.equal(h.user.subscription.cancelAtPeriodEnd,false);});
 await test('cancellation schedules period end before local update',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing'}});assert.equal((await h.run('cancel')).status,200);assert.equal(h.calls[1].args[1].cancel_at_period_end,true);assert.equal(h.writes[0].data.cancelAtPeriodEnd,true);});
 await test('trial cancellation retains same period-end contract',async()=>{const h=harness({subscription:{stripeCustomerId:'cus_existing'},subscriptions:[{id:'sub_trial',status:'trialing',cancel_at_period_end:false}]});assert.equal((await h.run('cancel')).status,200);assert.equal(h.calls[1].args[0],'sub_trial');});
 console.log(JSON.stringify({scope:'actual checkout/cancel routes and pricing; synthetic auth/payment/database only',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
