'use strict';
const assert=require('node:assert/strict'),dashboard=require('./youtube-connection.test.cjs'),generator=require('./generator-channel-status.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const kinds=[
 {name:'Dashboard',harness:dashboard.harness,set:(h,fn)=>h.state.send=fn,retry:v=>v.retryYoutube(),connected:v=>v.ytConnected,error:v=>v.ytError,loading:v=>v.ytLoading,response:r=>dashboard.defaults(r)},
 {name:'Generator',harness:generator.harness,set:(h,fn)=>h.state.read=fn?(url,init)=>fn({url,init,user:h.state.user}):null,retry:v=>v.retryChannel(),connected:v=>v.connected,error:v=>v.error,loading:v=>v.loading,response:r=>dashboard.reply(generator.connection(r.user))}
];
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const kind of kinds){
  for(const stage of ['headers','JSON'])await test(kind.name+' channel '+stage+' ends at total30s; uncertainty stays distinct from disconnected',async()=>{
   const h=kind.harness();try{
    let late,finished=false;if(stage==='headers')kind.set(h,()=>new Promise(resolve=>late=resolve));else kind.set(h,async()=>({ok:true,json:()=>new Promise(resolve=>late=resolve)}));
    const waiting=h.ready().then(()=>finished=true);await flush();h.advance(30_000);await flush();assert.equal(finished,true,'Channel wait remains pending past30s');await waiting;
    assert.equal(kind.connected(h.view()),null);assert.equal(kind.error(h.view()),true);assert.equal(kind.loading(h.view()),false);assert.equal(h.requests.length,1);assert.equal(h.requests[0].init.signal.aborted,true);
    kind.set(h,r=>kind.response(r));await kind.retry(h.view());assert.equal(kind.connected(h.view()),true);const count=h.requests.length;
    late(stage==='headers'?dashboard.reply({userId:h.state.user,connected:false}):{userId:h.state.user,connected:false});await flush();assert.equal(kind.connected(h.view()),true);assert.equal(h.requests.length,count);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  for(const field of ['user','email','auth','unmount'])await test(kind.name+' '+field+' settles a hung previous channel wait without network response',async()=>{
   const h=kind.harness();try{
    await h.ready();kind.set(h,()=>new Promise(()=>{}));let finished=false;const waiting=kind.retry(h.view()).then(()=>finished=true),original=h.requests.at(-1);
    kind.set(h,r=>kind.response(r));if(field==='unmount')h.unmount();else{h.state[field]=field==='auth'?'unauthenticated':field==='email'?'fixture-two@example.invalid':'fixture-two';h.view();}
    await flush();assert.equal(finished,true,'Retired scope retains channel wait');await waiting;assert.equal(original.init.signal.aborted,true);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  await test(kind.name+' concurrent channel retries share deadline and dispatch only on explicit retry after expiry',async()=>{
   const h=kind.harness();try{
    await h.ready();const before=h.requests.length;kind.set(h,()=>new Promise(()=>{}));let finished=0;
    const one=kind.retry(h.view()).then(()=>finished++),two=kind.retry(h.view()).then(()=>finished++);assert.equal(h.requests.length,before+1);h.advance(30_000);await flush();assert.equal(finished,2,'Shared channel request keeps retry locked');await Promise.all([one,two]);assert.equal(h.requests.length,before+1);
    assert.equal(kind.connected(h.view()),true);assert.equal(kind.error(h.view()),true);kind.set(h,r=>kind.response(r));await kind.retry(h.view());assert.equal(kind.error(h.view()),false);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
 }
 await test('Dashboard Strict Mode retains one initial channel and one read of each detail',async()=>{
  const h=dashboard.harness();try{h.state.send=dashboard.defaults;h.strictEffects();await h.ready();assert.equal(h.requests.length,3);assert.equal(h.view().ytConnected,true);}finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 for(const endpoint of ['/api/youtube/stats','/api/daily-ideas'])for(const stage of ['headers','JSON'])await test(endpoint+' '+stage+' times out independently; retry fetches only failing detail with channel retained',async()=>{
  const h=dashboard.harness();try{
   h.state.send=dashboard.defaults;await h.ready();const savedGrowth=h.view().ytGrowth,savedIdeas=h.view().dailyIdeas;let late,finished=false;
   h.state.send=r=>r.url!==endpoint?dashboard.defaults(r):stage==='headers'?new Promise(resolve=>late=resolve):{ok:true,json:()=>new Promise(resolve=>late=resolve)};
   const waiting=h.view().retryYoutube().then(()=>finished=true);await flush();assert.equal(h.view().ytConnected,true);assert.equal(h.view().ytDetailsLoading,true);h.advance(30_000);await flush();assert.equal(finished,true,'One hanging detail keeps channel retry locked');await waiting;
   assert.equal(h.view().ytDetailsLoading,false);assert.equal(h.view().ytError,false);assert.equal(h.view().ytStatsError,endpoint==='/api/youtube/stats');assert.equal(h.view().ytIdeasError,endpoint==='/api/daily-ideas');assert.deepEqual(h.view().ytGrowth,savedGrowth);assert.deepEqual(h.view().dailyIdeas,savedIdeas);
   const failed=h.requests.filter(r=>r.url===endpoint).at(-1);assert.equal(failed.init.signal.aborted,true);h.state.send=dashboard.defaults;const before=h.requests.length;await h.view().retryYoutubeDetails();assert.equal(h.requests.length,before+1);assert.equal(h.requests.at(-1).url,endpoint);
   late(stage==='headers'?dashboard.reply({userId:'wrong'}):{userId:'wrong'});await flush();assert.equal(h.view().ytStatsError,false);assert.equal(h.view().ytIdeasError,false);assert.equal(h.view().ytConnected,true);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 for(const field of ['user','unmount'])await test('Dashboard '+field+' retires hung detail reads without their callbacks',async()=>{
  const h=dashboard.harness();try{
   h.state.send=dashboard.defaults;await h.ready();h.state.send=r=>r.url==='/api/youtube/channel'?dashboard.defaults(r):new Promise(()=>{});let finished=false;const waiting=h.view().retryYoutube().then(()=>finished=true);await flush();const reads=h.requests.slice(-2);
   h.state.send=dashboard.defaults;if(field==='unmount')h.unmount();else{h.state.user='fixture-two';h.state.email='fixture-two@example.invalid';h.view();}await flush();assert.equal(finished,true,'Retired detail Promise.all remains pending');await waiting;assert(reads.every(r=>r.init.signal.aborted));
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 for(const stage of ['channel','details'])await test('Dashboard disconnect retires pending '+stage+' reads without changing disconnect acknowledgement rules',async()=>{
  const h=dashboard.harness();try{
   h.state.send=dashboard.defaults;await h.ready();h.state.send=r=>r.method==='POST'?dashboard.reply({userId:r.user,ok:true}):stage==='details'&&r.url==='/api/youtube/channel'?dashboard.defaults(r):new Promise(()=>{});
   let finished=false;const waiting=h.view().retryYoutube().then(()=>finished=true);await flush();const reads=h.requests.filter(r=>!r.init.signal?.aborted).slice(stage==='channel'?-1:-2);await h.view().handleYtDisconnect();await flush();assert.equal(finished,true,'Disconnect leaves older read lock pending');await waiting;assert(reads.every(r=>r.init.signal.aborted));assert.equal(h.view().ytConnected,false);assert.equal(h.view().ytDisconnectError,false);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 console.log(JSON.stringify({scope:'Actual YouTube Dashboard/Generator controllers; deterministic HTTP/body/timers/hooks only, no OAuth, Google, models or operational provenance',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
