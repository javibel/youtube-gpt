'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {thumbnailQuota}=load('lib/image/thumbnail-quota.ts'),results=[];
(async()=>{
 const month=new Date('2026-10-01'),seen=[];
 const q=await thumbnailQuota({generation:{count:async x=>{seen.push(x);return 199;}},legacyThumbnailAttempt:{count:async x=>{seen.push(x);return 1;}}},'owner',month);
 assert.equal(q.recorded,199);assert.equal(q.reserved,1);assert.equal(q.total,200);
 for(const x of seen){assert.equal(x.where.userId,'owner');assert.equal(x.where.createdAt.gte,month);}
 assert.equal(seen[1].where.state.not,'complete');results.push({name:'recorded history and uncertain attempts share existing monthly capacity; complete receipts excluded',status:'PASS'});
 for(const counts of [[-1,0],[0,-1],[NaN,0],[1.5,0],[0,Infinity],[Number.MAX_SAFE_INTEGER,1]]){
  await assert.rejects(thumbnailQuota({generation:{count:async()=>counts[0]},legacyThumbnailAttempt:{count:async()=>counts[1]}},'owner',month));results.push({name:'invalid/overflow quota fails closed '+counts,status:'PASS'});
 }
 for(const source of ['generation','legacyThumbnailAttempt']){
  const tx={generation:{count:async()=>0},legacyThumbnailAttempt:{count:async()=>0}};tx[source].count=async()=>{throw Error('synthetic count unavailable');};await assert.rejects(thumbnailQuota(tx,'owner',month));results.push({name:source+' unavailable never supplies zero capacity',status:'PASS'});
 }
 console.log(JSON.stringify({scope:'Quota arithmetic/owner/period/fail-closed contracts; no models or operational authority',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
