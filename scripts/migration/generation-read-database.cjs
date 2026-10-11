'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],gates=[],running=[],instances=[];
 const counts=async()=>({users:await prisma.user.count(),generations:await prisma.generation.count(),images:await prisma.legacyThumbnailAttempt.count(),texts:await prisma.textGenerationAttempt.count(),profiles:await prisma.profileUpdateAttempt.count()});
 const baseline=await counts(),usage=load('lib/ai/history-usage.ts');
 function bind(user,options={}){
  let now=0,serial=0;const calls=[],replies=[],timers=new Map(),controller=new AbortController(),entered=deferred(),gate=deferred();gates.push(gate);
  const query=(name,fn)=>{calls.push(name);const p=(async()=>{if(options.held===name&&name==='auth'){entered.resolve();await gate.promise;}if(options.onDispatch)options.onDispatch(name);const value=await fn();if(options.held===name&&name!=='auth'){entered.resolve();await gate.promise;}if(options.reject===name)throw Error('NEVER_PUBLIC read acknowledgement');return value;})();running.push(p);void p.catch(()=>{});return p;};
  const db={user:{findUnique:q=>query('user',()=>prisma.user.findUnique(q))},generation:{count:q=>query('total',()=>prisma.generation.count(q)),findMany:q=>query('rows',()=>prisma.generation.findMany(q))}};
  const route=load('app/api/user/generations/route.ts',{
   'next/server':{NextResponse:{json(body,init){replies.push(init.status);if(init.status===200&&options.held==='JSON'){entered.resolve();return gate.promise.then(()=>Response.json(body,init));}return Response.json(body,init);}}},
   '@/auth':{auth:()=>query('auth',async()=>options.session===undefined?{user:{id:user.id,email:user.email}}:options.session)},
   '@/lib/prisma':{prisma:db},'@/lib/ai/history-usage':usage
  },{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  const original=route.GET({nextUrl:new URL('https://example.invalid/api/user/generations?page='+(options.page??1)),signal:controller.signal});running.push(original);void original.catch(()=>{});
  const x={original,controller,gate,entered,calls,replies,timers,advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};instances.push(x);return x;
 }
 async function settle(){let n=0;while(n<running.length){const list=running.slice(n);n=running.length;await Promise.allSettled(list);await flush();}}
 async function unavailable(x){const r=await x.original;assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'Historial no disponible'});assert.equal(x.timers.size,0);}
 try{
  const users=await Promise.all([1,2,3].map(i=>prisma.user.create({data:{email:'generation-read-'+randomUUID()+'@example.invalid',name:'Synthetic '+i,password:'NEVER_PUBLIC'}})));ids.push(...users.map(u=>u.id));
  const prefix='generation-read-'+randomUUID()+'-',createdAt=new Date('2026-01-01T00:00:00Z');
  await prisma.generation.createMany({data:Array.from({length:23},(_,i)=>({id:prefix+String(i).padStart(2,'0'),userId:users[0].id,template:'title',inputs:{tema:'Synthetic '+i,nested:{value:i}},output:'Synthetic '+i,tokensUsed:i===21?17:0,createdAt,ipAddress:'NEVER_PUBLIC'}))});
  const other=await prisma.generation.create({data:{userId:users[1].id,template:'title',inputs:{},output:'Other synthetic',tokensUsed:0}});
  const seeded=await counts();
  {
   const bodies=[];for(const page of [1,2,3,4,1000000]){const x=bind(users[0],{page}),r=await x.original;assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');bodies.push(await r.json());assert.equal(x.timers.size,0);}
   assert.deepEqual(bodies.map(b=>b.generations.length),[10,10,3,0,0]);assert.deepEqual(bodies.map(b=>b.hasMore),[true,true,false,false,false]);assert(bodies.every(b=>b.total===23));assert.equal(bodies[0].generations[0].id,prefix+'22');assert.equal(bodies[0].generations[1].tokensUsed,17);assert.equal(bodies[0].generations[0].tokensUsed,null);
   const combined=bodies.flatMap(b=>b.generations);assert.equal(new Set(combined.map(g=>g.id)).size,23);assert(!JSON.stringify(bodies).includes('NEVER_PUBLIC'));assert(!combined.some(g=>g.id===other.id));assert.equal(bodies[0].generations[0].inputs.nested.value,22);
   results.push('Generation read native own23 rows preserve all pages/upper bound/tied-date order/nested JSON/nullable usage without foreign rows, IP or password');
  }
  {const x=bind(users[2]),r=await x.original;assert.equal(r.status,200);assert.deepEqual(await r.json(),{generations:[],total:0,page:1,hasMore:false});results.push('Generation read native truly empty third account requires successful count/page rather than manufactured empty fallback');}
  for(const held of ['auth','user','total','rows','JSON'])for(const action of ['timeout','abort']){
   const x=bind(users[0],{held});await x.entered.promise;if(action==='timeout')x.advance(25000);else x.controller.abort();await unavailable(x);
   const at=x.calls.length;x.gate.resolve();await settle();assert.equal(x.calls.length,at);if(held!=='JSON')assert(!x.replies.includes(200));assert.equal(x.calls.filter(c=>c===held).length,held==='JSON'?0:1);assert.deepEqual(await counts(),seeded);
   results.push('Generation read native '+held+'/'+action+' retires HTTP25s, observes same original SQL/ack after release, no later stages, second dispatch or data changes');
  }
  for(const reject of ['user','total','rows']){const x=bind(users[0],{reject});await unavailable(x);await settle();assert.deepEqual(await counts(),seeded);results.push('Generation read native '+reject+' real PostgreSQL acknowledgement failure returns private503 and preserves existing data');}
  for(const field of ['id','email']){
   const session={user:{id:users[0].id,email:users[0].email,[field]:users[1][field]}},x=bind(users[0],{session});assert.equal((await x.original).status,401);assert.deepEqual(x.calls,['auth','user']);
   results.push('Generation read native discordant '+field+' denies history/count before dispatch');
  }
  {
   const locked=deferred(),unlock=deferred();gates.push(unlock);
   const lock=prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('LOCK TABLE generations IN ACCESS EXCLUSIVE MODE');locked.resolve();await unlock.promise;},{timeout:15000});running.push(lock);await locked.promise;
   const dispatched=deferred();let reads=0;const x=bind(users[0],{onDispatch:name=>{if(name==='total'||name==='rows'){reads++;if(reads===2)dispatched.resolve();}}});await dispatched.promise;await flush();assert.equal(x.replies.length,0);x.advance(25000);await unavailable(x);unlock.resolve();await settle();
   assert.equal(reads,2);assert.deepEqual(x.calls,['auth','user','total','rows']);assert(!x.replies.includes(200));assert.deepEqual(await counts(),seeded);
   results.push('Generation read native genuine PostgreSQL table lock holds both original reads past HTTP deadline; both settle after unlock with no cancellation, replay, writes or late200');
  }
  {
   const x=bind(users[0],{held:'total'});await x.entered.promise;await flush();
   await prisma.generation.create({data:{userId:users[0].id,template:'title',inputs:{},output:'Concurrent synthetic',tokensUsed:0}});
   x.gate.resolve();const b=await(await x.original).json();assert.equal(b.total,23);assert.equal(b.generations.length,10);assert.equal(await prisma.generation.count({where:{userId:users[0].id}}),24);
   results.push('Generation read native count/page keep their observed values while a concurrent synthetic writer changes total; no invented transactional equality');
  }
  {const x=bind(users[1]),b=await(await x.original).json();assert.equal(b.total,1);assert.equal(b.generations[0].id,other.id);results.push('Generation read native independent second account remains isolated after retired first-account reads');}
 }finally{
  for(const gate of gates)gate.resolve();await settle();for(const x of instances)assert.equal(x.timers.size,0);await prisma.user.deleteMany({where:{id:{in:ids}}});assert.deepEqual(await counts(),baseline);
 }
 results.push('Generation read native cleanup by own fixture IDs restores original PostgreSQL counts; no schema, operational data, model, email or external effects');
};
