'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const identity={id:'stats-one',email:'stats-one@example.invalid'};
function selected(){return{...identity,name:'Original name',lang:'es',createdAt:new Date('2026-01-01T00:00:00Z'),password:'NEVER_PUBLIC'};}
function fixture(options={}){
 let now=0,serial=0;const calls=[],replies=[],timers=new Map(),controller=new AbortController(),user=options.user===undefined?{...identity}:options.user;
 const values={user:selected(),total:3,quota:{recorded:2,reserved:1,total:3},tips:1,subscription:null,dates:[],...options.values};
 const invoke=async(name,q)=>{calls.push({name,q});return options.stages?.[name]?options.stages[name](q):values[name];};
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:{}}});
 const route=load('app/api/user/stats/route.ts',{
  'next/server':{NextResponse:{json(body,init){replies.push({body,init});return options.reply?options.reply(body,init):Response.json(body,init);}}},
  '@/auth':{auth:()=>invoke('auth').then(()=>options.auth?options.auth():user?{user}:null)},
  '@/lib/prisma':{prisma:{
   user:{findUnique:q=>invoke('user',q)},
   generation:{count:q=>invoke(q.where.template?'tips':'total',q),findMany:q=>invoke('dates',q)},
   subscription:{findUnique:q=>invoke('subscription',q)}
  }},
  '@/lib/plans':plans,
  '@/lib/generation-quota':{readGenerationQuotaSnapshot:(id,month)=>invoke('quota',{id,month})}
 },{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 if(options.aborted)controller.abort();
 const request=new Request('https://example.invalid/api/user/stats',{signal:controller.signal}),original=route.GET(request);
 return{original,calls,replies,timers,controller,user,values,advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
async function unavailable(f){const r=await f.original;assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'Estadísticas no disponibles'});assert.equal(f.timers.size,0);return r;}
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 await test('public own stats preserve quota/reservations/tips and discard private user fields',async()=>{
  const f=fixture(),r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(b.user,{...identity,name:'Original name',lang:'es',createdAt:'2026-01-01T00:00:00.000Z'});
  assert.equal(b.stats.generationsReserved,1);assert.equal(b.stats.quotaOccupied,3);assert.equal(b.stats.remaining,7);assert.equal(b.stats.videoTipsRemaining,0);assert.equal(b.subscription,null);assert.equal(f.timers.size,0);
  assert.deepEqual(f.calls.map(c=>c.name),['auth','user','total','quota','tips','subscription','dates']);
  for(const c of f.calls.filter(c=>['total','tips','subscription','dates'].includes(c.name)))assert.equal(c.q.where.userId,identity.id);
  assert.equal(f.calls.find(c=>c.name==='quota').q.id,identity.id);assert.equal(f.calls.find(c=>c.name==='user').q.where.email,identity.email);
  assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));
 });
 await test('actual zero snapshot requires successful zero reads and remains coherent',async()=>{
  const f=fixture({values:{total:0,quota:{recorded:0,reserved:0,total:0},tips:0}}),b=await(await f.original).json();
  assert.equal(b.stats.totalGenerations,0);assert.equal(b.stats.quotaOccupied,0);assert.equal(b.stats.remaining,10);assert.equal(b.stats.videoTipsRemaining,1);
 });
 await test('all-time history and quota snapshots need no false cross-query equality',async()=>{
  const f=fixture({values:{total:0,quota:{recorded:2,reserved:1,total:3}}}),r=await f.original;assert.equal(r.status,200);assert.equal((await r.json()).stats.remaining,7);
 });
 for(const [name,user]of [['null',null],['no id',{email:identity.email}],['no email',{id:identity.id}],['non-string id',{id:12,email:identity.email}],['non-string email',{id:identity.id,email:12}]])
 await test('unauthenticated '+name+' returns no-store401 without storage',async()=>{const f=fixture({user}),r=await f.original;assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'No autorizado'});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,1);});
 await test('missing own user returns no-store404 before parallel reads',async()=>{const f=fixture({values:{user:null}}),r=await f.original;assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,2);});
 for(const field of ['id','email'])await test('discordant selected '+field+' returns401 before quota/SQL dispatch',async()=>{const f=fixture({values:{user:{...selected(),[field]:'foreign'}}}),r=await f.original;assert.equal(r.status,401);assert.equal(f.calls.length,2);});
 for(const stage of ['auth','user','total','quota','tips','subscription','dates']){
  await test(stage+' held25s retires original HTTP wait without empty/zero/retry',async()=>{
   const g=deferred(),f=fixture({stages:{[stage]:()=>g.promise}});await flush();f.advance(25000);await unavailable(f);
   const at=f.calls.length;g.resolve(stage==='auth'?undefined:f.values[stage]);await flush();assert.equal(f.calls.length,at);assert.equal(f.calls.filter(c=>c.name===stage).length,1);assert(!f.replies.some(r=>r.init.status===200));
  });
  await test(stage+' rejects privately with terminal503 and no diagnostics',async()=>{const f=fixture({stages:{[stage]:async()=>{throw Error('NEVER_PUBLIC private credential');}}});await unavailable(f);});
  await test(stage+' abort retires HTTP wait without redispatch',async()=>{
   const g=deferred(),f=fixture({stages:{[stage]:()=>g.promise}});await flush();f.controller.abort();await unavailable(f);const at=f.calls.length;g.resolve(stage==='auth'?undefined:f.values[stage]);await flush();assert.equal(f.calls.length,at);assert(!f.replies.some(r=>r.init.status===200));
  });
 }
 await test('already aborted request never authenticates or touches SQL',async()=>{const f=fixture({aborted:true});await unavailable(f);assert.equal(f.calls.length,0);});
 await test('auth20s/user4s/parallel1s share one25s budget',async()=>{
  const a=deferred(),u=deferred(),q=deferred(),f=fixture({stages:{auth:()=>a.promise,user:()=>u.promise,quota:()=>q.promise}});
  await flush();f.advance(20000);a.resolve();await flush();f.advance(4000);u.resolve(selected());await flush();f.advance(1000);await unavailable(f);q.resolve(f.values.quota);await flush();assert(!f.replies.some(r=>r.init.status===200));
 });
 await test('monotonic expired clock rejects a stage even before timer callback fires',async()=>{const g=deferred(),f=fixture({stages:{user:()=>g.promise}});await flush();f.advance(25000,false);g.resolve(selected());await unavailable(f);assert.equal(f.calls.length,2);});
 await test('captured session and selected user stay immutable while quota remains pending',async()=>{
  const u=deferred(),q=deferred(),row=selected(),f=fixture({stages:{user:()=>u.promise,quota:()=>q.promise}});
  await flush();Object.assign(f.user,{id:'foreign',email:'foreign@example.invalid'});u.resolve(row);await flush();
  Object.assign(row,{id:'foreign',email:'foreign@example.invalid',name:'Foreign name',lang:'en'});row.createdAt.setFullYear(2040);q.resolve(f.values.quota);
  const r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(b.user.id,identity.id);assert.equal(b.user.email,identity.email);assert.equal(b.user.name,'Original name');assert.equal(b.user.createdAt,'2026-01-01T00:00:00.000Z');
  for(const c of f.calls.filter(c=>c.q?.where?.userId))assert.equal(c.q.where.userId,identity.id);
 });
 for(const plan of ['pro','business'])for(const active of [true,false])await test(plan+(active?' active':' expired')+' manual expiry policy keeps customer marker internal',async()=>{
  const subscription={status:'active',plan,cancelAtPeriodEnd:true,currentPeriodEnd:new Date(Date.now()+(active?86400000:-86400000)),stripeCustomerId:'manual_admin',token:'NEVER_PUBLIC'},f=fixture({values:{subscription}}),r=await f.original,b=await r.json();
  assert.equal(r.status,200);assert.equal(b.stats.plan,active?plan:'free');assert.equal(b.stats.limit,active?(plan==='pro'?200:999999):10);assert.equal(b.stats.videoTipsRemaining,active?null:0);assert.equal(b.subscription.cancelAtPeriodEnd,true);
  assert.deepEqual(Object.keys(b.subscription).sort(),['cancelAtPeriodEnd','currentPeriodEnd','plan','status']);assert(!JSON.stringify(b).includes('manual_admin'));assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));
 });
 await test('Stripe active plan retains paid access without manual expiry requirement',async()=>{const f=fixture({values:{subscription:{status:'trialing',plan:'pro',cancelAtPeriodEnd:false,currentPeriodEnd:null,stripeCustomerId:'NEVER_PUBLIC'}}}),r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(b.stats.plan,'pro');assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));});
 await test('early quota/subscription/date results cannot mutate while another SQL branch waits',async()=>{
  const g=deferred(),quota={recorded:2,reserved:1,total:3},end=new Date(Date.now()+86400000),created=new Date(),subscription={status:'active',plan:'pro',cancelAtPeriodEnd:false,currentPeriodEnd:end,stripeCustomerId:'manual_admin'};
  const f=fixture({values:{quota,subscription,dates:[{createdAt:created}]},stages:{total:()=>g.promise}});await flush();
  Object.assign(quota,{recorded:100,reserved:100,total:200});subscription.plan='business';end.setFullYear(2000);created.setFullYear(2000);g.resolve(3);
  const b=await(await f.original).json();assert.equal(b.stats.plan,'pro');assert.equal(b.stats.remaining,197);assert.equal(b.stats.streak,1);
 });
 const bad=[
  ['total negative',{total:-1}],['total fraction',{total:1.5}],['total overflow',{total:Number.MAX_SAFE_INTEGER+1}],['tips missing',{tips:undefined}],
  ['quota missing',{quota:undefined}],['quota negative',{quota:{recorded:2,reserved:-1,total:1}}],['quota incoherent',{quota:{recorded:2,reserved:1,total:2}}],
  ['quota overflow',{quota:{recorded:Number.MAX_SAFE_INTEGER,reserved:1,total:Number.MAX_SAFE_INTEGER}}],
  ['user name object',{user:{...selected(),name:{private:'NEVER_PUBLIC'}}}],['user date invalid',{user:{...selected(),createdAt:new Date('invalid')}}],
  ['date invalid',{dates:[{createdAt:new Date('invalid')}]}],['subscription incomplete',{subscription:{status:'active',plan:'pro'}}]
 ];
 for(const[name,values]of bad)await test(name+' fails closed without fabricated counts or private projection',async()=>{await unavailable(fixture({values}));});
 for(const action of ['timeout','abort','reject'])await test('public JSON acknowledgement '+action+' remains inside common wait',async()=>{
  const g=deferred(),f=fixture({reply:(body,init)=>init.status===200?g.promise:Response.json(body,init)});await flush();
  if(action==='timeout')f.advance(25000);else if(action==='abort')f.controller.abort();else g.reject(Error('NEVER_PUBLIC'));
  await unavailable(f);if(action!=='reject'){g.resolve(Response.json({late:true}));await flush();}assert.equal(f.calls.length,7);
 });
 await test('JSON serialization crossing25s cannot yield late200 even without timer firing',async()=>{
  let f;f=fixture({reply:(body,init)=>{if(init.status===200)f.advance(25000,false);return Response.json(body,init);}});await unavailable(f);
 });
 console.log(JSON.stringify({status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual stats GET / synthetic auth, SQL and monotonic clock / no effects',results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
module.exports={fixture,selected,identity};if(require.main===module)run();
