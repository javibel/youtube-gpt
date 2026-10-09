'use strict';
const assert=require('node:assert/strict');
const history=require('./generation-history.test.cjs'),statistics=require('./dashboard-stats.test.cjs');
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
const kinds=[
 {name:'history',harness:history.harness,retry:v=>v.retryHistory(),refresh:v=>v.refreshHistory(),loading:v=>v.historyLoading,error:v=>v.historyError,data:v=>v.historyGens.map(r=>r.id),response:()=>history.reply(history.page(1)),newResponse:()=>history.reply(history.page(1,100,10))},
 {name:'statistics',harness:statistics.harness,retry:v=>v.retryStats(),refresh:v=>v.refreshStats(),loading:v=>v.statsRefreshing,error:v=>v.statsError,data:v=>v.data?.stats.totalGenerations??null,response:()=>statistics.reply(statistics.stats()),newResponse:()=>statistics.reply(statistics.stats(undefined,5))}
];
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const kind of kinds){
  await test(kind.name+' initial headers deadline ends spinner without empty/zero fallback; explicit retry only',async()=>{
   const h=kind.harness();try{
    h.state.send=()=>new Promise(()=>{});let finished=false;const waiting=h.ready().then(()=>finished=true);
    h.advance(30_000);await flush();assert.equal(finished,true,'Initial read remains pending beyond30s');await waiting;
    assert.equal(kind.loading(h.view()),false);assert.ok(kind.error(h.view()));assert.equal(h.requests.length,1);assert.equal(h.requests[0].init.signal.aborted,true);
    if(kind.name==='history'){assert.equal(h.view().historyLoaded,false);assert.equal(h.view().historyPage,0);}else assert.equal(h.view().data,null);
    h.state.send=null;await kind.retry(h.view());assert.equal(h.requests.length,2);assert.ok(!kind.error(h.view()));
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  await test(kind.name+' JSON shares total deadline and preserves confirmed snapshot through late completion',async()=>{
   const h=kind.harness();try{
    await h.ready();const confirmed=kind.data(h.view());let headers,body,parsed=0,finished=false;
    h.state.send=()=>new Promise(resolve=>headers=resolve);const waiting=kind.refresh(h.view()).then(()=>finished=true);h.advance(19_000);
    headers({ok:true,json:()=>{parsed++;return new Promise(resolve=>body=resolve);}});await flush();assert.equal(parsed,1);
    h.advance(11_000);await flush();assert.equal(finished,true,'Body read remains pending beyond original deadline');await waiting;
    assert.deepEqual(kind.data(h.view()),confirmed);assert.ok(kind.error(h.view()));assert.equal(kind.loading(h.view()),false);assert.equal(h.requests.at(-1).init.signal.aborted,true);
    h.state.send=async()=>kind.newResponse();await kind.retry(h.view());const latest=kind.data(h.view());body(await kind.response().json());await flush();assert.deepEqual(kind.data(h.view()),latest);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  for(const field of ['user','email','auth','unmount'])await test(kind.name+' '+field+' retires a hung old read without waiting for network callback',async()=>{
   const h=kind.harness();try{
    await h.ready();h.state.send=()=>new Promise(()=>{});let finished=false;const waiting=kind.refresh(h.view()).then(()=>finished=true),original=h.requests.at(-1);
    h.state.send=null;if(field==='unmount')h.unmount();else{h.state[field]=field==='auth'?'unauthenticated':field==='email'?'fixture-two@example.invalid':'fixture-two';h.view();}
    await flush();assert.equal(finished,true,'Retired account still waits for response');await waiting;assert.equal(original.init.signal.aborted,true);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  await test(kind.name+' new refresh immediately retires an older GET and does not parse its late body',async()=>{
   const h=kind.harness();try{
    await h.ready();let late,parsed=0,finished=false;h.state.send=()=>new Promise(resolve=>late=resolve);
    const old=kind.refresh(h.view()).then(()=>finished=true),original=h.requests.at(-1);h.state.send=async()=>kind.newResponse();await kind.refresh(h.view());const latest=kind.data(h.view());
    await flush();assert.equal(finished,true,'Superseded read remains pending');await old;assert.equal(original.init.signal.aborted,true);
    late({ok:true,json:async()=>{parsed++;return await kind.response().json();}});await flush();assert.equal(parsed,0);assert.deepEqual(kind.data(h.view()),latest);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  await test(kind.name+' coalesced retries share the original deadline and permit one explicit retry afterwards',async()=>{
   const h=kind.harness();try{
    await h.ready();h.state.send=()=>new Promise(()=>{});let finished=0;const one=kind.retry(h.view()).then(()=>finished++),two=kind.retry(h.view()).then(()=>finished++);
    assert.equal(h.requests.length,2);h.advance(30_000);await flush();assert.equal(finished,2,'Coalesced retries remain locked forever');await Promise.all([one,two]);assert.equal(h.requests.length,2);
    h.state.send=null;await kind.retry(h.view());assert.equal(h.requests.length,3);
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
  await test(kind.name+' Strict Mode setup-cleanup-setup still shares initial request',async()=>{
   const h=kind.harness();try{
    let release;h.state.send=()=>new Promise(resolve=>release=resolve);h.strictEffects();const waiting=h.ready();await flush();assert.equal(h.requests.length,1);
    if(h.requests[0].init.signal)assert.equal(h.requests[0].init.signal.aborted,false);release(kind.response());await waiting;assert.ok(!kind.error(h.view()));
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
 }
 for(const stage of ['headers','JSON'])await test('history next-page '+stage+' timeout keeps cursor/rows and retry targets that exact page',async()=>{
  const h=history.harness();try{
   await h.ready();let late,finished=false;h.state.send=stage==='headers'?()=>new Promise(resolve=>late=resolve):async()=>({ok:true,json:()=>new Promise(resolve=>late=resolve)});
   const waiting=h.view().loadMoreHistory().then(()=>finished=true);await flush();h.advance(30_000);await flush();assert.equal(finished,true,'Next-page read never releases the pagination lock');await waiting;
   assert.equal(h.view().historyPage,1);assert.equal(h.view().historyGens.length,10);assert.equal(h.view().historyHasMore,true);assert.equal(h.view().historyError,'more');assert.equal(h.requests.at(-1).url,'/api/user/generations?page=2');
   h.state.send=null;await h.view().retryHistory();assert.equal(h.requests.at(-1).url,'/api/user/generations?page=2');assert.equal(h.view().historyPage,2);assert.equal(h.view().historyGens.length,20);
   late(stage==='headers'?history.reply(history.page(2,100,10)):history.page(2,100,10));await flush();assert.equal(h.view().historyGens.some(r=>r.id==='generation-100'),false);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 console.log(JSON.stringify({scope:'Actual Dashboard history/statistics controllers; deterministic HTTP/body/timers/hooks, no operational auth or browser acceptance',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
