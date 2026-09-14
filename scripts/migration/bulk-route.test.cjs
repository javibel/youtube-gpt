'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {TEMPLATES}=load('utils/prompts.js');
function harness(options={}) {
 const requests=[],saved=[];
 const route=load('app/api/generate/bulk/route.ts',{
  '@/utils/prompts':{TEMPLATES},'@/auth':{auth:async()=>Object.hasOwn(options,'session')?options.session:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.plan??'pro',isPaid:plan=>plan!=='free',getLimits:()=>({bulkMaxTopics:3,generationsPerMonth:10})},
  '@/lib/prisma':{prisma:{generation:{count:async()=>options.used??0,create:async({data})=>{if(options.saveError)throw Error('Synthetic database failure');saved.push(data);return data;}}}},
 },{process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},Error,fetch:async(url,init)=>{
  requests.push({url,body:JSON.parse(init.body)});
  if(options.transportError)throw Error('Synthetic transport failure');
  const index=requests.length-1;
  return Response.json(options.replies?.[index]??options.reply??{content:[{type:'text',text:'Synthetic output'}],usage:{output_tokens:8},stop_reason:'end_turn'},{status:options.statuses?.[index]??200});
 }});
 async function run(body={template:'title',topics:['Synthetic topic']},headers={}) {
  const r=await route.POST(new Request('https://example.invalid/api/generate/bulk',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
  return {status:r.status,body:await r.json()};
 }
 return {run,requests,saved};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
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
  ['missing key unavailable',{noKey:true},undefined,503],
 ])await test(name,async()=>{const h=harness(options);assert.equal((await h.run(body)).status,status);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);});
 await test('success response and stored ownership',async()=>{const h=harness();const r=await h.run();assert.deepEqual(r,{status:200,body:{results:[{topic:'Synthetic topic',content:'Synthetic output'}],generated:1,total:1}});assert.equal(h.saved[0].userId,'synthetic');assert.equal(h.saved[0].tokensUsed,8);assert.equal(h.saved[0].inputs._bulk,true);});
 await test('trims topics and filters empty values',async()=>{const h=harness();const r=await h.run({template:'title',topics:['  Synthetic topic  ',' ',null]});assert.equal(r.body.total,1);assert.equal(r.body.results[0].topic,'Synthetic topic');});
 await test('English instruction preserved',async()=>{const h=harness();await h.run({template:'title',topics:['Synthetic'],lang:'en'});assert.match(h.requests[0].body.messages[0].content,/ENTIRE response in English/);});
 await test('long script allowance preserved',async()=>{const h=harness();await h.run({template:'script',topics:['Synthetic']});assert.equal(h.requests[0].body.max_tokens,8192);});
 await test('provider failure preserves partial batch success',async()=>{const h=harness({statuses:[429,200]});const r=await h.run({template:'title',topics:['one','two']});assert.equal(r.body.generated,1);assert.equal(r.body.results[0].error,'API error 429');assert.equal(h.saved.length,1);assert.equal(h.saved[0].inputs.tema,'two');});
 await test('transport error never stores output',async()=>{const h=harness({transportError:true});const r=await h.run();assert.equal(r.body.generated,0);assert.equal(h.saved.length,0);});
 await test('storage failure not reported as generated',async()=>{const h=harness({saveError:true});assert.equal((await h.run()).body.generated,0);});
 await test('forwarded IP preserves first entry',async()=>{const h=harness();await h.run(undefined,{'x-forwarded-for':'192.0.2.1, 192.0.2.2'});assert.equal(h.saved[0].ipAddress,'192.0.2.1');});
 await test('truncated provider response counted as complete',async()=>{const h=harness({reply:{content:[{text:'Partial'}],stop_reason:'max_tokens',usage:{output_tokens:8}}});const r=await h.run();assert.equal(r.body.generated,1);assert.equal(r.body.results[0].truncated,undefined);},true);
 await test('missing usage becomes zero accounting',async()=>{const h=harness({reply:{content:[{text:'Synthetic'}],stop_reason:'end_turn'}});await h.run();assert.equal(h.saved[0].tokensUsed,0);},true);
 await test('options can replace the validated topic',async()=>{const h=harness();const r=await h.run({template:'title',topics:['Expected topic'],options:{tema:'Different topic'}});assert.equal(r.body.results[0].topic,'Expected topic');assert.equal(h.saved[0].inputs.tema,'Different topic');assert.match(h.requests[0].body.messages[0].content,/Different topic/);},true);
 console.log(JSON.stringify({scope:'actual bulk route and prompts; synthetic dependencies; known defects are baseline evidence, not acceptance',results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
