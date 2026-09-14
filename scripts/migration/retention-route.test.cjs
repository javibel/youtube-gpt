'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const parser=load('lib/parse-claude-json.ts');
const sampleRows=[[0,.95],[.2,.85],[.4,.6],[.6,.6],[.8,.5]];
function harness(options={}){
 const requests=[];
 const route=load('app/api/youtube/retention/route.ts',{
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>options.noChannel?null:{channelId:'synthetic-channel'}}}},
  '@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},'@/lib/parse-claude-json':parser,
 },{process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:async(url,init)=>{
  const u=new URL(url);requests.push({url,body:init?.body?JSON.parse(init.body):null});
  if(u.hostname==='www.googleapis.com'){
   assert.equal(init.headers.Authorization,'Bearer synthetic-token');
   if(u.pathname==='/youtube/v3/search')return Response.json({items:options.noVideos?[]:[{id:{videoId:'synthetic-video'}}]},{status:options.searchStatus??200});
   assert.equal(u.pathname,'/youtube/v3/videos');return Response.json({items:[{id:'synthetic-video',snippet:{title:'Synthetic video'},statistics:{viewCount:'100'},contentDetails:{duration:'PT2M'}}]});
  }
  if(u.hostname==='youtubeanalytics.googleapis.com'){assert.equal(init.headers.Authorization,'Bearer synthetic-token');return Response.json({rows:options.rows??sampleRows},{status:options.analyticsStatus??200});}
  assert.equal(url,'https://api.anthropic.com/v1/messages');if(options.aiError)throw Error('Synthetic provider failure');
  return Response.json({content:[{text:options.text??JSON.stringify({tips:['Synthetic tip'],dropOffReasons:{'synthetic-video':[{timestamp:'0:48',reason:'Synthetic reason'}]}})}],stop_reason:options.stopReason??'end_turn'},{status:options.aiStatus??200});
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
 await test('missing AI key preserves data-only response',async()=>{const h=harness({noKey:true});const r=await h.run();assert.equal(r.status,200);assert.deepEqual(r.body.aiTips,[]);assert.equal(h.requests.length,2);});
 await test('provider error preserves data-only response',async()=>{const r=await harness({aiStatus:429}).run();assert.equal(r.status,200);assert.deepEqual(r.body.aiTips,[]);});
 await test('transport error preserves data-only response',async()=>{assert.deepEqual((await harness({aiError:true}).run()).body.aiTips,[]);});
 await test('malformed AI JSON preserves data',async()=>{assert.deepEqual((await harness({text:'invalid'}).run()).body.aiTips,[]);});
 await test('legacy array output remains compatible',async()=>{assert.deepEqual((await harness({text:'["Synthetic legacy tip"]'}).run()).body.aiTips,['Synthetic legacy tip']);});
 await test('fenced JSON uses actual shared parser',async()=>{assert.deepEqual((await harness({text:'\n```json\n{"tips":["Synthetic fenced"]}\n```'}).run()).body.aiTips,['Synthetic fenced']);});
 await test('Spanish instruction',async()=>{const h=harness();await h.run();assert.match(h.requests[2].body.messages[0].content,/Reply in Spanish/);});
 await test('English instruction',async()=>{const h=harness();await h.run({videoId:'synthetic-video',lang:'en'});assert.match(h.requests[2].body.messages[0].content,/Reply in English/);});
 await test('null body escapes route',async()=>{await assert.rejects(harness().run(null));},true);
 await test('tips accept non-string entries',async()=>{assert.deepEqual((await harness({text:'{"tips":[7,null]}'}).run()).body.aiTips,[7,null]);},true);
 await test('truncated provider output accepted',async()=>{assert.deepEqual((await harness({stopReason:'max_tokens'}).run()).body.aiTips,['Synthetic tip']);},true);
 console.log(JSON.stringify({scope:'actual retention route and parser; synthetic OAuth, YouTube data and AI; no operational API calls',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
