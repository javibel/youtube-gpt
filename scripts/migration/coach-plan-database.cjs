'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{create,ready}=require('./coach-plan.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'coach-plan-'+randomUUID()+'@example.invalid',name:'Synthetic Coach '+i}}))),[paid,free]=users;
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma),harnesses=[];
 const routeFor=(owner,db=prisma)=>load('app/api/user/stats/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id,email:owner.email}})},'@/lib/prisma':{prisma:db},'@/lib/plans':plans,'@/lib/generation-quota':quota});
 const newHarness=()=>{const h=create();harnesses.push(h);h.state.user=paid.id;h.state.email=paid.email;return h;};
 const readOnly=request=>{assert.equal(request.url,'/api/user/stats');assert.equal(request.init.cache,'no-store');assert(!request.body);};
 try{
  await prisma.subscription.create({data:{userId:paid.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  await prisma.generation.createMany({data:users.map(u=>({userId:u.id,template:'title',inputs:{},output:'Synthetic own content',tokensUsed:0}))});
  const before={users:await prisma.user.findMany({where:{id:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}})};
  {
   const h=newHarness(),owned=[];h.state.send=request=>{readOnly(request);const original=routeFor(paid).GET();owned.push(original);return original;};await ready(h);await Promise.all(owned);await ready(h);assert(h.input());assert.doesNotMatch(h.text(),/Desbloquear con Pro|No se pudo comprobar/);assert.equal(h.requests.length,1);h.unmount();
   results.push('Coach component/unchanged statistics hook/original API/actual PostgreSQL manual Pro subscription: only validated matching owner data enables conversation; no Coach/model/email/payment effect');
  }
  {
   const h=newHarness(),entered=deferred();h.state.send=async request=>{readOnly(request);const response=await routeFor(paid,{user:{findUnique:async()=>{throw Error('Private synthetic failed SELECT');}}}).GET();assert.equal(response.status,503);entered.resolve();return response;};await ready(h);await entered.promise;await ready(h);assert.match(h.text(),/No se pudo comprobar tu plan/);assert.doesNotMatch(h.text(),/Desbloquear con Pro|Private/);assert(!h.input());
   const confirmed=deferred();h.state.send=async request=>{readOnly(request);const response=await routeFor(paid).GET();confirmed.resolve();return response;};h.click('Reintentar plan');await confirmed.promise;await ready(h);assert(h.input());assert.equal(h.requests.length,2);h.unmount();
   results.push('Coach actual statistics storage503 stays visible and cannot claim Free access or enable sending; explicit GET-only retry reads matching native paid subscription without writes');
  }
  {
   const h=newHarness(),entered=deferred(),ack=deferred();let originalBody;h.state.send=async request=>{readOnly(request);const response=await routeFor(paid).GET();assert.equal(response.status,200);originalBody=await response.json();return {ok:true,status:200,json:()=>{entered.resolve();return ack.promise;}};};await ready(h);await entered.promise;h.advance(30000);await ready(h);assert.match(h.text(),/No se pudo comprobar tu plan/);assert(!h.input());assert.equal(h.requests[0].init.signal.aborted,true);ack.resolve(originalBody);await flush();h.view();assert(!h.input());assert.match(h.text(),/No se pudo comprobar/);h.unmount();
   results.push('Coach original native matching-paid statistics JSON acknowledgement held past total30s local wait: controlled error and no paywall; late data cannot enable sending or mutate subscription/content');
  }
  {
   const h=newHarness(),entered=deferred(),ack=deferred(),newRead=deferred();let originalBody;h.state.send=async request=>{readOnly(request);const owner=users.find(u=>u.id===request.owner);assert(owner);const response=await routeFor(owner).GET();assert.equal(response.status,200);const body=await response.json();if(owner===paid){originalBody=body;return{ok:true,status:200,json:()=>{entered.resolve();return ack.promise;}};}newRead.resolve();return{ok:true,status:200,json:async()=>body};};await ready(h);await entered.promise;
   h.state.user=free.id;h.state.email=free.email;const immediate=h.view(true);assert(!h.nodes(immediate).some(n=>n.type==='textarea'));h.runEffects();await newRead.promise;await ready(h);assert.match(h.text(),/Desbloquear con Pro/);assert(!h.input());ack.resolve(originalBody);await ready(h);assert.match(h.text(),/Desbloquear con Pro/);assert(!h.input());assert.equal(h.requests.length,2);h.unmount();
   results.push('Coach late actual PostgreSQL paid-owner body cannot populate new authenticated Free owner: immediate keyed isolation, matching Free paywall and no POST; original/neighbor rows unchanged');
  }
  assert.deepEqual(await prisma.user.findMany({where:{id:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.users);assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.subscriptions);assert.deepEqual(await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.generations);assert.equal(await prisma.chatMessage.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
 }finally{for(const h of harnesses)h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
