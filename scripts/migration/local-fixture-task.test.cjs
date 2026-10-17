'use strict';
const assert=require('node:assert/strict');
const {createFixtureRegistry,initialConfiguration}=require('../../lib/ai/adapters/local-fixture.cjs');
const {fixture,taskCatalog,createFixtureTaskFactory}=require('../../lib/migration/local-fixture-policy.cjs');
const {bestTimeFixture}=require('../../lib/migration/best-time-fixture.cjs');
const {createTaskRunner}=require('../../contracts/ai/v1/task-runner.cjs');
const identity=p=>({userId:p.userId,taskType:p.taskType,language:p===fixture?'en':'es,en',instructionsVersion:'synthetic-test-v1',incompletePolicy:'reject',outputSchema:p===fixture
 ?{type:'object',properties:{variantA:{type:'string'},variantB:{type:'string'}},required:['variantA','variantB'],additionalProperties:false}
 :{type:'object',properties:{es:{type:'string'},en:{type:'string'}},required:['es','en'],additionalProperties:false}});
const parameters={max_tokens:200,messages:[{role:'user',content:'Deliberately identical text, not a routing instruction.'}]};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
async function run(){
 for(const profile of ['Prueba Anthropic','Prueba OpenAI'])await test('concurrent tip and title invocations remain independent through '+profile,async()=>{
  const registry=createFixtureRegistry(),config={...initialConfiguration(fixture.taskType),activeProfile:profile},admissions=[],settlements=[];
  const factory=createFixtureTaskFactory(createTaskRunner({registry,store:{async admit(request,context){admissions.push({request,context});await Promise.resolve();return {runId:context.runId,snapshot:registry.resolve(config,request),replay:false,status:'running'};},async reconcile(runId,result){settlements.push({runId,result});return {state:'settled'};}}}));
  const tasks=await Promise.all([fixture,bestTimeFixture,fixture,bestTimeFixture].map(p=>factory(identity(p))));
  const replies=await Promise.all(tasks.map(t=>t.create(parameters)));
  for(let i=0;i<replies.length;i++){
   const p=i%2?bestTimeFixture:fixture,r=replies[i],data=JSON.parse(r.content[0].text);
   assert.deepEqual(Object.keys(data).sort(),i%2?['en','es']:['variantA','variantB']);assert.equal(r.incomplete,false);assert.equal(r.execution.status,'completed');assert.equal(r.accounting.state,'settled');
   assert.equal(admissions[i].context.budgetId,p.budgetId);assert.equal(admissions[i].request.taskType,p.taskType);assert.equal(admissions[i].request.budget.maxOutputTokens,200);assert.equal(admissions[i].request.toolPolicy.maxCalls,0);
   assert.equal(settlements[i].result.usage.costMicros,0);assert.equal(settlements[i].result.usage.priceVersion,'synthetic-free-v1');
  }
  assert.equal(new Set(admissions.map(a=>a.context.runId)).size,4);
 });
 await test('owner/task authorization denies cross-account, service and caller model/budget before admission',async()=>{
  let calls=0;const factory=createFixtureTaskFactory({run:async()=>{calls++;throw Error('unexpected');}});
  for(const value of [{...identity(fixture),taskType:bestTimeFixture.taskType},{...identity(bestTimeFixture),taskType:fixture.taskType},{...identity(bestTimeFixture),userId:'foreign'},{...identity(bestTimeFixture),model:'real'},{...identity(bestTimeFixture),budgetId:fixture.budgetId}])await assert.rejects(factory(value),e=>e.code==='permissions');
  const {userId,...rest}=identity(bestTimeFixture);await assert.rejects(factory({...rest,serviceId:userId}),e=>e.code==='permissions');assert.equal(calls,0);
 });
 await test('new reviewed v2 covers both tasks without editing old v1 snapshots',async()=>{
  const registry=createFixtureRegistry(),old={contractVersion:'1.0',revision:'migration-ui-fixture-v1',fallback:'none',activeProfile:'Prueba Anthropic',profiles:{'Prueba Anthropic':{[fixture.taskType]:{providerId:'anthropic',model:'synthetic-only'}}},exceptions:[]},before=JSON.stringify(old),candidate=initialConfiguration(fixture.taskType);
  assert.equal(candidate.revision,'migration-ui-fixture-v2');assert.equal(candidate.fallback,'none');assert.deepEqual(Object.keys(taskCatalog).sort(),[fixture.taskType,bestTimeFixture.taskType,'brand.social-post','brand.gmail-reply','brand.youtube-reply'].sort());
  for(const activeProfile of Object.keys(candidate.profiles))for(const taskType of [fixture.taskType,bestTimeFixture.taskType])assert.equal(registry.resolve({...candidate,activeProfile},{taskType,requiredCapabilities:['text','json']}).model,'synthetic-only');
  assert.throws(()=>registry.resolve(candidate,{taskType:'brand.social-post',requiredCapabilities:['text','prompt_cache']}));
  assert.throws(()=>registry.resolve(old,{taskType:bestTimeFixture.taskType,requiredCapabilities:['text','json']}));assert.equal(JSON.stringify(old),before);
 });
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Compiled fixture task policies, adapter concurrency and immutable profile upgrade; no real transport or operational acceptance.',results};
}
if(require.main===module){const watchdog=setTimeout(()=>{console.error('Fixture task verification missing terminal');process.exit(1);},15000);run().then(r=>{clearTimeout(watchdog);console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;},e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});}
module.exports={run};
