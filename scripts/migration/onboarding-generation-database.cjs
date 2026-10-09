'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness,reply,deferred}=require('./dashboard-onboarding.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
module.exports=async function(prisma,results){
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma),attempt=require('./text-generation-attempt-fixture.cjs')(prisma,plans),{TEMPLATES}=load('utils/prompts.js');
 for(const mode of ['headers','JSON','pending','missing']){
  const owner=await prisma.user.create({data:{email:'welcome-generation-'+crypto.randomUUID()+'@example.invalid',onboardingStep:1}}),peer=await prisma.user.create({data:{email:'welcome-peer-'+crypto.randomUUID()+'@example.invalid'}}),h=harness();
  const settled=new Map(),entered=deferred(),release=deferred(),body=deferred(),bodyReady=deferred(),running=[];let creates=0,retrieves=0,factories=0,originalBody;
  const generationFor=user=>load('app/api/generate/route.ts',{'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:user.id,email:user.email}})},'@/lib/extension-auth':{getExtensionUser:async()=>null},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/text-generation-attempt':attempt,'@/utils/prompts':{TEMPLATES},'@/lib/channel-context':{getChannelContext:async()=>null},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{}},'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{
   factories++;assert.equal(identity.userId,user.id);const key=identity.userId+':'+identity.operationKey;
   return{create:async parameters=>{creates++;entered.resolve();if(mode==='pending')await release.promise;const value={content:[{text:'Synthetic native welcome title'}],usage:{output_tokens:8},incomplete:true};settled.set(key,{parameters:JSON.stringify(parameters),value});return value;},retrieve:async parameters=>{retrieves++;const previous=settled.get(key);if(!previous)return null;assert.equal(JSON.stringify(parameters),previous.parameters);return previous.value;}};
  }}});
  const generation=generationFor(owner),steps=load('app/api/onboarding/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/prisma':{prisma}});
  // The synthetic transport ignores client abort. Only the original API invocation
  // and its own native business reservation may complete; timeout grants no authority.
  const invoke=(route,r)=>route.POST(new Request('https://example.invalid/api/generate',{method:'POST',headers:r.headers,body:r.rawBody}));
  const send=async r=>r.url==='/api/generate'?invoke(generation,r):r.method==='POST'?steps.POST(new Request('https://example.invalid/api/onboarding',{method:'POST',headers:r.headers,body:r.rawBody})):steps.GET();
  try{
   h.state.user=owner.id;h.state.email=owner.email;h.state.key=crypto.randomUUID();h.state.send=send;await h.ready();assert.equal(h.view().onboardingStep,1);
   h.state.send=async r=>{
    if(r.url!=='/api/generate')return send(r);
    if(mode==='missing')return body.promise;
    const original=invoke(generation,r);running.push(original);const response=await original;originalBody=await response.json();bodyReady.resolve();
    if(mode==='headers')return body.promise;
    if(mode==='JSON')return{ok:response.ok,status:response.status,json:()=>body.promise};
    return reply(originalBody,response.status);
   };
   let finished=false;const pending=h.view().runOnboardingGenerate('Synthetic native topic').then(()=>finished=true),original=h.requests.at(-1);
   if(mode==='pending')await entered.promise;else if(mode!=='missing')await bodyReady.promise;await flush();h.advance(90000);await flush();assert.equal(finished,true,'Original client wait did not end');await pending;
   const uncertain=()=>{assert.equal(h.view().onboardingStep,1);assert.equal(h.view().onboardingResult,null);assert.equal(h.view().onboardingBusy,false);assert.equal(h.view().onboardingGenerationPending,true);assert.equal(h.view().generationError,true);};uncertain();assert.equal(h.view().generationTimedOut,true);assert.equal(original.signal.aborted,true);assert.equal(creates,mode==='missing'?0:1);
   if(mode==='headers'||mode==='JSON'){
    assert.equal(await prisma.generation.count({where:{userId:owner.id}}),1);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id,state:'complete'}}),1);
    const retryBody=deferred(),retryReady=deferred();h.state.send=async r=>{if(r.url!=='/api/generate')return send(r);const response=await send(r),data=await response.json();assert.equal(response.status,200);assert.deepEqual(data,originalBody);retryReady.resolve();return{ok:true,json:()=>retryBody.promise};};
    const retry=h.view().runOnboardingGenerate('Replacement topic');await retryReady.promise;body.resolve(mode==='headers'?reply(originalBody):originalBody);await flush();assert.equal(h.view().onboardingResult,null);assert.equal(h.view().onboardingStep,1);assert.equal(h.view().onboardingBusy,true);assert.equal(h.refreshes.length,0);retryBody.resolve(originalBody);await retry;
    assert.equal(h.view().onboardingResult,'Synthetic native welcome title');assert.equal(h.view().onboardingTruncated,true);assert.equal(h.view().onboardingStep,2);assert.equal(h.refreshes.length,2);assert.equal(creates,1);assert.equal(retrieves,0);assert.equal(factories,1);
   }else{
    const observed=[];h.state.send=async r=>{const response=await send(r);if(r.url==='/api/generate')observed.push(response.status);return response;};
    await h.view().runOnboardingGenerate('Replacement topic');assert.deepEqual(observed,[503]);uncertain();assert.equal(h.view().generationTimedOut,false);assert.equal(creates,mode==='missing'?0:1);
    if(mode==='pending'){
     assert.equal(retrieves,1);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id,state:'pending'}}),1);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),0);
     release.resolve();assert.equal((await running[0]).status,200);await flush();uncertain();await h.view().runOnboardingGenerate('Replacement topic');assert.equal(h.view().onboardingResult,'Synthetic native welcome title');assert.equal(h.view().onboardingStep,2);assert.equal(creates,1);assert.equal(retrieves,1);
    }else{
     assert.equal(factories,0);assert.equal(retrieves,0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id}}),0);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),0);body.resolve(reply({},503));await flush();uncertain();assert.equal(h.refreshes.length,0);
    }
   }
   const generations=h.requests.filter(r=>r.url==='/api/generate');assert.equal(generations.length,mode==='pending'?3:2);for(const r of generations.slice(1)){assert.equal(r.rawBody,original.rawBody);assert.equal(r.headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(r.headers['X-Generation-Recovery'],'retained-only-v1');}
   const count=creates;assert.equal((await invoke(generationFor(peer),generations[1])).status,503);assert.equal(creates,count);assert.equal((await prisma.user.findUnique({where:{id:peer.id}})).onboardingStep,0);assert.equal(await prisma.generation.count({where:{userId:peer.id}}),0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:peer.id}}),0);
   assert.equal((await prisma.user.findUnique({where:{id:owner.id}})).onboardingStep,mode==='missing'?1:2);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),mode==='missing'?0:1);
   results.push('native welcome generation '+mode+' wait: original API/quota/history, bounded uncertainty, retained-only same-key lookup without new inference/admission, late result ignored and foreign owner denied');
  }finally{
   release.resolve();body.resolve(reply({},503));await Promise.allSettled(running);h.unmount();await flush();assert.equal(h.timers.size,0);for(const user of [owner,peer])await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','generate:'+user.id);await prisma.user.deleteMany({where:{id:{in:[owner.id,peer.id]}}});
  }
 }
};
