'use strict';
const assert=require('node:assert/strict'),{harness,page,reply,row}=require('./generation-history.test.cjs');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const results=[];async function test(name,fn){const h=harness();try{await fn(h);results.push({name,status:'PASS'});}finally{h.unmount();await flush();assert.equal(h.timers.size,0);}}
(async()=>{
 for(const count of [0,1,8])await test('count '+count+' observed before insert keeps ten actual rows and terminal flag, never fabricated empty history',async h=>{
  h.state.send=async()=>reply(page(1,0,10,count));await h.ready();const v=h.view();assert.equal(v.historyLoaded,true);assert.equal(v.historyError,null);assert.equal(v.historyGens.length,10);assert.equal(v.historyHasMore,false);assert.equal(v.historyPage,1);await v.loadMoreHistory();assert.equal(h.requests.length,1);
 });
 for(const count of [0,3,9])await test('short page '+count+' after delete keeps observed hasMore and advances only on explicit next-page click',async h=>{
  await h.ready();h.state.send=async()=>reply(page(2,30,count,23));await h.view().loadMoreHistory();const v=h.view();assert.equal(v.historyError,null);assert.equal(v.historyPage,2);assert.equal(v.historyGens.length,10+count);assert.equal(v.historyHasMore,true);await flush();assert.equal(h.requests.length,2);
  h.state.send=async()=>reply(page(3,40,0,13));await v.loadMoreHistory();assert.equal(h.requests.at(-1).url,'/api/user/generations?page=3');assert.equal(h.view().historyGens.length,10+count);assert.equal(h.view().historyPage,3);assert.equal(h.view().historyHasMore,false);
 });
 await test('empty first page with earlier positive count remains a confirmed page, hasMore and explicit load preserved',async h=>{
  h.state.send=async()=>reply(page(1,0,0,23));await h.ready();assert.equal(h.view().historyLoaded,true);assert.equal(h.view().historyError,null);assert.equal(h.view().historyHasMore,true);assert.equal(h.requests.length,1);
  h.state.send=async()=>reply(page(2,0,0,0));await h.view().loadMoreHistory();assert.equal(h.view().historyPage,2);assert.equal(h.view().historyHasMore,false);
 });
 await test('overlap in a short concurrent page deduplicates IDs without rewriting its cursor or hasMore',async h=>{
  await h.ready();h.state.send=async()=>reply(page(2,9,3,23));await h.view().loadMoreHistory();assert.equal(h.view().historyGens.length,12);assert.equal(h.view().historyPage,2);assert.equal(h.view().historyHasMore,true);assert.equal(h.view().historyError,null);
 });
 await test('refresh with a smaller count replaces prior pages with real rows and preserves measured/legacy usage',async h=>{
  await h.ready();await h.view().loadMoreHistory();const data=page(1,100,3,0);data.generations[0].tokensUsed=17;data.generations[0].inputs={tema:'Public label',number:1,nested:{private:'Not rendered'},list:[1]};h.state.send=async()=>reply(data);await h.view().refreshHistory();
  const v=h.view();assert.equal(v.historyGens.length,3);assert.equal(v.historyPage,1);assert.equal(v.historyError,null);assert.equal(v.historyHasMore,false);assert.equal(v.historyGens[0].tokensUsed,17);assert.equal(v.historyGens[1].tokensUsed,null);assert.deepEqual(Object.keys(v.historyGens[0].inputs),['tema']);assert.equal(v.historyGens[0].output,'Synthetic output 100');
 });
 const invalids=[
  ['negative count',d=>d.total=-1],['fractional count',d=>d.total=1.5],['unsafe count',d=>d.total=Number.MAX_SAFE_INTEGER+1],['nonfinite count',d=>d.total=NaN],['string count',d=>d.total='23'],
  ['mismatched hasMore',d=>d.hasMore=false],['terminal with true hasMore',d=>{d.total=0;d.hasMore=true;}],['eleven rows',d=>d.generations.push(row(99))],
  ['duplicate ID',d=>d.generations[1]=d.generations[0]],['missing inputs',d=>delete d.generations[0].inputs],['invalid date',d=>d.generations[0].createdAt='invalid'],
  ['invalid tokens',d=>d.generations[0].tokensUsed=0],['wrong page',d=>d.page=3]
 ];
 for(const[name,alter]of invalids)await test(name+' keeps confirmed pages and retries the exact cursor rather than accepting malformed data',async h=>{
  await h.ready();const prior=h.view().historyGens.map(r=>r.id);const data=page(2);alter(data);h.state.send=async()=>reply(data);await h.view().loadMoreHistory();
  assert.deepEqual(h.view().historyGens.map(r=>r.id),prior);assert.equal(h.view().historyPage,1);assert.equal(h.view().historyError,'more');h.state.send=async()=>reply(page(2,30,3,23));await h.view().retryHistory();assert.equal(h.requests.at(-1).url,'/api/user/generations?page=2');assert.equal(h.view().historyPage,2);assert.equal(h.view().historyError,null);
 });
 for(const[field,value]of [['user',undefined],['user',''],['email',null],['email',''],['auth','loading'],['auth','unauthenticated']])await test('missing '+field+'/'+String(value)+' dispatches no history GET and retires stale callbacks immediately',async h=>{
  await h.ready();const old=h.view(),n=h.requests.length;h.state[field]=value;assert.equal(h.view(true).historyGens.length,0);await old.refreshHistory();await old.retryHistory();await old.loadMoreHistory();assert.equal(h.requests.length,n);h.runEffects();await h.ready();assert.equal(h.requests.length,n);assert.equal(h.view().historyLoaded,false);
 });
 for(const stage of ['headers','JSON'])for(const field of ['user','email','auth','unmount'])await test(stage+'/'+field+' discards old-account data before parsing/publishing even before new effects',async h=>{
  await h.ready();let release,parsed=0;h.state.send=stage==='headers'?()=>new Promise(r=>release=r):async()=>({ok:true,json:()=>{parsed++;return new Promise(r=>release=r);}});
  const waiting=h.view().loadMoreHistory();await flush();if(field==='unmount')h.unmount();else{h.state[field]=field==='auth'?'loading':field==='user'?'fixture-two':'fixture-two@example.invalid';h.view(true);}
  if(stage==='headers')release({ok:true,json:async()=>{parsed++;return page(2);}});else release(page(2));await waiting;assert.equal(parsed,stage==='headers'?0:1);assert(!h.view(true).historyGens.some(r=>r.id==='generation-10'));assert.equal(h.requests.length,2);
 });
 for(const stage of ['headers','JSON'])await test('concurrent page '+stage+' held past30s preserves snapshot/cursor and ignores its later acknowledgement after explicit retry',async h=>{
  await h.ready();let release;h.state.send=stage==='headers'?()=>new Promise(r=>release=r):async()=>({ok:true,json:()=>new Promise(r=>release=r)});
  const waiting=h.view().loadMoreHistory();await flush();h.advance(30000);await waiting;assert.equal(h.view().historyPage,1);assert.equal(h.view().historyGens.length,10);assert.equal(h.view().historyError,'more');assert(h.requests.at(-1).init.signal.aborted);
  h.state.send=async()=>reply(page(2,30,3,23));await h.view().retryHistory();assert.equal(h.view().historyPage,2);assert.equal(h.view().historyGens.length,13);release(stage==='headers'?reply(page(2,90,3,23)):page(2,90,3,23));await flush();assert(!h.view().historyGens.some(r=>r.id==='generation-90'));assert.equal(h.requests.length,3);
 });
 await test('coalesced next-page clicks share one short concurrent result and preserve Strict Mode initial dispatch',async h=>{
  h.strictEffects();await h.ready();assert.equal(h.requests.length,1);let release;h.state.send=()=>new Promise(r=>release=r);const v=h.view(),a=v.loadMoreHistory(),b=v.loadMoreHistory();assert.equal(h.requests.length,2);release(reply(page(2,30,3,23)));await Promise.all([a,b]);assert.equal(h.view().historyPage,2);assert.equal(h.view().historyGens.length,13);
 });
 console.log(JSON.stringify({status:'PASS',scope:'Actual Dashboard generation-history controller; separate count/page observations, synthetic HTTP/hooks and clock, no browser/auth/model acceptance',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
