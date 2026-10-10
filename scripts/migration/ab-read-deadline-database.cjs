'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred}=require('./calendar-http-read-deadline.test.cjs');
const flush=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
async function within(p,label){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing original '+label)),2000);})]);}finally{clearTimeout(timer);}}
module.exports=async(prisma,results)=>{
 const modes=['auth-deadline','auth-abort','query-deadline','query-abort','query-success-owner'];
 const users=await Promise.all([...modes,'neighbor'].map(name=>prisma.user.create({data:{email:'ab-read-'+name+'-'+randomUUID()+'@example.invalid'}}))),ids=users.map(u=>u.id);
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.abTest.createMany({data:users.flatMap(u=>Array.from({length:23},(_,i)=>({userId:u.id,videoId:'video-'+i,originalTitle:'Original '+i,variantA:'A '+i,variantB:'B '+i,status:'cancelled',startedAt:new Date(Date.UTC(2026,9,1,0,i)),completedAt:new Date(Date.UTC(2026,9,1,1,i))})))});
  await prisma.generation.create({data:{userId:users.at(-1).id,template:'title',inputs:{},output:'Neighbor synthetic output',tokensUsed:0}});
  const before={subscriptions:await prisma.subscription.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),tests:await prisma.abTest.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),generations:await prisma.generation.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}})};
  for(const[index,mode]of modes.entries()){
   const owner=users[index],session={user:{id:owner.id}},gate=deferred(),entry=deferred(),units=[],controller=new AbortController(),timers=new Map();let now=0,sequence=0,queries=0,forbiddenCalls=0;
   const forbidden=()=>{forbiddenCalls++;throw Error('Read cannot mutate or execute title/OAuth/model');};
   const db={abTest:{findMany:args=>{queries++;assert.equal(args.where.userId,owner.id);assert.equal(args.take,20);assert.equal(args.orderBy.startedAt,'desc');const original=(async()=>{const rows=await prisma.abTest.findMany(args);entry.resolve();await gate.promise;return rows;})();units.push(original);void original.catch(()=>{});return original;},create:forbidden,update:forbidden}};
   const route=load('app/api/youtube/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:()=>{if(mode.startsWith('auth')){entry.resolve();return gate.promise.then(()=>session);}return Promise.resolve(session);}},'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/ab-test':{createAbTest:forbidden}},{performance:{now:()=>now},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:forbidden});
   const original=route.GET(new Request('https://example.invalid/api/youtube/ab-test',{signal:controller.signal}));
   try{
    await within(Promise.race([entry.promise,original.then(()=>{throw Error('HTTP ended before '+mode);})]),'entry '+mode);
    if(mode==='query-success-owner'){session.user.id=users.at(-1).id;gate.resolve();const r=await within(original,'successful SQL reader');assert.equal(r.status,200);const body=await r.json();assert.equal(body.userId,owner.id);assert.equal(body.tests.length,20);assert(body.tests.every(t=>t.userId===owner.id));assert.deepEqual(body.tests.map(t=>t.videoId),Array.from({length:20},(_,i)=>'video-'+(22-i)));assert.equal(r.headers.get('cache-control'),'no-store');}
    else{
     if(mode.endsWith('abort'))controller.abort();else{now=25000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}
     const r=await within(original,'HTTP terminal '+mode);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'ab_read_unconfirmed'});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);gate.resolve();await within(Promise.allSettled(units),'original SQL result '+mode);await flush();assert.equal(r.status,503);
    }
    assert.equal(queries,mode.startsWith('auth')?0:1);assert.equal(forbiddenCalls,0);assert.equal(timers.size,0);
    results.push('A/B GET '+mode+': actual owner-scoped route/PostgreSQL;25s total or abort, no SELECT after late auth, original SELECT result retained once, latest20 descending/no-store; neighbor and business tables untouched; no mutation/recovery/operational authority');
   }finally{gate.resolve();await original;await within(Promise.allSettled(units),'original cleanup '+mode);}
  }
  assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),before.subscriptions);assert.deepEqual(await prisma.abTest.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),before.tests);assert.deepEqual(await prisma.generation.findMany({where:{userId:{in:ids}},orderBy:{id:'asc'}}),before.generations);
 }finally{await prisma.user.deleteMany({where:{id:{in:ids}}});}
};
