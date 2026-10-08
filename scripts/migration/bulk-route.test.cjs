'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const {TEMPLATES}=load('utils/prompts.js');
function harness(options={}) {
 const requests=[],saved=[];let quotaReads=0,factories=0;
 const runtime=taskFixture({taskType:'content.bulk-generate',controlUnavailable:options.noKey,respond:async()=>{requests.push({body:runtime.calls.at(-1)});const index=requests.length-1;if(options.transportError)throw Error('Synthetic transport failure');if(options.statuses?.[index]&&options.statuses[index]!==200)throw {status:options.statuses[index]};return options.replies?.[index]??options.reply??{content:[{type:'text',text:'Synthetic output'}],usage:{output_tokens:8},stop_reason:'end_turn'};}});
 const prisma={generation:{count:async()=> (options.used??0)+saved.length,create:async({data})=>{if(options.saveError)throw Error('Synthetic database failure');saved.push(data);return data;}}};
 prisma.$transaction=async fn=>{quotaReads++;if(options.quotaFailure||options.lateQuotaFailure&&requests.length)throw Error('Private quota failure');return fn({...prisma,$queryRawUnsafe:async()=>options.noOwner?[]:[{id:'synthetic'}],textGenerationAttempt:{count:async()=>0},legacyThumbnailAttempt:{count:async()=>options.lateReservation&&requests.length?10:(options.reserved??0)}});};
 const route=load('app/api/generate/bulk/route.ts',{
  '@/lib/generation-quota':require('./generation-quota-fixture.cjs')(prisma),
  '@/lib/ai/task-runtime':{getMessagesTask:async identity=>{factories++;return runtime.getMessagesTask(identity);}},
  '@/utils/prompts':{TEMPLATES},'@/auth':{auth:async()=>Object.hasOwn(options,'session')?options.session:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.plan??'pro',isPaid:plan=>plan!=='free',getLimits:()=>({bulkMaxTopics:3,generationsPerMonth:10})},
  '@/lib/prisma':{prisma},
 });
 async function run(body={template:'title',topics:['Synthetic topic']},headers={}) {
  const r=await route.POST(new Request('https://example.invalid/api/generate/bulk',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
  return {status:r.status,body:await r.json()};
 }
 return {run,requests,saved,get quotaReads(){return quotaReads;},get factories(){return factories;}};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 const malformed=[... [undefined,null,42,{},[],'constructor','__proto__','toString'].map(template=>({template,topics:['Synthetic']})),...[null,42,true,[],{}].map(tono=>({template:'title',topics:['Synthetic'],options:{tono}})),...[42,{},[],false].map(lang=>({template:'title',topics:['Synthetic'],lang})),...[null,{},' ','x'.repeat(501),42].map(topic=>({template:'title',topics:['Synthetic',topic]}))];
 for(const body of malformed)await test('malformed batch rejected before quota/factory/model/history '+JSON.stringify(body),async()=>{const h=harness(),r=await h.run(body);assert.equal(r.status,400);assert.equal(h.quotaReads,0);assert.equal(h.factories,0);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);assert.deepEqual(Object.keys(r.body),['error']);});
 await test('valid string options boundary, unicode and duplicate topic order preserved',async()=>{const h=harness(),topics=['  Tema á🙂  ','Other','Tema á🙂'],r=await h.run({template:'title',topics,options:{tono:'x'.repeat(500),duracion:'10'},lang:'en'});assert.equal(r.status,200);assert.equal(r.body.total,3);assert.equal(r.body.generated,3);assert.deepEqual(r.body.results.map(x=>x.topic),['Tema á🙂','Other','Tema á🙂']);assert.deepEqual(h.saved.map(x=>x.inputs.tema),['Tema á🙂','Other','Tema á🙂']);assert.ok(h.saved.every(x=>x.inputs.tono.length===500&&x.inputs.duracion==='10'&&x.inputs._bulk===true));assert.equal(h.requests.length,3);assert.ok(h.requests.every(x=>x.body.messages[0].content.includes('ENTIRE response in English')));});
 for(const [name,options,body,status] of [
  ['anonymous blocked',{session:null},undefined,401],
  ['missing identity blocked',{session:{user:{}}},undefined,401],
  ['free account blocked',{plan:'free'},undefined,403],
  ['unknown template rejected',{}, {template:'missing',topics:['Synthetic']},400],
  ['empty list rejected',{}, {template:'title',topics:[]},400],
  ['non-array rejected',{}, {template:'title',topics:'Synthetic'},400],
  ['maximum topics enforced',{}, {template:'title',topics:['one','two','three','four']},400],
  ['invalid topic values rejected',{}, {template:'title',topics:[null,{},' ']},400],
  ['oversized topic rejected',{}, {template:'title',topics:['x'.repeat(501)]},400],
  ['quota enforced',{used:10},undefined,429],
  ['whole batch quota enforced',{used:9},{template:'title',topics:['one','two']},429],
  ['missing task control unavailable',{noKey:true},undefined,503],
 ])await test(name,async()=>{const h=harness(options);assert.equal((await h.run(body)).status,status);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);});
 await test('success response and stored ownership',async()=>{const h=harness();const r=await h.run();assert.deepEqual(r,{status:200,body:{results:[{topic:'Synthetic topic',content:'Synthetic output'}],generated:1,total:1}});assert.equal(h.saved[0].userId,'synthetic');assert.equal(h.saved[0].tokensUsed,8);assert.equal(h.saved[0].inputs._bulk,true);});
 await test('trims valid topics without silently dropping malformed neighbours',async()=>{const h=harness();const r=await h.run({template:'title',topics:['  Synthetic topic  ']});assert.equal(r.body.total,1);assert.equal(r.body.results[0].topic,'Synthetic topic');});
 await test('English instruction preserved',async()=>{const h=harness();await h.run({template:'title',topics:['Synthetic'],lang:'en'});assert.match(h.requests[0].body.messages[0].content,/ENTIRE response in English/);});
 await test('long script allowance preserved',async()=>{const h=harness();await h.run({template:'script',topics:['Synthetic']});assert.equal(h.requests[0].body.max_tokens,8192);});
 await test('provider failure preserves partial batch success',async()=>{const h=harness({statuses:[429,200]});const r=await h.run({template:'title',topics:['one','two']});assert.equal(r.body.generated,1);assert.equal(r.body.results[0].error,'API error 429');assert.equal(h.saved.length,1);assert.equal(h.saved[0].inputs.tema,'two');});
 await test('transport error never stores output',async()=>{const h=harness({transportError:true});const r=await h.run();assert.equal(r.body.generated,0);assert.equal(h.saved.length,0);});
 await test('storage failure not reported as generated',async()=>{const h=harness({saveError:true});assert.equal((await h.run()).body.generated,0);});
 await test('forwarded IP preserves first entry',async()=>{const h=harness();await h.run(undefined,{'x-forwarded-for':'192.0.2.1, 192.0.2.2'});assert.equal(h.saved[0].ipAddress,'192.0.2.1');});
 await test('truncated item is not counted or stored as complete',async()=>{const h=harness({reply:{content:[{type:'text',text:'Partial'}],stop_reason:'max_tokens',usage:{output_tokens:8}}});const r=await h.run();assert.equal(r.body.generated,0);assert.equal(h.saved.length,0);});
 await test('missing usage remains unconfirmed with no fabricated zero accounting',async()=>{const h=harness({reply:{content:[{type:'text',text:'Synthetic'}],stop_reason:'end_turn'}});const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.generated,0);assert.equal(r.body.total,1);assert.equal(h.saved.length,0);assert.equal(h.requests.length,1);assert.ok(r.body.results[0].error);assert.equal(r.body.results[0].content,'');});
 for(const reply of [{content:[],usage:{output_tokens:8}},{content:[{type:'text',text:'   '}],usage:{output_tokens:8}},...[-1,1.5,Infinity,null,'8'].map(output_tokens=>({content:[{type:'text',text:'Synthetic'}],usage:{output_tokens}}))])await test('invalid output or usage never creates successful history '+JSON.stringify(reply),async()=>{const h=harness({reply});const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.generated,0);assert.equal(r.body.total,1);assert.equal(h.saved.length,0);assert.equal(h.requests.length,1);assert.ok(r.body.results[0].error);assert.equal(r.body.results[0].content,'');});
 await test('explicit verified zero token count remains valid',async()=>{const h=harness({reply:{content:[{type:'text',text:'Synthetic'}],usage:{output_tokens:0},stop_reason:'end_turn'}});const r=await h.run();assert.equal(r.body.generated,1);assert.equal(h.saved.length,1);assert.equal(h.saved[0].tokensUsed,0);});
 await test('unknown usage in middle of batch preserves confirmed neighbours without model retry',async()=>{const h=harness({replies:[{content:[{type:'text',text:'First'}],usage:{output_tokens:8},stop_reason:'end_turn'},{content:[{type:'text',text:'Unconfirmed'}],stop_reason:'end_turn'},{content:[{type:'text',text:'Third'}],usage:{output_tokens:9},stop_reason:'end_turn'}]});const r=await h.run({template:'title',topics:['one','two','three']});assert.equal(r.body.generated,2);assert.equal(r.body.total,3);assert.equal(h.requests.length,3);assert.deepEqual(h.saved.map(x=>x.inputs.tema),['one','three']);assert.deepEqual(h.saved.map(x=>x.tokensUsed),[8,9]);assert.equal(r.body.results[0].content,'First');assert.ok(r.body.results[1].error);assert.equal(r.body.results[1].content,'');assert.equal(r.body.results[2].content,'Third');});
 await test('validated topic wins over options',async()=>{const h=harness();const r=await h.run({template:'title',topics:['Expected topic'],options:{tema:'Different topic'}});assert.equal(r.body.results[0].topic,'Expected topic');assert.equal(h.saved[0].inputs.tema,'Expected topic');assert.match(h.requests[0].body.messages[0].content,/Expected topic/);assert.doesNotMatch(h.requests[0].body.messages[0].content,/Different topic/);});
 await test('oversized option rejected before provider',async()=>{const h=harness();assert.equal((await h.run({template:'title',topics:['Synthetic'],options:{tone:'x'.repeat(501)}})).status,400);assert.equal(h.requests.length,0);});
 await test('null body rejected',async()=>assert.equal((await harness().run(null)).status,400));

 for(const [options,status]of [[{used:9,reserved:1},429],[{used:8,reserved:1},429],[{quotaFailure:true},503],[{noOwner:true},503]])await test('shared image reservation or unavailable quota stops whole batch '+JSON.stringify(options),async()=>{const h=harness(options);assert.equal((await h.run({template:'title',topics:['one','two']})).status,status);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);});
 await test('visible insufficient credits clamp over-occupied quota at zero',async()=>{const h=harness({used:10,reserved:1});const r=await h.run({template:'title',topics:['one'],lang:'en'});assert.equal(r.status,429);assert.match(r.body.error,/You have 0 left/);assert.equal(h.requests.length,0);});
 for(const [option,error]of [['lateReservation','Not enough credits'],['lateQuotaFailure','Generation quota unavailable']])await test('between-item '+option+' preserves confirmed first topic and prevents later model/history',async()=>{const h=harness({[option]:true});const r=await h.run({template:'title',topics:['one','two','three']});assert.equal(r.status,200);assert.equal(r.body.generated,1);assert.equal(r.body.total,3);assert.equal(h.requests.length,1);assert.equal(h.saved.length,1);assert.equal(r.body.results[0].content,'Synthetic output');for(const item of r.body.results.slice(1)){assert.equal(item.content,'');assert.equal(item.error,error);}});
 console.log(JSON.stringify({scope:'migrated batch route, common runtime and prompts; synthetic transport/storage; unknown usage/output never creates successful history',results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
