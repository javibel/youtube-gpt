'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const {TEMPLATES}=load('utils/prompts.js');
const proTemplate=Object.keys(TEMPLATES).find(key=>TEMPLATES[key].proOnly);
function harness(options={}){
 const requests=[],saved=[],emails=[];
 const runtime=taskFixture({taskType:'content.generate',controlUnavailable:options.noKey,respond:async()=>{requests.push({body:runtime.calls.at(-1)});if(options.transportError)throw Error('Synthetic transport failure');if(options.providerStatus)throw {status:options.providerStatus};return options.reply??{content:[{type:'text',text:'Synthetic output'}],usage:{output_tokens:8},stop_reason:'end_turn'};}});
 const session=Object.hasOwn(options,'session')?options.session:{user:{id:'synthetic',email:'synthetic@example.invalid'}};
 const prisma={user:{findUnique:async()=>options.missingUser?null:{id:options.userId??'synthetic'}},generation:{count:async({where})=>where.ipAddress?(options.ipUsage??0):(options.used??0),create:async({data})=>{saved.push(data);return data;}},$queryRaw:async()=>[{hits:options.hits??1}]};
 const route=load('app/api/generate/route.ts',{
  '@/lib/ai/task-runtime':runtime,
  '@/utils/prompts':{TEMPLATES},'@/auth':{auth:async()=>session},'@/lib/prisma':{prisma},
  '@/lib/extension-auth':{getExtensionUser:async()=>options.extension??null},
  '@/lib/plans':{getUserPlan:async()=>options.plan??'free',getLimits:()=>({generationsPerMonth:options.limit??10}),isPaid:plan=>plan!=='free'},
  '@/lib/channel-context':{getChannelContext:async()=>options.context?{summary:options.context}:null},
  '@/lib/lifecycle-trigger':{triggerConversionEmail:async(...args)=>{emails.push(args);}},
 });
 async function run(body={template:'title',inputs:{tema:'Synthetic topic'},lang:'es'},headers={}){const response=await route.POST(new Request('https://example.invalid/api/generate',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}
 return {run,requests,saved,emails};
}
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('unauthenticated request cannot call provider',async()=>{const h=harness({session:null});assert.equal((await h.run()).status,401);assert.equal(h.requests.length,0);});
 await test('session missing email cannot bypass accounting',async()=>{const h=harness({session:{user:{id:'synthetic'}}});assert.equal((await h.run()).status,401);assert.equal(h.requests.length,0);});
 await test('deleted user cannot bypass accounting',async()=>{const h=harness({missingUser:true});assert.equal((await h.run()).status,401);assert.equal(h.requests.length,0);});
 await test('session identity must match database user',async()=>{const h=harness({userId:'different-synthetic-user'});assert.equal((await h.run()).status,401);assert.equal(h.requests.length,0);});
 await test('unknown template rejected',async()=>{const h=harness();assert.equal((await h.run({template:'missing',inputs:{tema:'Synthetic'}})).status,400);assert.equal(h.requests.length,0);});
 await test('short content rejected in Spanish',async()=>{const r=await harness().run({template:'title',inputs:{tema:'a'}});assert.equal(r.status,400);assert.match(r.body.error,/detalle/);});
 await test('short content rejected in English',async()=>{const r=await harness().run({template:'title',inputs:{tema:'a'},lang:'en'});assert.match(r.body.error,/detail/);});
 await test('oversized input rejected before provider',async()=>{const h=harness();assert.equal((await h.run({template:'title',inputs:{tema:'x'.repeat(501)}})).status,400);assert.equal(h.requests.length,0);});
 await test('missing task control returns service unavailable',async()=>{const h=harness({noKey:true});assert.equal((await h.run()).status,503);assert.equal(h.requests.length,0);});
 await test('monthly quota prevents provider call',async()=>{const h=harness({used:10});assert.equal((await h.run()).status,429);assert.equal(h.requests.length,0);assert.equal(h.emails.length,1);});
 await test('paid-only template blocked for free account',async()=>{const key=TEMPLATES[proTemplate].inputs[0];const h=harness();assert.equal((await h.run({template:proTemplate,inputs:{[key]:'Synthetic topic'}})).status,403);assert.equal(h.requests.length,0);});
 await test('per-minute quota prevents provider call',async()=>{const h=harness({hits:6});assert.equal((await h.run()).status,429);assert.equal(h.requests.length,0);});
 await test('IP quota prevents provider call',async()=>{const h=harness({ipUsage:30});assert.equal((await h.run(undefined,{'x-forwarded-for':'192.0.2.1'})).status,429);assert.equal(h.requests.length,0);});
 await test('success preserves response and persistence contract',async()=>{const h=harness();const r=await h.run();assert.deepEqual(r,{status:200,body:{content:'Synthetic output',truncated:false}});assert.equal(h.saved[0].tokensUsed,8);assert.equal(h.saved[0].userId,'synthetic');});
 await test('English generation adds language instruction',async()=>{const h=harness();await h.run({template:'title',inputs:{tema:'Synthetic'},lang:'en'});assert.match(h.requests[0].body.messages[0].content,/ENTIRE response in English/);});
 await test('long-form template retains larger output allowance',async()=>{const h=harness();await h.run({template:'script',inputs:{tema:'Synthetic'}});assert.equal(h.requests[0].body.max_tokens,8192);});
 await test('channel context reaches actual prompt builder',async()=>{const h=harness({context:'Synthetic channel context'});await h.run();assert.match(h.requests[0].body.messages[0].content,/Synthetic channel context/);});
 await test('continuation preserves history and combined stored output',async()=>{const h=harness();await h.run({template:'title',inputs:{tema:'Synthetic',_previousContent:'Earlier '}});assert.equal(h.requests[0].body.messages.length,3);assert.equal(h.saved[0].output,'Earlier Synthetic output');});
 await test('truncated output remains explicitly marked',async()=>{const h=harness({reply:{content:[{type:'text',text:'Partial'}],stop_reason:'max_tokens'}});assert.equal((await h.run()).body.truncated,true);});
 await test('provider error does not persist generation',async()=>{const h=harness({providerStatus:429,reply:{error:{message:'Synthetic quota'}}});assert.equal((await h.run()).status,429);assert.equal(h.saved.length,0);});
 await test('extension free account retains shared quotas',async()=>{const h=harness({session:null,extension:{user:{id:'synthetic'},isPro:false},used:10});const r=await h.run();assert.equal(r.status,429);assert.equal(r.body.code,'quota_free');assert.equal(h.requests.length,0);});
 console.log(JSON.stringify({scope:'migrated generation route and prompt builders through common runtime; synthetic data, transport and email; explicit partial output retained',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
