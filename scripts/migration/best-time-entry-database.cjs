'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {bestTimeFixture:f,createBestTimeFixtureTransport,seedBestTimeFixture}=require('../../lib/migration/best-time-fixture.cjs');
const {create,ready,analyze,reads,posts}=require('./best-time-client.test.cjs');
module.exports=async function(prisma,results){
 await prisma.$transaction(async tx=>seedBestTimeFixture({async query(sql,args){return {rows:sql.startsWith('SELECT')?await tx.$queryRawUnsafe(sql,...args):(await tx.$executeRawUnsafe(sql,...args),[])};}}));
 const user=await prisma.user.findUnique({where:{id:f.userId}});assert.equal(user.email,f.email);
 const existing=await prisma.bestTimeAnalysisAttempt.findUnique({where:{userId:f.userId}});
 assert.equal(existing,null,'Existing unknown fixture original must be preserved; do not reset or replace this owner to force a demo');
 const owner=Object.freeze({id:f.userId,email:f.email}),runs=[],effects=[];
 let session={user:owner};
 const forbidden=()=>{throw Error('No real transport/model permitted');};
 const analysis=load('lib/best-time-analysis.ts');
 const source=load('lib/best-time-youtube-sources.ts',{'@/lib/youtube-auth':{getAccessToken:forbidden},'./best-time-analysis':analysis},{fetch:forbidden});
 const reader=load('lib/best-time-source-reader.ts',{'./best-time-analysis':analysis});
 const api=load('lib/best-time-original.ts',{'node:crypto':require('node:crypto'),'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma},'@/lib/plans':load('lib/plans.ts',{'@/lib/prisma':{prisma}}),'@/lib/image/thumbnail-quota':load('lib/image/thumbnail-quota.ts'),'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'./best-time-source-reader':reader,'@prisma/client':require('@prisma/client'),'./best-time-youtube-sources':source,'./best-time-tip':{generateBestTimeTip:forbidden}});
 const entry=load('lib/migration/best-time-entry.ts',{'server-only':{}},{process:{env:{YTV_MIGRATION_WEB_TEST:'1'}},__ytvRuntimeGuard:true});
 entry.installBestTimeFixtureEntry(request=>{effects.push('original');const run=api.runBoundBestTimeOriginal(request,source.createBestTimeYouTubeSources(f.referenceAt,request.signal,createBestTimeFixtureTransport()),owner);runs.push(run);return run;});
 const http=load('lib/best-time-http.ts',{'next/server':{NextResponse:Response},'@/lib/migration/best-time-entry':entry},{AbortController});
 const route=load('app/api/youtube/best-time/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma},'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'@/lib/best-time-http':http,'@/lib/best-time-eligibility':{readBestTimeEligibility:forbidden}});
 const before=await prisma.generation.count({where:{userId:f.userId}}),h=create(),pending=[];
 h.state.user=f.userId;h.state.email=f.email;
 h.state.send=r=>{const run=route[r.init.method](new Request('http://127.0.0.1:4300/api/youtube/best-time',{method:r.init.method,headers:{'idempotency-key':'forged-model-operation'},...(r.init.method==='POST'?{body:'{"referenceAt":"2099-01-01","owner":"foreign","reset":true,"withTip":true,"model":"real"}'}:{})}));pending.push(run);return run.then(response=>({ok:response.ok,status:response.status,json:()=>response.json()}));};
 const settle=async()=>{for(let i=0;i<4;i++){await ready(h);await Promise.allSettled(pending);}await ready(h);};
 try{
  await settle();assert.equal(posts(h).length,0);assert.equal(reads(h).length,1);
  const click=analyze(h).props.onClick;click();click();await settle();
  assert.equal(posts(h).length,1);assert.equal(reads(h).length,2);assert.equal(runs.length,1);assert.equal((await runs[0].original).status,200);
  assert.match(h.text(),/3 vídeos analizados/);assert.equal(h.timers.size,0);
  const cache=await prisma.bestTimeAnalysis.findUnique({where:{userId:f.userId}});assert.equal(cache.analyzedAt.toISOString(),'2026-10-12T12:00:00.000Z');assert.equal(cache.aiTip,null);assert.equal(cache.videoCount,3);assert.equal(await prisma.bestTimeAnalysisAttempt.count({where:{userId:f.userId}}),0);
  assert.equal(await prisma.generation.count({where:{userId:f.userId}}),before);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:f.userId}}),0);
  results.push('native guarded fixture entry: actual page click → one POST/original admission → injected uploads/details → cache ACK/close → own GET → rendered3 videos, declared timestamp preserved and no model/debit');
  const snapshot={user:await prisma.user.findUnique({where:{id:f.userId}}),subscription:await prisma.subscription.findUnique({where:{userId:f.userId}}),token:await prisma.youtubeToken.findUnique({where:{userId:f.userId}}),cache};
  await prisma.$transaction(async tx=>seedBestTimeFixture({async query(sql,args){return {rows:sql.startsWith('SELECT')?await tx.$queryRawUnsafe(sql,...args):(await tx.$executeRawUnsafe(sql,...args),[])};}}));
  assert.deepEqual({user:await prisma.user.findUnique({where:{id:f.userId}}),subscription:await prisma.subscription.findUnique({where:{userId:f.userId}}),token:await prisma.youtubeToken.findUnique({where:{userId:f.userId}}),cache:await prisma.bestTimeAnalysis.findUnique({where:{userId:f.userId}})},snapshot);
  results.push('native fixture seed is idempotent without resetting existing subscription/token/cache or refreshing source dates');
  session={user:{id:'foreign-authenticated-owner',email:f.email}};const wrong=await route.POST(new Request('http://127.0.0.1:4300/api/youtube/best-time',{method:'POST'}));assert.equal(wrong.status,403);assert.equal((await wrong.json()).error,'best_time_fixture_owner_required');assert.equal((await runs.at(-1).original).status,403);assert.deepEqual(await prisma.bestTimeAnalysis.findUnique({where:{userId:f.userId}}),cache);assert.equal(await prisma.bestTimeAnalysisAttempt.count({where:{userId:f.userId}}),0);
  results.push('native fixture entry refuses nonfixture auth before business SQL/source; client JSON/header cannot widen owner/model/source scope');
 }finally{h.unmount();await Promise.allSettled(pending);await Promise.allSettled(runs.map(r=>r.original));}
 // Keep this compiled demo account/cache for the guarded app. No cleanup from
 // row absence, and no operational provenance/acceptance inferred from it.
};
