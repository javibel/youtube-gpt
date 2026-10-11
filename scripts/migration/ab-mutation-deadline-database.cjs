'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred}=require('./calendar-http-read-deadline.test.cjs');
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
async function within(p,label){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing original '+label)),2000);})]);}finally{clearTimeout(timer);}}
module.exports=async(prisma,results)=>{
 const modes=['plan','create-title','create-sql','cancel-find','cancel-title','winner-title','token-lookup','refresh-title','refresh-sql'];
 const users=await Promise.all([...modes,'neighbor'].map(name=>prisma.user.create({data:{email:'ab-http-'+name+'-'+randomUUID()+'@example.invalid'}}))),neighbor=users.at(-1);
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  const neighborToken=await prisma.youtubeToken.create({data:{userId:neighbor.id,accessToken:'neighbor-token',refreshToken:'neighbor-refresh',expiresAt:new Date(Date.now()+86400000)}});
  const neighborTest=await prisma.abTest.create({data:{userId:neighbor.id,videoId:'neighbor',originalTitle:'Neighbor original',variantA:'Neighbor A',variantB:'Neighbor B'}});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Neighbor synthetic output',tokensUsed:0}});
  const subscriptions=await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),generations=await prisma.generation.findMany({where:{userId:neighbor.id}});
  for(const[index,mode]of modes.entries()){
   const owner=users[index],kind=mode.startsWith('cancel')?'cancel':mode==='winner-title'?'winner':'create',gate=deferred(),entry=deferred(),controller=new AbortController(),timers=new Map(),calls=[],units=[];let now=Date.now(),sequence=0;
   const expired=mode.startsWith('refresh')||mode==='token-lookup';
   await prisma.youtubeToken.create({data:{userId:owner.id,accessToken:'synthetic-token',refreshToken:'synthetic-refresh',expiresAt:new Date(now+(expired?-86400000:86400000))}});
   const seed=kind!=='create'?await prisma.abTest.create({data:{userId:owner.id,videoId:'video',originalTitle:'Original synthetic',variantA:'A synthetic',variantB:'B synthetic',...(kind==='winner'?{status:'completed',winner:'A',completedAt:new Date(now)}:{})}}):null;
   const stage=({plan:'plan','create-title':'title','create-sql':'create','cancel-find':'find','cancel-title':'title','winner-title':'title','token-lookup':'token','refresh-title':'refresh','refresh-sql':'tokenUpdate'})[mode];
   function tracked(name,fn){calls.push(name);const original=(async()=>{const value=await fn();if(name===stage){entry.resolve();await gate.promise;}return value;})();units.push(original);void original.catch(()=>{});return original;}
   const db={abTest:{findFirst:args=>tracked('find',()=>prisma.abTest.findFirst(args)),count:args=>tracked('count',()=>prisma.abTest.count(args)),create:args=>{assert.equal(args.data.userId,owner.id);return tracked('create',()=>prisma.abTest.create(args));},update:args=>{assert.equal(args.where.id,seed.id);return tracked('update',()=>prisma.abTest.update(args));}},youtubeToken:{findUnique:args=>{assert.equal(args.where.userId,owner.id);return tracked('token',()=>prisma.youtubeToken.findUnique(args));},update:args=>{assert.equal(args.where.userId,owner.id);return tracked('tokenUpdate',()=>prisma.youtubeToken.update(args));}}};
   db.$transaction=(fn,options)=>prisma.$transaction(tx=>fn({$queryRawUnsafe:(...args)=>tx.$queryRawUnsafe(...args),optimizeUpdateAttempt:tx.optimizeUpdateAttempt,abTestCreationAttempt:tx.abTestCreationAttempt,abTestMutationAttempt:tx.abTestMutationAttempt,abTest:{findFirst:args=>tx.abTest.findFirst(args),count:args=>tx.abTest.count(args),create:args=>{assert.equal(args.data.userId,owner.id);return tracked('create',()=>tx.abTest.create(args));},update:args=>{assert.equal(args.where.id,seed.id);return tracked('update',()=>tx.abTest.update(args));}}}),options);
   const globals={Date:class extends Date{static now(){return now;}},performance:{now:()=>now},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,init={})=>{
    if(url==='https://oauth2.googleapis.com/token'){assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).refresh_token,'synthetic-refresh');return tracked('refresh',async()=>Response.json({access_token:'rotated-synthetic',expires_in:3600}));}
    assert.match(url,/^https:\/\/www.googleapis.com\/youtube\/v3\/videos\?/);assert.match(init.headers.Authorization,/^Bearer (synthetic-token|rotated-synthetic)$/);
    if(init.method==='PUT'){const body=JSON.parse(init.body);assert.equal(body.id,'video');assert.equal(body.snippet.title,kind==='cancel'?'Original synthetic':'A synthetic');return tracked('title',async()=>Response.json({id:'video'}));}
    return tracked('snippet',async()=>Response.json({items:[{snippet:{title:'Original synthetic',categoryId:'22',thumbnails:{}},statistics:{viewCount:'12'}}]}));
   }};
   const realPlans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),plans={...realPlans,getUserPlan:id=>{assert.equal(id,owner.id);return tracked('plan',()=>realPlans.getUserPlan(id));}};
   const youtube=load('lib/youtube-auth.ts',{'@/lib/prisma':{prisma:db}},globals),realHelper=load('lib/ab-test.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/plans':plans},globals);
   function own(original){units.push(original);void original.catch(()=>{});return original;}
   const helper={...realHelper,createAbTest:(...args)=>own(realHelper.createAbTest(...args)),beginAbTestMutation:(...args)=>own(realHelper.beginAbTestMutation(...args).then(admission=>admission.ok?{...admission,complete:()=>own(admission.complete())}:admission))};
   const route=load('app/api/youtube/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/ab-test':helper},globals);
   const request=new Request('https://example.invalid/api/youtube/ab-test',{method:kind==='create'?'POST':'PATCH',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify(kind==='create'?{videoId:'video',variantA:'A synthetic',variantB:'B synthetic',hoursPerVariant:48}:{testId:seed.id,action:kind==='cancel'?'cancel':'apply_winner'})});
   const original=route[request.method](request);
   try{
    await within(Promise.race([entry.promise,original.then(()=>{throw Error('HTTP ended before held '+stage);})]),'entry '+mode);
    if(index%2)controller.abort();else{now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}
    const response=await within(original,'HTTP terminal '+mode);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ab_mutation_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
    assert.equal(calls.filter(x=>x==='title').length,['create-title','create-sql','cancel-title','winner-title'].includes(mode)?1:0);
    gate.resolve();
    // Drain the original units, including SQL first invoked by a late title.
    for(let i=0;i<5;i++){const count=units.length;await within(Promise.allSettled([...units]),'producer results '+mode);await flush();if(count===units.length)break;}
    const rows=await prisma.abTest.findMany({where:{userId:owner.id}});
    assert.equal(rows.length,['create-title','create-sql'].includes(mode)||kind!=='create'?1:0);
    if(kind==='cancel')assert.equal(rows[0].status,mode==='cancel-title'?'cancelled':'variant_a');
    if(kind==='winner')assert.deepEqual(rows[0],seed);
    assert.equal(calls.filter(x=>x==='create').length,['create-title','create-sql'].includes(mode)?1:0);
    assert.equal(calls.filter(x=>x==='update').length,mode==='cancel-title'?1:0);
    assert.equal(calls.filter(x=>x==='refresh').length,mode.startsWith('refresh')?1:0);
    assert.equal(calls.filter(x=>x==='tokenUpdate').length,mode.startsWith('refresh')?1:0);
    const token=await prisma.youtubeToken.findUnique({where:{userId:owner.id}});assert.equal(token.accessToken,mode.startsWith('refresh')?'rotated-synthetic':'synthetic-token');
    assert.equal(calls.filter(x=>x==='snippet').length,['create-title','create-sql','cancel-title','winner-title'].includes(mode)?1:0);assert.equal(timers.size,0);
    results.push('A/B HTTP '+mode+': actual POST/PATCH/shared helper/Pro plan/OAuth helper/PostgreSQL;55s total or abort; late prerequisite starts no title, invoked title/credential retains original SQL/result; synthetic transports only, no replay/recovery/operational authority');
   }finally{gate.resolve();await original;await within(Promise.allSettled(units),'cleanup original '+mode);}
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),subscriptions);
  assert.deepEqual(await prisma.youtubeToken.findUnique({where:{userId:neighbor.id}}),neighborToken);
  assert.deepEqual(await prisma.abTest.findUnique({where:{id:neighborTest.id}}),neighborTest);
  assert.deepEqual(await prisma.generation.findMany({where:{userId:neighbor.id}}),generations);
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
