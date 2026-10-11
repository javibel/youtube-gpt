'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness,ready,ui,own}=require('./dashboard-checkout-client.test.cjs'),{deferred,flush}=require('./dashboard-billing.test.cjs'),payments=require('./payment-fixtures.cjs'),{checkoutFacadeFixture}=require('./checkout-facade-test-fixture.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[],gates=[],running=[],root=path.resolve(__dirname,'../../..'),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8')),context={root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent']};
 const counts=async()=>({users:await prisma.user.count(),subscriptions:await prisma.subscription.count(),attempts:await prisma.checkoutAttempt.count(),emails:await prisma.emailLog.count(),generations:await prisma.generation.count(),passwords:await prisma.passwordChangeAttempt.count()}),baseline=await counts();
 const fixture=async(paid=false)=>{const u=await prisma.user.create({data:{email:'dashboard-checkout-'+randomUUID()+'@example.invalid',name:'Synthetic Dashboard Checkout',lang:'es',marketingOptOut:true}});users.push(u.id);if(paid)await prisma.subscription.create({data:{userId:u.id,stripeCustomerId:'cus_'+u.id,stripePriceId:'price_synthetic_prior',status:'active',plan:'pro'}});return u;};
 function bind(u,options={}){
  const h=harness({storage:options.storage}),gate=deferred(),entered=deferred(),pending=[],calls=[];pages.push(h);gates.push(gate);h.state.user=u.id;h.state.email=u.email;h.state.plan=options.plan??'monthly';h.state.lang=options.lang??'es';
  const env={STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',STRIPE_PRO_YEARLY_PRICE_ID:'price_synthetic_yearly',STRIPE_BUSINESS_PRICE_ID:'price_synthetic_business_monthly',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_synthetic_business_yearly'};
  let installed=[];const bridge=(operation,args)=>{const expected=installed.find(f=>f.operation===operation)?.args,normalized=structuredClone(args);assert.deepEqual(normalized,expected);calls.push({operation,exactArguments:true});return normalized;};
  const live={customers:{create:async(...a)=>payments.stripe.customers.create(...bridge('customers.create',a))},checkout:{sessions:{create:async(...a)=>payments.stripe.checkout.sessions.create(...bridge('checkout.sessions.create',a))}}};
  async function routed(r){
   assert.equal(r.url,'/api/stripe/checkout');const user=await prisma.user.findUnique({where:{id:u.id},include:{subscription:true}});installed=checkoutFacadeFixture(user,r.body.plan,r.body.lang,options.url);payments.configureOffline({config,context,paymentFixtures:installed});
   const deps={'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:r.user,email:r.email}})},'@/lib/prisma':{prisma},'@/lib/stripe':{stripe:live},'@/lib/pricing':load('lib/pricing.ts')},globals={process:{env:options.missingPrice?{}:env}};
   deps['@/lib/checkout-session']=load('lib/checkout-session.ts',deps,globals);
   const route=load('app/api/stripe/checkout/route.ts',deps,globals),response=await route.POST(new Request('https://example.invalid'+r.url,{method:'POST',headers:r.init.headers,body:JSON.stringify(r.body)})),body=await response.json();
   entered.resolve({status:response.status,body,cache:response.headers.get('Cache-Control')});if(options.corrupt)options.corrupt(body);if(options.held==='headers')await gate.promise;
   return{ok:response.ok,status:response.status,json:()=>options.held==='JSON'?gate.promise.then(()=>body):Promise.resolve(body)};
  }
  h.state.send=r=>{const p=routed(r);pending.push(p);running.push(p);p.catch(()=>{});return p;};
  async function settle(){let n=0;do{const b=pending.slice(n);n=pending.length;await Promise.all(b);await ready(h);}while(n<pending.length);}
  async function start(){await ready(h);const p=h.view().handleUpgrade(h.state.plan);await ready(h);return{waiter:p};}
  return{h,gate,entered,calls,start,settle,routed};
 }
 const row=u=>prisma.checkoutAttempt.findUnique({where:{userId:u.id}}),note=s=>results.push('Dashboard checkout native '+s);
 try{
  for(const plan of ['monthly','yearly','business_monthly','business_yearly'])for(const lang of ['es','en']){
   const paid=plan.startsWith('business'),u=await fixture(paid),x=bind(u,{plan,lang});await x.start();await x.settle();const packet=await x.entered.promise,a=await row(u);
   assert.equal(packet.status,200);assert.equal(packet.cache,'no-store');assert.equal(packet.body.key,x.h.requests[0].init.headers['Idempotency-Key']);assert.equal(a.state,'complete');assert.equal(a.plan,plan);assert.equal(a.lang,lang);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal(x.calls.filter(c=>c.operation==='customers.create').length,paid?0:1);
   assert.equal(x.h.state.navigationWrites.length,1);assert.match(ui(x.h).text,lang==='en'?/does not confirm payment/:/No acredita un pago/);assert(ui(x.h).denied.every(Boolean));await x.h.view().handleUpgrade(plan);ui(x.h).button.props.onClick();await ready(x.h);assert.equal(x.h.requests.length,1);assert.equal(x.h.state.navigationWrites.length,2);assert.deepEqual(await prisma.user.findUnique({where:{id:u.id}}),u);assert.equal(await prisma.subscription.count({where:{userId:u.id}}),paid?1:0);assert.equal(x.h.state.refreshes,0);note(plan+'/'+lang+' real user/subscription locks, unique ledger and exact offline facade; own seven-field200 plus current UI only; confirmed session is not payment or plan change');
  }
  for(const held of ['headers','JSON']){
   const u=await fixture(),x=bind(u,{held}),p=(await x.start()).waiter;assert.equal((await x.entered.promise).status,200);x.h.advance(60000);await p;assert.equal(x.h.view().checkoutState,'unconfirmed');assert.equal(x.h.view().billingBusy,false);assert.equal((await row(u)).state,'complete');await x.h.view().handleUpgrade('yearly');assert.equal(x.h.requests.length,1);x.gate.resolve();await x.settle();assert(!x.h.state.href);await x.h.view().handleObserveCheckout();assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note(held+' held after actual SQL complete and facade session:60s UI timeout, late result explicit same-original only, no new producer');
  }
  for(const field of ['lang','plan']){
   const u=await fixture(),x=bind(u,{held:'JSON'}),p=(await x.start()).waiter;await x.entered.promise;x.h.state[field]=field==='lang'?'en':'yearly';x.h.view(true);x.gate.resolve();await x.settle();await p;assert(!x.h.state.href);await x.h.view().handleObserveCheckout();assert(!x.h.state.href);x.h.state[field]=field==='lang'?'es':'monthly';x.h.view(true);await x.h.view().handleObserveCheckout();assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.h.requests.length,1);note(field+' change withdraws old navigation, different selection cannot open session; choose original and explicitly observe retained capability');
  }
  for(const field of ['user','email','auth']){
   const u=await fixture(),x=bind(u,{held:'headers'}),p=(await x.start()).waiter;await x.entered.promise;x.h.state[field]=field==='auth'?'unauthenticated':'foreign';x.h.view(true);x.gate.resolve();await x.settle();await p;assert(!x.h.state.href);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal((await row(u)).state,'complete');assert.equal(await prisma.subscription.count({where:{userId:u.id}}),0);note(field+' retirement after real session refuses former body/UI authority without reversing SQL or recovering from ledger');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'}),p=(await x.start()).waiter;await x.entered.promise;x.h.strictEffects();x.h.unmount();await ready(x.h);x.gate.resolve();await x.settle();await p;assert(!x.h.state.href);await x.h.view().handleObserveCheckout();assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.h.requests.length,1);note('Strict/remount retires old automatic redirects and callbacks, then only explicit same alive original');
  }
  for(const first of ['Dashboard','Profile']){
   const u=await fixture(),x=bind(u,{held:'JSON'}),profile=harness({profile:true,storage:x.h.storage,checkoutClient:x.h.load('lib/profile-checkout-client.ts')});pages.push(profile);profile.state.user=u.id;profile.state.email=u.email;
   if(first==='Dashboard')await x.start();else{profile.view().start('monthly');await ready(profile);}await x.entered.promise;await ready(x.h);await ready(profile);if(first==='Dashboard')profile.view().start('monthly');else await x.h.view().handleUpgrade('monthly');assert.equal(x.h.requests.length,1);x.gate.resolve();await x.settle();await ready(profile);if(first==='Dashboard'){assert(!profile.state.href);profile.view().observe();}else{assert(!x.h.state.href);await x.h.view().handleObserveCheckout();}await ready(profile);assert(profile.state.href&&x.h.state.href);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal(await prisma.checkoutAttempt.count({where:{userId:u.id}}),1);note(first+' and actual other hook share private original and one native session; other surface cannot auto-adopt JSON/row or repeat POST');
  }
  {
   const u=await fixture(),x=bind(u,{held:'headers'}),p=(await x.start()).waiter;await x.entered.promise;const lost=bind(u,{storage:x.h.storage});await ready(lost.h);await lost.h.view().handleUpgrade('monthly');await lost.h.view().handleObserveCheckout();assert.equal(lost.h.requests.length,0);assert(!lost.h.view().checkoutHasOriginal);assert.equal(ui(lost.h).button,undefined);x.gate.resolve();await x.settle();await p;assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('lost module retains marker denial only; SQL complete, URL and copied markers cannot recreate original or another session');
  }
  {
   const u=await fixture(),x=bind(u,{corrupt:b=>b.key='foreign'});await x.start();await x.settle();await x.h.view().handleObserveCheckout();assert(!x.h.state.href);assert.equal(x.h.view().checkoutState,'unconfirmed');assert.equal((await row(u)).state,'complete');assert.equal(x.h.requests.length,1);note('foreign key after exact facade/real SQL refuses redirect and fresh production even when ledger complete');
  }
  {
   const u=await fixture(),x=bind(u,{missingPrice:true});await x.start();await x.settle();assert.equal((await x.entered.promise).status,500);assert.equal(x.calls.length,0);assert.equal(await row(u),null);await x.h.view().handleUpgrade('monthly');assert.equal(x.h.requests.length,1);assert(!x.h.state.href);note('missing synthetic price denies before native admission/provider; conservative client retains uncertain original without new POST');
  }
  {
   const u=await fixture(),x=bind(u);await x.start();await x.settle();const r={...x.h.requests[0],init:{...x.h.requests[0].init,headers:{...x.h.requests[0].init.headers,'Idempotency-Key':randomUUID()}}};assert.equal((await x.routed(r)).status,503);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal(await prisma.checkoutAttempt.count({where:{userId:u.id}}),1);note('independent keyed request after complete denied by actual SQL; live client receipt/plan/time never releases durable admission');
  }
  {
   const u=await fixture(),x=bind(u);x.h.state.navigationFailure=true;await x.start();await x.settle();assert(x.h.view().checkoutNavigationFailed);assert.equal((await row(u)).state,'complete');x.h.state.navigationFailure=false;await x.h.view().handleObserveCheckout();assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('navigation failure after committed original session can only reopen same original, no new charge or subscription');
  }
 }catch(e){throw Error('Dashboard checkout native failed: '+e.name+'; '+(e.stack?.split('\n').find(x=>x.includes('dashboard-checkout-client-database.cjs'))?.trim()??'native contract'));}
 finally{for(const g of gates)g.resolve();await Promise.allSettled(running);for(const h of pages)h.unmount();payments.reset();if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});assert.deepEqual(await counts(),baseline,'Only own fixture IDs deleted; inherited rows intact');await flush();}
};
