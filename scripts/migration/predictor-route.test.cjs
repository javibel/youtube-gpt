'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const prediction={estimatedViews:{low:100,mid:400,high:900},estimatedEngagement:10.3,titleScore:70,seoScore:65,viralPotential:'medium',strengths:['Synthetic strength'],weaknesses:['Synthetic weakness'],suggestion:'Synthetic advice'};
const videos=[100,200,900].map((views,i)=>({id:'synthetic-'+i,snippet:{title:'Synthetic video '+i,publishedAt:'2026-09-01T00:00:00Z',tags:['synthetic'],description:'Synthetic description'},statistics:{viewCount:String(views),likeCount:String(views/10),commentCount:'1'},contentDetails:{duration:'PT2M30S'}}));
function harness(options={}){
 const requests=[];
 const route=load('app/api/predictor/route.ts',{
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/prisma':{prisma:{youtubeToken:{findUnique:async query=>{assert.equal(query.where.userId,'synthetic');return options.noChannel?null:{channelId:'synthetic',channelName:'Synthetic channel',subscribers:1000};}}}},
  '@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-not-a-token'},
 },{Error,process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:async(url,init)=>{
  requests.push({url,body:init?.body?JSON.parse(init.body):null});const parsed=new URL(url);
  if(parsed.hostname==='www.googleapis.com'){
   assert.equal(init.headers.Authorization,'Bearer synthetic-not-a-token');
   if(parsed.pathname==='/youtube/v3/search')return Response.json({items:(options.videos??videos).map(v=>({id:{videoId:v.id}}))},{status:options.searchStatus??200});
   assert.equal(parsed.pathname,'/youtube/v3/videos');return Response.json({items:options.videos??videos},{status:options.videosStatus??200});
  }
  assert.equal(url,'https://api.anthropic.com/v1/messages');if(options.transportError)throw Error('Synthetic failure');
  return Response.json({content:[{text:options.text??JSON.stringify(prediction)}],stop_reason:options.stopReason??'end_turn'},{status:options.providerStatus??200});
 }});
 async function run(body={title:'Synthetic proposal',description:'Synthetic description',tags:'synthetic',lang:'es'}){const r=await route.POST(new Request('https://example.invalid/api/predictor',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,requests};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,body,status] of [
  ['anonymous blocked',{anonymous:true},undefined,401],['free plan blocked',{free:true},undefined,403],['empty title blocked',{}, {title:' '},400],['missing channel blocked',{noChannel:true},undefined,400],['expired token blocked',{noToken:true},undefined,401],
 ])await test(name,async()=>{const h=harness(options);assert.equal((await h.run(body)).status,status);assert.equal(h.requests.length,0);});
 for(const body of [{title:42},{title:{}},{title:'Synthetic',description:[]},{title:'Synthetic',tags:42},null])await test('invalid input controlled: '+JSON.stringify(body),async()=>{const h=harness();assert.equal((await h.run(body)).status,400);assert.equal(h.requests.length,0);});
 await test('computed baseline and response preserved',async()=>{assert.deepEqual(await harness().run(),{status:200,body:{prediction,baseline:{avgViews:400,medianViews:200,avgEngagement:10.3,topVideoViews:900,topVideoTitle:'Synthetic video 2',videoCount:3,subscribers:1000}}});});
 await test('English evaluation instruction',async()=>{const h=harness();await h.run({title:'Synthetic',lang:'en'});assert.match(h.requests[2].body.messages[0].content,/bullet points in en/);});
 await test('insufficient videos prevents AI request',async()=>{const h=harness({videos:videos.slice(0,2)});assert.equal((await h.run()).body.error,'not_enough_videos');assert.equal(h.requests.length,2);});
 await test('YouTube search failure controlled',async()=>{const h=harness({searchStatus:503});assert.equal((await h.run()).body.error,'youtube_api_error');assert.equal(h.requests.length,1);});
 await test('missing AI key cannot trigger provider',async()=>{const h=harness({noKey:true});assert.equal((await h.run()).status,503);assert.equal(h.requests.length,2);});
 await test('provider error controlled',async()=>{assert.equal((await harness({providerStatus:429}).run()).status,500);});
 await test('provider transport failure controlled',async()=>{assert.equal((await harness({transportError:true}).run()).body.error,'prediction_failed');});
 await test('fenced JSON accepted',async()=>{assert.deepEqual((await harness({text:'```json\n'+JSON.stringify(prediction)+'\n```'}).run()).body.prediction,prediction);});
 await test('malformed JSON rejected',async()=>{assert.equal((await harness({text:'invalid'}).run()).status,500);});
 await test('malformed nested JSON rejected',async()=>{assert.equal((await harness({text:'prefix {broken} suffix'}).run()).status,500);});
 await test('null prediction accepted without schema check',async()=>{const r=await harness({text:'null'}).run();assert.equal(r.status,200);assert.equal(r.body.prediction,null);},true);
 await test('out of range prediction accepted',async()=>{const r=await harness({text:JSON.stringify({...prediction,titleScore:900})}).run();assert.equal(r.body.prediction.titleScore,900);},true);
 await test('truncated response accepted without status',async()=>{const r=await harness({stopReason:'max_tokens'}).run();assert.equal(r.status,200);assert.equal(r.body.truncated,undefined);},true);
 console.log(JSON.stringify({scope:'actual predictor route and baseline arithmetic; synthetic YouTube OAuth and provider fixtures',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
