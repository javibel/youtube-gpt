'use strict';
// Closed business contract with the existing declared-actor fixture. This cookie
// only selects that fixture; it is not native Auth.js authentication evidence.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const drains=[];
 const stages=['throttle','context','create','conversionUser','mail'],users=await Promise.all([...stages,'neighbor'].map(()=>prisma.user.create({data:{email:'coach-http-wait-'+randomUUID()+'@example.invalid',emailVerified:new Date(0)}}))),neighbor=users.at(-1);
 try{
  await prisma.subscription.createMany({data:users.filter((_,i)=>i<3||i===5).map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.chatMessage.create({data:{userId:neighbor.id,role:'user',content:'Synthetic neighboring conversation'}});
  const before={subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),neighbor:await prisma.chatMessage.findMany({where:{userId:neighbor.id}})};
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
  for(const[index,held]of stages.entries()){
   const owner=users[index],entered=deferred(),ack=deferred(),owned=[],calls=[],timers=new Map(),controller=new AbortController();let now=0,resultReads=0;
   const hold=(stage,operation)=>{calls.push(stage);const original=(async()=>{const value=await operation();if(stage===held){entered.resolve();await ack.promise;}return value;})();owned.push(original);return original;};
   drains.push(async()=>{ack.resolve();await Promise.allSettled(owned);await flush();await Promise.allSettled(owned);});
   const globals={performance:{now:()=>now},setTimeout(fn){const id={};timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
   const lifeClient=client=>new Proxy(client,{get(target,key){
    if(key==='$transaction')return(action,options)=>target.$transaction(tx=>action(lifeClient(tx)),options);
    if(key==='$queryRawUnsafe')return(sql,...args)=>hold(sql.startsWith('SELECT id,email,name')?'conversionUser':sql.includes('WITH accepted')?'mailLog':'lifecycleSQL',()=>target.$queryRawUnsafe(sql,...args));
    return Reflect.get(target,key);
   }});
   const currentLife=require('./lifecycle-fixture.cjs').fixture({prisma:lifeClient(prisma),fetch:()=>hold('mail',async()=>Response.json({id:'synthetic-original-mail-ack'}))});
   const lifecycle={triggerConversionEmail(...args){const original=currentLife.trigger.triggerConversionEmail(...args);owned.push(original);return original;}};
   const route=load('app/api/coach/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id,email:owner.email}})},'@/lib/prisma':{prisma:{$queryRaw:(...args)=>hold('throttle',()=>prisma.$queryRaw(...args))}},'@/lib/plans':plans,'@/lib/channel-context':{getChannelContext:id=>hold('context',async()=>{assert.equal(id,owner.id);return{summary:'Synthetic own channel context'};})},'@/lib/extension-auth':{getExtensionUser:async()=>{throw Error('No extension in fixture');}},'@/lib/lifecycle-trigger':lifecycle,'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{assert.equal(identity.userId,owner.id);return{create:()=>hold('create',async()=>({get content(){resultReads++;return[{text:'Original synthetic task answer'}];}}))};}}},globals);
   const original=route.POST(new Request('https://example.invalid/api/coach',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'closed-coach-business-fixture'},body:JSON.stringify({message:'Original question',lang:'es'}),signal:controller.signal}));await Promise.race([entered.promise,original.then(async response=>{throw Error('Coach fixture ended before '+held+': '+response.status);})]);const callsBefore=[...calls];
   if(index%2===0){now=55000;for(const fn of [...timers.values()])fn();}else controller.abort();
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'coach_send_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await Promise.all(owned);await flush();await Promise.all(owned);
   assert.deepEqual(calls,held==='mail'?[...callsBefore,'lifecycleSQL','mailLog']:callsBefore);assert.equal(calls.filter(x=>x==='create').length,held==='create'?1:0);assert.equal(resultReads,held==='create'?1:0);assert.equal(calls.filter(x=>x==='mail').length,held==='mail'?1:0);
   const throttle=await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'coach_throttle:'+owner.id}`;assert.equal(throttle.length,index<3?1:0);if(throttle.length)assert.equal(Number(throttle[0].hits),1);
   assert.equal(await prisma.emailLog.count({where:{userId:owner.id}}),held==='mail'?1:0);assert.equal(await prisma.chatMessage.count({where:{userId:owner.id}}),0);assert.equal(response.status,503);
   results.push('Coach HTTP original '+held+' '+(index%2===0?'55s deadline':'abort')+': declared Coach actor with actual paid-plan helper/PostgreSQL throttle/current lifecycle private admission/domain transport; one original closed task/mail, retained result reader or own admitted mail log, no later effects, resend, cancellation, persisted Coach history or recovery authority');
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.subscriptions);assert.deepEqual(await prisma.chatMessage.findMany({where:{userId:neighbor.id}}),before.neighbor);assert.equal(await prisma.emailLog.count({where:{userId:neighbor.id}}),0);assert.equal((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'coach_throttle:'+neighbor.id}`).length,0);
 }finally{
  for(const drain of drains)await drain();
  for(const u of users)await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${'coach_throttle:'+u.id}`;
  await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
 }
};
