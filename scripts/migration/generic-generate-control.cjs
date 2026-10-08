'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs'),{createTaskFactory}=require('../../lib/ai/task-factory.cjs'),{createAnthropicAdapter}=require('../../lib/ai/adapters/anthropic.cjs');
module.exports=async function({config,prefix,createRegistry,createControlStore,createTaskRunner,database,cfg,budget,stats}){
 const {PrismaClient}=require('@prisma/client');const prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}});
 const registry=createRegistry();let calls=0,identity,extension=false,failSave=true,parallel=false,arrived=0,release,quotaLimit=10;
 const barrier=new Promise(r=>release=r),messages=[];let text='Synthetic partial output';
 registry.register(createAnthropicAdapter({models:{'test-model':{verified:true,executors:['ai'],capabilities:['text']}},credentialRef:'test:fixture',preflight:async()=>({upperBoundMicros:60,currency:'EUR',priceVersion:'test-v1'}),priceUsage:async()=>({costMicros:7,currency:'EUR',priceVersion:'test-v1',estimated:true}),transport:{create:async body=>{calls++;messages.push(body.messages);return {content:[{type:'text',text}],stop_reason:'max_tokens',usage:{input_tokens:10,output_tokens:5}};}}}));
 const store=role=>createControlStore(database(role),registry),selection=cfg('generic-generate-retry','anthropic');selection.profiles.default={'content.generate':{providerId:'anthropic',model:'test-model'}};
 const previous=(await store('reader').active()).revision,users=[];
 try {
  await store('activator').publish(selection,{actor:'test-admin'});await store('activator').activate(selection.revision,{expectedRevision:previous,actor:'test-admin',reason:'Synthetic generic generation business replay'});
  for(const suffix of ['generic-first','generic-extension'])users.push(await prisma.user.create({data:{email:prefix+'_'+suffix+'@example.invalid',name:'Synthetic generation retry'}}));identity=users[0].id;
  const budgetId=await budget('generic-generate-retry',300),runtime=load('lib/ai/task-runtime.ts');
  runtime.installTaskRuntime(createTaskFactory({runner:createTaskRunner({registry,store:store('executor')}),policies:{'content.generate':{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:60,maxOutputTokens:8192,deadlineMs:3000}}},authorize:async({userId,taskType})=>users.some(u=>u.id===userId)&&taskType==='content.generate'?{budgetId}:null}));
  const db={user:prisma.user,generation:{findUnique:args=>prisma.generation.findUnique(args),count:args=>prisma.generation.count(args),create:async args=>{if(failSave){failSave=false;throw Error('Synthetic failure before history commit');}if(parallel){if(++arrived===2)release();await barrier;}const row=await prisma.generation.create(args);throw Error('Synthetic lost insert acknowledgement after commit '+row.id);}},$queryRaw:prisma.$queryRaw.bind(prisma)};
  const {TEMPLATES}=load('utils/prompts.js');let context=null;
  const route=load('app/api/generate/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma),'@/lib/generation-quota':require('./generation-quota-fixture.cjs')(prisma),'node:crypto':require('node:crypto'),'@/utils/prompts':{TEMPLATES},'@/auth':{auth:async()=>extension?null:{user:{id:identity,email:users.find(u=>u.id===identity).email}}},'@/lib/extension-auth':{getExtensionUser:async()=>extension?{user:{id:identity},isPro:false}:null},'@/lib/plans':{getUserPlan:async()=>'free',isPaid:()=>false,getLimits:()=>({generationsPerMonth:quotaLimit})},'@/lib/channel-context':{getChannelContext:async()=>context?{summary:context}:null},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{}},'@/lib/prisma':{prisma:db},'@/lib/ai/task-runtime':runtime});
  const input={template:'title',inputs:{tema:'Synthetic generic topic'},lang:'es'},key='same-generic-operation';
  const invoke=(body=input,operation=key)=>route.POST(new Request('https://example.invalid/api/generate',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':operation},body:JSON.stringify(body)}));
  assert.equal((await invoke()).status,503);assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),0);assert.equal(Number((await stats(budgetId)).settled_micros),7);
  parallel=true;const replies=await Promise.all([invoke(),invoke()]);parallel=false;assert.ok(replies.every(r=>r.status===200));assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);const saved=await prisma.generation.findFirst({where:{userId:identity}});assert.match(saved.id,/^generate_[a-f0-9]{64}$/);assert.equal(saved.tokensUsed,5);assert.equal(saved.inputs._migrationRetry.truncated,true);assert.equal(saved.inputs._migrationRetry.content,text);
  quotaLimit=1;context='Changed channel context';await prisma.$executeRaw`UPDATE rate_limits SET hits=99 WHERE key=${'generate:'+identity}`;
  const recovered=await invoke();assert.equal(recovered.status,200);assert.deepEqual(await recovered.json(),{content:text,truncated:true});assert.equal(calls,1);assert.equal((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'generate:'+identity}`)[0].hits,99);
  for(const body of [{...input,inputs:{tema:'Changed input'}},{...input,template:'description'},{...input,lang:'en'},{...input,inputs:{...input.inputs,_previousContent:'Earlier'}}])assert.equal((await invoke(body)).status,409);assert.equal(calls,1);assert.equal((await invoke(input,key+'_new')).status,429);assert.equal(calls,1);
  // Original client hook -> original route -> real retained history/control ledger.
  // Lose the successful HTTP acknowledgement at an already exhausted quota; retry the same operation.
  const {harness}=require('./generic-generation-client.test.cjs');
  const client=harness({user:identity,email:users[0].email,inputs:input.inputs,lang:input.lang,key});let loseAck=true;
  client.state.send=async init=>{const response=await route.POST(new Request('https://example.invalid/api/generate',init));assert.equal(response.status,200);if(loseAck){loseAck=false;throw Error('Synthetic lost HTTP acknowledgement');}return response;};
  try {
   await client.view().generate();assert.equal(client.view().error,'unconfirmed');assert.equal(client.state.confirmed.length,0);
   await client.view().retryGeneration();assert.equal(client.view().output,text);assert.equal(client.view().truncated,true);
   assert.equal(client.requests[0].body,client.requests[1].body);assert.equal(client.requests[0].headers['Idempotency-Key'],client.requests[1].headers['Idempotency-Key']);assert.equal(client.state.confirmed.length,1);
   await client.view().retryGeneration();assert.equal(client.requests.length,2);assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);assert.equal(Number((await stats(budgetId)).settled_micros),7);
  } finally {client.unmount();}
  // Original onboarding hook -> generation and onboarding routes -> real rows.
  // Recover lost generation and step acknowledgements independently at exhausted quota.
  const welcome=require('./dashboard-onboarding.test.cjs').harness();welcome.state.user=identity;welcome.state.email=users[0].email;welcome.state.key=key;
  await prisma.user.update({where:{id:identity},data:{onboardingStep:1}});
  const onboarding=load('app/api/onboarding/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:identity}})},'@/lib/prisma':{prisma}});
  let loseGeneration=true,loseStep=true;
  welcome.state.send=async r=>{
   if(r.url==='/api/generate'){
    const response=await route.POST(new Request('https://example.invalid/api/generate',{method:'POST',headers:r.headers,body:r.rawBody,signal:r.signal}));assert.equal(response.status,200);
    if(loseGeneration){loseGeneration=false;throw Error('Synthetic lost onboarding generation acknowledgement');}return response;
   }
   if(r.method==='GET')return onboarding.GET();
   const response=await onboarding.POST(new Request('https://example.invalid/api/onboarding',{method:'POST',headers:r.headers,body:r.rawBody}));
   if(loseStep){loseStep=false;throw Error('Synthetic lost onboarding step acknowledgement');}return response;
  };
  try {
   await welcome.ready();const old=welcome.view();await old.runOnboardingGenerate(input.inputs.tema);
   assert.equal(welcome.view().generationError,true);assert.equal(welcome.view().onboardingStep,1);assert.equal(welcome.view().onboardingResult,null);
   await welcome.view().runOnboardingGenerate('Ignored replacement topic');assert.equal(welcome.view().onboardingResult,text);assert.equal(welcome.view().onboardingTruncated,true);assert.equal(welcome.view().onboardingStep,1);assert.equal(welcome.view().onboardingError,true);
   assert.equal((await prisma.user.findUnique({where:{id:identity}})).onboardingStep,2);
   const generations=welcome.requests.filter(r=>r.url==='/api/generate');assert.equal(generations.length,2);assert.equal(generations[0].rawBody,generations[1].rawBody);assert.equal(generations[0].headers['Idempotency-Key'],generations[1].headers['Idempotency-Key']);
   assert.equal(await welcome.view().retryOnboarding(),true);assert.equal(welcome.view().onboardingStep,2);await old.runOnboardingGenerate(input.inputs.tema);assert.equal(welcome.requests.filter(r=>r.url==='/api/generate').length,2);
   assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);assert.equal(Number((await stats(budgetId)).settled_micros),7);assert.equal((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'generate:'+identity}`)[0].hits,99);
   assert.equal((await prisma.user.findUnique({where:{id:users[1].id}})).onboardingStep,0);
  } finally {welcome.unmount();}
  identity=users[1].id;extension=true;context=null;assert.equal((await invoke()).status,200);assert.equal(calls,2);assert.equal(await prisma.generation.count({where:{userId:identity}}),1);assert.equal(await prisma.generation.count({where:{userId:users[0].id}}),1);assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),14);
  // Long continuation through the original hook, API, runtime and real rows.
  identity=users[0].id;extension=false;quotaLimit=10;
  await prisma.$executeRaw`UPDATE rate_limits SET hits=0 WHERE key=${'generate:'+identity}`;
  const long=harness({user:identity,email:users[0].email,inputs:input.inputs,lang:input.lang});
  const base='x'.repeat(31990),delta='y'.repeat(20);let loseContinuation=true;
  long.state.send=async init=>{const response=await route.POST(new Request('https://example.invalid/api/generate',init));assert.equal(response.status,200);if(JSON.parse(init.body).inputs._previousContent&&loseContinuation){loseContinuation=false;quotaLimit=3;throw Error('Synthetic long continuation HTTP ack lost after saved history');}return response;};
  try {
   text=base;await long.view().generate();assert.equal(long.view().output,base);
   text=delta;await long.view().continueGeneration();assert.equal(long.view().output,base);assert.equal(long.view().error,'unconfirmed');assert.equal(calls,4);assert.equal(messages.at(-1)[1].content[0].text,base);
   const continuation=long.requests[1];await long.view().retryGeneration();assert.equal(long.requests[2].body,continuation.body);assert.equal(long.requests[2].headers['Idempotency-Key'],continuation.headers['Idempotency-Key']);assert.equal(long.view().output,base+delta);assert.equal(long.state.confirmed.length,2);assert.equal(calls,4);
   const row=await prisma.generation.findFirst({where:{userId:identity,output:base+delta}});assert.ok(row);assert.equal(row.inputs._previousContent,base);assert.equal(row.inputs._migrationRetry.content,delta);
   await long.view().continueGeneration();assert.equal(long.view().error,'length');assert.equal(long.requests.length,3);assert.equal(long.view().output,base+delta);assert.equal(await prisma.generation.count({where:{userId:identity}}),3);assert.equal(await prisma.generation.count({where:{userId:users[1].id}}),1);assert.equal(Number((await stats(budgetId)).reserved_micros),0);assert.equal(Number((await stats(budgetId)).settled_micros),28);
  } finally {long.unmount();}
 } finally {
  for(const user of users){await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${'generate:'+user.id}`;await prisma.user.delete({where:{id:user.id}});}
  if((await store('reader').active()).revision!==previous)await store('activator').activate(previous,{expectedRevision:selection.revision,actor:'test-admin',reason:'Restore prior synthetic selection'});await prisma.$disconnect();
 }
};
