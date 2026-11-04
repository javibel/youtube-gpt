'use strict';
const crypto=require('node:crypto'),{types}=require('node:util');
const {createPinnedObserverSignatureChecker}=require('./observer-channel.cjs');
const {ContractError}=require('./core.cjs');
const fail=()=>{throw new ContractError('permissions','Original relay peer not confirmed');};
function observerRelayControlSigningText(policy,action,requestId,issuedAt){
 require('./observer-channel.cjs').createObserverEnvelopeContract(policy);
 if(!['claim','result'].includes(action)||typeof requestId!=='string'||!/^obs_[A-Za-z0-9_-]{16,96}$/.test(requestId)||!Number.isSafeInteger(issuedAt)||issuedAt<1)fail();
 return 'YTV-OBSERVER-RELAY-V1\n'+JSON.stringify({action,requestId,issuedAt,peerId:policy.responder.peerId,keyId:policy.responder.keyId});
}
function createObserverRelayProtocol(policy,pins){
 // Existing constructor validates and pins both native Ed25519 public keys.
 createPinnedObserverSignatureChecker(policy,pins);
 const key=crypto.createPublicKey({key:pins.responder.publicKey.export({type:'spki',format:'der'}),type:'spki',format:'der'});
 const peerId=policy.responder.peerId,keyId=policy.responder.keyId;
 const unsigned=(action,requestId,issuedAt)=>{
  if(!['claim','result'].includes(action)||!/^obs_[A-Za-z0-9_-]{16,96}$/.test(requestId)||!Number.isSafeInteger(issuedAt))fail();
  return JSON.stringify({action,requestId,issuedAt,peerId,keyId});
 };
 return Object.freeze({
  signingText:(action,id,time)=>'YTV-OBSERVER-RELAY-V1\n'+unsigned(action,id,time),
  encode(action,id,time,signature){if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(signature))fail();return JSON.stringify({payload:unsigned(action,id,time),signature});},
  verify(wire,action,requestId,now){
   if(typeof wire!=='string'||wire.length>2048)fail();let data,p;
   try{data=JSON.parse(wire);p=JSON.parse(data.payload);}catch{fail();}
   if(!data||types.isProxy(data)||Object.keys(data).sort().join()!=='payload,signature'||JSON.stringify(data)!==wire||typeof data.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(data.signature))fail();
   if(data.payload!==unsigned(action,requestId,p.issuedAt)||p.issuedAt>now||now-p.issuedAt>30000)fail();
   if(!crypto.verify(null,Buffer.from('YTV-OBSERVER-RELAY-V1\n'+data.payload),key,Buffer.from(data.signature,'base64url')))fail();
   return Object.freeze({peerId,keyId,requestId,action});
  }
 });
}
module.exports={createObserverRelayProtocol,observerRelayControlSigningText};
