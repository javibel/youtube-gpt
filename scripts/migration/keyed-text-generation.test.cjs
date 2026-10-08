'use strict';
const assert=require('node:assert/strict'),fixture=require('./text-generation-attempt-fixture.cjs'),results=[];
const id='generate_'+'a'.repeat(64),other='generate_'+'b'.repeat(64);
const good={content:'Synthetic delta',truncated:true,history:{template:'title',inputs:{tema:'Synthetic'},output:'Previous Synthetic delta',tokensUsed:8,ipAddress:null}};
function harness(o={}){
 const attempts=new Map(),history=new Map();let effects=0,reads=0,preflights=0,tail=Promise.resolve(),retained=null,completionWrites=0;
 const model={count:async()=>Array.from(attempts.values()).filter(r=>r.state!=='complete').length,create:async({data})=>{const row={...data,createdAt:new Date()};attempts.set(data.id,row);return row;},findUnique:async({where})=>attempts.get(where.id)||null,updateMany:async({where,data})=>{const row=attempts.get(where.id);if(o.updateFailure||!row||row.state!==where.state)return{count:0};attempts.set(where.id,{...row,...data});return{count:1};}};
 const generation={count:async()=>o.used??history.size,findUnique:async({where})=>history.get(where.id)||null,create:async({data})=>{if(o.saveFailure)throw Error('Synthetic completion rollback');assert(!history.has(data.id));completionWrites++;history.set(data.id,data);return data;}};
 const db={textGenerationAttempt:model,generation,$transaction:(fn,opts)=>{
  assert.equal(opts.maxWait,10000);assert.equal(opts.timeout,15000);
  const run=tail.then(async()=>{const before=new Map(attempts),saved=new Map(history);let added=false,wrote=false,value;
   try{value=await fn({textGenerationAttempt:{...model,create:async args=>{added=true;return model.create(args);}},generation:{...generation,create:async args=>{wrote=true;return generation.create(args);}},legacyThumbnailAttempt:{count:async()=>o.images??0},$queryRawUnsafe:async(sql,user)=>{assert.equal(sql,'SELECT id FROM users WHERE id=$1 FOR UPDATE');assert.equal(user,'owner');return o.noOwner?[]:[{id:user}];}});}
   catch(e){attempts.clear();history.clear();for(const[k,v]of before)attempts.set(k,v);for(const[k,v]of saved)history.set(k,v);throw e;}
   if(added&&o.lostAdmission)throw Error('Synthetic committed admission ack lost');
   if(wrote&&o.lostCompletion)throw Error('Synthetic committed completion ack lost');
   if(added&&o.abortAfterAdmission)o.abortAfterAdmission.abort();return value;
  });tail=run.catch(()=>{});return run;
 }};
 const helper=fixture(db,{getUserPlan:async()=>'free',getLimits:()=>({generationsPerMonth:10})});
 return{attempts,history,effects:()=>effects,reads:()=>reads,preflights:()=>preflights,writes:()=>completionWrites,
  run:(key=id,signal=new AbortController().signal)=>helper.keyedTextGeneration('owner',key,signal,
   async()=>{preflights++;return o.denied?new Response(null,{status:403}):null;},
   async()=>{effects++;assert.equal(attempts.get(key).state,'pending');if(o.pause)await o.pause;retained=o.result??good;return retained;},
   async()=>{reads++;if(o.readFailure)throw Error('Synthetic unavailable settled result');return retained??new Response(null,{status:503});})};
}
async function test(name,fn){await fn();results.push({name,status:'PASS'});}
(async()=>{
 await test('fresh acknowledged admission precedes one model and atomic quota conversion',async()=>{const h=harness();assert.equal((await h.run()).status,200);assert.equal(h.effects(),1);assert.equal(h.reads(),0);assert.equal(h.attempts.get(id).state,'complete');assert.equal(h.history.get(id).createdAt.getTime(),h.attempts.get(id).createdAt.getTime());});
 await test('history failure retains capacity; exhausted-quota retry reads settled result without preflight or model',async()=>{const o={saveFailure:true},h=harness(o);assert.equal((await h.run()).status,503);assert.equal(h.history.size,0);assert.equal(h.attempts.get(id).state,'pending');o.used=9;o.denied=true;o.saveFailure=false;assert.equal((await h.run()).status,200);assert.equal(h.effects(),1);assert.equal(h.reads(),1);assert.equal(h.preflights(),1);assert.equal(h.history.size,1);});
 await test('missing admission acknowledgement leaves pending but next HTTP never infers from that row',async()=>{const h=harness({lostAdmission:true});assert.equal((await h.run()).status,503);assert.equal(h.attempts.size,1);assert.equal((await h.run()).status,503);assert.equal(h.effects(),0);assert.equal(h.reads(),1);assert.equal(h.preflights(),1);});
 await test('same-key in-flight follower never executes; original alone completes',async()=>{let release;const pause=new Promise(r=>release=r),h=harness({pause});const first=h.run();while(h.effects()===0)await new Promise(r=>setImmediate(r));assert.equal((await h.run()).status,503);assert.equal(h.effects(),1);assert.equal(h.reads(),1);release();assert.equal((await first).status,200);assert.equal(h.history.size,1);});
 await test('different keys competing for the final image/text shared slot admit only one model',async()=>{const h=harness({used:9});const replies=await Promise.all([h.run(id),h.run(other)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,429]);assert.equal(h.effects(),1);assert.equal(h.attempts.size,1);});
 await test('concurrent reads of one settled result commit exactly one history and confirm its completion',async()=>{const o={saveFailure:true},h=harness(o);await h.run();o.saveFailure=false;const r=await Promise.all([h.run(),h.run()]);assert(r.every(x=>x.status===200));assert.equal(h.effects(),1);assert.equal(h.history.size,1);assert.equal(h.writes(),1);});
 await test('lost completion acknowledgement confirms original committed result',async()=>{const h=harness({lostCompletion:true});assert.equal((await h.run()).status,200);assert.equal(h.effects(),1);assert.equal(h.history.size,1);});
 await test('deleted complete history never resurrects from runtime result',async()=>{const h=harness();await h.run();h.history.delete(id);assert.equal((await h.run()).status,503);assert.equal(h.effects(),1);assert.equal(h.reads(),0);});
 await test('foreign reservation cannot read or run a model',async()=>{const h=harness();h.attempts.set(id,{id,userId:'foreign',state:'pending',createdAt:new Date()});assert.equal((await h.run()).status,503);assert.equal(h.effects(),0);assert.equal(h.reads(),0);});
 for(const o of [{denied:true},{noOwner:true},{used:9,images:1}])await test('fresh denial/owner/last-slot check has no reservation or model '+JSON.stringify(o),async()=>{const h=harness(o);assert([403,429,503].includes((await h.run()).status));assert.equal(h.attempts.size,0);assert.equal(h.effects(),0);});
 await test('cancel after acknowledged admission retains capacity with zero models',async()=>{const c=new AbortController(),h=harness({abortAfterAdmission:c});assert.equal((await h.run(id,c.signal)).status,503);assert.equal(h.attempts.size,1);assert.equal(h.effects(),0);});
 await test('failed atomic state conversion rolls back history and retains original reservation',async()=>{const h=harness({updateFailure:true});assert.equal((await h.run()).status,503);assert.equal(h.history.size,0);assert.equal(h.attempts.get(id).state,'pending');});
 await test('unknown result usage remains pending, while explicitly known zero can complete',async()=>{for(const tokens of [null,undefined,-1,1.5]){const h=harness({result:{...good,history:{...good.history,tokensUsed:tokens}}});assert.equal((await h.run()).status,503);assert.equal(h.history.size,0);assert.equal(h.attempts.get(id).state,'pending');}const h=harness({result:{...good,history:{...good.history,tokensUsed:0}}});assert.equal((await h.run()).status,200);assert.equal(h.history.get(id).tokensUsed,0);});
 console.log(JSON.stringify({scope:'Keyed business quota admission and authenticated settled-result callback; no recovery authority from pending',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
