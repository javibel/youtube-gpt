'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const id='synthetic01';
function harness(options={}){
 const calls=[],requests=[],quotaKeys=[];
 const fixtures=Object.fromEntries(['public.seo-tip','public.thumbnail-review'].map(taskType=>[taskType,taskFixture({taskType,serviceId:'public-seo',controlUnavailable:options.noControl,respond:async body=>{calls.push(body);if(options.aiError)throw Error('Synthetic AI failure');return {content:[{type:'text',text:options.text??JSON.stringify(taskType==='public.seo-tip'?{es:'Consejo sintético',en:'Synthetic tip'}:{es:'Consejo sintético',en:'Synthetic tip',rating:'good'})}],stop_reason:options.stopReason??'end_turn'};}})]));
 const route=load('app/api/youtube/seo-score-url/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/ai/task-runtime':{getMessagesTask:identity=>fixtures[identity.taskType].getMessagesTask(identity)},
  '@/lib/prisma':{prisma:{$queryRaw:async(strings,key)=>{quotaKeys.push(key);if(options.quotaError)throw Error('Synthetic quota store failure');return [{hits:options.hits??1}];}}},
 },{process:{env:{ANTHROPIC_API_KEY:'synthetic-not-a-key',...(options.noKey?{}:{YOUTUBE_API_KEY:'synthetic-youtube'})}},fetch:async url=>{
  requests.push(url);const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');assert.equal(u.pathname,'/youtube/v3/videos');
  if(options.youtubeError)throw Error('Synthetic YouTube failure');
  return Response.json({items:options.noVideo?[]:[{snippet:{title:'Synthetic educational video title about cameras',description:'Synthetic description for creators',tags:['synthetic'],categoryId:'27',...(options.thumbnail?{thumbnails:{medium:{url:'https://example.invalid/thumbnail.jpg'},high:{url:'https://example.invalid/thumbnail.jpg'}}}:{})},statistics:{viewCount:'100',likeCount:'8',commentCount:'2'},contentDetails:{duration:'PT2M'}}]},{status:options.youtubeStatus??200});
 }});
 async function run(body={url:id},headers={}){const r=await route.POST(new Request('https://example.invalid/api/youtube/seo-score-url',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,calls,requests,quotaKeys};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('public route works without session',async()=>{const r=await harness().run();assert.equal(r.status,200);assert.equal(r.body.videoId,id);assert.equal(r.body.views,100);assert.ok(r.body.score>=0&&r.body.score<=100);});
 await test('IP quota blocks all external requests',async()=>{const h=harness({hits:21});assert.equal((await h.run()).status,429);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
 await test('quota key uses first forwarded IP',async()=>{const h=harness({hits:21});await h.run(undefined,{'x-forwarded-for':'192.0.2.1, 192.0.2.2'});assert.equal(h.quotaKeys[0],'seo-url:192.0.2.1');});
 await test('missing YouTube key blocks requests',async()=>{const h=harness({noKey:true});assert.equal((await h.run()).status,503);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
 for(const body of [{},{url:'bad'},{url:42},{url:{}},{videoId:42},null])await test('invalid URL rejected: '+JSON.stringify(body),async()=>{const h=harness();assert.equal((await h.run(body)).status,400);assert.equal(h.requests.length,0);assert.equal(h.calls.length,0);});
 for(const url of ['https://youtube.com/watch?v='+id,'https://youtu.be/'+id,'https://youtube.com/shorts/'+id,'https://youtube.com/embed/'+id])await test('supported URL: '+url,async()=>assert.equal((await harness().run({url})).body.videoId,id));
 await test('missing video response',async()=>{assert.equal((await harness({noVideo:true}).run()).status,404);});
 await test('YouTube failure response',async()=>{assert.equal((await harness({youtubeStatus:503}).run()).status,500);});
 await test('YouTube transport failure response',async()=>{assert.equal((await harness({youtubeError:true}).run()).status,500);});
 await test('AI error retains deterministic checklist',async()=>{const r=await harness({aiError:true}).run();assert.equal(r.status,200);assert.ok(r.body.checklist.length>0);assert.equal(r.body.checklist.some(c=>c.key==='ai_tip'),false);});
 await test('AI malformed output retains deterministic checklist',async()=>{assert.equal((await harness({text:'invalid'}).run()).status,200);});
 await test('vision request uses synthetic image fixture',async()=>{const h=harness({thumbnail:true});const r=await h.run();assert.equal(h.calls.length,2);const vision=h.calls.find(c=>Array.isArray(c.messages[0].content)&&c.messages[0].content.some(b=>b.type==='image'));assert.equal(vision.messages[0].content[0].source.url,'https://example.invalid/thumbnail.jpg');assert.ok(r.body.checklist.some(c=>c.key==='thumbnail_quality'));});
 await test('quota store failure blocks external calls',async()=>{const h=harness({quotaError:true});assert.equal((await h.run()).status,503);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
 await test('truncated AI reply excluded',async()=>{assert.equal((await harness({stopReason:'max_tokens'}).run()).body.checklist.some(c=>c.key==='ai_tip'),false);});
 await test('missing control preserves deterministic checks',async()=>{const h=harness({noControl:true,thumbnail:true});const r=await h.run();assert.equal(r.status,200);assert.equal(h.calls.length,0);assert.ok(r.body.checklist.length);});
 await test('wrong typed advice excluded',async()=>{assert.equal((await harness({text:'{"es":7,"en":null}'}).run()).body.checklist.some(c=>c.key==='ai_tip'),false);});
 await test('invalid quota receipt blocks external work',async()=>{const h=harness({hits:-1});assert.equal((await h.run()).status,503);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
 console.log(JSON.stringify({scope:'actual public SEO route and scoring; synthetic quota/YouTube/SDK; no live requests',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
