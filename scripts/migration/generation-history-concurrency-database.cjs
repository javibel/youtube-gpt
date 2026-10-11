'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness}=require('./generation-history.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
module.exports=async(prisma,results)=>{
 const ids=[],controllers=[],running=[],gates=[];
 const counts=async()=>({users:await prisma.user.count(),generations:await prisma.generation.count(),images:await prisma.legacyThumbnailAttempt.count(),subscriptions:await prisma.subscription.count(),profiles:await prisma.profileUpdateAttempt.count(),teams:await prisma.team.count()});
 const baseline=await counts(),usage=load('lib/ai/history-usage.ts');
 const track=fn=>{const p=Promise.resolve().then(fn);running.push(p);void p.catch(()=>{});return p;};
 async function fixture(n=23){const user=await prisma.user.create({data:{email:'generation-client-'+randomUUID()+'@example.invalid',name:'Synthetic concurrent history'}});ids.push(user.id);const prefix='history-client-'+randomUUID()+'-';if(n)await prisma.generation.createMany({data:Array.from({length:n},(_,i)=>({id:prefix+String(i).padStart(2,'0'),userId:user.id,template:'title',inputs:{tema:'Own label '+i,nested:{synthetic:true},count:i},output:'Own output '+i,tokensUsed:i===n-1?17:0,createdAt:new Date('2026-10-07T15:00:00Z')}))});return{user,prefix};}
 function bind(user){
  const h=harness(),controls={afterCount:null,held:null,gate:deferred(),entered:deferred()},observed=[];controllers.push(h);gates.push(controls.gate);h.state.user=user.id;h.state.email=user.email;
  h.state.send=(url,init)=>{
   const owner=Object.freeze({id:h.state.user,email:h.state.email}),afterCount=controls.afterCount,held=controls.held,gate=controls.gate,entered=controls.entered;
   return track(async()=>{
    const counted=deferred();
    const db={user:{findUnique:q=>track(()=>prisma.user.findUnique(q))},generation:{
     count:q=>track(async()=>{try{const total=await prisma.generation.count(q);if(afterCount)await afterCount(total);return total;}finally{counted.resolve();}}),
     findMany:q=>track(async()=>{await counted.promise;return prisma.generation.findMany(q);})
    }};
    const route=load('app/api/user/generations/route.ts',{'@/lib/ai/history-usage':usage,'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:owner})},'@/lib/prisma':{prisma:db}});
    const req=new Request(new URL(url,'https://example.invalid'),{signal:init.signal});req.nextUrl=new URL(req.url);
    const response=await route.GET(req),body=await response.json(),entry={owner,url,status:response.status,body,parsed:0};observed.push(entry);entered.resolve(entry);
    if(held==='headers')await gate.promise;
    return{ok:response.ok,status:response.status,json:()=>{entry.parsed++;return held==='JSON'?gate.promise.then(()=>body):Promise.resolve(body);}};
   });
  };
  return{h,controls,observed,hold(stage){controls.held=stage;controls.gate=deferred();controls.entered=deferred();gates.push(controls.gate);},async ready(){await h.ready();await flush();},unhold(){controls.held=null;}};
 }
 async function settle(){let n=0;while(n<running.length){const list=running.slice(n);n=running.length;await Promise.allSettled(list);}}
 try{
  {
   const {user}=await fixture(0),x=bind(user);x.controls.afterCount=async total=>{assert.equal(total,0);await prisma.generation.createMany({data:[0,1,2].map(i=>({userId:user.id,template:'title',inputs:{tema:'Inserted own label',nested:{x:1}},output:'Inserted own output '+i,tokensUsed:i===0?17:0,createdAt:new Date('2026-10-07T16:00:00Z')}))});};
   await x.ready();const v=x.h.view(),r=x.observed[0];assert.equal(r.status,200);assert.equal(r.body.total,0);assert.equal(r.body.generations.length,3);assert.equal(r.body.hasMore,false);assert.equal(v.historyLoaded,true);assert.equal(v.historyError,null);assert.equal(v.historyGens.length,3);assert.equal(v.historyPage,1);assert.equal(v.historyHasMore,false);assert(v.historyGens.some(r=>r.tokensUsed===17));assert(v.historyGens.some(r=>r.tokensUsed===null));assert(v.historyGens.every(r=>Object.keys(r.inputs).length===1));await v.loadMoreHistory();assert.equal(x.h.requests.length,1);
   results.push('Generation client native count0 before real PostgreSQL insert/page3 displays actual own rows, measured/legacy usage and terminal flag; no invented empty result or total equality');
  }
  for(const n of [0,3,9]){
   const {user,prefix}=await fixture(25),x=bind(user);await x.ready();const prior=Array.from(x.h.view().historyGens,r=>r.id);
   x.controls.afterCount=async total=>{assert.equal(total,25);await prisma.generation.deleteMany({where:{userId:user.id,id:{gte:prefix+String(10+n).padStart(2,'0')}}});};
   await x.h.view().loadMoreHistory();const r=x.observed.at(-1),v=x.h.view();assert.equal(r.status,200);assert.equal(r.body.total,25);assert.equal(r.body.generations.length,n);assert.equal(r.body.hasMore,true);assert.equal(v.historyError,null);assert.equal(v.historyPage,2);assert.equal(v.historyHasMore,true);assert.deepEqual(Array.from(v.historyGens,r=>r.id),[...prior,...r.body.generations.map(r=>r.id)]);await flush();assert.equal(x.h.requests.length,2);
   x.controls.afterCount=null;await v.loadMoreHistory();assert.equal(x.h.requests.at(-1).url,'/api/user/generations?page=3');assert.equal(x.h.view().historyPage,3);assert.equal(x.h.view().historyHasMore,false);assert.equal(x.h.view().historyError,null);assert.equal(await prisma.generation.count({where:{userId:user.id}}),10+n);
   results.push('Generation client native deletion between PostgreSQL count25/page'+n+' preserves confirmed rows, accepts short/empty page and hasMore, then explicit page3 observes current terminal count');
  }
  {
   const {user}=await fixture(23),x=bind(user);await x.ready();const prior=Array.from(x.h.view().historyGens,r=>r.id);
   x.controls.afterCount=async()=>{throw Error('NEVER_PUBLIC private SQL acknowledgement failure');};await x.h.view().loadMoreHistory();assert.equal(x.observed.at(-1).status,503);assert.equal(x.h.view().historyError,'more');assert.equal(x.h.view().historyPage,1);assert.deepEqual(Array.from(x.h.view().historyGens,r=>r.id),prior);assert(!JSON.stringify(x.observed.at(-1).body).includes('NEVER_PUBLIC'));
   x.controls.afterCount=null;await x.h.view().retryHistory();assert.equal(x.h.requests.at(-1).url,'/api/user/generations?page=2');assert.equal(x.h.view().historyPage,2);assert.equal(x.h.view().historyGens.length,20);assert.equal(await prisma.generation.count({where:{userId:user.id}}),23);
   results.push('Generation client native actual SQL count acknowledgement failure keeps own confirmed rows/cursor; explicit retry reads page2 through original server, never zero/empty fallback');
  }
  for(const stage of ['headers','JSON']){
   const {user}=await fixture(23),x=bind(user);await x.ready();x.hold(stage);const old=x.h.view().loadMoreHistory(),r=await x.controls.entered.promise;assert.equal(r.status,200);assert.equal(r.body.page,2);x.h.advance(30000);await old;
   assert.equal(x.h.view().historyPage,1);assert.equal(x.h.view().historyError,'more');assert.equal(x.h.view().historyGens.length,10);assert(x.h.requests.at(-1).init.signal.aborted);
   await prisma.generation.create({data:{userId:user.id,template:'title',inputs:{tema:'New own row'},output:'New own output',tokensUsed:0,createdAt:new Date('2026-10-07T17:00:00Z')}});
   x.unhold();await x.h.view().retryHistory();assert.equal(x.h.requests.at(-1).url,'/api/user/generations?page=2');const latest=Array.from(x.h.view().historyGens,r=>r.id);x.controls.gate.resolve();await settle();await flush();assert.deepEqual(Array.from(x.h.view().historyGens,r=>r.id),latest);assert.equal(x.h.view().historyPage,2);assert.equal(x.h.view().historyError,null);assert.equal(x.h.requests.length,3);assert.equal(await prisma.generation.count({where:{userId:user.id}}),24);
   results.push('Generation client native '+stage+' original PostgreSQL page200 withheld beyond client30s leaves explicit retry at page2; late original cannot replace newly observed current rows or repeat writes');
  }
  for(const stage of ['headers','JSON'])for(const field of ['user','email','auth','unmount']){
   const {user}=await fixture(23),x=bind(user);await x.ready();x.hold(stage);const old=x.h.view().loadMoreHistory(),r=await x.controls.entered.promise;assert.equal(r.status,200);await flush();
   let expectedUser=user.id;
   if(field==='user'){const second=await fixture(1);x.h.state.user=second.user.id;x.h.state.email=second.user.email;expectedUser=second.user.id;}
   else if(field==='email'){x.h.state.email='generation-client-new-'+randomUUID()+'@example.invalid';await prisma.user.update({where:{id:user.id},data:{email:x.h.state.email}});}
   else if(field==='auth')x.h.state.auth='unauthenticated';
   else x.h.unmount();
   if(field!=='unmount')assert.equal(x.h.view(true).historyGens.length,0);x.unhold();x.controls.gate.resolve();await old;await settle();await flush();assert.equal(r.parsed,stage==='headers'?0:1);assert.equal(x.h.requests.length,2);
   if(field==='user'||field==='email'){x.h.runEffects();await x.ready();assert.equal(x.h.requests.length,3);assert.equal(x.observed.at(-1).owner.id,expectedUser);assert.equal(x.observed.at(-1).owner.email,x.h.state.email);assert.equal(x.h.view().historyError,null);assert.equal(x.h.view().historyGens.length,field==='user'?1:10);}
   else{assert.equal(x.h.view(true).historyGens.length,0);}
   assert.equal(await prisma.generation.count({where:{userId:user.id}}),23);
   results.push('Generation client native '+stage+'/'+field+' retires original own SQL page before parsing/publishing across identity/auth/lifecycle transition; stale callback never issues another read');
  }
  {
   const {user}=await fixture(1),x=bind(user);x.h.state.user=undefined;await x.ready();assert.equal(x.h.requests.length,0);assert.equal(x.observed.length,0);assert.equal(x.h.view().historyLoaded,false);assert.equal(await prisma.generation.count({where:{userId:user.id}}),1);
   results.push('Generation client native missing session ID performs no HTTP/SQL history read despite an email; stored own row remains intact');
  }
 }finally{
  for(const gate of gates)gate.resolve();await settle();for(const h of controllers)h.unmount();await flush();await prisma.user.deleteMany({where:{id:{in:ids}}});assert.deepEqual(await counts(),baseline);
 }
 results.push('Generation client native cleanup only own fixture IDs restores original PostgreSQL counts; no schema, operational data, provider, email, payment, browser or recovery authority');
};
