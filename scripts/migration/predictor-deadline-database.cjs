'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'predictor-wait-'+randomUUID()+'@example.invalid'}}))),owner=users[0].id,neighbor=users[1].id;
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),request=signal=>new Request('https://example.invalid/api/predictor',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'native-predictor-wait'},body:'{"title":"Synthetic native proposal"}',signal});
 const business=async()=>({generations:await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),entries:await prisma.calendarEntry.count({where:{userId:{in:users.map(u=>u.id)}}})});
 const api=(db,resolver,globals={})=>load('app/api/predictor/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/plans':plans,'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':{getAccessToken:resolver},'@/lib/ai/task-runtime':{getMessagesTask:async()=>{throw Error('Retired original must not construct a task');}}},globals);
 const clock=()=>{let elapsed=0;const timers=new Map();return {globals:{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)},timers,expire(){elapsed=55000;for(const fn of [...timers.values()])fn();}};};
 const retired=async response=>{assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'prediction_unconfirmed',retryMayConsume:false});assert.equal(response.headers.get('cache-control'),'no-store');};
 try{
  await prisma.subscription.create({data:{userId:owner,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  await prisma.youtubeToken.createMany({data:users.map(u=>({userId:u.id,channelId:'UC_synthetic_'+u.id,channelName:'Synthetic native channel',accessToken:'synthetic-original-'+u.id,refreshToken:'synthetic-refresh-'+u.id,expiresAt:new Date(0)}))});
  const neighborBefore=await prisma.youtubeToken.findUnique({where:{userId:neighbor}});
  {
   const selected=deferred(),ack=deferred(),finished=deferred(),time=clock();let queries=0,resolvers=0,fetches=0;
   const db={youtubeToken:{findUnique:async input=>{queries++;const row=await prisma.youtubeToken.findUnique(input);assert.equal(row.userId,owner);selected.resolve();await ack.promise;finished.resolve();return row;}}};
   const before=await prisma.youtubeToken.findUnique({where:{userId:owner}}),route=api(db,async()=>{resolvers++;throw Error('Late SELECT must not resolve OAuth');},{...time.globals,fetch:()=>{fetches++;throw Error('No external calls');}}),original=route.POST(request());await selected.promise;time.expire();await retired(await original);ack.resolve();await finished.promise;await flush();assert.equal(queries,1);assert.equal(resolvers,0);assert.equal(fetches,0);assert.equal(time.timers.size,0);assert.deepEqual(await prisma.youtubeToken.findUnique({where:{userId:owner}}),before);
   results.push('predictor actual owner-scoped PostgreSQL token SELECT acknowledgement withheld until HTTP deadline503; late row cannot resolve OAuth or construct a task, native token unchanged');
  }
  for(const reason of ['deadline','abort']){
   // Each case starts a new designated synthetic credential; no operational age is renewed.
   await prisma.youtubeToken.update({where:{userId:owner},data:{accessToken:'synthetic-expired-'+reason,refreshToken:'synthetic-refresh-'+reason,expiresAt:new Date(0)}});
   const committed=deferred(),ack=deferred(),finished=deferred(),controller=new AbortController(),time=clock();let refreshes=0,writes=0,resolvers=0,fetches=0;
   const oauthDb={youtubeToken:{findUnique:input=>prisma.youtubeToken.findUnique(input),update:async input=>{writes++;const row=await prisma.youtubeToken.update(input);committed.resolve(row);await ack.promise;return row;}}};
   const oauth=load('lib/youtube-auth.ts',{'@/lib/prisma':{prisma:oauthDb}},{fetch:async(url,init)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(JSON.parse(init.body).refresh_token,'synthetic-refresh-'+reason);refreshes++;return Response.json({access_token:'synthetic-rotated-'+reason,expires_in:3600});}});
   const resolver=async id=>{resolvers++;assert.equal(id,owner);const value=await oauth.getAccessToken(id);finished.resolve();return value;};
   const route=api(prisma,resolver,{...time.globals,fetch:()=>{fetches++;throw Error('Retired OAuth must not fetch channel videos');}}),original=route.POST(request(controller.signal));await committed.promise;
   assert.equal((await prisma.youtubeToken.findUnique({where:{userId:owner}})).accessToken,'synthetic-rotated-'+reason);
   if(reason==='abort')controller.abort();else time.expire();const response=await original;await retired(response);assert.equal(time.timers.size,0);ack.resolve();await finished.promise;await flush();assert.equal(response.status,503);assert.equal(resolvers,1);assert.equal(refreshes,1);assert.equal(writes,1);assert.equal(fetches,0);assert.deepEqual(await prisma.youtubeToken.findUnique({where:{userId:neighbor}}),neighborBefore);assert.deepEqual(await business(),{generations:0,entries:0});
   results.push('predictor '+reason+' after original getAccessToken synthetic OAuth refresh and actual native token commit: HTTP503 retains uncertainty; late original update acknowledgement cannot fetch videos or dispatch a task, one refresh/update, neighboring owner intact (no real OAuth or AI admission)');
  }
  {
   const body=deferred(),started=deferred(),controller=new AbortController();let queries=0;
   const route=api({youtubeToken:{findUnique:async()=>{queries++;throw Error('Late body must not SELECT');}}},async()=>{throw Error('No OAuth');}),req=request(controller.signal);req.json=()=>{started.resolve();return body.promise;};const original=route.POST(req);await started.promise;controller.abort();await retired(await original);body.resolve({title:'Synthetic late body'});await flush();assert.equal(queries,0);assert.deepEqual(await business(),{generations:0,entries:0});
   results.push('predictor body abort after actual stored-Pro PostgreSQL authorization prevents late body from selecting token or admitting a task; native business rows unchanged');
  }
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
