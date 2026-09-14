'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
function harness(options={}){
 const requests=[],uploads=[];
 const runtime=taskFixture({taskType:'thumbnail.background-prompt',controlUnavailable:options.noAiKey,respond:async()=>{requests.push({url:'fixture-provider',body:JSON.stringify(runtime.calls.at(-1))});if(options.aiError)throw Error('Synthetic transport failure');if(options.aiStatus)throw {status:options.aiStatus};return {content:[{type:'text',text:options.prompt??' Synthetic image prompt '}],stop_reason:options.stopReason??'end_turn'};}});
 const route=load('app/api/thumbnail-background/route.ts',{
  '@/auth':{auth:async()=>options.anonymous?null:{user:{email:'synthetic@example.invalid'}}},
  '@/lib/ai/task-runtime':runtime,
  '@/lib/prisma':{prisma:{user:{findUnique:async()=>options.noUser?null:{id:'synthetic'}},$queryRaw:async()=>[{hits:options.hits??1}]}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@vercel/blob':{put:async(name,data,settings)=>{if(options.uploadError)throw Error('Synthetic upload failure');uploads.push({name,size:data.length,settings});return {url:'https://example.invalid/stored.jpg'};}},
 },{Buffer,FormData,process:{env:{...(options.noAiKey?{}:{ANTHROPIC_API_KEY:'synthetic-ai'}),...(options.noImageKey?{}:{IDEOGRAM_API_KEY:'synthetic-image'})}},fetch:async(url,init)=>{
  requests.push({url,body:init?.body});
  if(url==='https://api.ideogram.ai/v1/ideogram-v3/generate')return Response.json({data:options.noImage?[]:[{url:'https://example.invalid/image.jpg'}]},{status:options.imageStatus??200});
  assert.equal(url,'https://example.invalid/image.jpg');return new Response('synthetic image bytes',{status:options.downloadStatus??200});
 }});
 async function run(fields={tema:'Synthetic topic',lang:'en'}){const form=new FormData();for(const [key,value]of Object.entries(fields))form.set(key,value);const r=await route.POST(new Request('https://example.invalid/api/thumbnail-background',{method:'POST',body:form}));return {status:r.status,body:await r.json()};}
 return {run,requests,uploads};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status]of [['anonymous blocked',{anonymous:true},401],['deleted account',{noUser:true},404],['free plan blocked',{free:true},403],['AI key absent',{noAiKey:true},503],['image key absent',{noImageKey:true},503],['throttle blocks providers',{hits:6},429]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);assert.equal(h.uploads.length,0);});
 await test('short topic rejected',async()=>{const h=harness();assert.equal((await h.run({tema:'a'})).status,400);assert.equal(h.requests.length,0);});
 await test('full synthetic pipeline preserves output contract',async()=>{assert.deepEqual(await harness().run(),{status:200,body:{backgroundUrl:'https://example.invalid/stored.jpg',prompt:'Synthetic image prompt'}});});
 await test('Ideogram settings retained',async()=>{const h=harness();await h.run();const form=h.requests[1].body;assert.equal(form.get('resolution'),'1312x736');assert.equal(form.get('rendering_speed'),'TURBO');assert.equal(form.get('prompt'),'Synthetic image prompt');});
 await test('prompt retains topic and visual style',async()=>{const h=harness();await h.run({tema:'Synthetic topic',estilo:'cinematic'});const p=JSON.parse(h.requests[0].body).messages[0].content;assert.match(p,/Synthetic topic/);assert.match(p,/cinematic/);});
 await test('storage path scoped to authenticated user',async()=>{const h=harness();await h.run();assert.match(h.uploads[0].name,/^thumbnails\/bg\/synthetic\//);assert.equal(h.uploads[0].settings.contentType,'image/jpeg');});
 await test('AI error stops image generation and storage',async()=>{const h=harness({aiStatus:429});assert.equal((await h.run()).status,500);assert.equal(h.requests.length,1);assert.equal(h.uploads.length,0);});
 await test('AI transport failure controlled',async()=>{assert.equal((await harness({aiError:true}).run()).status,500);});
 await test('image provider failure stops storage',async()=>{const h=harness({imageStatus:503});assert.equal((await h.run()).status,500);assert.equal(h.uploads.length,0);});
 await test('missing generated image stops storage',async()=>{const h=harness({noImage:true});assert.equal((await h.run()).status,500);assert.equal(h.requests.length,2);assert.equal(h.uploads.length,0);});
 await test('failed download is not stored as image',async()=>{const h=harness({downloadStatus:404});assert.equal((await h.run()).status,500);assert.equal(h.uploads.length,0);});
 await test('storage failure controlled',async()=>{assert.equal((await harness({uploadError:true}).run()).status,500);});
 await test('upload branch needs no AI keys',async()=>{const h=harness({noAiKey:true,noImageKey:true});const r=await h.run({source:'upload',backgroundFile:new Blob(['synthetic'],{type:'image/png'})});assert.equal(r.status,200);assert.equal(r.body.prompt,null);assert.equal(h.requests.length,0);assert.equal(h.uploads[0].settings.contentType,'image/png');});
 await test('empty upload rejected',async()=>{const h=harness();assert.equal((await h.run({source:'upload',backgroundFile:new Blob([],{type:'image/png'})})).status,400);assert.equal(h.uploads.length,0);});
 await test('Spanish validation retained',async()=>{const r=await harness().run({tema:'a',lang:'es'});assert.match(r.body.error,/mín/);});
 await test('truncated prompt blocks image provider',async()=>{const h=harness({stopReason:'max_tokens'});assert.equal((await h.run()).status,500);assert.equal(h.requests.length,1);assert.equal(h.uploads.length,0);});
 await test('empty prompt blocks image provider',async()=>{const h=harness({prompt:''});assert.equal((await h.run()).status,500);assert.equal(h.requests.length,1);assert.equal(h.uploads.length,0);});
 console.log(JSON.stringify({scope:'actual background route; FormData requests, synthetic image bytes and explicit provider/storage fixtures; no images generated or uploaded',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
