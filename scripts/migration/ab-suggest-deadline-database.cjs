'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs'),{variants}=require('./ab-suggest-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const stages=['plan','body','factory','create'],users=await Promise.all([...stages,'neighbor'].map(()=>prisma.user.create({data:{email:'ab-suggestion-wait-'+randomUUID()+'@example.invalid'}}))),neighbor=users.at(-1);
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Synthetic neighboring title',tokensUsed:0}});
  await prisma.abTest.create({data:{userId:neighbor.id,videoId:'synthetic-neighbor',originalTitle:'Synthetic neighboring title',variantA:'Synthetic A',variantB:'Synthetic B'}});
  const before={subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),tests:await prisma.abTest.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}})};
  for(const[index,held]of stages.entries()){
   const owner=users[index],entered=deferred(),ack=deferred(),owned=[],calls=[],timers=new Map(),controller=new AbortController();let now=0,resultReads=0;
   const hold=(stage,operation)=>{calls.push(stage);const original=(async()=>{const value=await operation();if(stage===held){entered.resolve();await ack.promise;}return value;})();owned.push(original);return original;};
   const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:{subscription:{findUnique:query=>hold('plan',async()=>{assert.equal(query.where.userId,owner.id);return prisma.subscription.findUnique(query);})}}}});
   const route=load('app/api/youtube/ab-test/suggest/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:identity=>hold('factory',async()=>{assert.equal(identity.userId,owner.id);assert.equal(identity.operationKey,'native-original-ab-'+index);assert.equal(identity.taskType,'youtube.ab-title-suggestions');return{create:parameters=>hold('create',async()=>{assert.equal(parameters.max_tokens,200);assert.match(parameters.messages[0].content,/Original synthetic title/);return{get content(){resultReads++;return[{type:'text',text:JSON.stringify(variants)}];}};})};})}},{performance:{now:()=>now},setTimeout(fn){const id={};timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
   const request=new Request('https://example.invalid/api/youtube/ab-test/suggest',{method:'POST',headers:{'Idempotency-Key':'native-original-ab-'+index,'Content-Type':'application/json'},body:'{}',signal:controller.signal});request.json=()=>hold('body',async()=>({title:'Original synthetic title',lang:'es'}));
   const original=route.POST(request);await entered.promise;const callsBefore=[...calls];if(index%2===0){now=55000;for(const fn of [...timers.values()])fn();}else controller.abort();
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ab_suggestions_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await Promise.all(owned);await flush();assert.deepEqual(calls,callsBefore);assert.equal(calls.filter(x=>x==='create').length,held==='create'?1:0);assert.equal(resultReads,held==='create'?2:0);assert.equal(response.status,503);
   results.push('A/B suggestions original '+held+' '+(index%2===0?'55s deadline':'abort')+': actual stored-Pro helper/PostgreSQL authorization, one original synthetic result reader only after dispatch; no later factory/task, retry, business row/title publication or recovery authority');
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.subscriptions);assert.deepEqual(await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.generations);assert.deepEqual(await prisma.abTest.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.tests);
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
