'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const sampleRows=[[0,.95],[.2,.85],[.4,.6],[.6,.6],[.8,.5]];
function harness(options={}){
 const requests=[];
 const runtime=taskFixture({taskType:'youtube.retention-insights',controlUnavailable:options.noKey,respond:async()=>{requests.push({url:'synthetic:provider',body:runtime.calls.at(-1)});if(options.aiError)throw Error('Synthetic provider failure');if(options.aiStatus&&options.aiStatus!==200)throw {status:options.aiStatus};return {content:[{type:'text',text:options.text??JSON.stringify({tips:['Synthetic tip'],dropOffReasons:{'synthetic-video':[{timestamp:'0:48',reason:'Synthetic reason'}]}})}],stop_reason:options.stopReason??'end_turn'};}});
 const route=load('app/api/youtube/retention/route.ts',{
  '@/lib/ai/task-runtime':runtime,
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>options.noChannel?null:{channelId:'synthetic-channel'}}}},
  '@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},
 },{process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:async(url,init)=>{
  const u=new URL(url);requests.push({url,body:init?.body?JSON.parse(init.body):null});
  if(u.hostname==='www.googleapis.com'){
   assert.equal(init.headers.Authorization,'Bearer synthetic-token');
   if(u.pathname==='/youtube/v3/search')return Response.json({items:options.noVideos?[]:[{id:{videoId:'synthetic-video'}}]},{status:options.searchStatus??200});
   assert.equal(u.pathname,'/youtube/v3/videos');return Response.json({items:[{id:'synthetic-video',snippet:{title:'Synthetic video'},statistics:{viewCount:'100'},contentDetails:{duration:'PT2M'}}]});
  }
  if(u.hostname==='youtubeanalytics.googleapis.com'){assert.equal(init.headers.Authorization,'Bearer synthetic-token');return Response.json({rows:options.rows??sampleRows},{status:options.analyticsStatus??200});}
  throw Error('Unexpected external URL: '+url);
 }});
 async function run(body={videoId:'synthetic-video',lang:'es'}){const r=await route.POST(new Request('https://example.invalid/api/youtube/retention',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,requests};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status] of [['anonymous blocked',{anonymous:true},401],['free account blocked',{free:true},403],['no channel',{noChannel:true},400],['expired token',{noToken:true},401]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);});
 await test('retention arithmetic',async()=>{const r=await harness().run();assert.equal(r.status,200);assert.equal(r.body.videos[0].avgRetention,70);assert.equal(r.body.videos[0].hookScore,95);assert.equal(r.body.videos[0].duration,120);assert.deepEqual(r.body.videos[0].retention,[95,85,60,60,50]);});
 await test('drop location and magnitude',async()=>{const r=await harness().run();assert.deepEqual(r.body.videos[0].dropOffPoints,[{time:48,drop:25,retentionBefore:85,retentionAfter:60}]);});
 await test('tips and reasons preserve output contract',async()=>{const r=await harness().run();assert.deepEqual(r.body.aiTips,['Synthetic tip']);assert.equal(r.body.dropOffReasons['synthetic-video'][0].timestamp,'0:48');});
 await test('recent videos searched when none selected',async()=>{const h=harness();assert.equal((await h.run({})).status,200);assert.match(h.requests[0].url,/\/search\?/);});
 await test('no videos controlled',async()=>{const h=harness({noVideos:true});assert.equal((await h.run({})).body.error,'no_videos');assert.equal(h.requests.length,1);});
 await test('search failure controlled',async()=>{assert.equal((await harness({searchStatus:503}).run({})).body.error,'no_videos');});
 await test('too few data points prevent AI',async()=>{const h=harness({rows:sampleRows.slice(0,4)});assert.equal((await h.run()).body.error,'no_retention_data');assert.equal(h.requests.length,2);});
 await test('analytics failure prevents AI',async()=>{const h=harness({analyticsStatus:403});assert.equal((await h.run()).body.error,'no_retention_data');assert.equal(h.requests.length,2);});
 await test('missing task control preserves data-only response',async()=>{const h=harness({noKey:true});const r=await h.run();assert.equal(r.status,200);assert.deepEqual(r.body.aiTips,[]);assert.equal(h.requests.length,2);});
 await test('provider error preserves data-only response',async()=>{const r=await harness({aiStatus:429}).run();assert.equal(r.status,200);assert.deepEqual(r.body.aiTips,[]);});
 await test('transport error preserves data-only response',async()=>{assert.deepEqual((await harness({aiError:true}).run()).body.aiTips,[]);});
 await test('malformed AI JSON preserves data',async()=>{assert.deepEqual((await harness({text:'invalid'}).run()).body.aiTips,[]);});
 await test('unexpected array preserves metrics without invalid tips',async()=>{assert.deepEqual((await harness({text:'["Synthetic legacy tip"]'}).run()).body.aiTips,[]);});
 await test('fenced JSON uses protocol adapter validation',async()=>{assert.deepEqual((await harness({text:'\n```json\n{"tips":["Synthetic fenced"]}\n```'}).run()).body.aiTips,['Synthetic fenced']);});
 await test('Spanish instruction',async()=>{const h=harness();await h.run();assert.match(h.requests[2].body.messages[0].content,/Reply in Spanish/);});
 await test('English instruction',async()=>{const h=harness();await h.run({videoId:'synthetic-video',lang:'en'});assert.match(h.requests[2].body.messages[0].content,/Reply in English/);});
 await test('null body rejected',async()=>{assert.equal((await harness().run(null)).status,400);});
 await test('invalid tips preserve metrics',async()=>{assert.deepEqual((await harness({text:'{"tips":[7,null]}'}).run()).body.aiTips,[]);});
 await test('truncated output preserves metrics without partial tips',async()=>{assert.deepEqual((await harness({stopReason:'max_tokens'}).run()).body.aiTips,[]);});
 await test('unknown video reason rejected',async()=>{assert.deepEqual((await harness({text:JSON.stringify({tips:['Synthetic'],dropOffReasons:{unknown:[{timestamp:'0:00',reason:'Synthetic'}]}})}).run()).body.dropOffReasons,{});});
 await test('numeric video ID rejected before fetch',async()=>{const h=harness();assert.equal((await h.run({videoId:42})).status,400);assert.equal(h.requests.length,0);});
 console.log(JSON.stringify({scope:'actual retention route and parser; synthetic OAuth, YouTube data and AI; no operational API calls',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
