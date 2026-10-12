'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([0,1].map(i=>prisma.user.create({data:{email:'best-time-admit-'+randomUUID()+'@example.invalid',name:'Synthetic eligibility '+i}})));
 const owner={id:users[0].id,email:users[0].email},period=new Date('2060-01-01'),pending=[];
 const cache={userId:owner.id,heatmap:Array.from({length:7},()=>Array(24).fill(0)),topSlots:[],videoCount:3,aiTip:{es:'Caché intacto',en:'Unchanged cache'},analyzedAt:new Date(0)};
 function fixture(options={}){
  let elapsed=0,wall=Date.parse('2026-10-12T10:00:00Z'),next=0,transaction;const gate=deferred(),started=deferred(),calls=[],timers=new Map(),signal=new AbortController(),session=options.session??{user:{...owner}};
  const hold=async(stage,run)=>{calls.push(stage);const value=await run();if(options.held===stage){started.resolve(value);await gate.promise;}return value;};
  const db={$transaction:(fn,opts)=>{transaction=prisma.$transaction(async tx=>fn({
   $queryRawUnsafe:(sql,id)=>hold(sql.includes('subscriptions')?'sub-lock':'owner',()=>tx.$queryRawUnsafe(sql,id)),
   subscription:{findUnique:input=>hold('plan',()=>tx.subscription.findUnique(input))},
   generation:{count:input=>hold('history',()=>tx.generation.count(input))},
   legacyThumbnailAttempt:{count:input=>hold('images',()=>tx.legacyThumbnailAttempt.count(input))},
   textGenerationAttempt:{count:input=>hold('texts',()=>tx.textGenerationAttempt.count(input))},
   $queryRaw:(...args)=>hold('deleted',()=>tx.$queryRaw(...args))
  }),opts).then(value=>hold('ack',()=>Promise.resolve(value)));pending.push(transaction);void transaction.catch(()=>{});return transaction;}};
  class WallDate extends Date{constructor(...args){super(...(args.length?args:[wall]));}static now(){return wall;}}
  const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:db}},{Date:WallDate});
  const eligibility=load('lib/best-time-eligibility.ts',{'@/lib/prisma':{prisma:db},'@/lib/plans':plans,'@/lib/image/thumbnail-quota':load('lib/image/thumbnail-quota.ts')},{Date:WallDate});
  const route=load('app/api/youtube/best-time/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma:db},'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'@/lib/best-time-eligibility':eligibility},{performance:{now:()=>elapsed},setTimeout(fn,ms){assert.equal(ms,25000);const id=++next;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},fetch(){throw Error('No native HTTP effects');}});
  return {calls,gate,started,session,timers,signal,get transaction(){return transaction;},post:()=>route.POST(new Request('https://example.invalid/api/youtube/best-time',{method:'POST',signal:signal.signal,body:'{"accepted":true,"reset":true,"key":"old"}'})),retire(){elapsed=25000;for(const fn of [...timers.values()])fn();},expire(){wall=Date.parse('2061-01-01');}};
 }
 const rowCounts=async()=>Promise.all([prisma.generation.count({where:{userId:owner.id}}),prisma.legacyThumbnailAttempt.count({where:{userId:owner.id}}),prisma.textGenerationAttempt.count({where:{userId:owner.id}}),prisma.thumbnailSaveReceipt.count({where:{userId:owner.id}})]);
 try{
  await prisma.subscription.create({data:{userId:owner.id,status:'active',plan:'pro',stripeCustomerId:'manual_admin',currentPeriodEnd:period}});
  await prisma.bestTimeAnalysis.create({data:cache});const originalCache=await prisma.bestTimeAnalysis.findUnique({where:{userId:owner.id}});
  {const h=fixture(),r=await h.post();assert.equal(r.status,503);assert.equal((await r.json()).error,'best_time_admission_unavailable');assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await rowCounts(),[0,0,0,0]);}
  results.push('best-time POST native eligible paid owner/free capacity remains503 without reservation, provider, generation or cache write');
  {const h=fixture({session:{user:{id:owner.id,email:users[1].email}}});assert.equal((await h.post()).status,401);assert(!h.calls.includes('sub-lock'));}
  results.push('best-time POST native captured ID/email mismatch denies before another owner subscription/quota');
  {const h=fixture({session:{user:{id:'absent',email:'absent@example.invalid'}}});assert.equal((await h.post()).status,404);}
  results.push('best-time POST native missing owner is explicit without provider/admission');
  await prisma.subscription.update({where:{userId:owner.id},data:{plan:'free'}});assert.equal((await fixture().post()).status,403);await prisma.subscription.update({where:{userId:owner.id},data:{plan:'pro',currentPeriodEnd:new Date(0)}});assert.equal((await fixture().post()).status,403);await prisma.subscription.update({where:{userId:owner.id},data:{currentPeriodEnd:period}});
  results.push('best-time POST native free and declared expired manual plans deny without renewing period');
  await prisma.generation.createMany({data:Array.from({length:198},()=>({userId:owner.id,template:'synthetic',inputs:{},output:'Synthetic previous history',tokensUsed:0}))});
  await prisma.legacyThumbnailAttempt.create({data:{id:'image-'+randomUUID(),userId:owner.id,digest:'synthetic',state:'pending'}});
  await prisma.textGenerationAttempt.create({data:{id:'text-'+randomUUID(),userId:owner.id,state:'pending'}});
  assert.equal((await fixture().post()).status,429);await prisma.generation.deleteMany({where:{userId:owner.id}});
  await prisma.thumbnailSaveReceipt.createMany({data:Array.from({length:198},()=>({id:'deleted-'+randomUUID(),userId:owner.id,digest:'synthetic'}))});assert.equal((await fixture().post()).status,429);
  const occupied=await rowCounts();assert.deepEqual(occupied,[0,1,1,198]);await prisma.thumbnailSaveReceipt.deleteMany({where:{userId:owner.id}});await prisma.legacyThumbnailAttempt.deleteMany({where:{userId:owner.id}});await prisma.textGenerationAttempt.deleteMany({where:{userId:owner.id}});
  results.push('best-time POST native shared capacity counts recorded history, deleted PNG charges and pending image/text slots; no fresh admission');
  for(const stage of ['owner','sub-lock','plan','history','deleted','images','texts','ack']){
   const h=fixture({held:stage}),request=h.post();await h.started.promise;h.retire();const r=await request;assert.equal(r.status,503);assert.equal((await r.json()).error,'best_time_analysis_unconfirmed');assert.equal(h.timers.size,0);const length=h.calls.length;h.gate.resolve();await h.transaction.catch(()=>{});await flush();assert.equal(h.calls.length,length);assert.deepEqual(await rowCounts(),[0,0,0,0]);
   results.push('best-time POST native original '+stage+' wait retires25s and drains before cleanup without later queries or writes');
  }
  {const h=fixture({held:'plan'}),request=h.post();await h.started.promise;h.signal.abort();assert.equal((await request).status,503);const n=h.calls.length;h.gate.resolve();await h.transaction.catch(()=>{});assert.equal(h.calls.length,n);}
  results.push('best-time POST native abort during plan retires HTTP original without dispatching quota');
  for(const stage of ['history','ack']){
   const h=fixture({held:stage}),request=h.post();await h.started.promise;h.expire();h.gate.resolve();assert.equal((await request).status,403);assert.equal((await prisma.subscription.findUnique({where:{userId:owner.id}})).currentPeriodEnd.toISOString(),period.toISOString());
   results.push('best-time POST native declared manual date expires during '+stage+' without refresh or inferred access');
  }
  {const h=fixture({held:'owner'}),request=h.post();await h.started.promise;h.session.user.id=users[1].id;h.session.user.email=users[1].email;h.gate.resolve();assert.equal((await request).status,503);}
  results.push('best-time POST native original owner identity cannot be retargeted by mutable session');
  const concurrent=await Promise.all([fixture().post(),fixture().post()]);assert.deepEqual(concurrent.map(r=>r.status),[503,503]);assert.deepEqual(await rowCounts(),[0,0,0,0]);assert.deepEqual(await prisma.bestTimeAnalysis.findUnique({where:{userId:owner.id}}),originalCache);
  assert.equal(await prisma.generation.count({where:{userId:users[1].id}}),0);
  results.push('best-time POST native concurrent originals both remain denied, with own/neighbor data and cached analyzedAt epoch intact');
 }finally{await Promise.allSettled(pending);await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
