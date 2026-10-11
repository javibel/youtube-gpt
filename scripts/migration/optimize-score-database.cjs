'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{harness:server}=require('./optimize-score-server.test.cjs'),{deferred}=require('./chat-widget-harness.cjs'),{create,ready,open,start,change,reads,input,score,retry,defaults}=require('./optimize-score-client.test.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[];
 const newOwner=async()=>{const u=await prisma.user.create({data:{email:'optimize-score-'+randomUUID()+'@example.invalid'}});users.push(u.id);return u;};
 function bind(owner,options={}){
  const h=create();h.state.user=owner.id;h.state.email=owner.email;pages.push(h);const owned=[],lookups=[],entered=deferred();
  h.state.send=r=>{
   if(r.init.method!=='POST')return defaults(r);
   const p=(async()=>{const native=server({body:r.body,authReader:async()=>{lookups.push(owner.id);const u=await prisma.user.findUnique({where:{id:owner.id},select:{id:true,email:true}});return u?{user:u}:null;}});
    const res=await native.original,b=await res.json();options.corrupt?.(b);entered.resolve();
    if(options.held==='headers')await options.gate.promise;
    return {ok:res.ok,status:res.status,json:()=>options.held==='JSON'?options.gate.promise.then(()=>b):Promise.resolve(b)};
   })();owned.push(p);return p;
  };
  const settle=async()=>{await Promise.all(owned);await ready(h);};return{h,owned,lookups,entered,settle};
 }
 try{
  const owner=await newOwner(),neighbor=await newOwner(),ownerBefore=await prisma.user.findUnique({where:{id:owner.id}}),neighborBefore=await prisma.user.findUnique({where:{id:neighbor.id}});
  const beforeHistory=await prisma.optimizeHistory.count(),beforeAttempts=await prisma.competitorCreationAttempt.count(),beforeSubscriptions=await prisma.subscription.count();
  {
   const x=bind(owner);await start(x.h);await x.settle();assert.equal(score(x.h),'35');assert.deepEqual(x.lookups,[owner.id]);assert.equal(reads(x.h).length,1);assert.equal(x.h.timers.size,0);results.push('Optimize score native: actual page/hook/POST/auth SQL owner lookup yields local preview35; GET fixtures only, no Google/OAuth/model/history/plan/usage writes');
  }
  for(const held of ['headers','JSON']){
   const u=await newOwner(),gate=deferred(),x=bind(u,{held,gate});await start(x.h);await x.entered.promise;await ready(x.h);x.h.advance(20000);x.h.unmount();await open(x.h);change(x.h,'7 Best synthetic educational ideas');x.h.advance(400);await ready(x.h);assert.equal(reads(x.h).length,1);x.h.advance(9600);await ready(x.h);assert.equal(score(x.h),'—');assert(retry(x.h).props.disabled);retry(x.h).props.onClick();assert.equal(reads(x.h).length,1);gate.resolve();await x.settle();assert.equal(score(x.h),'35');assert.deepEqual(x.lookups,[u.id]);results.push('Optimize score native '+held+': actual SQL-authenticated original held across30s/remount, same reader/deadline and disabled replacement, late original body validates');
  }
  {
   const u=await newOwner(),gate=deferred(),x=bind(u,{held:'JSON',gate});await start(x.h);await x.entered.promise;const old=input(x.h).props.onChange;x.h.state.user=neighbor.id;x.h.state.email=neighbor.email;x.h.view(true);old({target:{value:'stale'}});gate.resolve();await x.settle();assert(!x.h.nodes().some(n=>n.props?.['aria-label']==='SEO score'));assert.equal(reads(x.h).length,1);assert.deepEqual(x.lookups,[u.id]);results.push('Optimize score native account render-before-effects retires old draft handler/body; no neighbor preview or automatic POST');
  }
  {
   const u=await newOwner(),x=bind(u,{corrupt:b=>b.userId=neighbor.id});await start(x.h);await x.settle();assert.equal(score(x.h),'—');assert.match(x.h.text(),/No se pudo calcular/);assert(!retry(x.h).props.disabled);assert.equal(reads(x.h).length,1);results.push('Optimize score native foreign acknowledgement cannot install SQL-authenticated preview or authorize any mutation');
  }
  {
   const u=await newOwner(),x=bind(u);await open(x.h);await prisma.user.delete({where:{id:u.id}});change(x.h,'7 Best synthetic educational ideas');x.h.advance(400);await x.settle();assert.equal(score(x.h),'—');assert.match(x.h.text(),/No se pudo calcular/);assert.deepEqual(x.lookups,[u.id]);assert.equal(reads(x.h).length,1);results.push('Optimize score native removed synthetic auth owner returns401 before body/scoring, finite local error with no external effects');
  }
  assert.deepEqual(await prisma.user.findUnique({where:{id:owner.id}}),ownerBefore);assert.deepEqual(await prisma.user.findUnique({where:{id:neighbor.id}}),neighborBefore);assert.equal(await prisma.optimizeHistory.count(),beforeHistory);assert.equal(await prisma.competitorCreationAttempt.count(),beforeAttempts);assert.equal(await prisma.subscription.count(),beforeSubscriptions);assert.equal(await prisma.generation.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:{in:users}}}),0);
  results.push('Optimize score native preservation: owner/neighbor/history/admissions/subscriptions unchanged, zero usage; only fixture accounts created and exact own cleanup, no operational provenance/recovery authority');
 }finally{for(const h of pages)h.unmount();await prisma.user.deleteMany({where:{id:{in:users}}});}
};

