'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {createRegistry}=require('../../contracts/ai/v1/core.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const {createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
const {createMessagesFacade}=require('../../lib/ai/compatibility.cjs');
const variants={variantA:'Synthetic emotional title',variantB:'Synthetic practical title'};
function harness(options={}){
 const calls=[],events=[];
 const registry=createRegistry();
 registry.register(createAnthropicAdapter({models:{'synthetic-model':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:50,currency:'EUR',priceVersion:'synthetic'}),transport:{create:async()=>{events.push('provider');if(options.providerError)throw Error('Synthetic provider failure');return options.reply??{content:[{type:'text',text:options.text??JSON.stringify(variants)}],stop_reason:'end_turn'};}}}));
 const config={contractVersion:'1.0',revision:'test-config',fallback:'none',activeProfile:'default',profiles:{default:{'youtube.ab-title-suggestions':{providerId:'anthropic',model:'synthetic-model'}}},exceptions:[]};
 const runner=createTaskRunner({registry,store:{admit:async(request,{runId})=>{events.push('admit');return {runId,snapshot:registry.resolve(config,request),status:'running',replay:false};},reconcile:async()=>{events.push('reconcile');return {state:'uncertain'};}}});
 const route=load('app/api/youtube/ab-test/suggest/route.ts',{
  'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/ai/task-runtime':{getMessagesTask:async identity=>{
   if(options.controlUnavailable)throw Error('Synthetic unavailable control');
   assert.equal(identity.userId,'synthetic');assert.equal(identity.taskType,'youtube.ab-title-suggestions');
   const facade=createMessagesFacade({runner,...identity,context:{requestId:'synthetic-request',runId:'synthetic-run',budgetId:'synthetic-budget',maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:100,maxOutputTokens:200,deadlineMs:1000}}});
   return {create:async parameters=>{calls.push(parameters);return facade.create(parameters);}};
  }},
 },{process:{env:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}}});
 async function run(body={title:'Synthetic original',lang:'es'}){const r=await route.POST(new Request('https://example.invalid/api/youtube/ab-test/suggest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,calls,events};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status] of [['anonymous blocked',{anonymous:true},401],['free plan blocked',{free:true},403]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.calls.length,0);});
 for(const body of [{},{title:''},{title:' '},{title:42},{title:{}},{title:[]},null])await test('invalid title rejected: '+JSON.stringify(body),async()=>{const h=harness();assert.equal((await h.run(body)).status,400);assert.equal(h.calls.length,0);});
 await test('response contract preserved',async()=>assert.deepEqual(await harness().run(),{status:200,body:variants}));
 await test('Spanish instructions',async()=>{const h=harness();await h.run();assert.match(h.calls[0].messages[0].content,/Eres un experto/);});
 await test('English instructions',async()=>{const h=harness();await h.run({title:'Synthetic original',lang:'en'});assert.match(h.calls[0].messages[0].content,/You are a YouTube SEO expert/);});
 await test('original title included',async()=>{const h=harness();await h.run();assert.match(h.calls[0].messages[0].content,/Synthetic original/);});
 await test('output token allowance preserved',async()=>{const h=harness();await h.run();assert.equal(h.calls[0].max_tokens,200);});
 await test('markdown JSON parsed',async()=>assert.deepEqual((await harness({text:'```json\n'+JSON.stringify(variants)+'\n```'}).run()).body,variants));
 await test('malformed JSON controlled',async()=>assert.equal((await harness({text:'invalid JSON'}).run()).status,503));
 await test('partial variants preserve existing fallback',async()=>{assert.deepEqual((await harness({text:JSON.stringify({variantA:'Synthetic A'})}).run()).body,{variantA:'Synthetic A',variantB:'Synthetic original'});});
 await test('non-text block results in parse error',async()=>{assert.equal((await harness({reply:{content:[{type:'tool_use'}]}}).run()).status,503);});
 await test('valid JSON null controlled by parse boundary',async()=>{assert.equal((await harness({text:'null'}).run()).status,503);});
 await test('valid whitespace around JSON',async()=>assert.deepEqual((await harness({text:' \n'+JSON.stringify(variants)+'\n '}).run()).body,variants));
 await test('empty content array is controlled',async()=>{assert.equal((await harness({reply:{content:[]}}).run()).status,503);});
 await test('provider rejection is controlled',async()=>{assert.equal((await harness({providerError:true}).run()).status,503);});
 await test('truncated output cannot succeed',async()=>{assert.equal((await harness({reply:{content:[{type:'text',text:JSON.stringify(variants)}],stop_reason:'max_tokens'}}).run()).status,503);});
 await test('non-string variants rejected',async()=>{assert.equal((await harness({text:JSON.stringify({variantA:7,variantB:8})}).run()).status,503);});
 await test('unavailable control fails closed before dispatch',async()=>{const h=harness({controlUnavailable:true});assert.equal((await h.run()).status,503);assert.deepEqual(h.events,[]);});
 await test('actual route follows admission provider reconciliation',async()=>{const h=harness();await h.run();assert.deepEqual(h.events,['admit','provider','reconcile']);});
 console.log(JSON.stringify({scope:'migrated AB route through portable runner and Anthropic adapter; synthetic store/transport; no title publication',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
