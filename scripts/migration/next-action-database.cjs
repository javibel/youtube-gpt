'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture,channelId,videoId,otherVideoId,allIds,deferred,flush}=require('./next-action-fixture.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],instances=[],gates=[],running=[];
 const models=['user','youtubeToken','generation','subscription','videoSeoScore','trackedCompetitor','bestTimeAnalysis','trendAlert','calendarEntry','abTest','dailyIdea'];
 const counts=async()=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await prisma[m].count()])));
 const baseline=await counts(),today=new Date().toISOString().slice(0,10);
 const bind=(owner,options={})=>{const f=fixture({prisma,owner,...options});instances.push(f);return f;};
 async function settle(){for(const f of instances)await f.settle();await Promise.allSettled(running);}
 async function unavailable(f){const r=await f.original;assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'Acciones no disponibles'});assert.equal(f.timers.size,0);}
 try{
  const users=await Promise.all([1,2,3].map(i=>prisma.user.create({data:{email:'next-action-'+randomUUID()+'@example.invalid',name:'Synthetic '+i,password:'NEVER_PUBLIC'}})));ids.push(...users.map(u=>u.id));
  for(const user of users.slice(0,2))await prisma.youtubeToken.create({data:{userId:user.id,channelId,videoCount:'4',accessToken:'SYNTHETIC_TOKEN',refreshToken:'SYNTHETIC_REFRESH',expiresAt:new Date(Date.now()+3600000)}});
  const owner=users[0],foreign=users[1];
  await prisma.subscription.create({data:{userId:owner.id,status:'active',plan:'pro',stripeCustomerId:'synthetic-next-action'}});
  await prisma.videoSeoScore.create({data:{userId:owner.id,videoId:otherVideoId,score:35,checklist:[]}});
  await prisma.trendAlert.create({data:{userId:owner.id,title:'Own synthetic trend',description:'Synthetic',category:'synthetic',relevance:50}});
  await prisma.dailyIdea.create({data:{userId:owner.id,date:today,ideas:[{title_es:'Idea propia',title_en:'Own idea'}]}});
  await prisma.generation.create({data:{userId:foreign.id,template:'title',inputs:{},output:'FOREIGN_SECRET',tokensUsed:0}});
  await prisma.videoSeoScore.create({data:{userId:foreign.id,videoId,score:90,checklist:[]}});
  await prisma.trackedCompetitor.create({data:{userId:foreign.id,channelId:'UC'+'b'.repeat(22),channelName:'Foreign'}});
  await prisma.bestTimeAnalysis.create({data:{userId:foreign.id,heatmap:[],topSlots:[],videoCount:4}});
  await prisma.calendarEntry.create({data:{userId:foreign.id,title:'FOREIGN_SECRET',date:today}});
  await prisma.abTest.create({data:{userId:foreign.id,videoId,originalTitle:'Foreign',variantA:'A',variantB:'B'}});
  await prisma.dailyIdea.create({data:{userId:foreign.id,date:today,ideas:[{title_es:'FOREIGN_SECRET'}]}});
  const seeded=await counts();
  {
   const f=bind(owner),r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(b.actions.map(a=>a.id),allIds);assert.equal(b.action.id,'first_generation');assert.equal(b.actions.find(a=>a.id==='optimize_low_score').href,'/optimize?video='+otherVideoId);assert.equal(b.actions.find(a=>a.id==='score_recent_video').href,'/seo-score?video='+videoId);assert(b.actions.find(a=>a.id==='daily_idea').reason.es.includes('Idea propia'));assert(!JSON.stringify(b).includes('FOREIGN_SECRET'));assert(!JSON.stringify(b).includes('SYNTHETIC_TOKEN'));assert.deepEqual(await counts(),seeded);
   results.push('Next action native full paid catalog keeps own priority, CTA/ES/EN/URLs, excludes foreign signals, passwords and tokens');
  }
  {
   await prisma.subscription.update({where:{userId:owner.id},data:{status:'canceled'}});
   const f=bind(owner,{search:'?skip=first_generation,score_recent_video,optimize_low_score'}),b=await(await f.original).json();assert.equal(b.action.id,'track_competitors');assert(!b.actions.some(a=>a.id==='start_ab_test'));assert.equal(b.actions.length,8);
   await prisma.subscription.update({where:{userId:owner.id},data:{status:'active'}});
   results.push('Next action native actual canceled subscription gates paid rule; skip selects next priority without truncating catalog');
  }
  {
   const f=bind(users[2],{search:'?skip=connect_channel,first_generation,plan_week'}),b=await(await f.original).json();assert.deepEqual(b.actions.map(a=>a.id),['connect_channel','first_generation','plan_week']);assert.equal(b.action,null);assert(!f.calls.some(c=>['token','google'].includes(c.name)));
   results.push('Next action native disconnected third account retains confirmed connect/first generation/week actions and never dispatches provider');
  }
  const stages=['auth','user','plan','channel','generation','scoreList','last','competitors','channelBest','bestTime','alert','calendar','channelAb','ab','daily','token','google','body','JSON'];
  for(const held of stages)for(const action of ['timeout','abort']){
   const f=bind(owner,{held});await f.entered.promise;if(action==='timeout')f.advance(25000);else f.controller.abort();await unavailable(f);const at=f.calls.length;f.gate.resolve();await settle();assert.equal(f.calls.length,at);if(held!=='JSON')assert(!f.replies.some(r=>r.init.status===200));assert.deepEqual(await counts(),seeded);
   results.push('Next action native '+held+'/'+action+' retires HTTP25s; original SQL/token/mock provider/JSON acknowledgement settles without later stage, replay or writes');
  }
  for(const reject of ['user','plan','generation','scoreList','last','competitors','bestTime','alert','calendar','ab','daily']){
   const f=bind(owner,{reject});await unavailable(f);await settle();assert.deepEqual(await counts(),seeded);
   results.push('Next action native '+reject+' failed original PostgreSQL acknowledgement returns private503 instead of empty catalog');
  }
  for(const field of ['id','email']){
   const session={user:{id:owner.id,email:owner.email,[field]:foreign[field]}},f=bind(owner,{session});assert.equal((await f.original).status,401);assert.deepEqual(f.calls.map(c=>c.name),['auth','user']);
   results.push('Next action native '+field+' discordance rejects before plan/rule dispatch');
  }
  for(const held of ['oauthHeaders','oauthBody','tokenUpdate'])for(const action of ['timeout','abort']){
   await prisma.youtubeToken.update({where:{userId:owner.id},data:{accessToken:'SYNTHETIC_OLD',expiresAt:new Date(0)}});
   const f=bind(owner,{oauth:true,held});await f.entered.promise;if(action==='timeout')f.advance(25000);else f.controller.abort();await unavailable(f);const at=f.calls.length;f.gate.resolve();await settle();assert.equal(f.calls.length,at);assert(!f.calls.some(c=>c.name==='google'));assert.equal(f.calls.filter(c=>c.name==='oauthHeaders').length,1);assert.equal(f.calls.filter(c=>c.name==='tokenUpdate').length,held==='tokenUpdate'?1:0);
   const token=await prisma.youtubeToken.findUnique({where:{userId:owner.id}});assert.equal(token.accessToken,held==='tokenUpdate'?'SYNTHETIC_REFRESHED':'SYNTHETIC_OLD');assert.deepEqual(await counts(),seeded);
   results.push('Next action native OAuth '+held+'/'+action+' same dispatched token write may settle once; no late body/update/retry/Google, no cancellation or recovery authority');
  }
  {
   await prisma.youtubeToken.update({where:{userId:owner.id},data:{accessToken:'SYNTHETIC_OLD',expiresAt:new Date(0)}});
   const f=bind(owner,{oauth:true}),r=await f.original;assert.equal(r.status,200);assert.equal(f.calls.filter(c=>c.name==='tokenUpdate').length,1);assert.equal(f.calls.filter(c=>c.name==='google').length,1);assert.equal((await prisma.youtubeToken.findUnique({where:{userId:owner.id}})).accessToken,'SYNTHETIC_REFRESHED');
   results.push('Next action native original mock OAuth refresh commits one real synthetic SQL token update and then reads mock playlist');
  }
  {
   const locked=deferred(),unlock=deferred(),dispatched=deferred();gates.push(unlock);
   const p=prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('LOCK TABLE generations IN ACCESS EXCLUSIVE MODE');locked.resolve();await unlock.promise;},{timeout:15000});running.push(p);await locked.promise;
   const f=bind(owner,{onDispatch:name=>{if(name==='generation')dispatched.resolve();}});await dispatched.promise;await flush();assert.equal(f.replies.length,0);f.advance(25000);await unavailable(f);const at=f.calls.length;unlock.resolve();await settle();assert.equal(f.calls.length,at);assert(!f.replies.some(r=>r.init.status===200));assert.deepEqual(await counts(),seeded);
   results.push('Next action native genuine PostgreSQL table lock holds original generation count beyond HTTP deadline; same SQL settles after unlock without cancellation/replay/late200');
  }
  {
   await prisma.generation.create({data:{userId:foreign.id,template:'title',inputs:{},output:'Second foreign',tokensUsed:0}});
   await prisma.dailyIdea.deleteMany({where:{userId:foreign.id}});
   const f=bind(foreign,{body:{items:[]}}),r=await f.original;assert.equal(r.status,200);assert.deepEqual(await r.json(),{action:null,actions:[]});
   results.push('Next action native truly empty complete catalog uses successful owned SQL plus acknowledged empty playlist; errors cannot manufacture absence');
  }
 }finally{
  for(const f of instances)f.gate.resolve();for(const g of gates)g.resolve();await settle();await prisma.user.deleteMany({where:{id:{in:ids}}});assert.deepEqual(await counts(),baseline);
 }
};
