'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],gates=[],running=[],instances=[];
 const counts=async()=>({users:await prisma.user.count(),subscriptions:await prisma.subscription.count(),attempts:await prisma.checkoutAttempt.count(),emails:await prisma.emailLog.count(),generations:await prisma.generation.count(),passwords:await prisma.passwordChangeAttempt.count()}),baseline=await counts();
 const fixture=async(paid=false)=>{const u=await prisma.user.create({data:{email:'checkout-server-'+randomUUID()+'@example.invalid',name:'Synthetic Checkout',marketingOptOut:true}});users.push(u.id);if(paid)await prisma.subscription.create({data:{userId:u.id,stripeCustomerId:'cus_'+u.id,stripePriceId:'price_synthetic_prior',status:'active',plan:'pro'}});return u;};
 function bind(u,options={}){
  let now=1000,serial=0,transactions=0;const gate=deferred(),entered=deferred(),calls=[],effects=[],packets=[],timers=new Map(),controller=new AbortController();gates.push(gate);
  const key=options.key??randomUUID(),body=options.body??{plan:options.plan??'monthly',lang:options.lang??'es'};
  const stage=async(name,work)=>{calls.push(name);const p=(async()=>{const v=await work();if(options.held===name){entered.resolve();await gate.promise;}if(options.reject===name)throw Error('PRIVATE_LOST_ACK');return v;})();running.push(p);void p.catch(()=>{});return p;};
  const db={user:{findUnique:q=>stage('read',()=>prisma.user.findUnique(q))},$transaction:(fn,settings)=>{const i=++transactions;let locks=0;
   return stage('ack'+i,()=>prisma.$transaction(tx=>fn({
    $queryRawUnsafe:(...a)=>stage('lock'+i+'-'+(++locks),()=>tx.$queryRawUnsafe(...a)),user:{findUnique:q=>stage('selection'+i,()=>tx.user.findUnique(q))},
    checkoutAttempt:{findUnique:q=>stage(i===1?'prior':'attempt',async()=>{const r=await tx.checkoutAttempt.findUnique(q);return options.foreignAttempt&&i===2?{...r,plan:'foreign'}:r;}),
     create:q=>stage('admit',()=>tx.checkoutAttempt.create(q)),updateMany:q=>stage('mark',()=>options.noMark?{count:0}:tx.checkoutAttempt.updateMany(q))}
   }),settings));}};
  const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
   process:{env:options.noPrice?{}:{STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',STRIPE_PRO_YEARLY_PRICE_ID:'price_synthetic_yearly',STRIPE_BUSINESS_PRICE_ID:'price_synthetic_business_monthly',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_synthetic_business_yearly'}}};
  const stripe={customers:{create:args=>stage('customer',async()=>{packets.push({operation:'customer',args:structuredClone(args)});assert.deepEqual(structuredClone(args),{email:u.email,name:u.name,metadata:{userId:u.id}});return{id:'cus_'+u.id};})},
   checkout:{sessions:{create:args=>stage('session',async()=>{const a=structuredClone(args);packets.push({operation:'session',args:a});assert.equal(a.customer,'cus_'+u.id);assert.equal(a.locale,body.lang);assert.equal(a.currency,options.country==='US'?'usd':'eur');assert.deepEqual(a.line_items,[{price:'price_synthetic_'+body.plan,quantity:1}]);assert.deepEqual(a.metadata,{userId:u.id});return{url:options.url??'https://example.invalid/checkout'};})}}};
  const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/stripe':{stripe},'@/lib/pricing':load('lib/pricing.ts')};
  const helper=load('lib/checkout-session.ts',deps,globals),route=load('app/api/stripe/checkout/route.ts',{'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:()=>stage('auth',async()=>({user:options.owner??{id:u.id,email:u.email}}))},'@/lib/pricing':deps['@/lib/pricing'],
   '@/lib/checkout-session':{...helper,checkoutOriginal(...a){const p=helper.checkoutOriginal(...a);effects.push(p);running.push(p);return p;}}},globals);
  const headers={'content-type':'application/json','x-vercel-ip-country':options.country??'ES',...(!options.legacy?{'Idempotency-Key':key}:{})};
  const original=route.POST(new Request('https://example.invalid/api/stripe/checkout',{method:'POST',headers,signal:controller.signal,body:JSON.stringify(body)}));running.push(original);
  const x={u,key,body,original,controller,entered,calls,packets,
   advance(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
   async finish(){gate.resolve();await Promise.allSettled(effects);await flush();},
   async observe(status){const r=await original;assert.equal(r.status,status);assert.equal(r.headers.get('Cache-Control'),'no-store');const b=await r.json();assert(!JSON.stringify(b).includes('PRIVATE'));if(status===503)assert.deepEqual(b,{error:'checkout_unconfirmed'});return b;}
  };instances.push(x);return x;
 }
 const row=u=>prisma.checkoutAttempt.findUnique({where:{userId:u.id}}),note=t=>results.push('Checkout server native '+t);
 try{
  for(const plan of ['monthly','yearly','business_monthly','business_yearly'])for(const lang of ['es','en']){
   const paid=plan.startsWith('business'),u=await fixture(paid),x=bind(u,{plan,lang,country:lang==='en'?'US':'ES'}),b=await x.observe(200),a=await row(u);
   assert.deepEqual(b,{userId:u.id,email:u.email,key:x.key,plan,lang,mode:'simulated',url:'https://example.invalid/checkout'});assert.equal(a.state,'complete');assert.equal(a.currency,lang==='en'?'usd':'eur');assert.equal(a.priceId,'price_synthetic_'+plan);
   assert.deepEqual(Object.keys(a).sort(),['id','userId','email','key','plan','lang','currency','priceId','state','createdAt'].sort());assert(!JSON.stringify(b).includes(a.id));assert.deepEqual(await prisma.user.findUnique({where:{id:u.id}}),u);assert.equal(await prisma.subscription.count({where:{userId:u.id}}),paid?1:0);
   for(const options of [{key:x.key},{plan:'yearly'},{legacy:true}]){const denied=bind(u,options);await denied.observe(503);assert.equal(denied.packets.length,0);}assert.equal(await prisma.checkoutAttempt.count({where:{userId:u.id}}),1);
   note(plan+'/'+lang+' actual SQL original complete; same/fresh/legacy key denies another provider/session, never declares payment or mutates plan');
  }
  for(const held of ['read','admission-ack','customer','session','mark','completion-ack'])for(const action of ['timeout','abort']){
   const mapped=held==='admission-ack'?'ack1':held==='completion-ack'?'ack2':held,u=await fixture(),x=bind(u,{held:mapped});await x.entered.promise;if(action==='timeout')x.advance();else x.controller.abort();await x.observe(503);await x.finish();const a=await row(u);
   if(held==='read')assert.equal(a,null);else{assert.equal(a.state,['mark','completion-ack'].includes(held)?'complete':'pending');await bind(u).observe(503);}
   assert.equal(x.calls.filter(n=>n===mapped).length,1);if(['read','admission-ack','customer'].includes(held))assert(!x.calls.includes('session'));assert.equal(await prisma.subscription.count({where:{userId:u.id}}),0);
   note(held+'/'+action+' original SQL/mock settles once after retirement; denial retained, no late next effect or reconstructed200');
  }
  for(const reject of ['ack1','customer','session','ack2']){
   const u=await fixture(),x=bind(u,{reject});await x.observe(503);assert.equal((await row(u)).state,reject==='ack2'?'complete':'pending');const fresh=bind(u,{legacy:true});await fresh.observe(503);assert.equal(fresh.packets.length,0);
   note(reject+' lost original acknowledgement retains durable denial even when SQL complete; no recovery/provider replay from independent read');
  }
  for(const options of [{noMark:true},{foreignAttempt:true},{url:'https://checkout.stripe.com/private'}]){
   const u=await fixture(),x=bind(u,options);await x.observe(503);assert.equal((await row(u)).state,'pending');await bind(u).observe(503);note(Object.keys(options)[0]+' effect transaction fails/rolls back marker; existing admission prevents duplicated customer/session');
  }
  for(const same of [true,false]){
   const u=await fixture(),key=randomUUID(),xs=[bind(u,{key}),bind(u,{key:same?key:randomUUID()}),bind(u,{legacy:true})],rs=await Promise.all(xs.map(x=>x.original));assert.equal(rs.filter(r=>r.status===200).length,1);assert(rs.every(r=>[200,503].includes(r.status)));assert.equal(xs.reduce((n,x)=>n+x.packets.filter(p=>p.operation==='session').length,0),1);assert.equal(await prisma.checkoutAttempt.count({where:{userId:u.id}}),1);
   note('independent '+(same?'same-key':'different-key')+' and legacy instances race actual user/subscription locks and unique durable account admission: one session only');
  }
  {
   const u=await fixture(),x=bind(u,{held:'ack1'});await x.entered.promise;const denied=bind(u);await denied.observe(503);assert.equal(denied.packets.length,0);const other=await fixture();await bind(other).observe(200);await x.finish();await x.observe(200);note('pending admission excludes another profile/Dashboard instance; unrelated synthetic account independent');
  }
  for(const field of ['email','subscription']){
   const u=await fixture(),x=bind(u,{held:'ack1'});await x.entered.promise;if(field==='email')await prisma.user.update({where:{id:u.id},data:{email:'changed-'+randomUUID()+'@example.invalid'}});else await prisma.subscription.create({data:{userId:u.id,stripeCustomerId:'cus_other',stripePriceId:'price_other',status:'active',plan:'pro'}});await x.finish();await x.observe(503);assert.equal(x.packets.length,0);assert.equal((await row(u)).state,'pending');note(field+' changes after admission are revalidated under physical user/subscription locks before mock provider');
  }
  {
   const u=await fixture(true),x=bind(u,{held:'session',plan:'business_monthly'});await x.entered.promise;let finished=false;const changed=prisma.subscription.update({where:{userId:u.id},data:{stripePriceId:'price_newer'}}).then(()=>{finished=true;});running.push(changed);let blocked=false;
   for(let i=0;i<100&&!blocked;i++){blocked=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE '%subscriptions%'"))[0].n>0;if(!blocked)await new Promise(r=>setTimeout(r,5));}assert(blocked&&!finished,'Original subscription lock must span provider and marker');await x.finish();await x.observe(200);await changed;assert.equal((await row(u)).state,'complete');assert.equal((await prisma.subscription.findUnique({where:{userId:u.id}})).stripePriceId,'price_newer');note('physical subscription lock excludes concurrent legacy price writer through original mock session/completion; no overwrite');
  }
  for(const options of [{owner:{id:'foreign',email:'foreign@example.invalid'}},{noPrice:true},{body:{plan:'bad',lang:'es'}},{body:{plan:'monthly',lang:'es',currency:'usd'}}]){
   const u=await fixture(),x=bind(u,options);await x.observe(options.owner?401:options.noPrice?500:400);assert.equal(await row(u),null);assert.equal(x.packets.length,0);note('invalid '+Object.keys(options)[0]+' rejects before durable admission or provider');
  }
 }finally{gates.forEach(g=>g.resolve());await Promise.allSettled(running);if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});assert.deepEqual(await counts(),baseline,'Own fixtures only; no inherited admission cleanup or recovery');}
};
