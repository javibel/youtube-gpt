'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],instances=[],gates=[],running=[];
 const counts=async()=>({users:await prisma.user.count(),generations:await prisma.generation.count(),images:await prisma.legacyThumbnailAttempt.count(),texts:await prisma.textGenerationAttempt.count(),subscriptions:await prisma.subscription.count(),profiles:await prisma.profileUpdateAttempt.count()});
 const baseline=await counts(),plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const decoder=load('lib/use-dashboard-stats.ts',{'react':{},'@/lib/client-read-wait':load('lib/client-read-wait.ts')}).decodeDashboardStats;
 function bind(user,options={}){
  let now=0,serial=0;const timers=new Map(),calls=[],replies=[],controller=new AbortController(),entered=deferred(),gate=deferred();gates.push(gate);
  const query=(name,fn)=>{calls.push(name);const p=(async()=>{if(options.held===name&&name==='auth'){entered.resolve();await gate.promise;}const value=await fn();if(options.held===name&&name!=='auth'){entered.resolve();await gate.promise;}if(options.reject===name)throw Error('NEVER_PUBLIC private SQL acknowledgement');return value;})();running.push(p);void p.catch(()=>{});return p;};
  const db={user:{findUnique:q=>query('user',()=>prisma.user.findUnique(q))},generation:{count:q=>query(q.where.template?'tips':'total',()=>prisma.generation.count(q)),findMany:q=>query('dates',()=>prisma.generation.findMany(q))},subscription:{findUnique:q=>query('subscription',()=>prisma.subscription.findUnique(q))}};
  const quota=require('./generation-quota-fixture.cjs')(prisma);
  const route=load('app/api/user/stats/route.ts',{
   'next/server':{NextResponse:{json(body,init){replies.push(init.status);if(init.status===200&&options.held==='JSON'){entered.resolve();return gate.promise.then(()=>Response.json(body,init));}return Response.json(body,init);}}},
   '@/auth':{auth:()=>query('auth',async()=>options.session===undefined?{user:{id:user.id,email:user.email}}:options.session)},
   '@/lib/prisma':{prisma:db},'@/lib/plans':plans,
   '@/lib/generation-quota':{readGenerationQuotaSnapshot:(...args)=>query('quota',()=>quota.readGenerationQuotaSnapshot(...args))}
  },{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  const original=route.GET(new Request('https://example.invalid/api/user/stats',{signal:controller.signal}));running.push(original);void original.catch(()=>{});
  const x={original,controller,gate,entered,calls,replies,timers,advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};instances.push(x);return x;
 }
 async function settle(){let n=0;while(n<running.length){const list=running.slice(n);n=running.length;await Promise.allSettled(list);await flush();}}
 async function unavailable(x){const r=await x.original;assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'Estadísticas no disponibles'});assert.equal(x.timers.size,0);}
 try{
  const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'stats-deadline-'+randomUUID()+'@example.invalid',name:'Synthetic '+i,lang:'es',password:'NEVER_PUBLIC'}})));ids.push(...users.map(u=>u.id));
  const now=new Date();await prisma.generation.createMany({data:[{userId:users[0].id,template:'title',createdAt:now},{userId:users[0].id,template:'video_preview',createdAt:now},{userId:users[0].id,template:'title',createdAt:new Date(now.getTime()-90*86400000)},{userId:users[1].id,template:'title',createdAt:now}].map(x=>({...x,inputs:{},output:'Synthetic',tokensUsed:0}))});
  const reserved=await prisma.legacyThumbnailAttempt.create({data:{id:randomUUID(),userId:users[0].id,digest:'synthetic',state:'pending',createdAt:now}});
  const sub=await prisma.subscription.create({data:{userId:users[0].id,status:'active',plan:'business',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(now.getTime()+86400000),cancelAtPeriodEnd:true}});
  const seeded=await counts();
  {
   const x=bind(users[0]),r=await x.original,b=await r.json(),d=decoder(b,users[0].id,users[0].email);
   assert.equal(r.status,200);assert.equal(d.stats.totalGenerations,3);assert.equal(d.stats.generationsThisMonth,2);assert.equal(d.stats.generationsReserved,1);assert.equal(d.stats.remaining,999996);assert.equal(d.stats.plan,'business');assert.equal(d.stats.videoTipsRemaining,null);
   assert.equal(b.user.lang,'es');assert.equal(b.subscription.cancelAtPeriodEnd,true);assert(!JSON.stringify(b).includes('manual_admin'));assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));assert.equal(r.headers.get('cache-control'),'no-store');
   results.push('Stats read native actual own PostgreSQL/dashboard decoder preserve business/occupancy/reservation/tips/lang; private customer/password absent from HTTP projection');
  }
  await prisma.subscription.update({where:{id:sub.id},data:{currentPeriodEnd:new Date(now.getTime()-86400000)}});
  {
   const x=bind(users[0]),b=await(await x.original).json();assert.equal(b.stats.plan,'free');assert.equal(b.stats.remaining,7);assert.equal(b.stats.videoTipsRemaining,0);assert.equal(b.subscription.cancelAtPeriodEnd,true);
   results.push('Stats read native stored manual expiry and cancellation preserve confirmed Free limits without exposing billing marker');
  }
  for(const held of ['auth','user','total','quota','tips','subscription','dates','JSON'])for(const retire of ['timeout','abort']){
   const x=bind(users[0],{held});await x.entered.promise;if(retire==='timeout')x.advance(25000);else x.controller.abort();await unavailable(x);
   const at=x.calls.length;x.gate.resolve();await settle();assert.equal(x.calls.length,at);if(held!=='JSON')assert(!x.replies.includes(200));assert.deepEqual(await counts(),seeded);assert.equal(await prisma.legacyThumbnailAttempt.count({where:{id:reserved.id,state:'pending'}}),1);
   results.push('Stats read native '+held+'/'+retire+' same original query/HTTP25s terminal503; no late next stage, duplicate SQL, writes, zero quota or reservation release');
  }
  for(const reject of ['user','total','quota','tips','subscription','dates']){
   const x=bind(users[0],{reject});await unavailable(x);await settle();assert.deepEqual(await counts(),seeded);
   results.push('Stats read native '+reject+' real read acknowledgement failure remains private503 and leaves data/occupancy unchanged');
  }
  {
   const x=bind(users[0],{session:{user:{id:users[1].id,email:users[0].email}}});assert.equal((await x.original).status,401);assert.deepEqual(x.calls,['auth','user']);
   const y=bind(users[0],{session:{user:{id:users[0].id,email:users[1].email}}});assert.equal((await y.original).status,401);assert.deepEqual(y.calls,['auth','user']);
   results.push('Stats read native discordant authenticated ID/email denied before own parallel quota/history/subscription dispatch');
  }
  {
   // Hold the genuine row lock, retire the HTTP wait, then observe completion of
   // the same quota transaction. Timing/PID/this read confers no reclaim authority.
   const locked=deferred(),unlock=deferred(),quotaEntered=deferred();gates.push(unlock);
   const lock=prisma.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM users WHERE id=$1 FOR UPDATE',users[0].id);locked.resolve();await unlock.promise;},{timeout:15000});running.push(lock);await locked.promise;
   let clock=0,serial=0;const timers=new Map(),originalQuota=require('./generation-quota-fixture.cjs')(prisma);let quotaCalls=0,quotaSettled=false;
   const q=load('app/api/user/stats/route.ts',{
    'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:users[0].id,email:users[0].email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,
    '@/lib/generation-quota':{readGenerationQuotaSnapshot(...args){quotaCalls++;const p=originalQuota.readGenerationQuotaSnapshot(...args).then(v=>{quotaSettled=true;return v;});running.push(p);quotaEntered.resolve();return p;}}
   },{performance:{now:()=>clock},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id)});
   const original=q.GET();running.push(original);await quotaEntered.promise;clock=25000;for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}
   await unavailable({original,timers});assert.equal(quotaSettled,false);unlock.resolve();await settle();assert.equal(quotaSettled,true);assert.equal(quotaCalls,1);
   assert.equal((await prisma.legacyThumbnailAttempt.findUnique({where:{id:reserved.id}})).state,'pending');assert.deepEqual(await counts(),seeded);
   results.push('Stats read native genuine PostgreSQL owner lock/HTTP retirement leaves quota transaction original pending; same transaction completes after unlock, no reclaim, cancellation, writes or second dispatch');
  }
  {
   const x=bind(users[1]),b=await(await x.original).json();assert.equal(b.user.id,users[1].id);assert.equal(b.stats.totalGenerations,1);assert.equal(b.stats.generationsReserved,0);assert.equal(b.stats.remaining,9);
   results.push('Stats read native other account has independently confirmed counts and no foreign reservation after retired own reads');
  }
 }finally{
  for(const gate of gates)gate.resolve();await settle();for(const x of instances)assert.equal(x.timers.size,0);await prisma.user.deleteMany({where:{id:{in:ids}}});
  assert.deepEqual(await counts(),baseline);
 }
 results.push('Stats read native fixture cleanup restores original PostgreSQL counts; no schema, operational data, model, email or external effects');
};
