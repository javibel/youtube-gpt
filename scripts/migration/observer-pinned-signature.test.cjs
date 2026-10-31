'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const web=path.resolve(__dirname,'../..'),root=path.resolve(web,'../..'),agent=path.join(root,'work/migration-agent'),results=[];
const modules=[require('../../contracts/ai/v1/observer-channel.cjs'),require(path.join(agent,'contracts/ai/v1/observer-channel.cjs'))];
const declarations=JSON.parse(fs.readFileSync(path.join(root,'work/migration-reporting/shared-configuration-2026-10-31/shared-runtime-declarations.json'))),config=path.join(root,'work/migration-reporting/shared-configuration-2026-10-31/shared-configuration.json');
const models=[...new Set(Object.keys(declarations.taskCatalog).filter(t=>declarations.taskCatalog[t].runtimeIds.includes('agent')).map(t=>declarations.configuration.profiles[declarations.configuration.activeProfile][t].model))].sort();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Deterministic public test material only. No random key generation or key files.
function syntheticKey(offset){const seed=Buffer.from(Array.from({length:32},(_,i)=>(i+offset)%256));const privateKey=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),type:'pkcs8',format:'der'}),publicKey=crypto.createPublicKey(privateKey);return{privateKey,publicKey,spkiSha256:hash(publicKey.export({format:'der',type:'spki'}))};}
const keys={web:syntheticKey(0),agent:syntheticKey(32),outsider:syntheticKey(64)};
const sign=(text,key)=>crypto.sign(null,Buffer.from(text),key.privateKey).toString('base64url');
function fixture(api){
 const policy={runtimeId:'agent',providerId:'anthropic',credentialRef:declarations.credentialReferences.anthropic,models:[...models],configurationRevision:declarations.configuration.revision,configurationDigest:hash(fs.readFileSync(config)),requester:{peerId:'web:synthetic',keyId:'web-key:synthetic'},responder:{peerId:'agent:synthetic',keyId:'agent-key:synthetic'}};
 const pins={requester:{...policy.requester,publicKey:keys.web.publicKey,spkiSha256:keys.web.spkiSha256},responder:{...policy.responder,publicKey:keys.agent.publicKey,spkiSha256:keys.agent.spkiSha256}},contract=api.createObserverEnvelopeContract(policy),checker=api.createPinnedObserverSignatureChecker(policy,pins);
 const request={version:api.OBSERVER_ENVELOPE_VERSION,kind:'request',purpose:api.OBSERVER_ENVELOPE_PURPOSE,requestId:'obs_synthetic-signature-0001',nonce:'b'.repeat(64),operation:'credential-availability-boolean',model:null,configurationRevision:policy.configurationRevision,configurationDigest:policy.configurationDigest,runtimeId:'agent',providerId:'anthropic',credentialRef:policy.credentialRef,requester:{...policy.requester},responder:{...policy.responder},issuedAt:1700000000000,deadline:1700000030000};
 const requestWire=contract.encodeRequest(request,sign(contract.requestSigningText(request),keys.web)),result={...request,kind:'result',outcome:'observed',observedAt:request.issuedAt+1,originalOperationState:'observation-returned',value:true};
 const resultWire=contract.encodeResult(result,sign(contract.resultSigningText(result,requestWire),keys.agent),requestWire);return{policy,pins,contract,checker,request,requestWire,result,resultWire};
}
const rejects=fn=>assert.throws(fn,e=>e.code==='invalid_format'||e.code==='permissions');
async function test(name,run){try{await run();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
(async()=>{
 await test('both public copies use actual Ed25519 verification and exact host-pinned signer identities',()=>{
  for(const ext of ['cjs','d.cts'])assert.equal(fs.readFileSync(path.join(web,'contracts/ai/v1/observer-channel.'+ext),'utf8'),fs.readFileSync(path.join(agent,'contracts/ai/v1/observer-channel.'+ext),'utf8'));
  for(const api of modules){const f=fixture(api),request=f.checker.checkRequestSignature(f.requestWire),result=f.checker.checkResultSignature(f.resultWire,f.requestWire);assert.equal(request.signer.spkiSha256,keys.web.spkiSha256);assert.equal(result.signer.spkiSha256,keys.agent.spkiSha256);assert.equal(result.data.unsigned.value,true);assert(Object.isFrozen(result)&&Object.isFrozen(result.signer));
   const metadata={runtimeId:'agent',providerId:'anthropic',credentialRef:f.request.credentialRef,requestedModel:models[0],resolvedModel:models[0],exactModelMatch:true,metadataAccessible:true,selectionUnchanged:true,generationVerified:false,budgetVerified:false},r={...f.request,operation:'model-metadata-observation',model:models[0]},rw=f.contract.encodeRequest(r,sign(f.contract.requestSigningText(r),keys.web)),v={...r,kind:'result',outcome:'observed',observedAt:r.issuedAt+1,originalOperationState:'observation-returned',value:metadata},vw=f.contract.encodeResult(v,sign(f.contract.resultSigningText(v,rw),keys.agent),rw);assert.equal(f.checker.checkResultSignature(vw,rw).data.unsigned.value.requestedModel,models[0]);
  }
 });
 await test('wrong signer, modified payload or signature, and a forged original request fail before a result can be checked',()=>{
  for(const api of modules){const f=fixture(api),outsider=f.contract.encodeRequest(f.request,sign(f.contract.requestSigningText(f.request),keys.outsider));rejects(()=>f.checker.checkRequestSignature(outsider));
   const changed={...f.request,nonce:'c'.repeat(64)},changedWire=f.contract.encodeRequest(changed,JSON.parse(f.requestWire).signature);rejects(()=>f.checker.checkRequestSignature(changedWire));
   const raw=JSON.parse(f.resultWire),mutated=Buffer.from(raw.signature,'base64url');mutated[0]^=1;rejects(()=>f.checker.checkResultSignature(f.contract.encodeResult(f.result,mutated.toString('base64url'),f.requestWire),f.requestWire));
   const attached=f.contract.encodeResult(f.result,sign(f.contract.resultSigningText(f.result,outsider),keys.agent),outsider);rejects(()=>f.checker.checkResultSignature(attached,outsider));
   const changedBinding={...f.request,credentialRef:'env:OTHER_SYNTHETIC'};rejects(()=>f.checker.checkRequestSignature(JSON.stringify({...changedBinding,signature:sign(f.contract.requestSigningText(f.request),keys.web)})));
  }
 });
 await test('JSON keys cannot self-enroll; fingerprint, algorithm, native key type and distinct peer pins are required and captured',()=>{
  for(const api of modules){const f=fixture(api),make=p=>api.createPinnedObserverSignatureChecker(f.policy,p);
   for(const publicKey of [keys.web.publicKey.export({format:'pem',type:'spki'}),{type:'public',asymmetricKeyType:'ed25519'},keys.web.privateKey,new Proxy(keys.web.publicKey,{})])rejects(()=>make({...f.pins,requester:{...f.pins.requester,publicKey}}));
   rejects(()=>make({...f.pins,requester:{...f.pins.requester,spkiSha256:'0'.repeat(64)}}));rejects(()=>make({...f.pins,requester:{...f.pins.requester,keyId:'self-enrolled'}}));rejects(()=>make({...f.pins,responder:{...f.pins.responder,publicKey:keys.web.publicKey,spkiSha256:keys.web.spkiSha256}}));
   const x=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b656e032100','hex'),Buffer.alloc(32,7)]),format:'der',type:'spki'});rejects(()=>make({...f.pins,requester:{...f.pins.requester,publicKey:x,spkiSha256:hash(x.export({format:'der',type:'spki'}))}}));
   f.pins.requester.publicKey=keys.outsider.publicKey;f.pins.requester.spkiSha256=keys.outsider.spkiSha256;f.policy.requester.keyId='changed-after-capture';assert.equal(f.checker.checkRequestSignature(f.requestWire).signer.spkiSha256,keys.web.spkiSha256);
  }
 });
 await test('signature facts retain untrusted claims and provide no enrollment, consent, freshness, replay protection or lifecycle authority',()=>{
  for(const api of modules){const f=fixture(api),checked=f.checker.checkResultSignature(f.resultWire,f.requestWire);assert.equal(checked.scope,'signature-only-no-authority');assert.equal(checked.data.trust,'untrusted-observer-data');assert.deepEqual(f.checker.checkResultSignature(f.resultWire,f.requestWire),checked);assert.equal(checked.data.unsigned.issuedAt,1700000000000);
   assert.deepEqual(Object.keys(f.checker).sort(),['checkRequestSignature','checkResultSignature']);for(const k of ['grant','authorize','ready','drained','fresh','enrolled','stop','activate','verifiedSource'])assert.equal(checked[k],undefined);
   for(const outcome of ['unconfirmed','declined']){const value={...f.result,outcome,originalOperationState:outcome==='declined'?'not-dispatched':'unconfirmed',value:null},wire=f.contract.encodeResult(value,sign(f.contract.resultSigningText(value,f.requestWire),keys.agent),f.requestWire);assert.equal(f.checker.checkResultSignature(wire,f.requestWire).data.unsigned.value,null);}
  }
 });
 console.log(JSON.stringify({scope:'Only new host-pinned public signature-check boundary; deterministic synthetic signing fixtures, no key generation/files, real identity enrollment, observers, consent, replay ledger, freshness, IO or authority. Earlier grammar/readiness suites not repeated.',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
