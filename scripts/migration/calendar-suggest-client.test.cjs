'use strict';
const assert=require('node:assert/strict'),{harness,suggestionSuccess,suggestion,success}=require('./calendar-client-retry.test.cjs'),{load}=require('./route-harness.cjs');
const decode=load('lib/calendar-suggestion-ack.ts').decodeCalendarSuggestionAck,flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();},results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
const expected={userId:'fixture-one',lang:'es',key:'calendar-fixture-1',method:'create',baseDay:'2026-10-07'};
const body=async()=>suggestionSuccess().json();
const slot=h=>'ytv:calendar:pending:v1:'+JSON.stringify([h.state.user,h.state.email,h.state.lang]);
async function bad(fn){const h=harness();h.state.send=async(init,scope)=>{const r=suggestionSuccess(init,scope),v=await r.json();fn(v,h);return{...r,json:async()=>v};};await h.click();assert(h.alert());assert.equal(h.requests.length,1);assert.equal(h.storage.size,1);assert.doesNotMatch(h.text(),/Synthetic topic/);const key=h.requests[0].headers['Idempotency-Key'];h.state.send=async()=>({ok:false,status:503});await h.click();assert.equal(h.requests[1].headers['Idempotency-Key'],key);assert.equal(h.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');return h;}
(async()=>{
 await test('closed own HTTP200 ACK adopts copied immutable proposals once',async()=>{
  const v=await body(),r=decode(v,expected,()=>{});for(const x of [r,r.ack,r.suggestions,r.suggestions[0],r.ack.horizon,r.ack.horizon.next14,r.ack.context,r.ack.context.coverage,r.ack.context.ownSearch,r.ack.context.ownSearch.videos])assert(Object.isFrozen(x));
  v.suggestions[0].title='Changed late';assert.equal(r.suggestions[0].title,'Synthetic topic');const h=harness();await h.click();assert.match(h.text(),/Synthetic topic/);assert.equal(h.storage.size,0);assert.equal(h.timers.size,0);
 });
 for(const status of [undefined,201,202,204,206,299])await test('HTTP '+status+' cannot confirm plausible own ACK',async()=>{
  const h=harness();let parsed=0;h.state.send=async(init,scope)=>{const r=suggestionSuccess(init,scope);return{...r,status,json:async()=>{parsed++;return r.json();}};};await h.click();assert(h.alert());assert.equal(parsed,0);assert.equal(h.storage.size,1);
 });
 const changes=[
  ['extra envelope',v=>v.authority=true],['missing ACK',v=>delete v.ack],['extra ACK',v=>v.ack.fresh=true],
  ['version',v=>v.ack.version=2],['foreign owner',v=>v.ack.userId='foreign'],['foreign key',v=>v.ack.operationKey='foreign'],
  ['nullable key',v=>v.ack.operationKey=null],['wrong method',v=>v.ack.method='retrieve'],['foreign lang',v=>v.ack.input.lang='en'],
  ['extra input',v=>v.ack.input.model='untrusted'],['extra horizon',v=>v.ack.horizon.today='renewed'],
  ['foreign base day',v=>v.ack.horizon.baseDay='2026-10-08'],['impossible base day',v=>v.ack.horizon.baseDay='2026-02-31'],
  ['short horizon',v=>v.ack.horizon.next14.pop()],['duplicate horizon',v=>v.ack.horizon.next14[1]=v.ack.horizon.next14[0]],
  ['noncanonical horizon',v=>v.ack.horizon.next14[0]='2026-2-1'],['reordered horizon',v=>v.ack.horizon.next14.reverse()],
  ['extra context',v=>v.ack.context.provider='untrusted'],['calendar incomplete',v=>v.ack.context.coverage.calendarComplete=false],
  ['wrong calendar limit',v=>v.ack.context.coverage.calendarLimit=201],['calendar count',v=>v.ack.context.coverage.calendarCount=201],
  ['fractional count',v=>v.ack.context.coverage.calendarCount=.5],['missing count',v=>delete v.ack.context.coverage.calendarCount],
  ['watch incomplete',v=>v.ack.context.coverage.watchlistComplete=false],['watch count',v=>v.ack.context.coverage.watchlistCount=21],
  ['watch limit',v=>v.ack.context.coverage.watchlistLimit=21],['trend limit',v=>v.ack.context.coverage.trendSelectionLimit=11],
  ['trend count',v=>v.ack.context.coverage.trendSelectionCount=11],['extra coverage',v=>v.ack.context.coverage.fullChannel=true],
  ['analysis date',v=>v.ack.context.bestTimeAnalyzedAt='2026-02-31T00:00:00Z'],
  ['empty proposals',v=>v.suggestions=[]],['six proposals',v=>v.suggestions=Array(6).fill({...suggestion})],
  ['extra proposal',v=>v.suggestions[0].confirmed=true],['missing proposal hour',v=>delete v.suggestions[0].hour],
  ['past date',v=>v.suggestions[0].date='2020-01-01'],['outside horizon',v=>v.suggestions[0].date='2026-10-22'],
  ['impossible date',v=>v.suggestions[0].date='2026-02-31'],['string hour',v=>v.suggestions[0].hour='0'],
  ['fractional hour',v=>v.suggestions[0].hour=.5],['hour over',v=>v.suggestions[0].hour=24],
  ['empty title',v=>v.suggestions[0].title=' '],['title length',v=>v.suggestions[0].title='x'.repeat(201)],
  ['reason type',v=>v.suggestions[0].reason=7],['reason length',v=>v.suggestions[0].reason='x'.repeat(301)],
  ['description type',v=>v.suggestions[0].description={}],['description length',v=>v.suggestions[0].description='x'.repeat(501)],
 ];
 for(const[name,change]of changes)await test(name+' preserves original selector and denies display/retry admission',()=>bad(change));
 for(const which of ['competitorSearch','ownSearch'])for(const[name,change]of [
  ['unknown state',s=>s.status='ready'],['selected null channel',s=>s.status='selected'],['channel injection',s=>s.channelId='x&key=other'],
  ['wrong limit',s=>s.selectionLimit=99],['missing range',s=>delete s.publishedThrough],['extra range',s=>s.fresh=true],
  ['foreign through day',s=>s.publishedThrough='2026-10-08T12:00:00.000Z'],['wrong lower',s=>s.publishedAfter='2026-09-01T12:00:00.000Z'],
  ['nonempty unconfirmed',s=>{s.channelId='test';s.status='unconfirmed';s.selectedCount=1;s.videos=[{videoId:'video000000',publishedAt:'2026-10-06T12:00:00Z'}];}],
  ['count mismatch',s=>{s.channelId='test';s.status='selected';s.selectedCount=1;}],
 ])await test(which+' '+name+' is not acknowledged as complete',()=>bad(v=>change(v.ack.context[which])));
 for(const[name,change]of [
  ['duplicate',s=>{s.videos.push({...s.videos[0]});s.selectedCount=2;}],['invalid ID',s=>s.videos[0].videoId='short'],
  ['future date',s=>s.videos[0].publishedAt='2026-10-08T12:00:00Z'],['equal upper',s=>s.videos[0].publishedAt=s.publishedThrough],
  ['equal lower',s=>s.videos[0].publishedAt=s.publishedAfter],['extra selected field',s=>s.videos[0].title='uncaptured'],
 ])await test('selected competitor '+name+' rejected without field repair',()=>bad(v=>{
  const s=v.ack.context.competitorSearch;s.channelId='test';s.status='selected';s.selectedCount=1;s.videos=[{videoId:'video000000',publishedAt:'2026-10-06T12:00:00Z'}];change(s);
 }));
 await test('old declared analysis timestamp is preserved and confers no freshness',async()=>{
  const v=await body();v.ack.context.bestTimeAnalyzedAt='2000-01-01T00:00:00.000Z';assert.equal(decode(v,expected,()=>{}).ack.context.bestTimeAnalyzedAt,'2000-01-01T00:00:00.000Z');
 });
 for(const phase of ['headers','json','decode','storage-set','storage-remove'])await test('monotonic 30s includes '+phase+' without timer delivery or fresh retry',async()=>{
  const h=harness();h.state.send=async(init,scope)=>{const r=suggestionSuccess(init,scope),v=await r.json();
   if(phase==='headers')h.elapseWithoutTimers(30000);
   if(phase==='storage-set')h.state.onStorageSet=()=>h.elapseWithoutTimers(30000);
   if(phase==='storage-remove')h.state.onStorageRemove=()=>h.elapseWithoutTimers(30000);
   return{...r,json:async()=>{if(phase==='json')h.elapseWithoutTimers(30000);if(phase==='decode'){const a=v.ack;Object.defineProperty(v,'ack',{enumerable:true,get(){h.elapseWithoutTimers(30000);return a;}});}return v;}};
  };
  if(phase==='storage-set')h.state.onStorageSet=()=>h.elapseWithoutTimers(30000);
  await h.click();assert(h.alert());assert.doesNotMatch(h.text(),/Synthetic topic/);assert.equal(h.timers.size,0);
  const first=h.requests[0],selected=[...h.storage.values()][0];h.state.onStorageSet=null;h.state.onStorageRemove=null;h.state.send=success;await h.click();
  if(first){assert.equal(h.requests.at(-1).headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(h.requests.at(-1).headers['X-Calendar-Recovery'],'retained-only-v1');}
  else {assert(selected);assert.equal(h.requests.at(-1).headers['Idempotency-Key'],JSON.parse(selected).key);assert.equal(h.requests.at(-1).headers['X-Calendar-Recovery'],'retained-only-v1');}
 });
 await test('headers and JSON share a single budget',async()=>{
  const h=harness();h.state.send=async(init,scope)=>{const r=suggestionSuccess(init,scope);h.elapseWithoutTimers(20000);return{...r,json:async()=>{h.elapseWithoutTimers(10000);return r.json();}};};
  await h.click();assert(h.alert());assert.equal(h.storage.size,1);assert.equal(h.timers.size,0);
 });
 for(const [name,change]of [['owner',h=>h.state.user='foreign'],['email',h=>h.state.email='foreign@example.invalid'],['lang',h=>h.state.lang='en'],['auth',h=>h.state.auth='loading']])
  await test(name+' render retires old response before effects and exposes no old proposals',async()=>{
   const h=harness();let release;h.state.send=()=>new Promise(r=>release=r);const callback=h.handler(),pending=callback();await flush();
   const first=h.requests[0],r=suggestionSuccess(first,{user:first.owner,wall:h.state.wall});change(h);const tree=h.render(true);release(r);await pending;
   assert.equal(h.requests.length,1);assert.equal(h.storage.size,1);await callback();assert.equal(h.requests.length,1);h.runEffects();await flush();assert.doesNotMatch(h.text(),/Synthetic topic/);
  });
 await test('scope before effects cannot show or add previous owner proposals',async()=>{
  const h=harness();await h.click();const add=h.nodes().find(n=>n.type==='button'&&n.props.children?.at?.(-1)==='Añadir').props.onClick;
  h.state.user='foreign';h.render(true);h.state.write=async()=>{throw Error('Must not write');};await add();assert.equal(h.writeRequests.length,0);
  h.runEffects();await flush();assert.doesNotMatch(h.text(),/Synthetic topic/);
 });
 await test('StrictMode retires original permanently, restores selector only, and old handlers cannot generate',async()=>{
  const h=harness();let release;h.state.send=()=>new Promise(r=>release=r);const old=h.handler(),pending=old();await flush();h.strictEffects();await pending;await old();assert.equal(h.requests.length,1);
  h.state.send=success;await h.click();assert.equal(h.requests.length,2);assert.equal(h.requests[1].headers['Idempotency-Key'],h.requests[0].headers['Idempotency-Key']);assert.equal(h.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');
  release(suggestionSuccess());await flush();assert.equal(h.requests.length,2);
 });
 await test('confirmed original invalidates captured generation and discard callbacks',async()=>{
  const h=harness();const original=h.handler();await original();await original();assert.equal(h.requests.length,1);
  h.state.send=async()=>({ok:false,status:503});await h.click();const oldDiscard=h.discardHandler();h.state.send=success;await h.click();h.state.send=async()=>({ok:false,status:503});await h.click();oldDiscard();assert.equal(h.storage.size,1);const k=h.requests.at(-1).headers['Idempotency-Key'];await h.click();assert.equal(h.requests.at(-1).headers['Idempotency-Key'],k);
 });
 await test('synchronous new request invalidates old add button before rerender',async()=>{
  const h=harness();await h.click();const add=h.nodes().find(n=>n.type==='button'&&n.props.children?.at?.(-1)==='Añadir').props.onClick;
  h.state.send=async()=>({ok:false,status:503});const pending=h.handler()();await add();await pending;assert.equal(h.writeRequests.length,0);
 });
 await test('valid ACK cannot erase another selector or turn its retry into fresh work',async()=>{
  const h=harness();let release;h.state.send=(init,scope)=>new Promise(r=>release=()=>r(suggestionSuccess(init,scope)));const pending=h.click();await flush();
  h.storage.set(slot(h),JSON.stringify({version:1,key:'different-retained',lang:'es'}));release();await pending;assert(h.alert());assert.doesNotMatch(h.text(),/Synthetic topic/);
  h.state.send=async()=>({ok:false,status:503});await h.click();assert.equal(h.requests[1].headers['Idempotency-Key'],'different-retained');assert.equal(h.requests[1].headers['X-Calendar-Recovery'],'retained-only-v1');assert.equal(JSON.parse(h.storage.get(slot(h))).key,'different-retained');
 });
 await test('original client UTC horizon does not renew during delayed headers at midnight',async()=>{
  const h=harness();h.state.wall=Date.parse('2026-10-07T23:59:59.000Z');let release;
  h.state.send=(init,scope)=>new Promise(r=>release=()=>r(suggestionSuccess(init,scope)));const pending=h.click();await flush();h.state.wall+=2000;release();await pending;assert.match(h.text(),/Synthetic topic/);
 });
 const report={scope:'Actual client component and closed decoder, synthetic hooks/HTTP/clock/storage only; no operational authority or real provider calls',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results};console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
