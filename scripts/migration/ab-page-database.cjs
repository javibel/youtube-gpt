'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {create,ready,defaults,pick,posts,values}=require('./ab-page-client.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const nativeHistory=require('./ab-history-native.test.cjs'),readers=[];
 const users=await Promise.all(['read','JSON','headers','remount','neighbor'].map(name=>prisma.user.create({data:{email:'ab-page-'+name+'-'+randomUUID()+'@example.invalid',emailVerified:new Date(Date.now()-10000)}}))),neighbor=users.at(-1),harnesses=[];
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const noWrite=()=>{throw Error('No real title or mutation effect permitted in read fixture');};
 const listFor=async owner=>{const b=await nativeHistory.bound({account:owner,db:prisma});readers.push(b);return b.start();};
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.abTest.createMany({data:users.map(u=>({userId:u.id,videoId:'own-'+u.id,originalTitle:'Own native history '+u.id,variantA:'Own A '+u.id,variantB:'Own B',status:'cancelled'}))});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Neighbor synthetic title',tokensUsed:0}});
  const before={subscriptions:await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),tests:await prisma.abTest.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}})};
  for(const[index,held]of ['read','JSON','headers','remount'].entries()){
   const owner=users[index],h=create(),entered=deferred(),gate=deferred(),owned=[],reads=[],calls=[],finished=deferred();harnesses.push(h);h.state.user=owner.id;h.state.email=owner.email;
   const suggestion=load('app/api/youtube/ab-test/suggest/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/plans':plans,'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{assert.equal(identity.userId,owner.id);assert.equal(identity.taskType,'youtube.ab-title-suggestions');assert.match(identity.operationKey,/^synthetic-ab-/);return{create:async parameters=>{calls.push(parameters);assert.equal(parameters.max_tokens,200);assert.match(parameters.messages[0].content,/Original synthetic video/);if(held==='headers'||held==='remount'){entered.resolve();await gate.promise;}return{content:[{type:'text',text:'{"variantA":"Native suggested A","variantB":"Native suggested B"}'}]};}};}}});
   h.state.send=request=>{
    if(request.url.includes('channel'))return defaults(request);
    if(request.url.endsWith('ab-test')){
     assert.equal(request.init.cache,'no-store');assert(!request.body);const account=users.find(u=>u.id===request.owner);assert(account);
     const original=(async()=>{const response=await listFor(account);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.userId,account.id);assert(body.tests.every(t=>t.userId===account.id));if(held==='read'&&account===owner)return{ok:true,status:200,json:()=>{entered.resolve();return gate.promise.then(()=>body);}};return{ok:true,status:200,json:async()=>body};})();reads.push(original);return original;
    }
    assert.equal(request.url,'/api/youtube/ab-test/suggest');assert.equal(request.owner,owner.id);assert.equal(request.init.signal,undefined);
    const original=(async()=>{const response=await suggestion.POST(new Request('https://example.invalid/api/youtube/ab-test/suggest',{method:'POST',headers:request.init.headers,body:JSON.stringify(request.body)}));const body=await response.json();finished.resolve();if(held==='JSON')return{ok:response.ok,status:response.status,json:()=>{entered.resolve();return gate.promise.then(()=>body);}};return{ok:response.ok,status:response.status,json:async()=>body};})();owned.push(original);return original;
   };
   await ready(h);await Promise.all(reads);await ready(h);
   if(held==='read'){
    await entered.promise;h.advance(30000);await ready(h);assert.match(h.text(),/No se pudieron cargar/);h.state.user=neighbor.id;h.state.email=neighbor.email;await ready(h);await Promise.all(reads);await ready(h);assert.match(h.text(),new RegExp('Own A '+neighbor.id));assert.doesNotMatch(h.text(),new RegExp('Own A '+owner.id));gate.resolve();await ready(h);assert.doesNotMatch(h.text(),new RegExp('Own A '+owner.id));assert.equal(posts(h).length,0);
   }else{
    pick(h);h.view();const p=h.click('Sugerir con IA');await Promise.race([entered.promise,finished.promise.then(()=>{if(held!=='JSON')throw Error('Task completed before held entry');})]);
    if(held==='remount'){h.unmount();await ready(h);await Promise.all(reads);await ready(h);}
    h.advance(60000);await p;await ready(h);assert.match(h.text(),/Las sugerencias no están confirmadas/);assert(h.button('Sugerir con IA').props.disabled);await h.button('Sugerir con IA').props.onClick();assert.equal(posts(h).length,1);assert.equal(calls.length,1);gate.resolve();await Promise.all(owned);await finished.promise;await ready(h);assert.equal(values(h),'Native suggested A|Native suggested B');assert.equal(h.storage.size,0);assert.equal(calls.length,1);assert.equal(posts(h).length,1);
   }
   assert.equal(h.timers.size,0);h.unmount();
   results.push('A/B page '+held+': actual owner-scoped GET/PostgreSQL test list and Pro helper, synthetic channel/auth/React/transport; total30s read or60s send wait, live original task/key/payload retained, no replacement, title publication or recovery reconstruction');
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.subscriptions);
  assert.deepEqual(await prisma.abTest.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.tests);
  assert.deepEqual(await prisma.generation.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),before.generations);
 }finally{for(const b of readers)await nativeHistory.drain(b);for(const h of harnesses)h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await flush();}
};
