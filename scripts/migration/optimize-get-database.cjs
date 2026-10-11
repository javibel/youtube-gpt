'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{flush,deferred}=require('./chat-widget-harness.cjs'),{harness,response}=require('./optimize-get-server.test.cjs');
module.exports=async(prisma,results)=>{
 const users=[],newOwner=async(plan='pro',token=true)=>{const u=await prisma.user.create({data:{email:'optimize-get-'+randomUUID()+'@example.invalid'}});users.push(u.id);await prisma.subscription.create({data:{userId:u.id,plan,status:plan==='free'?'canceled':'active'}});if(token)await prisma.youtubeToken.create({data:{userId:u.id,accessToken:'synthetic-token',refreshToken:null,expiresAt:new Date('2026-11-01T00:00:00Z'),channelId:'UC_synthetic'}});return u;};
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 function bind(u,options={}){
  const auth=()=>prisma.user.findUnique({where:{id:u.id},select:{id:true,email:true}}).then(user=>user?{user}:null);
  return harness({userId:u.id,email:u.email,realToken:true,authReader:auth,planReader:id=>plans.getUserPlan(id),tokenReader:q=>prisma.youtubeToken.findUnique(q),tokenWriter:q=>prisma.youtubeToken.update(q),historyReader:q=>prisma.optimizeHistory.findMany(q),...options});
 }
 async function settle(h){let n=0;do{const batch=h.owned.slice(n);n=h.owned.length;await Promise.all(batch);await flush();}while(n<h.owned.length);}
 try{
  const owner=await newOwner(),neighbor=await newOwner();
  await prisma.optimizeHistory.createMany({data:[{userId:owner.id,videoId:'synthetic01',field:'title',oldValue:'Own original',newValue:'Own revised',scoreBefore:0,scoreAfter:35,viewsBefore:0,createdAt:new Date('2026-10-01T00:00:00Z')},{userId:owner.id,videoId:'synthetic02',field:'description',oldValue:'Other selection',newValue:'Other revised',createdAt:new Date('2026-10-01T00:00:00Z')},{userId:neighbor.id,videoId:'synthetic01',field:'tags',oldValue:'Neighbor secret',newValue:'Neighbor revised',createdAt:new Date('2026-10-01T00:00:00Z')}]});
  const beforeRows=await prisma.optimizeHistory.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeOwner=await prisma.user.findUnique({where:{id:owner.id}}),beforeNeighbor=await prisma.user.findUnique({where:{id:neighbor.id}}),beforeTokens=await prisma.youtubeToken.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}});
  {
   const h=bind(owner),b=await response(h);assert.equal(b.userId,owner.id);assert.equal(b.email,owner.email);assert.equal(b.coverage,'complete');assert.deepEqual(b.videos.map(v=>v.videoId),['synthetic01','synthetic02']);assert.deepEqual(h.plans,[owner.id]);assert.equal(h.tokens[0].where.userId,owner.id);assert.equal(h.updates.length,0);assert.equal(h.queries.length,0);results.push('Optimize GET native list: real auth user/plan/token SQL and original GET, fictitious Google complete coverage/order, no history/title/model writes');
  }
  {
   const h=bind(owner,{detail:true}),b=await response(h);assert.equal(b.history.length,1);assert.equal(b.history[0].oldValue,'Own original');assert.equal(b.history[0].userId,owner.id);assert.equal(b.history[0].videoId,'synthetic01');assert.equal(b.history[0].createdAt,'2026-10-01T00:00:00.000Z');assert.equal(b.history[0].scoreBefore,0);assert.equal(b.history[0].viewsBefore,0);assert.equal(b.score,35);assert(!JSON.stringify(b).includes('synthetic-token'));assert(!JSON.stringify(b).includes('Neighbor secret'));results.push('Optimize GET native detail/history: exact owner/video SQL query,20-row bounded select, original dates/nullable zeros; excludes neighboring owner/video and token disclosure');
  }
  {
   const u=await newOwner('free'),h=bind(u);await response(h,403);assert.equal(h.transports.length,0);assert.equal(h.tokens.length,0);assert.equal(h.queries.length,0);assert.deepEqual(h.plans,[u.id]);results.push('Optimize GET native Free plan: real stored cancellation denies before token/OAuth/Google/history, no synthetic acceptance from wrong plan flag');
  }
  {
   const u=await newOwner('pro',false),h=bind(u);await response(h,400);assert.equal(h.transports.length,0);assert.equal(h.queries.length,0);assert.equal(h.tokens.length,1);results.push('Optimize GET native absent own token: actual SQL disconnect400, no refresh or Google request');
  }
  {
   const h=bind(owner,{detail:true,held:'plan'});await h.entered.plan.promise;h.state.session={user:{id:neighbor.id,email:neighbor.email}};h.request.url='https://example.invalid/?videoId=synthetic02';h.gates.plan.resolve();const b=await response(h);assert.equal(b.userId,owner.id);assert.equal(b.email,owner.email);assert.equal(b.video.videoId,'synthetic01');assert.equal(b.history[0].userId,owner.id);assert.deepEqual(h.plans,[owner.id]);results.push('Optimize GET native delayed real plan preserves authenticated original owner/email and URL/video before mutation; SQL history cannot switch to neighbor');
  }
  {
   const gate=deferred(),entered=deferred(),h=bind(owner,{detail:true,historyReader:async q=>{const rows=await prisma.optimizeHistory.findMany(q);entered.resolve();await gate.promise;return rows;}});await entered.promise;h.advance(25000);await response(h,503);gate.resolve();await settle(h);assert.equal(h.queries.length,1);assert.equal(h.updates.length,0);assert.equal(h.transports.length,1);results.push('Optimize GET native original SQL history invocation held25s: terminal503 closes HTTP while observing its same late readonly SQL producer, no duplicate query or follow-on transport');
  }
  {
   const u=await newOwner();await prisma.youtubeToken.update({where:{userId:u.id},data:{accessToken:'synthetic-expired',refreshToken:'synthetic-refresh',expiresAt:new Date(0)}});const h=bind(u,{oauth:true,held:'refreshJSON'});await h.entered.refreshJSON.promise;h.advance(25000);await response(h,503);h.gates.refreshJSON.resolve();await settle(h);assert.equal(h.transports.length,1);assert.equal(h.updates.length,1);const token=await prisma.youtubeToken.findUnique({where:{userId:u.id}});assert.equal(token.accessToken,'synthetic-refreshed');assert.equal(h.queries.length,0);assert(!h.calls.includes('searchHeaders'));results.push('Optimize GET native invoked fictitious OAuth retains original own token persistence after HTTP25s; real SQL update observed once, no cancellation/reconstruction/new refresh or Google/title/history effect');
  }
  {
   const foreign=await prisma.optimizeHistory.findFirst({where:{userId:neighbor.id,videoId:'synthetic01'}}),h=bind(owner,{detail:true,historyReader:async()=>[foreign]});await response(h,503);assert.equal(h.queries.length,1);assert.equal(h.updates.length,0);results.push('Optimize GET native foreign SQL-row acknowledgement rejected generic503 without neighboring history disclosure or substitute data');
  }
  assert.deepEqual(await prisma.optimizeHistory.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeRows);assert.deepEqual(await prisma.user.findUnique({where:{id:owner.id}}),beforeOwner);assert.deepEqual(await prisma.user.findUnique({where:{id:neighbor.id}}),beforeNeighbor);assert.deepEqual(await prisma.youtubeToken.findMany({where:{userId:{in:[owner.id,neighbor.id]}},orderBy:{id:'asc'}}),beforeTokens);assert.equal(await prisma.generation.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.competitorCreationAttempt.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.extensionEvent.count({where:{userId:{in:users}}}),0);
  results.push('Optimize GET native preservation: owner/neighbor/history/valid tokens untouched, no generation/admission/extension/title writes; one fictitious already-invoked refresh persists only its own fixture token, exact own fixture cleanup');
 }finally{await prisma.user.deleteMany({where:{id:{in:users}}});}
};

