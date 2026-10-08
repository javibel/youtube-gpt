'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const story='0s-6s: HOOK | A creator opens a notebook';
function harness(options={}) {
 const saved=[],counts=[];
 const runtime=taskFixture({taskType:'content.storyboard',controlUnavailable:options.noKey,respond:async()=>{if(options.transportError)throw Error('Synthetic failure');if(options.status)throw {status:options.status};return options.reply??{content:[{type:'text',text:story}],usage:{output_tokens:20},stop_reason:'end_turn'};}});
 const calls=runtime.calls;
 const quotaDb={$transaction:async fn=>{if(options.quotaFailure)throw Error('Private quota failure');return fn({$queryRawUnsafe:async()=>options.noQuotaOwner?[]:[{id:'synthetic'}],textGenerationAttempt:{count:async()=>0},legacyThumbnailAttempt:{count:async()=>options.reserved??0},generation:{count:async query=>{counts.push(query);return options.used??0;}}});}};
 const route=load('app/api/storyboard/route.ts',{
  '@/lib/generation-quota':require('./generation-quota-fixture.cjs')(quotaDb),
  'node:crypto':require('node:crypto'),
  '@/lib/ai/task-runtime':runtime,
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.paid?'pro':'free',getLimits:()=>({generationsPerMonth:options.paid?200:10}),isPaid:plan=>plan==='pro'},
  '@/lib/prisma':{prisma:{generation:{findUnique:async({where})=>{if(options.readError)throw Error('Private database failure');return options.savedRow??saved.find(row=>row.id===where.id)??null;},count:async query=>{counts.push(query);return query.where.template?(options.tips??0):(options.used??0);},create:async({data})=>{if(options.saveError)throw Error('Synthetic failure');if(data.id&&saved.some(row=>row.id===data.id))throw {code:'P2002'};saved.push(data);if(options.lostSaveAck)throw Error('Private late acknowledgement');return data;}},$queryRaw:async()=>[{hits:options.hits??1}]}},
 });
 async function run(body={script:'Synthetic script',lang:'es'},headers={}) {const r=await route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,calls,saved,counts};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status] of [['anonymous blocked',{anonymous:true},401],['free pool quota',{used:10},429],['free tips quota',{tips:1},429],['paid pool quota',{paid:true,used:200},429],['minute throttle',{hits:6},429],['missing control',{noKey:true},503]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.calls.length,0);assert.equal(h.saved.length,0);});
 for(const script of ['', ' ',42,{},[]])await test('invalid script controlled: '+JSON.stringify(script),async()=>{const h=harness();assert.equal((await h.run({script})).status,400);assert.equal(h.calls.length,0);});
 await test('null body rejected',async()=>assert.equal((await harness().run(null)).status,400));
 await test('free entitlement and accounting contract',async()=>{const h=harness();assert.deepEqual(await h.run(),{status:200,body:{storyboard:story}});assert.equal(h.saved[0].userId,'synthetic');assert.equal(h.saved[0].template,'video_preview');assert.equal(h.saved[0].tokensUsed,20);assert.equal(h.counts.length,2);});
 await test('paid plan has no extra tips cap',async()=>{const h=harness({paid:true,tips:50});assert.equal((await h.run()).status,200);assert.equal(h.counts.length,1);});
 await test('Spanish prompt',async()=>{const h=harness();await h.run();assert.match(h.calls[0].messages[0].content,/Convierte este script/);});
 await test('English prompt',async()=>{const h=harness();await h.run({script:'Synthetic',lang:'en'});assert.match(h.calls[0].messages[0].content,/Convert this YouTube script/);});
 await test('script bounded in prompt and storage',async()=>{const h=harness();await h.run({script:'z'.repeat(4001)});assert.equal(h.saved[0].inputs.script.length,4000);assert.doesNotMatch(h.calls[0].messages[0].content,/z{4001}/);});
 await test('IP accounting preserves first proxy entry',async()=>{const h=harness();await h.run(undefined,{'x-forwarded-for':'192.0.2.1, 192.0.2.2'});assert.equal(h.saved[0].ipAddress,'192.0.2.1');});
 await test('provider error never saved',async()=>{const h=harness({status:429});assert.equal((await h.run()).status,502);assert.equal(h.saved.length,0);});
 await test('transport failure controlled',async()=>{assert.equal((await harness({transportError:true}).run()).status,500);});
 await test('empty output rejected before history write',async()=>{const h=harness({reply:{content:[],stop_reason:'end_turn'}});assert.equal((await h.run()).status,502);assert.equal(h.saved.length,0);});
 await test('truncated output rejected before history write',async()=>{const h=harness({reply:{content:[{type:'text',text:story}],stop_reason:'max_tokens'}});assert.equal((await h.run()).status,502);assert.equal(h.saved.length,0);});
 await test('save failure does not report successful generation',async()=>{const h=harness({saveError:true});assert.equal((await h.run()).status,503);assert.equal(h.saved.length,0);assert.equal(h.calls.length,1);});
 await test('saved free result survives exhausted quota and throttle without another task or count',async()=>{const options={},h=harness(options),headers={'Idempotency-Key':'free-retry'};const first=await h.run(undefined,headers);options.tips=1;options.used=10;options.hits=6;assert.deepEqual(await h.run(undefined,headers),first);assert.equal(h.calls.length,1);assert.equal(h.saved.length,1);assert.equal(h.counts.length,2);});
 await test('changed full input or language conflicts before model and quota',async()=>{const h=harness(),headers={'Idempotency-Key':'same-input'};const script='z'.repeat(4000)+'a';await h.run({script,lang:'es'},headers);for(const body of [{script:'z'.repeat(4000)+'b',lang:'es'},{script,lang:'en'}])assert.equal((await h.run(body,headers)).status,409);assert.equal(h.calls.length,1);assert.equal(h.saved.length,1);assert.equal(h.counts.length,2);});
 await test('acknowledged-late history insert recovers the committed result',async()=>{const h=harness({lostSaveAck:true});assert.equal((await h.run(undefined,{'Idempotency-Key':'late-save'})).status,200);assert.equal(h.saved.length,1);assert.equal(h.calls.length,1);});
 await test('parallel identical requests save one history row',async()=>{const h=harness({paid:true}),headers={'Idempotency-Key':'parallel'};const replies=await Promise.all([h.run(undefined,headers),h.run(undefined,headers)]);assert.ok(replies.every(r=>r.status===200));assert.equal(h.saved.length,1);});
 for(const key of ['bad key','x'.repeat(129),''])await test('invalid operation key rejected before counts '+key.length,async()=>{const h=harness();assert.equal((await h.run(undefined,{'Idempotency-Key':key})).status,400);assert.equal(h.calls.length,0);assert.equal(h.saved.length,0);assert.equal(h.counts.length,0);});
 await test('history read failure blocks without private error or inference',async()=>{const h=harness({readError:true});const reply=await h.run(undefined,{'Idempotency-Key':'read-error'});assert.deepEqual(reply,{status:503,body:{error:'Generation history unavailable'}});assert.equal(h.calls.length,0);assert.equal(h.counts.length,0);});
 await test('malformed stored identity never replays',async()=>{const h=harness({savedRow:{userId:'another-user',template:'video_preview',inputs:{},output:'Private output'}});const reply=await h.run(undefined,{'Idempotency-Key':'mismatch'});assert.equal(reply.status,409);assert.doesNotMatch(JSON.stringify(reply),/Private output/);assert.equal(h.calls.length,0);});
 await test('malformed language rejected before quota',async()=>{const h=harness();assert.equal((await h.run({script:'Synthetic',lang:{}})).status,400);assert.equal(h.counts.length,0);});
 for(const options of [{paid:true,used:199,reserved:1},{quotaFailure:true},{noQuotaOwner:true}])await test('shared capacity/owner unavailable '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.run()).status,options.reserved?429:503);assert.equal(h.calls.length,0);assert.equal(h.saved.length,0);});
 console.log(JSON.stringify({scope:'migrated storyboard route through common runner and adapter; synthetic auth, quota storage and transport',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
