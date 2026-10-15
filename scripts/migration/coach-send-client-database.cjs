'use strict';
// Closed business contract with the existing declared-actor fixture. This cookie
// only selects that fixture; it is not native Auth.js authentication evidence.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {create,posts,terminal}=require('./coach-send-client.test.cjs'),{ready,sendButton}=require('./coach-plan.test.cjs'),{deferred}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all(['headers','JSON','failure','remount','neighbor'].map(name=>prisma.user.create({data:{email:'coach-send-'+name+'-'+randomUUID()+'@example.invalid'}}))),neighbor=users.at(-1),harnesses=[];
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma);
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Neighbor synthetic content',tokensUsed:0}});
  const before={subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}})};
  for(const[index,held]of ['headers','JSON','failure','remount'].entries()){
   const owner=users[index],h=create(),entered=deferred(),gate=deferred(),finished=deferred(),calls=[],requests=[],reads=[];harnesses.push(h);h.state.user=owner.id;h.state.email=owner.email;
   const stats=load('app/api/user/stats/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id,email:owner.email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota});
   const route=load('app/api/coach/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id,email:owner.email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/channel-context':{getChannelContext:async id=>{assert.equal(id,owner.id);return{summary:'Synthetic own channel context'};}},'@/lib/extension-auth':{getExtensionUser:async()=>{throw Error('No extension authorization in this fixture');}},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{throw Error('No lifecycle effects authorized in this fixture');}},'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{assert.equal(identity.userId,owner.id);assert.equal(identity.taskType,'channel.coach');assert.equal(identity.requiredCapabilities.length,1);assert.equal(identity.requiredCapabilities[0],'prompt_cache');return{create:async parameters=>{calls.push(parameters);if(held==='headers'||held==='remount'){entered.resolve();await gate.promise;}if(held==='failure')throw Error('Synthetic original task failure');return{content:[{text:'Native-route synthetic Coach answer'}]};}};}}});
   h.state.send=async request=>{
    if(request.url==='/api/user/stats'){assert.equal(request.init.cache,'no-store');const original=(async()=>{const response=await stats.GET();const body=await response.json();return{ok:response.ok,status:response.status,json:async()=>body};})();reads.push(original);return original;}
    assert.equal(request.url,'/api/coach');assert.equal(request.owner,owner.id);assert.equal(request.init.signal,undefined);
    const original=route.POST(new Request('https://example.invalid/api/coach',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'closed-coach-business-fixture'},body:JSON.stringify(request.body)}));requests.push(original);
    const response=await original;const body=await response.json();finished.resolve();
    if(held==='JSON')return{ok:response.ok,status:response.status,json:()=>{entered.resolve();return gate.promise.then(()=>body);}};
    return{ok:response.ok,status:response.status,json:async()=>body};
   };
   await ready(h);await Promise.all(reads);await ready(h);h.change('Native-route synthetic question');const p=sendButton(h).props.onClick();await ready(h);
   if(held==='failure')await finished.promise;
   else if(held==='JSON')await entered.promise;
   else await Promise.race([entered.promise,finished.promise.then(()=>{throw Error('Original route completed before the held task entered');})]);
   if(held==='remount')h.unmount();h.advance(60000);await terminal(p);await ready(h);await Promise.all(reads);await ready(h);
   assert.match(h.text(),/El envío no está confirmado/);assert.match(h.text(),/Native-route synthetic question/);assert(h.input().props.disabled);await sendButton(h).props.onClick();assert.equal(posts(h).length,1);assert.equal(calls.length,1);
   assert.equal(Number((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'coach_throttle:'+owner.id}`)[0].hits),1);
   if(held!=='failure'){gate.resolve();await finished.promise;await Promise.all(requests);await ready(h);assert.match(h.text(),/Native-route synthetic Coach answer/);assert(!h.input().props.disabled);assert.equal(h.storage.size,0);}else{await Promise.all(requests);assert(h.input().props.disabled);assert.equal(h.storage.size,1);}
   assert.equal(calls.length,1);assert.equal(posts(h).length,1);assert.equal(h.timers.size,0);h.unmount();
   results.push('Coach send '+held+': actual component/controller/API/paid-plan helper/PostgreSQL throttle; one original synthetic task and SQL hit,60s unconfirmed wait without resend or cancellation; original acknowledgment alone unlocks, no persisted Coach history/reconstructed authority/model/email/payment');
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.subscriptions);
  assert.deepEqual(await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.generations);
  assert.equal(await prisma.chatMessage.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
  assert.equal((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'coach_throttle:'+neighbor.id}`).length,0);
 }finally{
  for(const h of harnesses)h.unmount();for(const u of users)await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${'coach_throttle:'+u.id}`;
  await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
 }
};
