'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),client=require('./learn-plan.test.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],pages=[],gates=[],running=[];
 const counts=async()=>({users:await prisma.user.count(),generations:await prisma.generation.count(),images:await prisma.legacyThumbnailAttempt.count(),subscriptions:await prisma.subscription.count(),profiles:await prisma.profileUpdateAttempt.count(),teams:await prisma.team.count()});
 const baseline=await counts(),plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma);
 const track=fn=>{const p=Promise.resolve().then(fn);running.push(p);void p.catch(()=>{});return p;};
 async function fixture(plan='pro'){
  const user=await prisma.user.create({data:{email:'learn-plan-'+randomUUID()+'@example.invalid',name:'Synthetic guide reader',lang:'es'}});ids.push(user.id);
  await prisma.generation.create({data:{userId:user.id,template:'title',inputs:{},output:'Synthetic',tokensUsed:0}});
  await prisma.legacyThumbnailAttempt.create({data:{id:randomUUID(),userId:user.id,digest:'synthetic',state:'pending'}});
  if(plan!=='free')await prisma.subscription.create({data:{userId:user.id,plan,status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000),cancelAtPeriodEnd:true}});
  return user;
 }
 function bind(user,options={}){
  const h=client.create(),gate=deferred(),entered=deferred(),reads=[];pages.push(h);gates.push(gate);h.state.user=user.id;h.state.email=user.email;h.state.slug=options.slug??'body-guide';
  let held=options.held,fail=options.fail;
  h.state.send=request=>{
   const p=track(async()=>{
    const db={user:{findUnique:q=>track(()=>prisma.user.findUnique(q))},generation:{count:q=>track(async()=>{const n=await prisma.generation.count(q);if(fail&&!q.where.template)throw Error('NEVER_PUBLIC private SQL failure');return n;}),findMany:q=>track(()=>prisma.generation.findMany(q))},subscription:{findUnique:q=>track(()=>prisma.subscription.findUnique(q))}};
    const route=load('app/api/user/stats/route.ts',{
     'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.session===undefined?{user:{id:request.owner,email:request.email}}:options.session},'@/lib/prisma':{prisma:db},'@/lib/plans':plans,
     '@/lib/generation-quota':{readGenerationQuotaSnapshot:(...args)=>track(()=>quota.readGenerationQuotaSnapshot(...args))}
    });
    const response=await route.GET(new Request('https://example.invalid/api/user/stats',{signal:request.init.signal})),body=await response.json();
    entered.resolve({status:response.status,body});if(held==='headers')await gate.promise;
    return{ok:response.ok,status:response.status,json:()=>held==='JSON'?gate.promise.then(()=>body):Promise.resolve(body)};
   });reads.push(p);return p;
  };
  const x={h,gate,entered,unhold(){held=null;},setFail(value){fail=value;},async ready(){await client.ready(h);let n=0;while(n<reads.length){const list=reads.slice(n);n=reads.length;await Promise.allSettled(list);await client.ready(h);}},async start(){await client.ready(h);return entered.promise;}};
  return x;
 }
 async function settle(){let n=0;while(n<running.length){const list=running.slice(n);n=running.length;await Promise.allSettled(list);}}
 try{
  for(const slug of ['body-guide','fallback-guide'])for(const plan of ['free','pro','business']){
   const user=await fixture(plan),x=bind(user,{slug});await x.ready();client.publicContent(x.h);assert.equal(client.frames(x.h).length,plan==='free'?0:1);assert.equal(client.previews(x.h).length,plan==='free'?1:0);assert.match(x.h.text(),new RegExp('Plan confirmado: '+(plan==='free'?'Free':plan==='pro'?'Pro':'Business')));
   const actual=await x.entered.promise;assert.equal(actual.status,200);assert.equal(actual.body.stats.quotaOccupied,2);assert.equal(actual.body.stats.generationsReserved,1);assert(!JSON.stringify(actual.body).includes('manual_admin'));assert.equal(x.h.requests.length,1);
   results.push('Learn plan native '+slug+'/'+plan+' actual UI/stats GET/own PostgreSQL snapshot confirms nested plan, article/legacy video gate and reserved capacity, no private billing marker or external resource loaded');
  }
  for(const held of ['headers','JSON']){
   const user=await fixture('business'),x=bind(user,{held});const actual=await x.start();assert.equal(actual.status,200);assert.equal(actual.body.stats.plan,'business');assert.equal(client.frames(x.h).length,0);assert.equal(client.previews(x.h).length,0);
   x.h.advance(30000);await client.ready(x.h);assert.match(x.h.text(),/No hemos podido comprobar tu plan/);assert.equal(client.frames(x.h).length,0);assert(x.h.requests[0].init.signal.aborted);
   x.gate.resolve();await x.ready();assert.equal(client.frames(x.h).length,0);assert.equal(await prisma.legacyThumbnailAttempt.count({where:{userId:user.id,state:'pending'}}),1);
   await prisma.subscription.updateMany({where:{userId:user.id},data:{currentPeriodEnd:new Date(Date.now()-86400000)}});x.unhold();await x.h.click('Reintentar plan');await x.ready();assert.match(x.h.text(),/Plan confirmado: Free/);assert.equal(client.previews(x.h).length,1);assert.equal(x.h.requests.length,2);assert.equal(await prisma.generation.count({where:{userId:user.id}}),1);
   results.push('Learn plan native '+held+' original SQL paid200 withheld beyond UI30s stays unconfirmed; late paid body ignored, explicit new own read sees stored expiry Free without reservation release or writes');
  }
  {
   const user=await fixture(),x=bind(user);await x.ready();assert.equal(client.frames(x.h).length,1);x.setFail(true);await x.h.click('Actualizar plan');await x.ready();
   assert.match(x.h.text(),/Último plan confirmado: Pro/);assert.match(x.h.text(),/No hemos podido/);assert.equal(client.frames(x.h).length,0);assert.equal(client.previews(x.h).length,0);assert(!x.h.text().includes('NEVER_PUBLIC'));
   x.setFail(false);await prisma.subscription.updateMany({where:{userId:user.id},data:{currentPeriodEnd:new Date(Date.now()-86400000)}});await x.h.click('Reintentar plan');await x.ready();assert.equal(client.previews(x.h).length,1);
   results.push('Learn plan native failed PostgreSQL refresh labels last confirmed Pro, withdraws iframe and does not fabricate Free; explicit retry reads genuine expired plan');
  }
  {
   const first=await fixture('business'),second=await fixture('free'),x=bind(first,{held:'headers'});await x.start();
   x.h.state.user=second.id;x.h.state.email=second.email;const immediate=x.h.view(true);assert.equal(client.frames(x.h,immediate).length,0);assert.equal(client.previews(x.h,immediate).length,0);assert(!x.h.text(immediate).includes('Business'));
   x.unhold();x.h.runEffects();await client.ready(x.h);x.gate.resolve();await x.ready();assert.match(x.h.text(),/Plan confirmado: Free/);assert.equal(client.frames(x.h).length,0);assert.equal(x.h.requests.length,2);
   results.push('Learn plan native account replacement before effects withdraws old Business projection; original delayed response cannot replace the current Free account');
  }
  {
   const user=await fixture(),x=bind(user);await x.ready();const old=x.h.button('Actualizar plan');x.h.state.email='learn-new-'+randomUUID()+'@example.invalid';await prisma.user.update({where:{id:user.id},data:{email:x.h.state.email}});
   assert.equal(client.frames(x.h,x.h.view(true)).length,0);const before=x.h.requests.length;await old.props.onClick();assert.equal(x.h.requests.length,before);x.h.runEffects();await x.ready();assert.equal(client.frames(x.h).length,1);assert.equal(x.h.requests.at(-1).email,x.h.state.email);
   results.push('Learn plan native same owner/email replacement retires stale refresh callback immediately; actual current email revalidated by own SQL before paid gate');
  }
  for(const session of [null,{user:{id:'discordant',email:'none@example.invalid'}}]){
   const user=await fixture(),x=bind(user,{session});await x.ready();assert.equal(client.frames(x.h).length,0);assert.equal(client.previews(x.h).length,0);assert.match(x.h.text(),/No hemos podido/);
   results.push('Learn plan native anonymous/missing SQL owner HTTP denial shows explicit retry and public article, never Free default or paid iframe');
  }
  {
   const user=await fixture(),x=bind(user);x.h.strictEffects();await x.ready();assert.equal(x.h.requests.length,1);assert.equal(client.frames(x.h).length,1);
   x.h.state.auth='unauthenticated';assert.equal(client.frames(x.h,x.h.view(true)).length,0);x.h.runEffects();await client.ready(x.h);assert.match(x.h.text(),/Inicia sesión/);const n=x.h.requests.length;await client.ready(x.h);assert.equal(x.h.requests.length,n);
   results.push('Learn plan native Strict initial read remains singular; logout retires the paid projection without another SQL read');
  }
 }finally{
  for(const gate of gates)gate.resolve();await settle();for(const h of pages)h.unmount();await flush();await prisma.user.deleteMany({where:{id:{in:ids}}});assert.deepEqual(await counts(),baseline);
 }
 results.push('Learn plan native own fixture IDs cleaned and original PostgreSQL counts restored; no browser, paid model, email, Stripe request, OAuth or operational acceptance');
};
