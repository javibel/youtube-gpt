'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness,reply,deferred}=require('./dashboard-onboarding.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
module.exports=async function(prisma,results){
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma),attempt=require('./text-generation-attempt-fixture.cjs')(prisma,plans),{TEMPLATES}=load('utils/prompts.js');
 for(const mode of ['complete','pending','missing']){
  const owner=await prisma.user.create({data:{email:'welcome-reload-'+crypto.randomUUID()+'@example.invalid',onboardingStep:1}}),peer=await prisma.user.create({data:{email:'welcome-reload-peer-'+crypto.randomUUID()+'@example.invalid',onboardingStep:1}});
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},first=harness({storage});let second,foreign;
  const entered=deferred(),release=deferred(),running=[];let creates=0,factories=0,retrieves=0;
  const generationFor=user=>load('app/api/generate/route.ts',{'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:user.id,email:user.email}})},'@/lib/extension-auth':{getExtensionUser:async()=>null},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/text-generation-attempt':attempt,'@/utils/prompts':{TEMPLATES},'@/lib/channel-context':{getChannelContext:async()=>null},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{}},'@/lib/ai/task-runtime':{getMessagesTask:async identity=>{
   factories++;assert.equal(identity.userId,user.id);
   return{create:async()=>{creates++;entered.resolve();if(mode==='pending')await release.promise;return{content:[{text:'Confirmed synthetic welcome reload title'}],usage:{output_tokens:8},incomplete:true};},retrieve:async()=>{retrieves++;return null;}};
  }}});
  const generation=generationFor(owner);
  const stepsFor=user=>load('app/api/onboarding/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:user.id}})},'@/lib/prisma':{prisma}}),steps=stepsFor(owner);
  const invoke=(route,r)=>route.POST(new Request('https://example.invalid/api/generate',{method:'POST',headers:r.headers,body:r.rawBody}));
  const send=async r=>r.url==='/api/generate'?invoke(generation,r):r.method==='POST'?steps.POST(new Request('https://example.invalid/api/onboarding',{method:'POST',headers:r.headers,body:r.rawBody})):steps.GET();
  const welcomeSlot=user=>'ytv:welcome:pending:v1:'+JSON.stringify([user.id,user.email,'es']);
  try{
   Object.assign(first.state,{user:owner.id,email:owner.email,key:crypto.randomUUID(),send});await first.ready();
   first.state.send=async r=>{if(r.url!=='/api/generate')return send(r);if(mode==='missing')throw Error('Not delivered');const response=invoke(generation,r);running.push(response);await response;throw Error('Original response not delivered to client');};
   const originalWait=first.view().runOnboardingGenerate('Original synthetic native reload topic'),original=first.requests.at(-1);
   if(mode==='pending'){await entered.promise;first.unmount();await originalWait;}else{await originalWait;first.unmount();}
   await flush();const retained=storage.getItem(welcomeSlot(owner));assert(retained);assert.equal(values.size,1);assert.equal(first.refreshes.length,0);
   second=harness({storage});Object.assign(second.state,{user:owner.id,email:owner.email,send});await second.ready();assert.equal(second.requests.length,1);assert.equal(second.view().onboardingStep,1);assert.equal(second.view().onboardingResult,null);assert.equal(second.view().onboardingGenerationRestored,true);assert.equal(creates,mode==='missing'?0:1);
   await second.view().runOnboardingGenerate('Replacement topic');
   if(mode==='pending'){
    assert.equal(second.view().onboardingGenerationPending,true);assert.equal(second.view().onboardingResult,null);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id,state:'pending'}}),1);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),0);assert.equal(creates,1);assert.equal(retrieves,1);
    release.resolve();assert.equal((await running[0]).status,200);await flush();assert.equal(second.view().onboardingResult,null);assert.equal(second.view().onboardingStep,1);assert.equal(storage.getItem(welcomeSlot(owner)),retained);await second.view().runOnboardingGenerate('Replacement again');
   }
   if(mode==='missing'){
    await second.view().runOnboardingGenerate('Replacement again');assert.equal(second.view().onboardingResult,null);assert.equal(second.view().onboardingGenerationPending,true);assert.equal(second.view().onboardingStep,1);assert.equal(factories,0);assert.equal(creates,0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id}}),0);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),0);assert.equal(storage.getItem(welcomeSlot(owner)),retained);
   }else{
    assert.equal(second.view().onboardingResult,'Confirmed synthetic welcome reload title');assert.equal(second.view().onboardingTruncated,true);assert.equal(second.view().onboardingStep,2);assert.equal(creates,1);assert.equal(factories,mode==='pending'?2:1);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:owner.id,state:'complete'}}),1);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),1);assert.equal(storage.getItem(welcomeSlot(owner)),null);assert.equal(second.refreshes.length,2);
   }
   const lookups=second.requests.filter(r=>r.url==='/api/generate');assert.equal(lookups.length,mode==='complete'?1:2);for(const r of lookups){assert.equal(r.rawBody,original.rawBody);assert.equal(r.headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(r.headers['X-Generation-Recovery'],'retained-only-v1');}
   // Copying valid local JSON to another account creates only an untrusted
   // selector. The native API still finds no admitted original for that owner.
   storage.setItem(welcomeSlot(peer),retained);foreign=harness({storage});const foreignGeneration=generationFor(peer),foreignSteps=stepsFor(peer);Object.assign(foreign.state,{user:peer.id,email:peer.email,send:r=>r.url==='/api/generate'?invoke(foreignGeneration,r):foreignSteps.GET()});await foreign.ready();const before=creates,beforeFactories=factories;await foreign.view().runOnboardingGenerate('Copied input');assert.equal(foreign.requests.at(-1).headers['X-Generation-Recovery'],'retained-only-v1');assert.equal(foreign.view().onboardingResult,null);assert.equal(foreign.view().onboardingStep,1);assert.equal(foreign.refreshes.length,0);assert.equal(creates,before);assert.equal(factories,beforeFactories);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:peer.id}}),0);assert.equal(await prisma.generation.count({where:{userId:peer.id}}),0);assert.equal((await prisma.user.findUnique({where:{id:peer.id}})).onboardingStep,1);
   results.push('native welcome reload '+mode+': same-tab selector restores without generation, original retained-only API confirms or remains uncertain, no new admission/inference and copied foreign selector rejected');
  }finally{
   release.resolve();await Promise.allSettled(running);first.unmount();second?.unmount();foreign?.unmount();await flush();for(const h of [first,second,foreign])if(h)assert.equal(h.timers.size,0);for(const user of [owner,peer])await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','generate:'+user.id);await prisma.user.deleteMany({where:{id:{in:[owner.id,peer.id]}}});
  }
 }
};
