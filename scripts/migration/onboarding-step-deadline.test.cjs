'use strict';
const assert=require('node:assert/strict'),{harness,reply,deferred}=require('./dashboard-onboarding.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const ack=(h,step)=>({userId:h.state.user,step,name:'Synthetic'});
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const mode of ['read','save'])for(const stage of ['headers','JSON'])await test(mode+' '+stage+' has one total deadline, keeps confirmed state/target and ignores late ack during explicit retry',async()=>{
  const h=harness();try{
   if(mode==='save'){h.state.step=1;await h.ready();}const before=h.requests.length,headers=deferred(),body=deferred();let finished=0,bodyStarted=false;
   h.state.send=()=>headers.promise;const v=h.view(),one=(mode==='save'?v.advanceOnboarding(4):v.retryOnboarding()).then(ok=>{finished++;return ok;}),two=(mode==='save'?v.advanceOnboarding(4):v.retryOnboarding()).then(ok=>{finished++;return ok;});assert.equal(h.requests.length,before+1);const original=h.requests.at(-1);assert.equal(await v.advanceOnboarding(2),false);
   if(stage==='JSON'){h.advance(20_000);headers.resolve({ok:true,json:()=>{bodyStarted=true;return body.promise;}});await flush();assert.equal(bodyStarted,true);h.advance(9_999);}else h.advance(29_999);await flush();assert.equal(finished,0);assert.equal(h.view().onboardingBusy,true);h.advance(1);await flush();assert.equal(finished,2,'Step wait remains pending after total30s');assert.deepEqual(await Promise.all([one,two]),[false,false]);
   assert.equal(h.view().onboardingStep,mode==='save'?1:null);assert.equal(h.view().onboardingBusy,false);assert.equal(h.view().onboardingError,true);assert.equal(original.signal.aborted,true);assert.equal(h.requests.length,before+1);await v.runOnboardingGenerate('Synthetic topic');assert.equal(h.requests.length,before+1);
   const retry=deferred();h.state.send=()=>retry.promise;const next=h.view().retryOnboarding(),same=h.view().retryOnboarding();assert.equal(h.requests.length,before+2);const second=h.requests.at(-1);assert.equal(second.method,original.method);assert.equal(second.rawBody,original.rawBody);assert.equal(second.user,original.user);
   if(stage==='headers')headers.resolve(reply(ack(h,4)));else body.resolve(ack(h,4));await flush();assert.equal(h.view().onboardingStep,mode==='save'?1:null);assert.equal(h.view().onboardingBusy,true);
   retry.resolve(reply(ack(h,mode==='save'?4:2)));assert.deepEqual(await Promise.all([next,same]),[true,true]);assert.equal(h.view().onboardingStep,mode==='save'?4:2);assert.equal(h.view().onboardingBusy,false);assert.equal(h.view().onboardingError,false);assert.equal(h.requests.length,before+2);assert.equal(h.refreshes.length,0);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 await test('refresh JSON deadline preserves last confirmed step/name instead of reopening welcome',async()=>{
  const h=harness();try{h.state.step=4;await h.ready();let finished=false;h.state.send=()=>({ok:true,json:()=>new Promise(()=>{})});const pending=h.view().retryOnboarding().then(()=>finished=true);await flush();h.advance(30000);await flush();assert.equal(finished,true,'Refresh remains pending');await pending;assert.equal(h.view().onboardingStep,4);assert.equal(h.view().onboardingName,'Synthetic');assert.equal(h.view().onboardingError,true);assert.equal(h.view().onboardingBusy,false);assert.equal(h.requests.length,2);}finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 for(const mode of ['read','save'])for(const field of ['user','email','auth','lang','unmount'])await test(field+' retires hung '+mode+' without old response or cross-scope writes',async()=>{
  const h=harness();try{
   h.state.step=1;await h.ready();const old=h.view(),late=deferred(),oldUser=h.state.user;let finished=false,bodyStarted=false;
   h.state.send=()=>mode==='save'?late.promise:{ok:true,json:()=>{bodyStarted=true;return late.promise;}};
   const pending=(mode==='save'?old.advanceOnboarding(4):old.retryOnboarding()).then(()=>finished=true);await flush();if(mode==='read')assert.equal(bodyStarted,true);const original=h.requests.at(-1);
   h.state.send=null;if(field==='unmount')h.unmount();else{h.state[field]=field==='user'?'fixture-two':field==='email'?'fixture-two@example.invalid':field==='lang'?'en':'unauthenticated';h.view();}await flush();assert.equal(finished,true,'Retired step request remains pending');await pending;assert.equal(original.signal.aborted,true);
   if(field!=='unmount')await h.ready();const count=h.requests.length;assert.equal(await old.advanceOnboarding(4),false);await old.runOnboardingGenerate('Synthetic topic');assert.equal(h.requests.length,count);
   const data={userId:oldUser,step:4,name:'Old private name'};late.resolve(mode==='save'?reply(data):data);await flush();assert.equal(h.view().onboardingStep,field==='auth'||field==='unmount'?null:1);assert.notEqual(h.view().onboardingName,'Old private name');assert.equal(h.view().onboardingBusy,false);assert.equal(h.refreshes.length,0);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 await test('confirmed synthetic title survives hung step-save JSON and retry never generates or refreshes twice',async()=>{
  const h=harness();try{h.state.step=1;await h.ready();const body=deferred();let bodyStarted=false,finished=false;const old=h.view();h.state.send=r=>r.url==='/api/generate'?reply({content:'Confirmed title',truncated:true}):{ok:true,json:()=>{bodyStarted=true;return body.promise;}};const pending=old.runOnboardingGenerate('Synthetic topic').then(()=>finished=true);await flush();assert.equal(bodyStarted,true);h.advance(30000);await flush();assert.equal(finished,true,'Step save holds confirmed generation indefinitely');await pending;assert.equal(h.view().onboardingStep,1);assert.equal(h.view().onboardingResult,'Confirmed title');assert.equal(h.view().onboardingTruncated,true);assert.equal(h.view().onboardingError,true);assert.equal(h.view().generationError,false);assert.equal(h.view().onboardingBusy,false);assert.equal(h.refreshes.length,2);
   body.resolve(ack(h,2));await flush();assert.equal(h.view().onboardingStep,1);h.state.send=null;await h.view().retryOnboarding();await old.runOnboardingGenerate('New topic');assert.equal(h.view().onboardingStep,2);assert.equal(h.view().onboardingResult,'Confirmed title');assert.equal(h.requests.filter(r=>r.url==='/api/generate').length,1);assert.equal(h.requests.at(-1).body.step,2);assert.equal(h.refreshes.length,2);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 await test('immediate Strict Mode cleanup/setup keeps one original step GET and clears deadline on completion',async()=>{const h=harness();try{h.strictEffects();await h.ready();assert.equal(h.requests.length,1);assert.equal(h.view().onboardingStep,0);assert.equal(h.timers.size,0);}finally{h.unmount();await flush();assert.equal(h.timers.size,0);}});
 console.log(JSON.stringify({scope:'Actual welcome step controller; deterministic hooks/HTTP/clock and synthetic title response, no real inference or server-cancellation claim',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
