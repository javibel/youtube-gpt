'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred}=require('./chat-widget-harness.cjs'),{create,ready,defaults,writes,track,channelId}=require('./competitor-analysis-track.test.cjs'),{start,reads,submit}=require('./competitor-analysis-client.test.cjs'),{harness}=require('./competitor-analysis-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[],plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),newOwner=async paid=>{const u=await prisma.user.create({data:{email:'analysis-client-'+randomUUID()+'@example.invalid'}});users.push(u.id);if(paid)await prisma.subscription.create({data:{userId:u.id,plan:'pro',status:'active'}});return u;};
 const row=u=>prisma.trackedCompetitor.findMany({where:{userId:u.id},include:{snapshots:true},orderBy:{id:'asc'}}),admissions=u=>prisma.competitorCreationAttempt.findMany({where:{userId:u.id},orderBy:{id:'asc'}});
 function bind(owner,options={}){
  const h=create();h.state.user=owner.id;h.state.email=owner.email;pages.push(h);const owned=[],servers=[];
  const helper=load('lib/competitor-creation.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/plans':plans},{fetch:async url=>{assert(url.startsWith('https://www.googleapis.com/youtube/v3/channels?'));return Response.json({items:[{id:channelId,snippet:{title:'Synthetic followed channel',thumbnails:{default:{url:null}}},statistics:{subscriberCount:'12',viewCount:'600',videoCount:'3'}}]});}});
  const route=load('app/api/youtube/competitors/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/prisma':{prisma},'@/lib/competitor-creation':helper,'@/lib/competitor-deletion':{}},{process:{env:{YOUTUBE_API_KEY:'synthetic'}}});
  h.state.send=r=>{
   if(r.url==='/api/youtube/competitor'){
    const server=harness({userId:owner.id,email:owner.email,body:r.body,userReader:q=>prisma.user.findUnique(q),planReader:id=>plans.getUserPlan(id),dataEdit:options.dataEdit});servers.push(server);
    const p=(async()=>{const response=await server.original;const body=await response.json();options.entered?.resolve();if(options.corrupt)options.corrupt(body);if(options.held==='headers')await options.gate.promise;return {ok:response.ok,status:response.status,json:()=>options.held==='JSON'?options.gate.promise.then(()=>body):Promise.resolve(body)};})();owned.push(p);return p;
   }
   if(r.url==='/api/youtube/competitors'){const p=r.init.method==='POST'?route.POST(new Request('https://example.invalid/api/youtube/competitors',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(r.body)})):route.GET();owned.push(p);return p;}
   return defaults(r);
  };
  const settle=async()=>{await ready(h);await Promise.all(owned);await ready(h);return ready(h);};return{h,owned,servers,settle};
 }
 try{
  const owner=await newOwner(true),free=await newOwner(false),neighbor=await newOwner(true);const c=await prisma.trackedCompetitor.create({data:{userId:neighbor.id,channelId:'UC_neighbor_'+randomUUID(),channelName:'Untouched neighbor'}});await prisma.competitorSnapshot.create({data:{competitorId:c.id,subscribers:1,totalViews:10n,videoCount:1}});const neighborBefore=await row(neighbor),ownerBefore=await prisma.user.findUnique({where:{id:owner.id}});
  {
   const x=bind(owner);await start(x.h);await x.settle();assert.match(x.h.text(),/Synthetic channel/);assert.equal(x.servers[0].queries[0].where.email,owner.email);assert.deepEqual(x.servers[0].plans,[owner.id]);assert.equal(x.servers[0].transports.length,3);const cb=track(x.h).props.onClick;cb();cb();await x.settle();assert.match(x.h.text(),/Siguiendo/);assert.equal(writes(x.h).length,1);assert.equal((await admissions(owner)).length,1);const rows=await row(owner);assert.equal(rows.length,1);assert.equal(rows[0].snapshots.length,1);assert.equal(x.h.storage.size,0);results.push('Analysis client native complete + follow: actual page/hook/read/POST/auth/user/plan/SQL and fictitious Google; only explicit original follow acknowledgement creates one admission/snapshot');
  }
  {
   const x=bind(free);await start(x.h);await x.settle();assert.match(x.h.text(),/exclusiva del Plan Pro/);assert(!x.h.text().includes('Synthetic channel'));assert.equal(x.servers[0].transports.length,0);assert.equal(reads(x.h).length,1);assert.equal(writes(x.h).length,0);assert.equal((await admissions(free)).length,0);results.push('Analysis client native Free: actual stored plan403 reaches localized page error; no Google, metrics, tracking selection or admission');
  }
  for(const held of ['headers','JSON']){
   const u=await newOwner(true),gate=deferred(),entered=deferred(),x=bind(u,{held,gate,entered});await start(x.h);await entered.promise;x.h.advance(20000);x.h.unmount();await ready(x.h);x.h.strictEffects();await ready(x.h);x.h.advance(10000);await ready(x.h);assert.match(x.h.text(),/No se pudo obtener/);assert.equal(reads(x.h).length,1);submit(x.h)({preventDefault(){}});await ready(x.h);assert.equal(x.servers.length,1);assert.equal((await row(u)).length,0);gate.resolve();await x.settle();assert.match(x.h.text(),/Synthetic channel/);assert.equal(reads(x.h).length,1);assert.equal(x.h.timers.size,0);assert.equal(writes(x.h).length,0);results.push('Analysis client native '+held+': original actual server/user/plan/SQL result held30s, remount/Strict setup observes same producer, late original scoped acknowledgement alone supplies result; no addition or replacement');
  }
  for(const mode of ['partial','empty']){
   const u=await newOwner(true),x=bind(u,{dataEdit:(data,stage)=>stage===(mode==='empty'?'playlist':'stats')?{items:[]}:data});await start(x.h);await x.settle();assert.match(x.h.text(),mode==='empty'?/no tiene vídeos/:/Análisis parcial.*0 \/ 3/);assert.match(x.h.text(),/Synthetic channel/);assert.equal(writes(x.h).length,0);assert.equal(x.servers.length,1);results.push('Analysis client native '+mode+': actual detailed route validates fictitious collection/SQL entitlement; page distinguishes declared missing statistics from original empty playlist');
  }
  {
   const u=await newOwner(true),x=bind(u,{corrupt:b=>b.userId=neighbor.id});await start(x.h);await x.settle();assert.match(x.h.text(),/No se pudo obtener/);assert(!x.h.text().includes('Synthetic channel'));assert.equal(x.h.requests.filter(r=>r.url==='/api/youtube/competitors').length,0);assert.equal(writes(x.h).length,0);assert.equal((await admissions(u)).length,0);results.push('Analysis client native foreign acknowledgement: actual SQL-entitled result with changed owner cannot render metrics, start list/follow or supply recovery authority');
  }
  {
   const u=await newOwner(true),gate=deferred(),entered=deferred(),x=bind(u,{held:'headers',gate,entered});await start(x.h);await entered.promise;const cb=submit(x.h);x.h.state.user=neighbor.id;x.h.state.email=neighbor.email;x.h.view(true);cb({preventDefault(){}});gate.resolve();await x.settle();assert(!x.h.text().includes('Synthetic channel'));assert.equal(reads(x.h).length,1);assert.equal(writes(x.h).length,0);assert.equal((await admissions(u)).length,0);results.push('Analysis client native render-before-effects account change: old submit and actual late server result retire before list/outliers/follow; captured SQL query remains original owner only');
  }
  assert.deepEqual(await row(neighbor),neighborBefore);assert.equal((await admissions(neighbor)).length,0);assert.deepEqual(await prisma.user.findUnique({where:{id:owner.id}}),ownerBefore);assert.equal(await prisma.extensionEvent.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.competitorDeletionAttempt.count({where:{userId:{in:users}}}),0);results.push('Analysis client native preservation: neighbor rows/snapshots, accounts and deletion admissions intact; no extension events, actual OAuth/models, emails or serialized recovery');
 }finally{for(const h of pages)h.unmount();await prisma.user.deleteMany({where:{id:{in:users}}});}
};
