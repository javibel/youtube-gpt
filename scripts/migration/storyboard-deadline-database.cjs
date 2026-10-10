'use strict';
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2,3,4,5].map(()=>prisma.user.create({data:{email:'storyboard-wait-'+randomUUID()+'@example.invalid'}})));
 const neighbor=users[4].id,plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),story='0s-6s: HOOK | A creator opens a notebook';
 try{
  await prisma.generation.create({data:{userId:neighbor,template:'video_preview',inputs:{script:'Synthetic neighboring record'},output:story,tokensUsed:2}});
  const neighborBefore=await prisma.generation.findMany({where:{userId:neighbor}});
  for(const[index,held]of ['rate','admission','create','completion'].entries()){
   const owner=users[index].id,key='native-storyboard-'+held,id='storyboard_'+createHash('sha256').update(JSON.stringify([owner,key])).digest('hex');
   const committed=deferred(),ack=deferred(),owned=[];let elapsed=0,creates=0,retrieves=0,factories=0,rateWrites=0;
   const timers=new Map(),globals={performance:{now:()=>elapsed},setTimeout(fn){const timer={};timers.set(timer,fn);return timer;},clearTimeout:timer=>timers.delete(timer)};
   const db=new Proxy(prisma,{get(target,property){
    if(property==='$queryRaw')return async(...args)=>{rateWrites++;const result=await target.$queryRaw(...args);if(held==='rate'){committed.resolve();await ack.promise;}return result;};
    if(property==='$transaction')return async(fn,options)=>{
     let stage=null;
     const result=await target.$transaction(async tx=>fn(new Proxy(tx,{get(transaction,member){
      if(member==='textGenerationAttempt')return new Proxy(transaction.textGenerationAttempt,{get(model,method){
       if(method==='create'||method==='updateMany')return async(...args)=>{const value=await model[method](...args);stage=method==='create'?'admission':'completion';return value;};
       const value=model[method];return typeof value==='function'?value.bind(model):value;
      }});
      const value=transaction[member];return typeof value==='function'?value.bind(transaction):value;
     }})),options);
     // Hold only the acknowledgement after the actual native transaction commits.
     if(stage===held){committed.resolve();await ack.promise;}return result;
    };
    const value=target[property];return typeof value==='function'?value.bind(target):value;
   }});
   const originalHelper=require('./text-generation-attempt-fixture.cjs')(db),helper={};
   for(const name of ['unkeyedStoryboardGeneration','keyedStoryboardGeneration','retrieveKeyedStoryboardGeneration'])helper[name]=(...args)=>{const original=originalHelper[name](...args);owned.push(original);return original;};
   const route=load('app/api/storyboard/route.ts',{'next/server':{NextResponse:Response},'node:crypto':require('node:crypto'),'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/plans':plans,'@/lib/prisma':{prisma:db},'@/lib/generation-quota':require('./generation-quota-fixture.cjs')(db),'@/lib/text-generation-attempt':helper,'@/lib/ai/task-runtime':{getMessagesTask:async()=>{factories++;return {create:async(_parameters,context)=>{creates++;assert.equal(context.signal,request.signal);if(held==='create'){committed.resolve();await ack.promise;}return {content:[{text:story}],usage:{output_tokens:7}};},retrieve:async()=>{retrieves++;throw Error('Saved business replay must not reconstruct a task result');}};}}},globals);
   const request=new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:'{"script":"Synthetic native script","lang":"es"}'});
   const original=route.POST(request);await committed.promise;
   const admissionBefore=await prisma.textGenerationAttempt.findUnique({where:{id}}),historyBefore=await prisma.generation.findUnique({where:{id}});
   assert.equal(admissionBefore?.state,held==='rate'?undefined:held==='completion'?'complete':'pending');assert.equal(Boolean(historyBefore),held==='completion');
   elapsed=55000;for(const fn of [...timers.values()])fn();const response=await original;
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Generation unconfirmed',code:'text_result_unconfirmed',retryMayConsume:false});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await Promise.all(owned);await flush();
   const row=await prisma.textGenerationAttempt.findUnique({where:{id}}),saved=await prisma.generation.findUnique({where:{id}});
   assert.equal(response.status,503);assert.equal(rateWrites,1);assert.equal(retrieves,0);assert.deepEqual(await prisma.generation.findMany({where:{userId:neighbor}}),neighborBefore);
   if(held==='rate'){
    assert.equal(row,null);assert.equal(saved,null);assert.equal(factories,0);assert.equal(creates,0);assert.equal(Number((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'storyboard:'+owner}`)[0].hits),1);
    results.push('Storyboard original PostgreSQL rate-limit commit held until HTTP deadline503: late rate acknowledgement cannot admit quota or construct a task; original rate effect and neighboring history preserved');
   }else if(held==='admission'){
    assert.deepEqual(row,admissionBefore);assert.equal(row.state,'pending');assert.equal(saved,null);assert.equal(factories,0);assert.equal(creates,0);
    const recovery=await route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'absent-native-key','X-Storyboard-Recovery':'retained-only-v1'},body:'{"script":"Synthetic native script"}'}));assert.equal(recovery.status,503);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner}}),1);assert.equal(factories,0);assert.equal(rateWrites,1);
    results.push('Storyboard actual native quota admission committed with its original acknowledgement withheld past HTTP deadline503: late original cannot dispatch; one pending slot and original timestamp retained, absent retained-only selector cannot admit another slot');
   }else{
    assert.equal(row.state,'complete');assert.equal(row.createdAt.getTime(),admissionBefore.createdAt.getTime());assert.equal(saved.createdAt.getTime(),admissionBefore.createdAt.getTime());assert.equal(saved.tokensUsed,7);assert.equal(saved.output,story);assert.equal(creates,1);assert.equal(factories,1);assert.equal(await prisma.generation.count({where:{userId:owner}}),1);
    if(held==='completion')assert.deepEqual(saved,historyBefore);
    const replay=await route.POST(new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Storyboard-Recovery':'retained-only-v1'},body:'{"script":"Synthetic native script","lang":"es"}'}));assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{storyboard:story});assert.equal(creates,1);assert.equal(factories,1);assert.equal(rateWrites,1);assert.equal(retrieves,0);assert.equal(await prisma.generation.count({where:{userId:owner}}),1);
    results.push('Storyboard '+(held==='create'?'synthetic task result released after HTTP retirement completes only its original native admission/history':'original native history completion committed before HTTP retirement with acknowledgement withheld')+': HTTP remains503; exact retained business replay reads one committed result, original quota date/usage and neighboring owner intact (task mocked; no native AI admission or recovery authority)');
   }
  }
 }finally{for(const user of users)await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${'storyboard:'+user.id}`;await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
