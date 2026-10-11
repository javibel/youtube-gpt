'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),client=require('./profile-checkout-client.test.cjs'),payments=require('./payment-fixtures.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[],gates=[],running=[],root=path.resolve(__dirname,'../../..'),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8')),context={root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent']};
 const counts=async()=>({users:await prisma.user.count(),subscriptions:await prisma.subscription.count(),emails:await prisma.emailLog.count(),generations:await prisma.generation.count(),passwords:await prisma.passwordChangeAttempt.count()}),baseline=await counts();
 const fixture=async(paid=false)=>{const u=await prisma.user.create({data:{email:'profile-checkout-'+randomUUID()+'@example.invalid',name:'Synthetic Checkout',lang:'es',marketingOptOut:true}});users.push(u.id);if(paid)await prisma.subscription.create({data:{userId:u.id,stripeCustomerId:'cus_'+u.id,stripePriceId:'price_synthetic_existing',plan:'pro',status:'active'}});return u;};
 function bind(u,options={}){
  const h=client.create({storage:options.storage}),gate=deferred(),entered=deferred(),pending=[],calls=[];pages.push(h);gates.push(gate);h.state.user=u.id;h.state.email=u.email;h.state.lang=options.lang??'es';
  const pricing=load('lib/pricing.ts'),env={STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',STRIPE_PRO_YEARLY_PRICE_ID:'price_synthetic_yearly',STRIPE_BUSINESS_PRICE_ID:'price_synthetic_business_monthly',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_synthetic_business_yearly'};
  let installed=[];const live={};const bridge=(operation,args)=>{const expected=installed.find(f=>f.operation===operation)?.args,normalized=structuredClone(args);calls.push({operation,rawRealmMatch:require('node:util').isDeepStrictEqual(args,expected),normalizedArgumentsMatch:require('node:util').isDeepStrictEqual(normalized,expected)});assert.deepEqual(normalized,expected,'Exact fixture arguments after VM/Node realm bridge');return normalized;};for(const section of ['customers','checkout'])live[section]=section==='customers'?{create:async(...args)=>{return payments.stripe.customers.create(...bridge('customers.create',args));}}:{sessions:{create:async(...args)=>{return payments.stripe.checkout.sessions.create(...bridge('checkout.sessions.create',args));}}};
  function install(user,plan,lang){
   const business=plan.startsWith('business'),yearly=plan.endsWith('yearly'),trial=!business&&!user.subscription?.stripePriceId,currency='eur',p=pricing.formatPrice(business?yearly?299:29.99:yearly?99.99:9.99,currency,lang),en=lang==='en',customer=user.subscription?.stripeCustomerId??'cus_'+u.id;
   const description=business?yearly?en?'YTubViral.com — Business Annual Plan (Unlimited · '+p+'/yr)':'YTubViral.com — Plan Business Anual (Ilimitado · '+p+'/año)':en?'YTubViral.com — Business Plan (Unlimited · '+p+'/mo)':'YTubViral.com — Plan Business (Ilimitado · '+p+'/mes)':yearly?en?'YTubViral.com — Pro Annual Plan (200 gen/mo · '+p+'/yr)':'YTubViral.com — Plan Pro Anual (200 generaciones/mes · '+p+'/año)':en?'YTubViral.com — Pro Plan (200 gen/mo)':'YTubViral.com — Plan Pro (200 generaciones/mes)';
   const message=business?yearly?en?'Annual plan — '+p+'/yr. Your Business access activates instantly. No surprise renewals.':'Plan anual — '+p+'/año. Tu acceso Business se activa al instante. Sin renovaciones sorpresa.':en?'Your YTubViral.com Business subscription activates instantly. Cancel anytime.':'Tu suscripción a YTubViral.com Business se activa al instante. Puedes cancelar en cualquier momento.':trial?yearly?en?'7 days free, then '+p+'/yr. Cancel before day 7 at no cost.':'7 días gratis, luego '+p+'/año. Cancela antes del día 7 sin coste.':en?'7 days free, then '+p+'/mo. Cancel before day 7 at no cost.':'7 días gratis, luego '+p+'/mes. Cancela antes del día 7 sin coste.':yearly?en?'Annual plan — '+p+'/yr. Your Pro access activates instantly. No surprise renewals.':'Plan anual — '+p+'/año. Tu acceso Pro se activa al instante. Sin renovaciones sorpresa.':en?'Your YTubViral.com Pro subscription activates instantly. Cancel anytime.':'Tu suscripción a YTubViral.com Pro se activa al instante. Puedes cancelar en cualquier momento.';
   const price='price_synthetic_'+plan,paymentFixtures=[{operation:'customers.create',args:[{email:user.email,name:user.name,metadata:{userId:user.id}}],result:{id:customer}},{operation:'checkout.sessions.create',args:[{customer,payment_method_types:['card'],line_items:[{price,quantity:1}],mode:'subscription',currency,allow_promotion_codes:true,locale:lang,success_url:'https://ytubviral.com/stripe/success',cancel_url:'https://ytubviral.com/dashboard',metadata:{userId:user.id},subscription_data:{description,metadata:{userId:user.id,service:'YTubViral.com',plan:business?'business':'pro'},...(trial?{trial_period_days:7}:{})},custom_text:{submit:{message}}}],result:{url:options.url??'https://example.invalid/checkout'}}];
   installed=paymentFixtures;payments.configureOffline({config,context,paymentFixtures});
  }
  async function routed(r){
   const isCheckout=r.url==='/api/stripe/checkout';
   if(isCheckout){const user=await prisma.user.findUnique({where:{id:u.id},include:{subscription:true}});install(user,r.body.plan??'monthly',r.body.lang??'es');}
   const deps={'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:isCheckout?(options.authId??r.owner):r.owner,email:r.email}})},'@/lib/prisma':{prisma},'@/lib/stripe':{stripe:live},'@/lib/pricing':pricing,'@/lib/plans':load('lib/plans.ts',{'@/lib/prisma':{prisma}}),'@/lib/generation-quota':require('./generation-quota-fixture.cjs')(prisma)};
   const route=load(isCheckout?'app/api/stripe/checkout/route.ts':'app/api/user/stats/route.ts',deps,{process:{env:options.missingPrice?{}:env}});
   const response=await route[r.init.method](new Request('https://example.invalid'+r.url,{method:r.init.method,...(isCheckout?{headers:r.init.headers,body:JSON.stringify(r.body)}:{})})),body=await response.json();
   if(isCheckout){entered.resolve({status:response.status,cache:response.headers.get('Cache-Control'),body});if(options.corrupt)options.corrupt(body);if(options.held==='headers')await gate.promise;}
   return{ok:response.ok,status:response.status,json:()=>isCheckout&&options.held==='JSON'?gate.promise.then(()=>body):Promise.resolve(body)};
  }
  h.state.send=r=>{const p=routed(r);pending.push(p);running.push(p);p.catch(()=>{});return p;};
  async function settle(){let n=0;do{const batch=pending.slice(n);n=pending.length;await Promise.all(batch);await client.ready(h);}while(n<pending.length);}
  async function ready(){await client.ready(h);await settle();}
  async function start(){await ready();client.submit(h);await client.ready(h);}
  return{h,gate,entered,calls,start,ready,settle,routed};
 }
 const note=s=>results.push('Profile checkout native '+s);
 try{
  for(const lang of ['es','en'])for(const paid of [false,true]){
   const u=await fixture(paid),x=bind(u,{lang});await x.start();await x.settle();const packet=await x.entered.promise;
   assert.equal(packet.status,200);assert.equal(packet.cache,'no-store');assert.equal(packet.body.userId,u.id);assert.equal(packet.body.email,u.email);assert.equal(packet.body.plan,paid?'business_monthly':'monthly');assert.equal(packet.body.lang,lang);assert.equal(packet.body.key,client.mutations(x.h)[0].init.headers['Idempotency-Key']);
   assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal(x.calls.filter(c=>c.operation==='customers.create').length,paid?0:1);assert.equal(x.h.state.navigationWrites.length,1);assert.equal(client.mutations(x.h).length,1);assert.deepEqual([...x.h.storage.values()],['pending']);assert.match(x.h.text(),lang==='en'?/does not confirm payment/:/No acredita un pago/);
   assert.deepEqual(await prisma.user.findUnique({where:{id:u.id}}),u);assert.equal(await prisma.subscription.count({where:{userId:u.id}}),paid?1:0);
   client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.equal(x.h.state.navigationWrites.length,2);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);
   assert(x.calls.every(c=>c.normalizedArgumentsMatch));note(lang+' '+(paid?'Business':'Pro')+' actual profile/POST/real SQL/exact offline facade confirms only original synthetic session; no plan/payment writes; VM argument bridge rawEqual='+x.calls[0].rawRealmMatch+', normalizedEqual='+x.calls[0].normalizedArgumentsMatch);
  }
  for(const held of ['headers','JSON']){
   const u=await fixture(),x=bind(u,{held});await x.start();assert.equal((await x.entered.promise).status,200);x.h.advance(60000);await client.ready(x.h);assert.match(x.h.text(),/sin confirmar/);assert(!x.h.state.href);client.submit(x.h);assert.equal(client.mutations(x.h).length,1);x.gate.resolve();await x.settle();assert(!x.h.state.href);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);
   note(held+'60s leaves actual synthetic session unaccepted until explicit same live original; no replay from SQL or public receipt');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;x.h.state.lang='en';x.h.view(true);x.gate.resolve();await x.settle();assert(!x.h.state.href);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert(!x.h.state.href);x.h.state.lang='es';x.h.view(true);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('language change retires late redirect and explicit other selection cannot navigate; same live original only');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;x.h.strictEffects();x.h.unmount();await client.ready(x.h);x.gate.resolve();await x.settle();assert(!x.h.state.href);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.equal(x.h.state.navigationWrites.length,1);assert.equal(client.mutations(x.h).length,1);note('Strict/remount retains denial and only explicit original navigation without another offline producer');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;const lost=bind(u,{storage:x.h.storage});await lost.ready();client.submit(lost.h);await client.ready(lost.h);assert.equal(client.mutations(lost.h).length,0);assert(!lost.h.state.href);x.gate.resolve();await x.settle();assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('lost module cannot restore session from marker/SQL/public JSON and cannot start another producer');
  }
  {
   const u=await fixture(),x=bind(u,{corrupt:b=>b.key='foreign'});await x.start();await x.settle();assert(!x.h.state.href);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert(!x.h.state.href);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('foreign receipt key after actual facade response keeps denial and cannot redirect');
  }
  for(const option of [{authId:'other-owner'},{missingPrice:true},{url:'https://checkout.stripe.com/private'}]){
   const u=await fixture(),x=bind(u,option);await x.start();await x.settle();assert(!x.h.state.href);assert.match(x.h.text(),/sin confirmar/);assert.equal(client.mutations(x.h).length,1);assert.equal(await prisma.subscription.count({where:{userId:u.id}}),0);
   if(option.authId)assert.equal(x.calls.length,0);if(option.missingPrice)assert.equal(x.calls.length,0);
   note(option.authId?'keyed auth ID/email mismatch denies before offline provider':option.missingPrice?'missing synthetic price denies before provider without unsafe client retry':'real payment URL blocked by unchanged offline facade and by client; no payment accepted');
  }
  {
   const u=await fixture(),x=bind(u,{held:'headers'});await x.start();await x.entered.promise;x.h.state.auth='unauthenticated';x.h.view(true);x.gate.resolve();await x.settle();assert(!x.h.state.href);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);assert.equal(await prisma.subscription.count({where:{userId:u.id}}),0);note('logout after original synthetic creation withdraws former body/navigation authority; no subscription write');
  }
  {
   const u=await fixture(),x=bind(u);await x.ready();x.h.state.navigationFailure=true;client.submit(x.h);await x.settle();assert(!x.h.state.href);assert.match(x.h.text(),/No se pudo abrir/);x.h.state.navigationFailure=false;client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.equal(x.h.state.navigationWrites.length,1);assert.equal(x.calls.filter(c=>c.operation==='checkout.sessions.create').length,1);note('navigation failure permits explicit same confirmed original without another session, charge or plan write');
  }
  {
   const u=await fixture(),x=bind(u);await x.ready();for(const [key,body]of [['bad/key',{plan:'monthly',lang:'es'}],['safe',{plan:'unknown',lang:'es'}],['safe',{plan:'monthly',lang:'unknown'}],['safe',{plan:'monthly',lang:'es',extra:true}]]){const r={url:'/api/stripe/checkout',owner:u.id,email:u.email,body,init:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key}}};const res=await x.routed(r);assert.equal(res.status,400);}assert.equal(x.calls.length,0);note('invalid keyed body/key rejects before offline provider; no broadened effect');
  }
 }catch(e){throw Error('Profile checkout native contract failed: '+e.name+'; '+(e.stack?.split('\n').find(x=>x.includes('profile-checkout-client-database.cjs'))?.trim()??'native fixture'));}
 finally{for(const g of gates)g.resolve();await Promise.allSettled(running);for(const h of pages)h.unmount();payments.reset();if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});assert.deepEqual(await counts(),baseline,'Own checkout fixtures only; inherited rows untouched');await flush();}
};
