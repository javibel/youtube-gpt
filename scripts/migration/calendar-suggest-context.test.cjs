'use strict';
const assert=require('node:assert/strict'),{harness}=require('./calendar-suggest-deadline.test.cjs');
const {flush}=require('./calendar-http-read-deadline.test.cjs'),{load}=require('./route-harness.cjs');
const decoder=load('lib/calendar-suggestion-context.ts'),owner='synthetic-suggest-owner',at=new Date('2026-10-07T12:00:00Z');
const row=(i=0,patch={})=>({id:'entry-'+String(i).padStart(3,'0'),userId:owner,title:'Original scheduled '+i,date:'2026-10-08',status:'idea',createdAt:at,...patch});
const competitor=(i=0,patch={})=>({id:'competitor-'+String(i).padStart(3,'0'),userId:owner,channelId:'channel_'+i,channelName:'Original competitor '+i,addedAt:at,...patch});
const trend=(i=0,patch={})=>({id:'trend-'+String(i).padStart(3,'0'),userId:owner,title:'Original trend '+i,category:'test',relevance:80,createdAt:at,...patch});
const times={userId:owner,topSlots:[{day:0,hour:0,score:80,videoCount:2}],analyzedAt:at};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
function setup(state){const h=harness({held:'auth'});Object.assign(h.state,state);h.gates.auth.resolve(h.state.auth);return h;}
(async()=>{
 await test('exact own context is immutable and excludes unused credentials/metadata',()=>{
  const best=decoder.captureSuggestionTimes(times,owner,()=>{}),watch=decoder.captureSuggestionCompetitors([competitor()],owner,()=>{}),calendar=decoder.captureSuggestionCalendar([row()],owner,'2026-10-07',()=>{}),channel=decoder.captureSuggestionChannel({userId:owner,channelId:'own_channel',channelName:'Original own',accessToken:'unused-private'},owner,()=>{});
  for(const value of [best,best.topSlots,best.topSlots[0],watch,watch[0],calendar,calendar[0],channel])assert(Object.isFrozen(value));
  assert.equal(Object.hasOwn(channel,'accessToken'),false);assert.equal(Object.hasOwn(best.topSlots[0],'videoCount'),false);
 });
 const invalid=[
  ['bestTime',{bestTime:{...times,userId:'foreign'}}],
  ['slot day',{bestTime:{...times,topSlots:[{day:7,hour:0,score:1}]}}],
  ['slot hour',{bestTime:{...times,topSlots:[{day:0,hour:'0',score:1}]}}],
  ['slot score',{bestTime:{...times,topSlots:[{day:0,hour:0,score:NaN}]}}],
  ['slot duplicate',{bestTime:{...times,topSlots:[{day:0,hour:0,score:1},{day:0,hour:0,score:2}]}}],
  ['trend foreign',{trends:[trend(0,{userId:'foreign'})]}],
  ['trend relevance',{trends:[trend(0,{relevance:59})]}],
  ['trend duplicate',{trends:[trend(),trend()]}],
  ['trend unsorted',{trends:[trend(1),trend(0)]}],
  ['trend exceeds selected limit',{trends:Array.from({length:11},(_,i)=>trend(i))}],
  ['competitor foreign',{competitors:[competitor(0,{userId:'foreign'})]}],
  ['competitor URL selector injection',{competitors:[competitor(0,{channelId:'x&key=other'})]}],
  ['competitor duplicate',{competitors:[competitor(),competitor()]}],
  ['competitor channel duplicate',{competitors:[competitor(),competitor(1,{channelId:'channel_0'})]}],
  ['competitor unsorted',{competitors:[competitor(1),competitor(0)]}],
  ['watchlist sentinel',{competitors:Array.from({length:21},(_,i)=>competitor(i))}],
  ['calendar foreign',{entries:[row(0,{userId:'foreign'})]}],
  ['calendar invalid civil day',{entries:[row(0,{date:'2026-02-31'})]}],
  ['calendar below captured range',{entries:[row(0,{date:'2026-10-06'})]}],
  ['calendar status',{entries:[row(0,{status:'unknown'})]}],
  ['calendar title oversized',{entries:[row(0,{title:'x'.repeat(201)})]}],
  ['calendar duplicate',{entries:[row(),row()]}],
  ['calendar unsorted',{entries:[row(1),row(0)]}],
  ['calendar sentinel',{entries:Array.from({length:201},(_,i)=>row(i))}],
  ['channel foreign',{token:{userId:'foreign',channelId:'own',channelName:'Own'}}],
  ['channel malformed',{token:{userId:owner,channelId:{other:true},channelName:'Own'}}],
 ];
 for(const[name,state]of invalid)await test(name+' rejects before factory or inference',async()=>{
  const h=setup(state),r=await h.original;assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});assert.equal(h.calls.includes('factory'),false);assert.equal(h.captures.filter(c=>c.method).length,0);assert.equal(h.timers.size,0);
 });
 await test('200 calendar rows and 20 watched channels have complete selected coverage, with entry beyond old cap in prompt',async()=>{
  const h=setup({entries:Array.from({length:200},(_,i)=>row(i)),competitors:Array.from({length:20},(_,i)=>competitor(i)),trends:Array.from({length:10},(_,i)=>trend(i)),bestTime:times,token:{userId:owner,channelId:'own_channel',channelName:'Own'}});
  assert.equal((await h.original).status,200);const call=h.captures.find(c=>c.method);assert.match(call.parameters.messages[0].content,/Original scheduled 199/);assert.match(call.parameters.messages[0].content,/Monday at 0:00 UTC/);
  assert(Object.isFrozen(call.parameters));assert(Object.isFrozen(call.parameters.messages));assert(Object.isFrozen(call.parameters.messages[0]));
  assert.equal(h.captures.find(c=>c.entriesQuery).entriesQuery.take,201);
 });
 await test('earlier facts are copied before a later SQL await',async()=>{
  const h=harness({held:['auth','trends']});h.state.bestTime=structuredClone(times);h.gates.auth.resolve(h.state.auth);await h.started.trends.promise;
  h.state.bestTime.topSlots[0].hour=23;h.state.bestTime.topSlots[0].score=0;h.gates.trends.resolve(h.state.trends);
  assert.equal((await h.original).status,200);const prompt=h.captures.find(c=>c.method).parameters.messages[0].content;assert.match(prompt,/Monday at 0:00 UTC \(score: 80\)/);assert.doesNotMatch(prompt,/Monday at 23:00/);
 });
 await test('context and expiry are copied before the original transaction ACK',async()=>{
  const h=harness({held:['auth','transaction']});h.state.entries=[row()];h.state.token={userId:owner,channelId:'original_channel',channelName:'Original channel'};h.gates.auth.resolve(h.state.auth);await h.started.transaction.promise;
  h.state.entries[0].title='Changed late source';h.state.token.channelName='Changed late channel';h.gates.transaction.resolve(h.state.transaction);
  assert.equal((await h.original).status,200);const prompt=h.captures.find(c=>c.method).parameters.messages[0].content;assert.match(prompt,/Original scheduled 0/);assert.match(prompt,/Original channel/);assert.doesNotMatch(prompt,/Changed late/);
 });
 await test('substituted SQL ACK cannot adopt a fabricated context object',async()=>{
  const h=harness({held:'transaction'});await h.started.transaction.promise;h.gates.transaction.resolve({...h.state.transaction});
  assert.equal((await h.original).status,503);assert.equal(h.calls.includes('factory'),false);
 });
 await test('body is captured before the first own SQL read',async()=>{
  const h=harness({held:'owner'});await h.started.owner.promise;h.state.body.lang='es';h.gates.owner.resolve(h.state.owner);
  assert.equal((await h.original).status,200);assert.equal(h.captures.find(c=>c.identity).identity.language,'en');
 });
 await test('retained-only context never falls back to create and original absence remains unconfirmed',async()=>{
  const h=harness({held:'retrieve',recovery:true});await h.started.retrieve.promise;h.gates.retrieve.resolve(null);const r=await h.original;assert.equal(r.status,503);assert.deepEqual(h.captures.filter(c=>c.method).map(c=>c.method),['retrieve']);await flush();
 });
 console.log(JSON.stringify({scope:'actual own SQL context copying, complete calendar/watchlist sentinel coverage and deterministic selected trends; simulated dependencies only',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results},null,2));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
