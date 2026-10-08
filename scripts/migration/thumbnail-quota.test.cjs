'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {thumbnailQuota}=load('lib/image/thumbnail-quota.ts'),results=[];
(async()=>{
 const month=new Date('2026-10-01'),seen=[];
 const q=await thumbnailQuota({generation:{count:async x=>{seen.push(x);return 199;}},textGenerationAttempt:{count:async()=>0},legacyThumbnailAttempt:{count:async x=>{seen.push(x);return 1;}}},'owner',month);
 assert.equal(q.recorded,199);assert.equal(q.reserved,1);assert.equal(q.total,200);
 for(const x of seen){assert.equal(x.where.userId,'owner');assert.equal(x.where.createdAt.gte,month);}
 assert.equal(seen[1].where.state.not,'complete');results.push({name:'recorded history and uncertain attempts share existing monthly capacity; complete receipts excluded',status:'PASS'});
 for(const counts of [[-1,0],[0,-1],[NaN,0],[1.5,0],[0,Infinity],[Number.MAX_SAFE_INTEGER,1]]){
  await assert.rejects(thumbnailQuota({generation:{count:async()=>counts[0]},textGenerationAttempt:{count:async()=>0},legacyThumbnailAttempt:{count:async()=>counts[1]}},'owner',month));results.push({name:'invalid/overflow quota fails closed '+counts,status:'PASS'});
 }
 const textSeen=[];
 const text=await thumbnailQuota({generation:{count:async()=>197},legacyThumbnailAttempt:{count:async()=>1},textGenerationAttempt:{count:async x=>{textSeen.push(x);return 2;}}},'owner',month);
 assert.equal(text.recorded,197);assert.equal(text.reserved,3);assert.equal(text.total,200);assert.equal(textSeen[0].where.userId,'owner');assert.equal(textSeen[0].where.createdAt.gte,month);assert.equal(textSeen[0].where.state.not,'complete');results.push({name:'uncertain text shares owner/month capacity with image reservations and completed history',status:'PASS'});
 for(const invalid of [-1,NaN,1.5,Infinity,Number.MAX_SAFE_INTEGER]){
  await assert.rejects(thumbnailQuota({generation:{count:async()=>1},legacyThumbnailAttempt:{count:async()=>0},textGenerationAttempt:{count:async()=>invalid}},'owner',month));results.push({name:'invalid or overflowing text reservation fails closed '+invalid,status:'PASS'});
 }
 for(const source of ['generation','legacyThumbnailAttempt','textGenerationAttempt']){
  const tx={generation:{count:async()=>0},textGenerationAttempt:{count:async()=>0},legacyThumbnailAttempt:{count:async()=>0}};tx[source].count=async()=>{throw Error('synthetic count unavailable');};await assert.rejects(thumbnailQuota(tx,'owner',month));results.push({name:source+' unavailable never supplies zero capacity',status:'PASS'});
 }
 console.log(JSON.stringify({scope:'Quota arithmetic/owner/period/fail-closed contracts; no models or operational authority',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
