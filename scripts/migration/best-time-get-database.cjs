'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {cache}=require('./best-time-get.test.cjs'),{deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([0,1,2].map(i=>prisma.user.create({data:{email:'best-time-'+randomUUID()+'@example.invalid',name:'Synthetic best time '+i}})));
 const owner={id:users[0].id,email:users[0].email},neighbor={id:users[1].id,email:users[1].email},pending=[];
 const sample=cache();sample.heatmap[1][8]=100;sample.topSlots=[{day:1,hour:8,score:100,videoCount:3}];sample.aiTip={es:'Consejo guardado',en:'Retained advice'};
 const create=(user,c)=>prisma.bestTimeAnalysis.create({data:{...c,userId:user.id}});
 function fixture(options={}){
  let elapsed=0,next=0,originalTransaction;const calls=[],timers=new Map(),gate=deferred(),started=deferred(),controller=new AbortController();
  const session=options.session??{user:{...owner}},hold=async(stage,operation)=>{calls.push(stage);const value=await operation();if(options.held===stage){started.resolve(value);await gate.promise;}return value;};
  const sql={$transaction:(fn,opts)=>{
   originalTransaction=prisma.$transaction(async tx=>{
    const readonly=async command=>hold('read-only',async()=>{const r=await tx.$executeRawUnsafe(command);assert.equal((await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS ro"))[0].ro,'on');return r;});
    const value=await fn({$executeRawUnsafe:readonly,
     user:{findUnique:input=>hold('owner',()=>tx.user.findUnique(input))},
     bestTimeAnalysis:{findUnique:input=>hold('cache',()=>tx.bestTimeAnalysis.findUnique(input))}});
    return value;
   },opts).then(value=>hold('ack',()=>Promise.resolve(value)));
   pending.push(originalTransaction);void originalTransaction.catch(()=>{});return originalTransaction;
  }};
  const forbidden=()=>{throw Error('GET must not invoke provider, plans, tokens or writes');};
  const route=load('app/api/youtube/best-time/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma:sql},'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/plans':{getUserPlan:forbidden,isPaid:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden}},{performance:{now:()=>elapsed},setTimeout(fn,ms){const id=++next;assert.equal(ms,25000);timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  return {session,calls,gate,started,timers,controller,get transaction(){return originalTransaction;},get:()=>route.GET(new Request('https://example.invalid/api/youtube/best-time',{signal:controller.signal})),retire(){elapsed=25000;for(const fn of [...timers.values()])fn();}};
 }
 try{
  await create(users[0],sample);await create(users[1],{...sample,aiTip:{es:'Privado vecino',en:'Neighbor private'},analyzedAt:new Date('2001-01-01')});
  const before=await prisma.bestTimeAnalysis.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{userId:'asc'}});
  const a=fixture(),r=await a.get(),body=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(body.owner,owner);assert.equal(body.data.aiTip.es,'Consejo guardado');assert.equal(body.data.analyzedAt,'1970-01-01T00:00:00.000Z');assert.equal(a.timers.size,0);
  results.push('best-time GET native read-only transaction returns exact own cached shape and original epoch date, without provider or write');
  const b=fixture({session:{user:neighbor}}),nb=await (await b.get()).json();assert.deepEqual(nb.owner,neighbor);assert.equal(nb.data.aiTip.es,'Privado vecino');
  results.push('best-time GET native neighboring owner receives only its cache');
  const missing=fixture({session:{user:{id:users[2].id,email:users[2].email}}});assert.deepEqual(await (await missing.get()).json(),{owner:{id:users[2].id,email:users[2].email},data:null});
  results.push('best-time GET native own cache absence never falls back to neighbor or producer');
  const mismatched=fixture({session:{user:{id:owner.id,email:neighbor.email}}});assert.equal((await mismatched.get()).status,401);assert.equal(mismatched.calls.includes('cache'),false);
  results.push('best-time GET native ID/email mismatch denies before cache query');
  const gone=fixture({session:{user:{id:'missing',email:'missing-'+randomUUID()+'@example.invalid'}}});assert.equal((await gone.get()).status,404);assert.equal(gone.calls.includes('cache'),false);
  results.push('best-time GET native absent owner remains explicit, without cache query');
  for(const stage of ['read-only','owner','cache','ack'])for(const mode of ['deadline','abort']){
   const h=fixture({held:stage}),request=h.get();await h.started.promise;
   if(mode==='deadline')h.retire();else h.controller.abort();const response=await request;assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);const count=h.calls.length;
   h.gate.resolve();await h.transaction.catch(()=>{});await flush();assert.equal(h.calls.length,count);assert.equal(response.status,503);
   results.push('best-time GET native '+stage+' original '+mode+' retires HTTP and drains before cleanup, no late dispatch or success');
  }
  const mutable=fixture({held:'owner'}),request=mutable.get();await mutable.started.promise;mutable.session.user.id=neighbor.id;mutable.session.user.email=neighbor.email;mutable.gate.resolve();assert.deepEqual((await (await request).json()).owner,owner);
  results.push('best-time GET native owner captured before wait cannot be retargeted by mutable session');
  assert.deepEqual(await prisma.bestTimeAnalysis.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{userId:'asc'}}),before);
  for(const changes of [{heatmap:[]},{topSlots:[{day:7,hour:0,score:100,videoCount:3}]},{aiTip:{es:'missing en'}},{videoCount:51}]){
   await prisma.bestTimeAnalysis.update({where:{userId:owner.id},data:changes});const h=fixture();assert.equal((await h.get()).status,503);assert.equal((await prisma.bestTimeAnalysis.findUnique({where:{userId:neighbor.id}})).aiTip.es,'Privado vecino');
   await prisma.bestTimeAnalysis.update({where:{userId:owner.id},data:{heatmap:sample.heatmap,topSlots:sample.topSlots,aiTip:sample.aiTip,videoCount:sample.videoCount}});
  }
  results.push('best-time GET native malformed JSON/count caches deny without repairing data, changing dates or touching neighbor');
  assert.deepEqual(await prisma.bestTimeAnalysis.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{userId:'asc'}}),before);
  assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
  results.push('best-time GET all own and neighboring cached rows/dates remain unchanged; no generation effects or operational provenance');
 }finally{await Promise.allSettled(pending);await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
