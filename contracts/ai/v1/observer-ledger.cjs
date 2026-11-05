'use strict';
// Two-table observer queue and execution claim. Rows are never capabilities.
// Uses the caller's original database and retention owner; opens no pool.
const {types}=require('node:util');
const {ContractError}=require('./core.cjs');
const fail=code=>{throw new ContractError(code,'Observer state unconfirmed; never redispatch');};
function createObserverLedger({database,retain}){
 if(database?.role!=='executor'||database.controlSchema!=='ytv_ai_v1'||typeof retain!=='function')fail('configuration');
 const descriptor=Object.getOwnPropertyDescriptor(database,'transactionOriginal');
 if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function'||types.isProxy(descriptor.value))fail('configuration');
 const transaction=descriptor.value.bind(database);
 const run=(work,signal)=>retain(async()=>{let native;try{native=transaction(work,{signal});return await native.result;}finally{if(native)await native.settled;}});
 return Object.freeze({
  create(entries,{actor,signal}){
   if(typeof actor!=='string'||!/^admin_[a-f0-9]{64}$/.test(actor)||!Array.isArray(entries)||entries.length<1||entries.length>5)fail('permissions');
   return run(async tx=>{for(const e of entries)await tx.query('INSERT INTO ytv_ai_v1.observer_requests(request_id,nonce,actor,request_wire,request_digest,responder,deadline_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',[e.requestId,e.nonce,actor,e.wire,e.requestDigest,e.responder,e.deadline]);return entries.map(e=>({requestId:e.requestId,state:'pending'}));},signal);
  },
  status(requestId,{actor,signal,now}){return run(async tx=>{const rows=await tx.query('SELECT q.state,q.deadline_ms,q.execution_claim IS NOT NULL AS execution_claimed,r.result_wire FROM ytv_ai_v1.observer_requests q LEFT JOIN ytv_ai_v1.observer_results r USING(request_id) WHERE q.request_id=$1 AND q.actor=$2',[requestId,actor]);if(rows.length!==1)fail('permissions');const r=rows[0];return Object.freeze({requestId,state:r.state==='pending'&&Number(r.deadline_ms)<=now?'expired':r.state==='delivered'?'uncertain':r.state,executionClaimed:r.execution_claimed,resultWire:r.result_wire??null});},signal);},
  cancel(requestId,{actor,signal}){return run(async tx=>{const rows=await tx.query("UPDATE ytv_ai_v1.observer_requests SET state='cancelled' WHERE request_id=$1 AND actor=$2 AND state IN ('pending','delivered','uncertain') RETURNING request_id",[requestId,actor]);if(rows.length!==1)fail('uncertain');return{requestId,state:'cancelled'};},signal);},
  take(requestId,{responder,signal,now}){return run(async tx=>{const rows=await tx.query("UPDATE ytv_ai_v1.observer_requests SET state='delivered' WHERE request_id=$1 AND responder=$2 AND state='pending' AND deadline_ms>$3 RETURNING request_wire",[requestId,responder,now]);if(rows.length!==1)fail('uncertain');return rows[0].request_wire;},signal);},
  insertClaim:async({transaction:tx,context,claim})=>tx.query("UPDATE ytv_ai_v1.observer_requests SET execution_claim=$1::jsonb WHERE request_id=$2 AND nonce=$3 AND request_digest=$4 AND state='delivered' AND execution_claim IS NULL AND deadline_ms>floor(extract(epoch from clock_timestamp())*1000) RETURNING request_id AS \"requestId\",nonce,request_digest AS \"requestDigest\",execution_claim->>'bindingDigest' AS \"bindingDigest\"",[JSON.stringify(claim),context.requestId,context.nonce,context.requestDigest]),
  request(requestId,{signal}){return run(async tx=>{const rows=await tx.query('SELECT request_wire,state,execution_claim FROM ytv_ai_v1.observer_requests WHERE request_id=$1',[requestId]);if(rows.length!==1)fail('permissions');return rows[0];},signal);},
  observation(binding,{actor,responder,signal,now}){
   if(typeof actor!=='string'||!/^admin_[a-f0-9]{64}$/.test(actor))fail('permissions');
   // Bounded read in the SAME native transaction/retention path. A duplicate
   // live observation is ambiguous; never silently pick the newest row.
   return run(async tx=>{
    // Same coordinator used by the public control store's activation/admission.
    await tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('ytv_ai_v1:active'))");
    return tx.query("SELECT q.request_id,q.nonce,q.actor,q.responder,q.state,q.request_wire,q.request_digest,q.execution_claim,q.deadline_ms,r.result_wire,a.revision AS active_revision,c.payload AS active_payload FROM ytv_ai_v1.observer_requests q JOIN ytv_ai_v1.observer_results r USING(request_id) CROSS JOIN ytv_ai_v1.active_revision a JOIN ytv_ai_v1.revisions c ON c.revision=a.revision WHERE a.singleton=true AND q.actor=$1 AND q.responder=$2 AND q.state='complete' AND q.deadline_ms>$3 AND q.request_wire::jsonb->>'configurationRevision'=$4 AND q.request_wire::jsonb->>'configurationDigest'=$5 AND q.request_wire::jsonb->>'operation'=$6 AND (q.request_wire::jsonb->>'model') IS NOT DISTINCT FROM $7::text ORDER BY q.request_id LIMIT 2",[actor,responder,now,binding.configurationRevision,binding.configurationDigest,binding.operation,binding.model]);
   },signal);
  },
  result(requestId,wire,{signal,now}){return run(async tx=>{const rows=await tx.query("UPDATE ytv_ai_v1.observer_requests SET state='complete' WHERE request_id=$1 AND state='delivered' AND execution_claim IS NOT NULL AND deadline_ms>$2 RETURNING request_id",[requestId,now]);if(rows.length!==1)fail('uncertain');await tx.query('INSERT INTO ytv_ai_v1.observer_results(request_id,result_wire) VALUES($1,$2)',[requestId,wire]);return{requestId,state:'complete'};},signal);}
 });
}
module.exports={createObserverLedger};
