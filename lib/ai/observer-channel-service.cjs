'use strict';
// Inert trusted composition. No environment, pool, enrollment or startup.
const {randomBytes,createHash}=require('node:crypto');
const {createObserverEnvelopeContract,createPinnedObserverSignatureChecker}=require('../../contracts/ai/v1/observer-channel.cjs');
const {createObserverRelayProtocol}=require('../../contracts/ai/v1/observer-relay-protocol.cjs');
const {createObserverLedger}=require('../../contracts/ai/v1/observer-ledger.cjs');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {types}=require('node:util');
const fail=code=>{throw new ContractError(code,'Observation channel not confirmed');};
const capture=(v,allowed,required=allowed)=>{
 if(!v||typeof v!=='object'||types.isProxy(v)||Array.isArray(v))fail('permissions');
 const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);
 if(keys.some(k=>typeof k!=='string'||!allowed.includes(k)||!Object.hasOwn(d[k],'value'))||required.some(k=>!Object.hasOwn(d,k)))fail('permissions');
 return Object.fromEntries(keys.map(k=>[k,d[k].value]));
};
const canonical=(v,depth=0,size={nodes:0})=>{
 if(depth>32||++size.nodes>10000)fail('configuration');
 if(v===null||['string','boolean'].includes(typeof v)||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(!v||typeof v!=='object'||types.isProxy(v))fail('configuration');
 if(Array.isArray(v))return '['+v.map(x=>canonical(x,depth+1,size)).join(',')+']';
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k],depth+1,size)).join(',')+'}';
};
function createObserverChannelService({policy,pins,clock,database,signRequest,verifyAgentOriginal,retain,assertOpen,combineSignal}){
 for(const f of [clock,signRequest,verifyAgentOriginal,retain,assertOpen])if(typeof f!=='function')fail('configuration');
 if(combineSignal!==undefined&&typeof combineSignal!=='function')fail('configuration');
 const grammar=createObserverEnvelopeContract(policy),checker=createPinnedObserverSignatureChecker(policy,pins),protocol=createObserverRelayProtocol(policy,pins);
 // Immutable policy captured through the existing grammar; no callbacks from data.
 const declared=structuredClone(policy),ledger=createObserverLedger({database,retain}),creationAttempts=new WeakSet();let latestCreation,creationCount=0,last=-Infinity;
 const now=()=>{const n=Date.prototype.getTime.call(clock());if(!Number.isSafeInteger(n)||n<last)fail('deadline');last=n;return n;};
 const check=signal=>{assertOpen();if(!(signal instanceof AbortSignal)||signal.aborted)fail('cancelled');};
 const owned=signal=>{check(signal);const linked=combineSignal?combineSignal(signal):signal;check(linked);return linked;};
 async function authenticate(action,id,proof,signal){check(signal);const peer=protocol.verify(proof,action,id,now());if(await verifyAgentOriginal(Object.freeze({...peer,signal}))!==true)fail('permissions');check(signal);}
 return Object.freeze({
  observe(input,options){
   const c=capture(input,['runtimeId','providerId','credentialRef','model','signal'],['runtimeId','providerId','credentialRef']);
   const o=capture(options,['getActor','signal'],['getActor']);
   if(typeof o.getActor!=='function'||types.isProxy(o.getActor))fail('permissions');const getActor=o.getActor.bind(options);
   if(c.runtimeId!==declared.runtimeId||c.providerId!==declared.providerId||c.credentialRef!==declared.credentialRef||Object.hasOwn(c,'model')&&!declared.models.includes(c.model)||c.signal!==undefined&&o.signal!==c.signal)fail('permissions');
   const signal=owned(o.signal??combineSignal?.());
   return retain(async()=>{
    // Authentication itself is ORIGINAL pending work of this same owner.
    // A caller timeout cannot orphan it outside the owner's drain decision.
    check(signal);const actor=await getActor();check(signal);if(typeof actor!=='string'||!/^admin_[a-f0-9]{64}$/.test(actor))fail('permissions');
    const binding={configurationRevision:declared.configurationRevision,configurationDigest:declared.configurationDigest,operation:Object.hasOwn(c,'model')?'model-metadata-observation':'credential-availability-boolean',model:c.model??null};
    const rows=await ledger.observation(binding,{actor,responder:declared.responder.peerId,signal,now:now()});check(signal);
    if(rows.length!==1)fail(rows.length?'uncertain':'credentials');const row=rows[0];
    if(row.active_revision!==declared.configurationRevision||row.active_payload?.revision!==declared.configurationRevision||createHash('sha256').update(canonical(row.active_payload)).digest('hex')!==declared.configurationDigest)fail('configuration');
    const request=checker.checkRequestSignature(row.request_wire).data.unsigned,result=checker.checkResultSignature(row.result_wire,row.request_wire).data.unsigned;
    const requestDigest=createHash('sha256').update(row.request_wire).digest('hex'),claim=capture(row.execution_claim,['requestId','nonce','requestDigest','bindingDigest']);
    if(row.actor!==actor||row.responder!==declared.responder.peerId||row.state!=='complete'||row.request_id!==request.requestId||row.nonce!==request.nonce||row.request_digest!==requestDigest||Number(row.deadline_ms)!==request.deadline||claim.requestId!==request.requestId||claim.nonce!==request.nonce||claim.requestDigest!==requestDigest||typeof claim.bindingDigest!=='string'||!/^[a-f0-9]{64}$/.test(claim.bindingDigest)||request.operation!==binding.operation||request.model!==binding.model)fail('permissions');
    const time=now();if(time<request.issuedAt||time>=request.deadline||result.observedAt>time)fail('deadline');
    if(result.outcome!=='observed'||result.originalOperationState!=='observation-returned')fail('credentials');
    // Signatures/rows are observations, not enrollment or runtime authority.
    // Recheck the live ORIGINAL peer capability after native settlement and
    // before exposing either the boolean or the bounded metadata value.
    if(await verifyAgentOriginal(Object.freeze({peerId:declared.responder.peerId,keyId:declared.responder.keyId,requestId:request.requestId,action:'read-observation',configurationRevision:declared.configurationRevision,configurationDigest:declared.configurationDigest,requestDigest,bindingDigest:claim.bindingDigest,signal}))!==true)fail('permissions');
    check(signal);
    // An original enrollment decision can take time. Re-read through the SAME
    // native transaction owner after it settles; a concurrent head switch or
    // newly ambiguous observation must not make an earlier snapshot current.
    const current=await ledger.observation(binding,{actor,responder:declared.responder.peerId,signal,now:now()});check(signal);
    if(canonical(current)!==canonical(rows))fail('configuration');
    if(now()>=request.deadline)fail('deadline');return result.value;
   });
  },
  async create(input){
   const {actor,signal:borrowed}=capture(input,['actor','signal']);if(typeof actor!=='string'||!/^admin_[a-f0-9]{64}$/.test(actor))fail('permissions');const signal=owned(borrowed);
   if(creationAttempts.has(input))fail('uncertain');creationAttempts.add(input);
   const issuedAt=now();
   // New original requests may follow an expired,fully settled batch on this
   // SAME owner. Never clear an old attempt,nonce,claim or uncertain result.
   if(latestCreation&&(!latestCreation.settled||issuedAt<latestCreation.deadline))fail('uncertain');
   // One initial batch plus the maximum five-minute cadence over seven days.
   // This negative capacity bound grants no signing,enrollment or execution.
   if(creationCount>=2017)fail('quota');
   const current={deadline:issuedAt+300000,settled:false};latestCreation=current;creationCount++;
   return retain(async()=>{try{
    check(signal);const deadline=current.deadline,entries=[];
    for(const model of [null,...declared.models]){
     check(signal);const request={version:'ytv-observer-envelope-v1',kind:'request',purpose:'agent-readiness-observation',requestId:'obs_'+randomBytes(18).toString('base64url'),nonce:randomBytes(32).toString('hex'),operation:model===null?'credential-availability-boolean':'model-metadata-observation',configurationRevision:declared.configurationRevision,configurationDigest:declared.configurationDigest,runtimeId:declared.runtimeId,providerId:declared.providerId,credentialRef:declared.credentialRef,model,requester:declared.requester,responder:declared.responder,issuedAt,deadline};
     grammar.requestSigningText(request);const signed=await signRequest(request,{signal});check(signal);
     const parsed=checker.checkRequestSignature(signed.wire).data;
     if(grammar.requestSigningText(request)!==parsed.signingText)fail('permissions');
     entries.push({...request,wire:signed.wire,requestDigest:createHash('sha256').update(signed.wire).digest('hex'),responder:declared.responder.peerId});
    }
    return await ledger.create(entries,{actor,signal});
   }finally{current.settled=true;}});
  },
  status(id,{actor,signal}){signal=owned(signal);return ledger.status(id,{actor,signal,now:now()});},
  cancel(id,{actor,signal}){signal=owned(signal);return ledger.cancel(id,{actor,signal});},
  claim(id,proof,{signal}){signal=owned(signal);return retain(async()=>{await authenticate('claim',id,proof,signal);return ledger.take(id,{responder:declared.responder.peerId,signal,now:now()});});},
  result(id,wire,proof,{signal}){signal=owned(signal);return retain(async()=>{
   await authenticate('result',id,proof,signal);const request=await ledger.request(id,{signal});
   const parsed=checker.checkResultSignature(wire,request.request_wire).data.unsigned;
   if(parsed.requestId!==id||request.state!=='delivered'||!request.execution_claim)fail('uncertain');
   check(signal);return ledger.result(id,wire,{signal,now:now()});
  });}
 });
}
module.exports={createObserverChannelService};
