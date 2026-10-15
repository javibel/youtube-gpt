'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
function harness(options={}) {
 const requests=[],emails=[];
 const runtime=taskFixture({taskType:'channel.coach',controlUnavailable:options.noKey,respond:async payload=>{requests.push({body:{...runtime.calls.at(-1),system:payload.system}});if(options.transportError)throw Error('Synthetic transport failure');if(options.providerStatus)throw {status:options.providerStatus};return options.reply??{content:[{type:'text',text:'Synthetic reply'}],stop_reason:'end_turn'};}});
 const route=load('app/api/coach/route.ts',{
  '@/lib/ai/task-runtime':runtime,
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>Object.hasOwn(options,'session')?options.session:{user:{id:'synthetic',email:'synthetic@example.invalid'}}},
  '@/lib/prisma':{prisma:{$queryRaw:async()=>[{hits:options.hits??1}]}},
  '@/lib/plans':{getUserPlan:async()=>options.plan??'pro',isPaid:plan=>plan!=='free'},
  '@/lib/channel-context':{getChannelContext:async()=>options.channel?{summary:options.channel}:null},
  '@/lib/extension-auth':{getExtensionUser:async()=>options.extension??null},
  '@/lib/lifecycle-trigger':{triggerConversionEmail:async(...args)=>emails.push(args)},
 });
 async function run(body={message:'Synthetic question'}) {const r=await route.POST(new Request('https://example.invalid/api/coach',{method:'POST',headers:{'content-type':'application/json',cookie:'declared-web-fixture=1'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,requests,emails};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,body,status] of [
  ['anonymous blocked',{session:null},undefined,401],
  ['free web plan blocked',{plan:'free'},undefined,403],
  ['empty message rejected',{}, {message:' '},400],
  ['non-string message rejected',{}, {message:8},400],
  ['throttle blocks provider',{hits:2},undefined,429],
  ['missing task control unavailable',{noKey:true},undefined,503],
 ])await test(name,async()=>{const h=harness(options);assert.equal((await h.run(body)).status,status);assert.equal(h.requests.length,0);});
 await test('paywall invokes only simulated lifecycle effect',async()=>{const h=harness({plan:'free'});await h.run();assert.equal(h.emails.length,1);assert.equal(h.emails[0][0],'synthetic');assert.equal(h.emails[0][1],'c3');});
 for(const mode of ['create','analyze','optimize','research'])await test(mode+' mode prompt',async()=>{const h=harness();await h.run({message:'Synthetic',mode});assert.match(h.requests[0].body.system[0].text,new RegExp(mode.toUpperCase()+' MODE'));});
 await test('invalid mode falls back to analyze',async()=>{const h=harness();await h.run({message:'Synthetic',mode:'invalid'});assert.match(h.requests[0].body.system[0].text,/ANALYZE MODE/);});
 await test('English instruction and real channel context builder input',async()=>{const h=harness({channel:'Synthetic channel metrics'});await h.run({message:'Synthetic',lang:'en'});assert.match(h.requests[0].body.system[0].text,/Reply ALWAYS in English/);assert.match(h.requests[0].body.system[0].text,/Synthetic channel metrics/);});
 await test('default Spanish and absent channel explicit',async()=>{const h=harness();await h.run();assert.match(h.requests[0].body.system[0].text,/Reply ALWAYS in Spanish/);assert.match(h.requests[0].body.system[0].text,/No YouTube channel connected/);});
 await test('page context bounded',async()=>{const h=harness();await h.run({message:'Synthetic',pageContext:'z'.repeat(601)});assert.match(h.requests[0].body.system[0].text,new RegExp('z{600}'));assert.doesNotMatch(h.requests[0].body.system[0].text,new RegExp('z{601}'));});
 await test('history bounded to ten entries and 2000 characters',async()=>{const h=harness();await h.run({message:'q'.repeat(2001),context:Array.from({length:12},(_,i)=>({role:'user',content:String(i)+'x'.repeat(2001)}))});assert.equal(h.requests[0].body.messages.length,11);assert.equal(h.requests[0].body.messages[0].content.length,2000);assert.match(h.requests[0].body.messages[0].content,/^2x/);assert.equal(h.requests[0].body.messages[10].content.length,2000);});
 await test('system role is rejected before provider',async()=>{const h=harness();assert.equal((await h.run({message:'Synthetic',context:[{role:'system',content:'Synthetic'}]})).status,400);assert.equal(h.requests.length,0);});
 await test('provider error response controlled',async()=>{const h=harness({providerStatus:429});assert.deepEqual(await h.run(),{status:500,body:{error:'AI service error'}});});
 await test('transport exception is controlled',async()=>{assert.equal((await harness({transportError:true}).run()).status,500);});
 await test('null history entry rejected before provider',async()=>{const h=harness();assert.equal((await h.run({message:'Synthetic',context:[null]})).status,400);assert.equal(h.requests.length,0);});
 await test('empty provider response rejected',async()=>{assert.equal((await harness({reply:{content:[],stop_reason:'end_turn'}}).run()).status,500);});
 await test('truncated response rejected',async()=>{assert.equal((await harness({reply:{content:[{type:'text',text:'Partial'}],stop_reason:'max_tokens'}}).run()).status,500);});
 await test('null body rejected',async()=>assert.equal((await harness().run(null)).status,400));
 console.log(JSON.stringify({scope:'migrated Coach modes through common runtime; synthetic channel, transport, storage and lifecycle; no real email',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
