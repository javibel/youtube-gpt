'use strict';
const assert=require('node:assert/strict'),{harness,defaults,reply,deferred}=require('./youtube-connection.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const stage of ['headers','JSON'])await test('disconnect '+stage+' has one total deadline, retains uncertainty and ignores old ack during explicit retry',async()=>{
  const h=harness();try{
   h.state.send=defaults;await h.ready();const savedChannel=h.view().ytChannel,savedGrowth=h.view().ytGrowth,savedIdeas=h.view().dailyIdeas,before=h.requests.length,headers=deferred(),body=deferred();let bodyStarted=false,finished=0;
   h.state.send=r=>r.method==='POST'?headers.promise:defaults(r);
   const one=h.view().handleYtDisconnect().then(()=>finished++),two=h.view().handleYtDisconnect().then(()=>finished++);assert.equal(h.requests.length,before+1);const original=h.requests.at(-1);assert.equal(original.method,'POST');
   await h.view().retryYoutube();await h.view().retryYoutubeDetails();h.view().handleYtConnect();assert.equal(h.requests.length,before+1);assert.equal(h.state.href,'');
   if(stage==='JSON'){h.advance(20_000);headers.resolve({ok:true,json:()=>{bodyStarted=true;return body.promise;}});await flush();assert.equal(bodyStarted,true);h.advance(9_999);}else h.advance(29_999);
   await flush();assert.equal(finished,0);assert.equal(h.view().ytDisconnecting,true);h.advance(1);await flush();assert.equal(finished,2,'Disconnect wait remains pending after total30s');await Promise.all([one,two]);
   const retained=()=>{assert.equal(h.view().ytConnected,true);assert.deepEqual(h.view().ytChannel,savedChannel);assert.deepEqual(h.view().ytGrowth,savedGrowth);assert.deepEqual(h.view().dailyIdeas,savedIdeas);};retained();assert.equal(h.view().ytDisconnecting,false);assert.equal(h.view().ytDisconnectError,true);assert.equal(original.init.signal.aborted,true);assert.equal(h.requests.length,before+1);
   const retry=deferred();h.state.send=r=>r.method==='POST'?retry.promise:defaults(r);const next=h.view().handleYtDisconnect();const coalesced=h.view().handleYtDisconnect();assert.equal(h.requests.length,before+2);assert.equal(h.requests.at(-1).url,original.url);assert.equal(h.requests.at(-1).user,original.user);
   if(stage==='headers')headers.resolve(reply({ok:true,userId:h.state.user}));else body.resolve({ok:true,userId:h.state.user});await flush();retained();assert.equal(h.view().ytDisconnecting,true);assert.equal(h.view().ytDisconnectError,false);
   retry.resolve(reply({ok:true,userId:h.state.user}));await Promise.all([next,coalesced]);assert.equal(h.view().ytConnected,false);assert.equal(h.view().ytChannel,null);assert.equal(h.view().ytGrowth,null);assert.equal(h.view().dailyIdeas,null);assert.equal(h.view().ytDisconnecting,false);assert.equal(h.view().ytDisconnectError,false);assert.equal(h.requests.length,before+2);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 for(const stage of ['headers','JSON'])for(const field of ['user','email','auth','unmount'])await test(field+' retires hung disconnect '+stage+' without response or effects in the new scope',async()=>{
  const h=harness();try{
   h.state.send=defaults;await h.ready();const oldView=h.view(),oldUser=h.state.user,late=deferred();let bodyStarted=false,finished=false;
   h.state.send=r=>r.method==='POST'?(stage==='headers'?late.promise:{ok:true,json:()=>{bodyStarted=true;return late.promise;}}):defaults(r);
   const pending=oldView.handleYtDisconnect().then(()=>finished=true);await flush();if(stage==='JSON')assert.equal(bodyStarted,true);const original=h.requests.at(-1);assert.equal(original.method,'POST');
   h.state.send=defaults;if(field==='unmount')h.unmount();else{h.state[field]=field==='user'?'fixture-two':field==='email'?'fixture-two@example.invalid':'unauthenticated';h.view();}
   await flush();assert.equal(finished,true,'Retired disconnect still depends on old response');await pending;assert.equal(original.init.signal.aborted,true);
   if(field!=='unmount')await h.ready();const posts=h.requests.filter(r=>r.method==='POST').length;await oldView.handleYtDisconnect();assert.equal(h.requests.filter(r=>r.method==='POST').length,posts);
   late.resolve(stage==='headers'?reply({ok:true,userId:oldUser}):{ok:true,userId:oldUser});await flush();assert.equal(h.view().ytDisconnectError,false);assert.equal(h.view().ytDisconnecting,false);assert.equal(h.view().ytConnected,field==='auth'||field==='unmount'?null:true);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 console.log(JSON.stringify({scope:'Actual Dashboard disconnect controller; deterministic HTTP/JSON/clock/hooks, no server-cancellation or OAuth claims',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
