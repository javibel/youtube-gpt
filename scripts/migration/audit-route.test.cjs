'use strict';
const assert=require('node:assert/strict');const {load}=require('./route-harness.cjs');const {taskFixture}=require('./task-fixture.cjs');
function harness(options={}){
 const calls=[],requests=[];
 const runtime=taskFixture({taskType:'youtube.audit-summary',controlUnavailable:options.noControl,respond:async payload=>{calls.push(payload);if(options.aiError)throw Error('Synthetic error');return {content:[{type:'text',text:options.text??'{"es":"Resumen sintético","en":"Synthetic summary"}'}],stop_reason:options.stopReason??'end_turn'};}});
 const videos=Array.from({length:4},(_,i)=>({id:'synthetic'+i,snippet:{title:'Synthetic educational video title '+i,description:'Synthetic description',tags:['synthetic'],publishedAt:new Date(Date.now()-(i+1)*86400000).toISOString()},statistics:{viewCount:String((i+1)*100),likeCount:'10',commentCount:'2'},contentDetails:{duration:'PT10M'}}));
 const route=load('app/api/youtube/audit/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},'@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:p=>p==='pro'},'@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},'@/lib/ai/task-runtime':runtime,'@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>options.noChannel?null:{channelId:'synthetic',channelName:'Synthetic channel',subscribers:1000}}}}},{URLSearchParams,fetch:async(url,init)=>{
  requests.push(url);const u=new URL(url);assert.equal(init.headers.Authorization,'Bearer synthetic-token');
  if(u.hostname==='youtubeanalytics.googleapis.com'){
   if(options.analyticsError)return Response.json({error:{message:'Synthetic unavailable'}},{status:503});
   const keys=[...(u.searchParams.get('dimensions')?.split(',')??[]),...u.searchParams.get('metrics').split(',')];const values={day:'2026-09-01',views:1000,estimatedMinutesWatched:5000,averageViewDuration:300,averageViewPercentage:50,subscribersGained:12,subscribersLost:3,likes:100,comments:20,shares:10};return Response.json({columnHeaders:keys.map(name=>({name})),rows:[keys.map(k=>values[k])]});
  }
  assert.equal(u.hostname,'www.googleapis.com');if(u.pathname.endsWith('/search'))return Response.json({items:options.empty?[]:videos.map(v=>({id:{videoId:v.id}}))},{status:options.searchStatus??200});assert.ok(u.pathname.endsWith('/videos'));return Response.json({items:videos},{status:options.statsStatus??200});
 }});
 async function run(){const r=await route.GET();return {status:r.status,body:await r.json()};}
 return {run,calls,requests};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 for(const [options,status] of [[{anonymous:true},401],[{free:true},403],[{noChannel:true},400],[{noToken:true},401]])await test('entry restriction '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
 await test('audit categories and bilingual summary',async()=>{const r=await harness().run();assert.equal(r.status,200);assert.equal(r.body.videosAnalyzed,4);assert.equal(r.body.categories.length,5);assert.equal(r.body.healthScore,Math.round(r.body.categories.reduce((s,c)=>s+c.score,0)/5));assert.ok(r.body.healthScore>=0&&r.body.healthScore<=100);assert.deepEqual(r.body.aiSummary,{es:'Resumen sintético',en:'Synthetic summary'});assert.equal(r.body.patterns.topVideos[0].views,400);});
 for(const options of [{noControl:true},{aiError:true},{text:'invalid'},{text:'{"es":7,"en":null}'},{stopReason:'max_tokens'}])await test('optional summary failure preserves audit '+JSON.stringify(options),async()=>{const r=await harness(options).run();assert.equal(r.status,200);assert.equal(r.body.aiSummary,null);assert.equal(r.body.videosAnalyzed,4);assert.equal(r.body.categories.length,5);});
 for(const options of [{searchStatus:503},{statsStatus:503},{analyticsError:true}])await test('source failure avoids AI '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.run()).status,500);assert.equal(h.calls.length,0);});
 await test('empty channel avoids AI',async()=>{const h=harness({empty:true});assert.equal((await h.run()).body.error,'no_videos');assert.equal(h.calls.length,0);});
 console.log(JSON.stringify({scope:'actual audit route and scoring, synthetic analytics and provider; not exhaustive scoring coverage',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
