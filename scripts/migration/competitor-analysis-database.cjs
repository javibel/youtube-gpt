'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),crypto=require('node:crypto'),bcrypt=require('bcryptjs'),{load}=require('./route-harness.cjs'),{flush,deferred}=require('./chat-widget-harness.cjs'),{harness,response,channelId}=require('./competitor-analysis-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const password='closed-native-competitor-pg-password',users=[],newOwner=async paid=>{const u=await prisma.user.create({data:{email:'analysis-native-'+randomUUID()+'@example.invalid',emailVerified:new Date(),password:await bcrypt.hash(password,8)}});users.push(u.id);if(paid)await prisma.subscription.create({data:{userId:u.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});return u;};
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),options=u=>({userId:u.id,email:u.email,userReader:q=>prisma.user.findUnique(q),planReader:id=>plans.getUserPlan(id)});
 const rows=()=>prisma.trackedCompetitor.findMany({where:{userId:{in:users}},include:{snapshots:true},orderBy:{id:'asc'}}),admissions=()=>prisma.competitorCreationAttempt.findMany({where:{userId:{in:users}},orderBy:{id:'asc'}});
 try{
  const owner=await newOwner(true),free=await newOwner(false),neighbor=await newOwner(true);
  for(const u of [owner,neighbor]){const c=await prisma.trackedCompetitor.create({data:{userId:u.id,channelId:'UC_neighbor_'+randomUUID(),channelName:'Native neighbor '+u.id}});await prisma.competitorSnapshot.create({data:{competitorId:c.id,subscribers:12,totalViews:600n,videoCount:3}});}
  const beforeRows=await rows(),beforeAdmissions=await admissions(),beforeUsers=await prisma.user.findMany({where:{id:{in:users}},orderBy:{id:'asc'}}),beforeSubscriptions=await prisma.subscription.findMany({where:{userId:{in:users}},orderBy:{id:'asc'}});
  {
   const h=harness({...options(free),session:{user:{id:free.id}}});await response(h,403);assert.deepEqual(h.plans,[free.id]);assert.equal(h.queries.length,0);assert.equal(h.transports.length,0);results.push('Analysis server native Free/id-only session: actual stored plan rejects403 before Google, fixing absent-email entitlement bypass without business writes');
  }
  {
   const h=harness(options(owner)),b=await response(h,200);assert.equal(b.userId,owner.id);assert.equal(b.language,'en');assert.equal(b.channel.id,channelId);assert.equal(b.collectionStatus,'complete');assert.equal(b.avgViews,200);assert.equal(b.totalVideosAvailable,3);assert.equal(b.topVideos[0].publishedAt,'2026-10-01T00:00:00Z');assert.deepEqual(h.plans,[owner.id]);assert.equal(h.queries[0].where.email,owner.email);results.push('Analysis server native Pro: actual user email/identity SELECT plus stored plan and fictitious Google return original scoped dates, order, average and complete coverage');
  }
  {
   const gate=deferred(),entered=deferred(),owned=[];const h=harness({...options(owner),userReader:q=>{const p=(async()=>{const user=await prisma.user.findUnique(q);entered.resolve();await gate.promise;return user;})();owned.push(p);return p;}});await entered.promise;h.advance(25000);await response(h,503);gate.resolve();await Promise.all(owned);await flush();assert.equal(h.plans.length,0);assert.equal(h.transports.length,0);assert.equal(owned.length,1);results.push('Analysis server native held user SELECT acknowledgement: one25s waiter retires, same actual query observed; no plan/Google successor or replacement query');
  }
  {
   const gate=deferred(),entered=deferred(),owned=[];const h=harness({...options(owner),planReader:id=>{const p=(async()=>{const plan=await plans.getUserPlan(id);entered.resolve();await gate.promise;return plan;})();owned.push(p);return p;}});await entered.promise;h.advance(25000);await response(h,503);gate.resolve();await Promise.all(owned);await flush();assert.equal(h.transports.length,0);assert.equal(h.calls.filter(x=>x==='body').length,0);assert.equal(owned.length,1);results.push('Analysis server native held plan acknowledgement: actual original subscription SELECT completes without body/Google after common25s retirement');
  }
  {
   const gate=deferred(),entered=deferred(),owned=[];const h=harness({...options(owner),planReader:id=>{const p=(async()=>{const plan=await plans.getUserPlan(id);entered.resolve();await gate.promise;return plan;})();owned.push(p);return p;}});await entered.promise;h.state.auth.user.id=neighbor.id;h.state.auth.user.email=neighbor.email;gate.resolve();await Promise.all(owned);const b=await response(h,200);assert.equal(b.userId,owner.id);assert.deepEqual(h.plans,[owner.id]);assert.equal(h.queries[0].where.email,owner.email);results.push('Analysis server native account capture: auth mutation during original stored-plan wait cannot redirect email/identity or disclose neighbor result');
  }
  for(const mode of ['paid','free','expired']){
   const u=mode==='free'?free:owner;
   const issuer=load('lib/extension-token-native-authorization.ts',{'node:crypto':crypto,'@/lib/prisma':{prisma},'@/lib/native-user-session':{readNativeVerifiedUser(){throw Error('No cookie recovery');}},'@/lib/plans':plans,bcryptjs:bcrypt,'@/lib/admin-email':{ADMIN_EMAIL:'other-admin@example.invalid'}},{Date});
   const credential=await issuer.authorizeNativeExtensionPassword({email:u.email,password},()=>{}),minted=await issuer.mintNativeExtensionToken(credential,randomUUID(),()=>{}),token=minted.token;
   if(mode==='expired')await prisma.extensionToken.update({where:{token},data:{expiresAt:new Date(0)}});
   const nativeExtension=load('lib/extension-competitor-native-authorization.ts',{'@/lib/prisma':{prisma},'@/lib/plans':plans},{Date}),beforeEvents=await prisma.extensionEvent.count({where:{userId:u.id}});
   const actual=harness({...options(u),extensionMode:true,authorization:'Bearer '+token,held:'auth',nativeExtension});
   actual.request.headers.set('authorization','Bearer foreign-token');actual.request.url='https://example.invalid/foreign';actual.gates.auth.resolve();
   const b=await response(actual,mode==='paid'?200:mode==='free'?403:401);
   if(mode==='paid'){assert.equal(b.userId,u.id);assert.equal(b.channel.id,channelId);}else assert.equal(actual.transports.length,0);
   assert.equal(actual.extensions[0].headers.get('authorization'),'Bearer '+token);assert.equal(actual.extensions[0].url,'https://example.invalid/api/youtube/competitor');
   assert.equal(await prisma.extensionEvent.count({where:{userId:u.id}}),beforeEvents);
   results.push('Analysis native extension '+mode+': actual native password/crypto issuer and single-use competitor purpose; token/verified owner/paid plan original, no retention/auth writer or real Google/OAuth.');
  }
  {
   const h=harness({...options(owner),held:'playlistJSON'});await h.entered.playlistJSON.promise;h.advance(25000);await response(h,503);const before=h.transports.length;h.gates.playlistJSON.resolve();await flush();assert.equal(h.transports.length,before);results.push('Analysis server native plan plus original Google body: late playlist starts no video statistics successor and does not renew25s budget');
  }
  assert.deepEqual(await rows(),beforeRows);assert.deepEqual(await admissions(),beforeAdmissions);assert.deepEqual(await prisma.user.findMany({where:{id:{in:users}},orderBy:{id:'asc'}}),beforeUsers);assert.deepEqual(await prisma.subscription.findMany({where:{userId:{in:users}},orderBy:{id:'asc'}}),beforeSubscriptions);assert.equal(await prisma.competitorDeletionAttempt.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.extensionEvent.count({where:{userId:neighbor.id}}),0);
  results.push('Analysis server native preservation: accounts/subscriptions/competitors/snapshots/creation/deletion admissions unchanged; neighbor has no retention event; only authorized synthetic auth fixtures');
 }finally{results.push('Native analysis fixtures retained without deletion: '+users.join(','));}
};
