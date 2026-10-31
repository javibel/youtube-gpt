'use strict';
// Public wire grammar only. No signing/verification, peer enrollment, clock,
// consent, provider, storage, transport or lifecycle capability is installed.
const {types}=require('node:util');
const {ContractError}=require('./core.cjs');
const VERSION='ytv-observer-envelope-v1',PURPOSE='agent-readiness-observation';
const MAX_WIRE_BYTES=65536,MAX_LIFETIME_MS=300000;
const fail=()=>{throw new ContractError('invalid_format','Invalid untrusted observer envelope');};
const fields=['version','kind','purpose','requestId','nonce','operation','configurationRevision','configurationDigest','runtimeId','providerId','credentialRef','model','requester','responder','issuedAt','deadline'];
const metadataFields=['runtimeId','providerId','credentialRef','requestedModel','resolvedModel','exactModelMatch','metadataAccessible','selectionUnchanged','generationVerified','budgetVerified'];
function exact(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))fail();
 const prototype=Object.getPrototypeOf(value);if(prototype!==null&&prototype!==Object.prototype)fail();
 const d=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(d);
 if(own.length!==keys.length||own.some(k=>!keys.includes(k)||!Object.hasOwn(d[k],'value'))||keys.some(k=>!Object.hasOwn(d,k)))fail();
 return Object.fromEntries(keys.map(k=>[k,d[k].value]));
}
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
function stable(value,depth=0,size={nodes:0}){
 if(depth>6||++size.nodes>256)fail();
 if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(!value||typeof value!=='object'||types.isProxy(value))fail();
 if(Array.isArray(value))return'['+value.map(v=>stable(v,depth+1,size)).join(',')+']';
 return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k],depth+1,size)).join(',')+'}';
}
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const model=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const timestamp=value=>Number.isSafeInteger(value)&&value>0;
function signature(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(value))fail();const bytes=Buffer.from(value,'base64url');if(bytes.length!==64||bytes.toString('base64url')!==value)fail();return value;}
function peer(value){const p=exact(value,['peerId','keyId']);if(!id(p.peerId)||!id(p.keyId))fail();return p;}
function models(value){
 if(!Array.isArray(value)||types.isProxy(value))fail();const d=Object.getOwnPropertyDescriptors(value),length=d.length.value;
 if(length<1||length>4||Reflect.ownKeys(d).length!==length+1)fail();const selected=[];
 for(let n=0;n<length;n++){if(!d[n]||!Object.hasOwn(d[n],'value')||!model(d[n].value))fail();selected.push(d[n].value);}
 if(new Set(selected).size!==length)fail();return selected;
}
function wire(value){const encoded=stable(value);if(Buffer.byteLength(encoded,'utf8')>MAX_WIRE_BYTES)fail();return encoded;}
function decode(input){
 if(typeof input!=='string'||!input||Buffer.byteLength(input,'utf8')>MAX_WIRE_BYTES)fail();let value;try{value=JSON.parse(input);}catch{fail();}
 // Exact canonical bytes also reject duplicate JSON keys, alternate escaping,
 // extra whitespace and ambiguous numeric encodings before signature handling.
 if(stable(value)!==input)fail();return value;
}
function createObserverEnvelopeContract(input){
 const policy=exact(input,['runtimeId','providerId','credentialRef','models','configurationRevision','configurationDigest','requester','responder']);
 policy.models=models(policy.models);policy.requester=peer(policy.requester);policy.responder=peer(policy.responder);
 if(policy.runtimeId!=='agent'||policy.providerId!=='anthropic'||!id(policy.credentialRef)||!id(policy.configurationRevision)||!digest(policy.configurationDigest)||policy.requester.peerId===policy.responder.peerId||policy.requester.keyId===policy.responder.keyId)fail();freeze(policy);
 function binding(value,kind){
  if(value.version!==VERSION||value.kind!==kind||value.purpose!==PURPOSE||typeof value.requestId!=='string'||!/^obs_[A-Za-z0-9_-]{16,96}$/.test(value.requestId)||!digest(value.nonce)||!timestamp(value.issuedAt)||!timestamp(value.deadline)||value.deadline<=value.issuedAt||value.deadline-value.issuedAt>MAX_LIFETIME_MS)fail();
  for(const key of ['runtimeId','providerId','credentialRef','configurationRevision','configurationDigest'])if(value[key]!==policy[key])fail();
  value.requester=peer(value.requester);value.responder=peer(value.responder);
  if(stable(value.requester)!==stable(policy.requester)||stable(value.responder)!==stable(policy.responder))fail();
  if(value.operation==='credential-availability-boolean'){if(value.model!==null)fail();}
  else if(value.operation==='model-metadata-observation'){if(!policy.models.includes(value.model))fail();}
  else fail();return value;
 }
 const requestData=value=>binding(exact(value,fields),'request');
 function metadata(value,request){
  const data=exact(value,metadataFields);
  for(const key of ['runtimeId','providerId','credentialRef'])if(data[key]!==request[key])fail();
  if(data.requestedModel!==request.model||!model(data.resolvedModel)||data.exactModelMatch!==(data.requestedModel===data.resolvedModel)||data.metadataAccessible!==true||data.selectionUnchanged!==true||data.generationVerified!==false||data.budgetVerified!==false)fail();return data;
 }
 function resultData(value,request){
  const result=binding(exact(value,[...fields,'outcome','observedAt','originalOperationState','value']),'result');
  for(const key of fields)if(key!=='kind'&&stable(result[key])!==stable(request[key]))fail();
  if(!timestamp(result.observedAt)||result.observedAt<request.issuedAt)fail();
  if(result.outcome==='observed'){
   if(result.originalOperationState!=='observation-returned'||result.observedAt>request.deadline)fail();
   if(result.operation==='credential-availability-boolean'){if(typeof result.value!=='boolean')fail();}
   else result.value=metadata(result.value,request);
  }else if(result.outcome==='unconfirmed'){if(result.originalOperationState!=='unconfirmed'||result.value!==null)fail();}
  else if(result.outcome==='declined'){if(result.originalOperationState!=='not-dispatched'||result.value!==null)fail();}
  else fail();return result;
 }
 const signingText=data=>'YTV-OBSERVER-ENVELOPE\n'+VERSION+'\n'+data.kind+'\n'+wire(data);
 const untrusted=(unsigned,sig,encoded)=>Object.freeze({trust:'untrusted-observer-data',kind:unsigned.kind,unsigned:freeze(unsigned),signature:sig,signingText:signingText(unsigned),wire:encoded});
 function parseRequest(input){const all=exact(decode(input),[...fields,'signature']),sig=signature(all.signature);delete all.signature;return untrusted(requestData(all),sig,input);}
 function parseResult(input,requestWire){const request=parseRequest(requestWire).unsigned,all=exact(decode(input),[...fields,'outcome','observedAt','originalOperationState','value','signature']),sig=signature(all.signature);delete all.signature;return untrusted(resultData(all,request),sig,input);}
 return Object.freeze({
  requestSigningText:value=>signingText(requestData(value)),
  encodeRequest(value,sig){return wire({...requestData(value),signature:signature(sig)});},
  parseRequest,
  resultSigningText(value,requestWire){return signingText(resultData(value,parseRequest(requestWire).unsigned));},
  encodeResult(value,sig,requestWire){return wire({...resultData(value,parseRequest(requestWire).unsigned),signature:signature(sig)});},
  parseResult,
 });
}
module.exports={OBSERVER_ENVELOPE_VERSION:VERSION,OBSERVER_ENVELOPE_PURPOSE:PURPOSE,createObserverEnvelopeContract};
