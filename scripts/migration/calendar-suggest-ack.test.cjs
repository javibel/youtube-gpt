'use strict';
const assert=require('node:assert/strict'),{harness}=require('./calendar-suggest-deadline.test.cjs'),{load}=require('./route-harness.cjs');
const search=load('lib/calendar-suggestion-search.ts'),results=[];
const select={channelId:'synthetic-competitor',limit:5,publishedAfter:'2026-09-30T12:00:00.000Z',publishedThrough:'2026-10-07T12:00:00.000Z',status:'unconfirmed',videos:[]};
const video=(i=0,channelId=select.channelId,patch={})=>({id:{kind:'youtube#video',videoId:'video'+String(i).padStart(6,'0')},snippet:{channelId,title:'Original upload '+i,channelTitle:'Original source',publishedAt:'2026-10-06T12:00:00Z',...patch}});
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
function begin(state={},options={}){const h=harness({youtube:true,held:'auth',...options});Object.assign(h.state,state);h.gates.auth.resolve(h.state.auth);return h;}
const wire=(chunks,track={})=>({body:{getReader:()=>({read:async()=>chunks.length?{done:false,value:chunks.shift()}:{done:true},cancel:async()=>{track.cancelled=true;},releaseLock(){track.released=true;}})}});
(async()=>{
 await test('pure copy freezes selected fields, preserves publication declaration, and excludes unused data',()=>{
  const raw={items:[video()]};raw.items[0].secret='unused';const v=search.captureSuggestionSearch(raw,select,()=>{});
  raw.items[0].snippet.title='Changed late';assert.equal(v.videos[0].title,'Original upload 0');assert.equal(v.videos[0].publishedAt,'2026-10-06T12:00:00Z');
  for(const x of [v,v.videos,v.videos[0]])assert(Object.isFrozen(x));assert.equal(Object.hasOwn(v.videos[0],'secret'),false);
 });
 const invalid=[
  ['missing items',{}],['array response',[]],['error and items',{error:{code:403},items:[]}],
  ['six rows',{items:Array.from({length:6},(_,i)=>video(i))}],
  ['foreign channel',{items:[video(0,'foreign')]}],['missing video id',{items:[{snippet:video().snippet}]}],
  ['invalid video id',{items:[{...video(),id:{kind:'youtube#video',videoId:'x'}}]}],
  ['wrong resource',{items:[{...video(),id:{kind:'youtube#channel',videoId:'video000000'}}]}],
  ['duplicate',{items:[video(),video()]}],['empty title',{items:[video(0,select.channelId,{title:' '})]}],
  ['oversized title',{items:[video(0,select.channelId,{title:'x'.repeat(501)})]}],
  ['missing channel title',{items:[video(0,select.channelId,{channelTitle:undefined})]}],
  ['non-string text',{items:[video(0,select.channelId,{title:42})]}],
  ['impossible declared date',{items:[video(0,select.channelId,{publishedAt:'2026-02-31T12:00:00Z'})]}],
  ['offset date',{items:[video(0,select.channelId,{publishedAt:'2026-10-06T12:00:00+00:00'})]}],
  ['future date',{items:[video(0,select.channelId,{publishedAt:'2026-10-08T12:00:00Z'})]}],
  ['equal lower boundary',{items:[video(0,select.channelId,{publishedAt:select.publishedAfter})]}],
  ['equal upper boundary',{items:[video(0,select.channelId,{publishedAt:select.publishedThrough})]}],
  ['old date',{items:[video(0,select.channelId,{publishedAt:'2026-09-29T12:00:00Z'})]}],
  ['unsorted',{items:[video(0,select.channelId,{publishedAt:'2026-10-05T12:00:00Z'}),video(1)]}],
 ];
 for(const[name,data]of invalid)await test(name+' is unconfirmed in optional context without partial adoption',async()=>{
  assert.throws(()=>search.captureSuggestionSearch(data,select,()=>{}));
  const h=begin({competitorJson:data}),r=await h.original;assert.equal(r.status,200);const body=await r.json();
  assert.equal(body.ack.context.competitorSearch.status,'unconfirmed');assert.equal(body.ack.context.competitorSearch.selectedCount,0);
  assert.equal(h.captures.filter(c=>c.method).length,1);assert.doesNotMatch(h.captures.find(c=>c.method).parameters.messages[0].content,/Original upload/);
 });
 await test('only an actual empty selection is acknowledged as selected count zero',async()=>{
  const h=begin(),b=await(await h.original).json();assert.equal(b.ack.context.competitorSearch.status,'selected');assert.equal(b.ack.context.competitorSearch.selectedCount,0);
 });
 await test('own ten-row selection is included without legacy eight-title truncation',async()=>{
  const h=begin({ownJson:{items:Array.from({length:10},(_,i)=>video(i,'synthetic-owner'))}});assert.equal((await h.original).status,200);
  assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Original upload 9/);
 });
 await test('first response is copied before second optional headers arrive',async()=>{
  const h=begin({competitorJson:{items:[video()]}},{held:['auth','ownHeaders']});await h.started.ownHeaders.promise;
  h.state.competitorJson.items[0].snippet.title='Changed late upload';h.state.competitorJson.items[0].snippet.publishedAt='2099-01-01T00:00:00Z';
  h.gates.ownHeaders.resolve({status:503,redirected:false,headers:new Headers({'Content-Type':'application/json'})});
  const b=await(await h.original).json(),prompt=h.captures.find(c=>c.method).parameters.messages[0].content;
  assert.match(prompt,/Original upload 0/);assert.doesNotMatch(prompt,/Changed late/);assert.equal(b.ack.context.competitorSearch.videos[0].publishedAt,'2026-10-06T12:00:00Z');
 });
 await test('ack is closed and bound to original own identity/input/key/horizon/coverage and declared analysis date',async()=>{
  const h=begin({competitorJson:{items:[video()]},bestTime:{userId:'synthetic-suggest-owner',topSlots:[],analyzedAt:new Date('2000-01-01')}},{held:['auth','create']});
  await h.started.create.promise;h.state.auth.user.id='foreign';h.state.body.lang='es';h.request.headers.set('Idempotency-Key','changed');h.wallAdvance(86400000);
  h.gates.create.resolve(h.state.create);const r=await h.original,b=await r.json(),a=b.ack;assert.equal(r.status,200);
  assert.deepEqual(Object.keys(b).sort(),['ack','suggestions']);assert.deepEqual(Object.keys(a).sort(),['context','horizon','input','method','operationKey','userId','version']);
  assert.equal(a.version,1);assert.equal(a.userId,'synthetic-suggest-owner');assert.equal(a.operationKey,'original-suggest-key');assert.equal(a.method,'create');assert.deepEqual(a.input,{lang:'en'});
  assert.equal(a.horizon.baseDay,'2026-10-07');assert.equal(a.horizon.next14[0],'2026-10-08');assert.equal(a.horizon.next14.at(-1),'2026-10-21');
  assert.equal(a.context.bestTimeAnalyzedAt,'2000-01-01T00:00:00.000Z');assert.equal(a.context.coverage.calendarComplete,true);
  assert.equal(a.context.competitorSearch.publishedThrough,'2026-10-07T12:00:00.000Z');assert.equal(a.context.competitorSearch.publishedAfter,select.publishedAfter);
  assert.equal(JSON.stringify(a).includes('synthetic-suggest-owner@example.invalid'),false);assert.equal(JSON.stringify(a).includes('key=synthetic'),false);
  assert.equal(r.headers.get('cache-control'),'no-store');
 });
 await test('retained-only ACK describes retrieve and never creates a replacement',async()=>{
  const h=begin({}, {recovery:true});const b=await(await h.original).json();assert.equal(b.ack.method,'retrieve');assert.deepEqual(h.captures.filter(c=>c.method).map(c=>c.method),['retrieve']);
 });
 for(const [name,headers]of [['non-200',{status:201}],['redirect',{redirected:true}],['wrong MIME',{headers:new Headers({'content-type':'text/html'})}]])
  await test(name+' HTTP selection is unconfirmed without reading its body',async()=>{
   const h=begin({competitorHeaders:headers});const b=await(await h.original).json();assert.equal(b.ack.context.competitorSearch.status,'unconfirmed');assert.equal(h.calls.includes('competitorJson'),false);
  });
 await test('bounded reader rejects over65536 bytes and releases its own stream',async()=>{
  const track={},h=begin({competitorHeaders:wire([new Uint8Array(65537)],track)});const b=await(await h.original).json();
  assert.equal(b.ack.context.competitorSearch.status,'unconfirmed');assert.equal(track.cancelled,true);assert.equal(track.released,true);
 });
 await test('exact65536-byte JSON body is accepted without truncating bytes',async()=>{const text=JSON.stringify({items:[]});const h=begin({competitorHeaders:wire([new TextEncoder().encode(text+' '.repeat(65536-text.length))])});assert.equal((await(await h.original).json()).ack.context.competitorSearch.status,'selected');});
 await test('bounded streaming JSON accepts split UTF8 without changing selected text',async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({items:[video(0,select.channelId,{title:'Original á upload'})]})),split=bytes.findIndex(v=>v===195)+1,track={};
  const h=begin({competitorHeaders:wire([bytes.slice(0,split),bytes.slice(split)],track)});const b=await(await h.original).json();
  assert.equal(b.ack.context.competitorSearch.status,'selected');assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Original á upload/);assert.equal(track.released,true);assert.equal(track.cancelled,undefined);
 });
 for(const[name,bytes]of [['invalid UTF8',new Uint8Array([255])],['invalid JSON',new TextEncoder().encode('{')]])
  await test(name+' wire is unconfirmed without invented data',async()=>{
   const h=begin({competitorHeaders:wire([bytes])});const b=await(await h.original).json();assert.equal(b.ack.context.competitorSearch.status,'unconfirmed');
  });
 await test('monotonic budget retirement within item capture cannot dispatch a task or acknowledge',()=>{
  let n=0;assert.throws(()=>search.captureSuggestionSearch({items:[video(),video(1)]},select,()=>{if(++n===7)throw Error('Wait retired');}),/Wait retired/);
 });
 await test('search requests are bound to original range and channel without redirects/cache',async()=>{
  const h=begin();await h.original;for(const c of h.captures.filter(c=>c.url)){const u=new URL(c.url);assert.equal(u.searchParams.get('publishedBefore'),select.publishedThrough);assert.equal(c.context.redirect,'error');assert.equal(c.context.cache,'no-store');assert.equal(c.context.signal,h.request.signal);}
 });
 await test('unconfirmed recent search is not represented as an empty selected channel',async()=>{const h=begin({ownJson:{}});const b=await(await h.original).json();assert.equal(b.ack.context.ownSearch.status,'unconfirmed');assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Recent videos: No confirmed recent search data\./);});
 await test('no configured transport is acknowledged as not requested rather than selected empty',async()=>{
  const h=harness(),a=(await(await h.original).json()).ack;assert.equal(a.context.ownSearch.status,'not_requested');assert.equal(a.context.competitorSearch.status,'not_requested');assert.equal(h.captures.filter(c=>c.url).length,0);
 });
 await test('copied selection descriptors enter original parameters even when textual summaries match',async()=>{
  const h=begin({bestTime:{userId:'synthetic-suggest-owner',topSlots:[],analyzedAt:new Date('2000-01-01')}});
  const b=await(await h.original).json(),prompt=h.captures.find(c=>c.method).parameters.messages[0].content;
  const marker='Original captured selection (input binding only; declared dates do not establish operational provenance, consent or freshness):\n';
  const captured=JSON.parse(prompt.slice(prompt.indexOf(marker)+marker.length));
  assert.equal(captured.context.bestTime.analyzedAt,b.ack.context.bestTimeAnalyzedAt);assert.equal(captured.selection.publishedThrough,b.ack.context.ownSearch.publishedThrough);
  assert.equal(captured.userId,b.ack.userId);assert.equal(captured.operationKey,b.ack.operationKey);
  assert.equal(Object.hasOwn(captured,'method'),false);assert.equal(captured.context.coverage.calendarComplete,true);
 });
 await test('create and retained retrieval of identical capture use identical parameters; different capture cannot match',async()=>{
  const fresh=begin(),retained=begin({}, {recovery:true});await fresh.original;await retained.original;
  const parameters=h=>JSON.stringify(h.captures.find(c=>c.method).parameters);
  assert.equal(parameters(fresh),parameters(retained));
  const changed=begin({}, {wall:Date.parse('2026-10-07T12:00:00.001Z')});await changed.original;
  assert.notEqual(parameters(changed),parameters(fresh));
 });
 const report={scope:'Actual suggestion route/search capture; synthetic transport, clocks and task only. ACK is input binding, not admission/recovery/provenance/consent/freshness or operational acceptance.',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results};
 console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
