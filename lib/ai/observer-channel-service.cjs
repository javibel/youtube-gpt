'use strict';
// Inert trusted composition. No environment, pool, enrollment or startup.
const {randomBytes,createHash}=require('node:crypto');
const {createObserverEnvelopeContract,createPinnedObserverSignatureChecker}=require('../../contracts/ai/v1/observer-channel.cjs');
const {createObserverRelayProtocol}=require('../../contracts/ai/v1/observer-relay-protocol.cjs');
const {createObserverLedger}=require('../../contracts/ai/v1/observer-ledger.cjs');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const fail=code=>{throw new ContractError(code,'Observation channel not confirmed');};
function createObserverChannelService({policy,pins,clock,database,signRequest,verifyAgentOriginal,retain,assertOpen,combineSignal}){
 for(const f of [clock,signRequest,verifyAgentOriginal,retain,assertOpen])if(typeof f!=='function')fail('configuration');
 if(combineSignal!==undefined&&typeof combineSignal!=='function')fail('configuration');
 const grammar=createObserverEnvelopeContract(policy),checker=createPinnedObserverSignatureChecker(policy,pins),protocol=createObserverRelayProtocol(policy,pins);
 // Immutable policy captured through the existing grammar; no callbacks from data.
 const declared=structuredClone(policy),ledger=createObserverLedger({database,retain});let bundleStarted=false,last=-Infinity;
 const now=()=>{const n=Date.prototype.getTime.call(clock());if(!Number.isSafeInteger(n)||n<last)fail('deadline');last=n;return n;};
 const check=signal=>{assertOpen();if(!(signal instanceof AbortSignal)||signal.aborted)fail('cancelled');};
 const owned=signal=>{check(signal);const linked=combineSignal?combineSignal(signal):signal;check(linked);return linked;};
 async function authenticate(action,id,proof,signal){check(signal);const peer=protocol.verify(proof,action,id,now());if(await verifyAgentOriginal(Object.freeze({...peer,signal}))!==true)fail('permissions');check(signal);}
 return Object.freeze({
  create({actor,signal}){signal=owned(signal);return retain(async()=>{
   check(signal);if(bundleStarted)fail('uncertain');bundleStarted=true;
   const issuedAt=now(),deadline=issuedAt+300000,entries=[];
   for(const model of [null,...declared.models]){
    check(signal);const request={version:'ytv-observer-envelope-v1',kind:'request',purpose:'agent-readiness-observation',requestId:'obs_'+randomBytes(18).toString('base64url'),nonce:randomBytes(32).toString('hex'),operation:model===null?'credential-availability-boolean':'model-metadata-observation',configurationRevision:declared.configurationRevision,configurationDigest:declared.configurationDigest,runtimeId:declared.runtimeId,providerId:declared.providerId,credentialRef:declared.credentialRef,model,requester:declared.requester,responder:declared.responder,issuedAt,deadline};
    grammar.requestSigningText(request);const signed=await signRequest(request,{signal});check(signal);
    const parsed=checker.checkRequestSignature(signed.wire).data;
    if(grammar.requestSigningText(request)!==parsed.signingText)fail('permissions');
    entries.push({...request,wire:signed.wire,requestDigest:createHash('sha256').update(signed.wire).digest('hex'),responder:declared.responder.peerId});
   }
   return ledger.create(entries,{actor,signal});
  });},
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
