'use strict';
const assert=require('node:assert/strict');const {load}=require('./route-harness.cjs');const {taskFixture}=require('./task-fixture.cjs');
const sample={score:70,breakdown:[{category:'Contrast',score:80,tip:'Synthetic tip'}],summary:'Synthetic summary'};
function harness(options={}){
 const calls=[],requests=[];
 const runtime=taskFixture({taskType:'youtube.thumbnail-preview',controlUnavailable:options.noControl,respond:async payload=>{calls.push(payload);if(options.aiError)throw Error('Synthetic error');return {content:[{type:'text',text:options.text??JSON.stringify(sample)}],stop_reason:options.stopReason??'end_turn'};}});
 const route=load('app/api/youtube/thumbnail-preview/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},'@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:p=>p==='pro'},'@/lib/ai/task-runtime':runtime},{process:{env:options.noKey?{}:{YOUTUBE_API_KEY:'synthetic'}},fetch:async url=>{requests.push(url);const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');if(options.youtubeError)throw Error('Synthetic search error');if(u.pathname.endsWith('/search'))return Response.json({items:[{id:{videoId:'synthetic01'}}]});assert.ok(u.pathname.endsWith('/videos'));return Response.json({items:[{id:'synthetic01',snippet:{title:'Synthetic',channelTitle:'Synthetic channel',thumbnails:{high:{url:'https://example.invalid/competitor.jpg'}}},statistics:{viewCount:'100'}}]});}});
 async function run(body={keyword:'Synthetic',thumbnailUrl:'https://example.invalid/thumb.jpg'}){const r=await route.POST(new Request('https://example.invalid/',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,calls,requests};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 for(const [options,status] of [[{anonymous:true},401],[{free:true},403],[{noKey:true},503]])await test('entry restriction '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);assert.equal(h.calls.length,0);});
 for(const body of [null,{},[],{keyword:42},{keyword:' '},{keyword:'Synthetic',thumbnailUrl:42}])await test('invalid input '+JSON.stringify(body),async()=>{const h=harness();assert.equal((await h.run(body)).status,400);assert.equal(h.requests.length,0);assert.equal(h.calls.length,0);});
 await test('typed image assessment and competitors',async()=>{const h=harness();const r=await h.run();assert.equal(r.status,200);assert.deepEqual(r.body.ctrAnalysis,sample);assert.equal(r.body.competitors[0].views,100);assert.equal(h.calls[0].messages[0].content[0].source.url,'https://example.invalid/thumb.jpg');});
 await test('no image skips AI',async()=>{const h=harness();const r=await h.run({keyword:'Synthetic'});assert.equal(r.body.ctrAnalysis,null);assert.equal(h.calls.length,0);});
 for(const options of [{noControl:true},{aiError:true},{text:'invalid'},{text:JSON.stringify({...sample,score:101})},{text:JSON.stringify({...sample,breakdown:[null]})},{stopReason:'max_tokens'}])await test('optional AI failure preserves competitors '+JSON.stringify(options),async()=>{const r=await harness(options).run();assert.equal(r.status,200);assert.equal(r.body.ctrAnalysis,null);assert.equal(r.body.competitors.length,1);});
 await test('competitor lookup failure still permits own image assessment',async()=>{const r=await harness({youtubeError:true}).run();assert.equal(r.status,200);assert.deepEqual(r.body.competitors,[]);assert.deepEqual(r.body.ctrAnalysis,sample);});
 await test('English instruction preserved',async()=>{const h=harness();await h.run({keyword:'Synthetic',thumbnailUrl:'https://example.invalid/thumb.jpg',lang:'en'});assert.match(h.calls[0].messages[0].content[1].text,/Reply in English/);});
 console.log(JSON.stringify({scope:'actual thumbnail preview route with synthetic search and image transport; no image downloads',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
