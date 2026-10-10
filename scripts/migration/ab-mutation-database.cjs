'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {create,ready,defaults,inputs,pick}=require('./ab-page-client.test.cjs');
const {form,start,writes}=require('./ab-mutation-client.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all(['create-headers','create-JSON','cancel-headers','cancel-JSON','cancel-rejected','neighbor'].map(name=>prisma.user.create({data:{email:'ab-mutation-'+name+'-'+randomUUID()+'@example.invalid'}}))),neighbor=users.at(-1),harnesses=[];
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Neighbor synthetic output',tokensUsed:0}});
  const subscriptions=await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}});
  const neighborTest=await prisma.abTest.create({data:{userId:neighbor.id,videoId:'neighbor',originalTitle:'Neighbor original',variantA:'Neighbor A',variantB:'Neighbor B'}}),neighborGenerations=await prisma.generation.findMany({where:{userId:neighbor.id}});
  for(const[index,mode]of ['create-headers','create-JSON','cancel-headers','cancel-JSON','cancel-rejected'].entries()){
   const owner=users[index],kind=mode.startsWith('create')?'create':'cancel',held=mode.endsWith('JSON')?'JSON':'headers',h=create(),gate=deferred(),entered=deferred(),finished=deferred(),reads=[],owned=[],provider=[],nativeWrites=[];
   harnesses.push(h);h.state.user=owner.id;h.state.email=owner.email;
   const seed=kind==='cancel'?await prisma.abTest.create({data:{userId:owner.id,videoId:'Original',originalTitle:'Original synthetic video',variantA:'Native A',variantB:'Native B'}}):null;
   const db={...prisma,abTest:{findMany:args=>prisma.abTest.findMany(args),findFirst:args=>prisma.abTest.findFirst(args),count:args=>prisma.abTest.count(args),create:args=>{assert.equal(args.data.userId,owner.id);nativeWrites.push('create');return prisma.abTest.create(args);},update:args=>{assert.equal(args.where.id,seed.id);nativeWrites.push('cancel');return prisma.abTest.update(args);}}};
   db.$transaction=(fn,options)=>prisma.$transaction(tx=>fn({$queryRawUnsafe:(...args)=>tx.$queryRawUnsafe(...args),abTestCreationAttempt:tx.abTestCreationAttempt,abTestMutationAttempt:tx.abTestMutationAttempt,abTest:{findFirst:args=>tx.abTest.findFirst(args),count:args=>tx.abTest.count(args),create:args=>{assert.equal(args.data.userId,owner.id);nativeWrites.push('create');return tx.abTest.create(args);},update:args=>{assert.equal(args.where.id,seed.id);nativeWrites.push('cancel');return tx.abTest.update(args);}}}),options);
   const transport=async(url,init={})=>{
    assert.match(url,/^https:\/\/www.googleapis.com\/youtube\/v3\/videos\?/);assert.equal(init.headers.Authorization,'Bearer synthetic-title-token');provider.push({url,init});
    if(init.method!=='PUT')return Response.json({items:[{id:'Original',snippet:{title:'Original synthetic video',categoryId:'22',thumbnails:{}},statistics:{viewCount:'12'}}]});
    const body=JSON.parse(init.body);assert.equal(body.id,'Original');assert.equal(body.snippet.title,'Original synthetic video');
    if(held==='headers'){entered.resolve();await gate.promise;}
    return mode==='cancel-rejected'?new Response('Synthetic provider rejection',{status:403}):Response.json({id:'Original'});
   };
   const youtube={getAccessToken:async userId=>{assert.equal(userId,owner.id);return'synthetic-title-token';}};
   const helper=load('lib/ab-test.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/plans':plans},{fetch:transport});
   const route=load('app/api/youtube/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/ab-test':helper},{fetch:transport});
   h.state.send=request=>{
    if(request.url.includes('channel'))return defaults(request);
    assert.equal(request.url,'/api/youtube/ab-test');assert.equal(request.owner,owner.id);
    if(!request.init.method){const original=(async()=>{const response=await route.GET(),body=await response.json();assert.equal(body.userId,owner.id);return{ok:response.ok,status:response.status,json:async()=>body};})();reads.push(original);return original;}
    assert.equal(request.init.signal,undefined);
    const original=(async()=>{try{const response=await route[request.init.method](new Request('https://example.invalid/api/youtube/ab-test',{method:request.init.method,headers:request.init.headers,body:JSON.stringify(request.body)})),body=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');finished.resolve();return{ok:response.ok,status:response.status,json:()=>{if(held==='JSON'){entered.resolve();return gate.promise.then(()=>body);}return Promise.resolve(body);}};}catch(e){finished.reject(e);throw e;}})();owned.push(original);return original;
   };
   await ready(h);await Promise.all(reads);await ready(h);if(kind==='create')form(h);
   const callback=kind==='create'?h.button('Iniciar A/B test').props.onClick:h.button('Cancelar test').props.onClick,p=callback();
   await Promise.race([entered.promise,finished.promise.then(()=>{if(held!=='JSON')throw Error('Native producer ended before held effect');})]);
   h.unmount();await ready(h);await Promise.all(reads);await ready(h);h.advance(60000);await p;await ready(h);assert.match(h.text(),/El cambio del test no está confirmado/);await callback();assert.equal(writes(h).length,1);
   if(held==='headers'){assert.equal(nativeWrites.length,0);assert.equal(await prisma.abTest.count({where:{userId:owner.id}}),kind==='cancel'?1:0);}
   gate.resolve();await Promise.all(owned);await finished.promise;await ready(h);
   const rows=await prisma.abTest.findMany({where:{userId:owner.id}});assert.equal(rows.length,1);assert.equal(provider.filter(c=>c.init.method==='PUT').length,1);assert.equal(writes(h).length,1);
   if(mode==='cancel-rejected'){assert.equal(rows[0].status,'variant_a');assert.equal(rows[0].completedAt,null);assert.equal(nativeWrites.length,0);assert.equal(h.storage.size,1);assert.match(h.text(),/no está confirmado/);}else{assert.equal(nativeWrites.length,1);assert.equal(h.storage.size,0);assert.equal(rows[0].status,kind==='create'?'variant_a':'cancelled');assert.match(h.text(),kind==='create'?/Candidate B/:/CANCELADO/);}
   assert.equal(h.timers.size,0);h.unmount();
   results.push('A/B mutation '+mode+': actual component/coordinator/POST/PATCH/Pro helper/PostgreSQL, synthetic auth/channel/title transport; one original PUT and mutation,60s wait/remount denial, owner-bound full acknowledgement; provider rejection never marks cancelled; no operational title effect/recovery');
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),subscriptions);
  assert.deepEqual(await prisma.abTest.findUnique({where:{id:neighborTest.id}}),neighborTest);
  assert.deepEqual(await prisma.generation.findMany({where:{userId:neighbor.id}}),neighborGenerations);
 }finally{for(const h of harnesses)h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await flush();}
};
