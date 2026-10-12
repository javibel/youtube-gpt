'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {harness}=require('./calendar-suggest-deadline.test.cjs');
const {flush}=require('./calendar-http-read-deadline.test.cjs');
const decode=load('lib/calendar-suggestion-contract.ts').decodeCalendarSuggestions;
const dates=Object.freeze(Array.from({length:14},(_,i)=>new Date(Date.UTC(2026,9,8+i)).toISOString().slice(0,10)));
const proposal={title:'Original title',date:dates[0],hour:0,reason:'Original reason',description:'Original outline'};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
const output=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
(async()=>{
 await test('valid fields and original text are copied exactly into immutable output',()=>{
  const input={...proposal,title:'  Original title  ',description:'  Original outline  '};
  const value=decode(JSON.stringify([input]),dates,()=>{});
  assert.deepEqual(JSON.parse(JSON.stringify(value)),[input]);assert(Object.isFrozen(value));assert(Object.isFrozen(value[0]));
 });
 await test('five complete proposals and both hour/date boundaries remain exact',()=>{
  const input=Array.from({length:5},(_,i)=>({...proposal,date:i===4?dates.at(-1):dates[i],hour:i===4?23:0}));
  assert.deepEqual(JSON.parse(JSON.stringify(decode(JSON.stringify(input),dates,()=>{}))),input);
 });
 const invalid=[
  ['empty array',[]],['six entries',Array(6).fill(proposal)],['object',{suggestions:[proposal]}],
  ['null',null],['null entry',[null]],['array entry',[[]]],
  ...Object.keys(proposal).map(k=>['missing '+k,[Object.fromEntries(Object.entries(proposal).filter(([n])=>n!==k))]]),
  ['extra authority',[{...proposal,originalMutation:true}]],
  ['empty title',[{...proposal,title:' '}]],['numeric title',[{...proposal,title:123}]],
  ['title too long',[{...proposal,title:'x'.repeat(201)}]],
  ['description too long',[{...proposal,description:'x'.repeat(501)}]],
  ['reason too long',[{...proposal,reason:'x'.repeat(301)}]],
  ['null reason',[{...proposal,reason:null}]],['array description',[{...proposal,description:[]}]],
  ...['2026-02-31','0000-10-08','2026-10-07','2026-10-22','2026-10-8','2026-10-08T00:00:00Z'].map(date=>['invalid/outside date '+date,[{...proposal,date}]]),
  ...[-1,24,2.5,'0','12',null,true,[],{}].map(hour=>['invalid hour '+JSON.stringify(hour),[{...proposal,hour}]]),
 ];
 for(const[name,value]of invalid)await test(name+' rejects the whole output without replacement',async()=>{
  assert.throws(()=>decode(JSON.stringify(value),dates,()=>{}));
  const h=harness({held:'create'});await h.started.create.promise;h.gates.create.resolve(output(value));
  const r=await h.original;assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'ai_parse_error'});
  assert.equal(h.captures.filter(c=>c.method).length,1);assert.equal(h.timers.size,0);
 });
 for(const text of ['not JSON',''.padEnd(16385,' '),String.fromCharCode(96).repeat(3)+'json\n'+JSON.stringify([proposal])])
  await test('malformed, oversized or incomplete fence rejects',()=>assert.throws(()=>decode(text,dates,()=>{})));
 await test('complete Markdown fence preserves every field',()=>{
  const fence=String.fromCharCode(96).repeat(3);assert.deepEqual(JSON.parse(JSON.stringify(decode(fence+'json\n'+JSON.stringify([proposal])+'\n'+fence,dates,()=>{}))),[proposal]);
 });
 for(const malformed of [{incomplete:true,...output([proposal])},{content:[]},{content:[{type:'image',text:JSON.stringify([proposal])}]},{content:[{type:'text',text:JSON.stringify([proposal])},{type:'text',text:'extra'}]}])
  await test('incomplete or multiple task blocks never acknowledge a proposal',async()=>{
   const h=harness({held:'create'});await h.started.create.promise;h.gates.create.resolve(malformed);
   assert.equal((await h.original).status,500);assert.equal(h.timers.size,0);
  });
 await test('retained-only invalid output stays unconfirmed and never calls create',async()=>{
  const h=harness({held:'retrieve',recovery:true});await h.started.retrieve.promise;h.gates.retrieve.resolve(output([{...proposal,date:'2020-01-01'}]));
  const r=await h.original;assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'suggestions_unconfirmed',retryMayConsume:false});
  assert.deepEqual(h.captures.filter(c=>c.method).map(c=>c.method),['retrieve']);
 });
 await test('UTC midnight during auth preserves the original HTTP date horizon and query',async()=>{
  const h=harness({wall:Date.parse('2026-10-07T23:59:59Z'),held:'auth',youtube:true});
  await h.started.auth.promise;h.wallAdvance(2000);h.gates.auth.resolve(h.state.auth);
  const r=await h.original;assert.equal(r.status,200);assert.equal((await r.json()).suggestions[0].date,'2026-10-08');
  assert.equal(h.captures.find(c=>c.entriesQuery).entriesQuery.where.date.gte,'2026-10-07');
  assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Pick dates from: 2026-10-08,/);
  assert.match(h.captures.find(c=>c.url).url,/publishedAfter=2026-09-30T23:59:59.000Z/);
 });
 await test('a changed wall date does not replace the submitted invalid date',async()=>{
  const h=harness({held:'create'});await h.started.create.promise;h.wallAdvance(86400000);
  h.gates.create.resolve(output([{...proposal,date:'2026-10-07'}]));const r=await h.original;assert.equal(r.status,500);
  assert.deepEqual(await r.json(),{error:'ai_parse_error'});
 });
 await test('monotonic budget expires in output delivery even without timer callback',async()=>{
  const h=harness({held:'create'});await h.started.create.promise;
  const data={get content(){h.elapse(55000);return output([proposal]).content;}};
  h.gates.create.resolve(data);const r=await h.original;assert.equal(r.status,503);assert.equal(h.timers.size,0);
  assert.equal(h.captures.filter(c=>c.method).length,1);await flush();
 });
 await test('decoder check retires parsing and field validation within the same budget',()=>{
  for(const boundary of [1,2,3,4,5,6,7]){let checks=0;
   assert.throws(()=>decode(JSON.stringify([proposal]),dates,()=>{if(++checks===boundary)throw Error('Retired original wait');}),/Retired/);
  }
 });
 console.log(JSON.stringify({scope:'actual suggestions decoder and route; original horizon, canonical closed proposals, no writes/real models/recovery reconstruction',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results},null,2));
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
