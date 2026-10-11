'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness:server}=require('./optimize-get-server.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),{create,ready,open,reads,input,retry,choose}=require('./optimize-read-client.test.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[];
 async function newOwner(plan='pro',token=true){
  const u=await prisma.user.create({data:{email:'optimize-read-'+randomUUID()+'@example.invalid'}});users.push(u.id);
  await prisma.subscription.create({data:{userId:u.id,plan,status:plan==='free'?'canceled':'active'}});
  if(token)await prisma.youtubeToken.create({data:{userId:u.id,accessToken:'synthetic-token',refreshToken:null,expiresAt:new Date('2026-11-01T00:00:00Z'),channelId:'UC_synthetic'}});
  return u;
 }
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 function bind(u,options={}){
  const h=create();h.state.user=u.id;h.state.email=u.email;pages.push(h);const originals=[],owned=[],listOwned=[],entered=deferred();
  h.state.send=r=>{
   assert.equal(r.init.method,'GET','No mutation/model calls permitted');
   const p=(async()=>{
    const id=new URL(r.url,'https://example.invalid').searchParams.get('videoId');
    const native=server({userId:u.id,email:u.email,detail:id!==null,videoId:id??undefined,realToken:true,
     authReader:()=>prisma.user.findUnique({where:{id:r.owner},select:{id:true,email:true}}).then(user=>user?{user}:null),
     planReader:id=>plans.getUserPlan(id),tokenReader:q=>prisma.youtubeToken.findUnique(q),tokenWriter:()=>{throw Error('No OAuth refresh permitted in native reader test');},historyReader:q=>prisma.optimizeHistory.findMany(q),partial:options.partial});
    originals.push({id,native});const res=await native.original,b=await res.json();options.corrupt?.(b,id);
    if(id===(Object.hasOwn(options,'target')?options.target:'synthetic01'))entered.resolve();
    if(options.held==='headers'&&id===options.target)await options.gate.promise;
    return{ok:res.ok,status:res.status,json:()=>options.held==='JSON'&&id===options.target?options.gate.promise.then(()=>b):Promise.resolve(b)};
   })();owned.push(p);if(!r.url.includes('?'))listOwned.push(p);return p;
  };
  const settle=async()=>{let n=0;do{const batch=owned.slice(n);n=owned.length;await Promise.all(batch);await ready(h);}while(n<owned.length);};
  const select=async(id='synthetic01')=>{await ready(h);await Promise.all(listOwned);await ready(h);const b=choose(h,id);assert(b);b.props.onClick();await ready(h);};
  return{h,originals,owned,entered,settle,select};
 }
 try{
  const owner=await newOwner(),neighbor=await newOwner();
  await prisma.optimizeHistory.createMany({data:[
   {userId:owner.id,videoId:'synthetic01',field:'title',oldValue:'Own original history',newValue:'Own revised history',scoreBefore:0,scoreAfter:35,viewsBefore:0,createdAt:new Date('2026-10-01T00:00:00Z')},
   {userId:owner.id,videoId:'synthetic02',field:'description',oldValue:'Other selection history',newValue:'Other description',createdAt:new Date('2026-10-01T00:00:00Z')},
   {userId:neighbor.id,videoId:'synthetic01',field:'title',oldValue:'Neighbor secret history',newValue:'Neighbor revised',createdAt:new Date('2026-10-01T00:00:00Z')}]});
  const beforeRows=await prisma.optimizeHistory.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeOwner=await prisma.user.findUnique({where:{id:owner.id}}),beforeNeighbor=await prisma.user.findUnique({where:{id:neighbor.id}}),beforeTokens=await prisma.youtubeToken.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}});
  const beforeGenerations=await prisma.generation.count(),beforeAdmissions=await prisma.competitorCreationAttempt.count(),beforeExtensions=await prisma.extensionEvent.count();
  {
   const x=bind(owner);await x.select();await x.settle();assert(input(x.h));assert(x.h.text().includes('Own original history'));assert(!x.h.text().includes('Neighbor secret history'));assert(!x.h.text().includes('Other selection history'));assert(x.h.text().includes('2026'));assert.equal(x.h.timers.size,0);
   assert.equal(reads(x.h).length,1);assert.equal(reads(x.h,'synthetic01').length,1);assert.equal(x.originals[1].native.queries[0].where.userId,owner.id);assert.equal(x.originals[1].native.queries[0].where.videoId,'synthetic01');
   results.push('Optimize read native page/list/detail: actual hook/reader/GET/auth/plan/token/history SQL exact owner/video, original timestamps and zero/null values; excludes neighboring history, no mutation');
  }
  for(const held of ['headers','JSON']){
   const u=await newOwner(),gate=deferred(),x=bind(u,{target:'synthetic01',held,gate});await x.select();await x.entered.promise;await ready(x.h);x.h.advance(20000);x.h.unmount();await x.select();assert.equal(reads(x.h,'synthetic01').length,1);x.h.advance(10000);await ready(x.h);assert(retry(x.h).props.disabled);retry(x.h).props.onClick();gate.resolve();await x.settle();assert(input(x.h));assert.equal(reads(x.h,'synthetic01').length,1);
   results.push('Optimize read native detail '+held+': SQL original response held30s/remount, same producer/deadline, disabled replacement and validated original late body');
  }
  {
   const u=await newOwner(),gate=deferred(),x=bind(u,{target:null,held:'JSON',gate});await ready(x.h);await x.entered.promise;await ready(x.h);x.h.advance(20000);x.h.unmount();await ready(x.h);x.h.advance(10000);await ready(x.h);assert(retry(x.h).props.disabled);assert.equal(reads(x.h).length,1);gate.resolve();await x.settle();assert(choose(x.h));assert.equal(reads(x.h).length,1);
   results.push('Optimize read native list: original real SQL-authenticated GET body retained across30s/remount without a second list/token/Google invocation');
  }
  {
   const u=await newOwner(),gate=deferred(),x=bind(u,{target:'synthetic01',held:'JSON',gate});await x.select();await x.entered.promise;const old=x.h.nodes().find(n=>n.type==='button'&&x.h.text(n).includes('Volver')).props.onClick;x.h.state.user=neighbor.id;x.h.state.email=neighbor.email;x.h.view(true);old();gate.resolve();await Promise.all(x.owned);await flush();assert(!input(x.h));await x.settle();assert(!input(x.h));assert(!x.h.text().includes('Neighbor secret history'));assert.equal(reads(x.h,'synthetic01').length,1);
   results.push('Optimize read native account render-before-effects retires original detail/history and back handler before late body; no neighboring editor/mutation');
  }
  {
   const u=await newOwner(),x=bind(u,{corrupt:(b,id)=>{if(id==='synthetic01')b.userId=neighbor.id;}});await x.select();await x.settle();assert(!input(x.h));assert.match(x.h.text(),/No se pudieron cargar/);assert(!retry(x.h).props.disabled);
   results.push('Optimize read native corrupt owner acknowledgement cannot install real SQL history/editor or authorize a substitute action');
  }
  {
   const u=await newOwner('free'),x=bind(u);await ready(x.h);await x.settle();assert.match(x.h.text(),/requiere el plan Pro/);assert(!choose(x.h));assert.equal(x.originals[0].native.tokens.length,0);assert.equal(x.originals[0].native.transports.length,0);
   results.push('Optimize read native stored canceled Free plan denies before token/Google/history and displays safe plan error, no fabricated empty list');
  }
  {
   const u=await newOwner('pro',false),x=bind(u);await ready(x.h);await x.settle();assert.match(x.h.text(),/Conecta tu canal/);assert.equal(x.originals[0].native.transports.length,0);assert(!choose(x.h));
   results.push('Optimize read native absent own SQL token produces connection error without OAuth or fabricated empty data');
  }
  {
   const u=await newOwner(),x=bind(u,{partial:true});await ready(x.h);await x.settle();assert.match(x.h.text(),/Datos parciales: 1\s*\/\s*2/);assert(choose(x.h));assert(!choose(x.h,'synthetic02'));assert(!x.h.text().includes('búsqueda confirmada'));
   results.push('Optimize read native partial Google fixture preserves requested coverage/order/original dates; real owner SQL and validated client disclose1/2 rather than confirmed empty');
  }
  assert.deepEqual(await prisma.optimizeHistory.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeRows);assert.deepEqual(await prisma.user.findUnique({where:{id:owner.id}}),beforeOwner);assert.deepEqual(await prisma.user.findUnique({where:{id:neighbor.id}}),beforeNeighbor);assert.deepEqual(await prisma.youtubeToken.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeTokens);
  assert.equal(await prisma.generation.count(),beforeGenerations);assert.equal(await prisma.competitorCreationAttempt.count(),beforeAdmissions);assert.equal(await prisma.extensionEvent.count(),beforeExtensions);
  results.push('Optimize read native preservation: existing accounts/neighbor/history/tokens/generation/admissions/extensions unchanged; exact own synthetic fixture cleanup only, no operational recovery/provenance/freshness authority');
 }finally{for(const h of pages)h.unmount();await prisma.user.deleteMany({where:{id:{in:users}}});}
};
