'use strict';
// Executable original release scope approved by Javier on 2026-11-05. The
// selector requests preparation; these narrow functions supply capabilities.
// Import/registration never read a secret, connect, seed or activate a task.
const crypto=require('node:crypto');
const {types}=require('node:util');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const {registerOriginalNativePlatformWebHostConfiguration,getOriginalPlatformWebHostFactory}=require('./platform-web-host-registration.cjs');
const {WEB_RESERVATION_REVISION}=require('./adapters/native-provider-owner.cjs');
const release=require('./ytubviral-native-release.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(hash(JSON.stringify(release,null,2)+'\n')!=='5a9192ce4f1f73506d9b0e0d5e76fd1f0fa118f862b40286ad8231220a494317')throw Error('Original release declarations differ');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(release);
const fail=()=>{throw new ContractError('permissions','Original YTubViral release scope unavailable');};
const live=c=>!!c&&c.signal instanceof AbortSignal&&!c.signal.aborted;
const account=c=>live(c)&&c.runtimeId==='web'&&c.providerId==='anthropic'&&c.credentialRef==='env:ANTHROPIC_API_KEY'&&release.modelIds.includes(c.model)&&c.account?.apiVersion==='2023-06-01'&&c.account.workspaceId===null;
const identity=release.pins.requester;
const signing=c=>live(c)&&c.purpose==='agent-readiness-observation'&&c.identity?.peerId===identity.peerId&&c.identity.keyId===identity.keyId&&c.identity.spkiSha256===identity.spkiSha256;
let registered=false;
function registerYTubViralNativeRelease(original){
 // An explicitly preprovided original retains its own path. A failed original
 // registration/preparation never falls back to this or any other factory.
 if(registered||getOriginalPlatformWebHostFactory())return;
 if(!original||types.isProxy(original))fail();const d=Object.getOwnPropertyDescriptors(original);
 if(Reflect.ownKeys(d).length!==1||!Object.hasOwn(d.getAdministrativeActor??{},'value')||typeof d.getAdministrativeActor.value!=='function'||types.isProxy(d.getAdministrativeActor.value))fail();
 const getActor=d.getAdministrativeActor.value.bind(original);
 const readAgent=(context,metadata)=>{
  if(!context||typeof context!=='object'||types.isProxy(context)||Array.isArray(context))fail();const fields=Object.getOwnPropertyDescriptors(context),required=['runtimeId','providerId','credentialRef',...(metadata?['model']:[])],allowed=[...required,'signal'];
  if(Reflect.ownKeys(fields).some(k=>!allowed.includes(k)||!Object.hasOwn(fields[k],'value'))||required.some(k=>!Object.hasOwn(fields,k)))fail();
  const captured=Object.freeze(Object.fromEntries(Reflect.ownKeys(fields).map(k=>[k,fields[k].value])));
  if(captured.runtimeId!=='agent'||captured.providerId!=='anthropic'||captured.credentialRef!==release.observerPolicy.credentialRef||metadata&&!release.modelIds.includes(captured.model)||captured.signal!==undefined&&(!(captured.signal instanceof AbortSignal)||types.isProxy(captured.signal)||captured.signal.aborted))fail();
  const service=require('./observer-channel-runtime.cjs').getObserverChannel();if(typeof service?.observe!=='function')fail();
  return service.observe(captured,{getActor,signal:captured.signal});
 };
 const pins=Object.fromEntries(Object.entries(release.pins).map(([side,p])=>[side,{peerId:p.peerId,keyId:p.keyId,spkiSha256:p.spkiSha256,publicKey:crypto.createPublicKey({key:Buffer.from(p.spkiDerBase64,'base64'),format:'der',type:'spki'})}]));
 const config={
  deployment:{database:release.database,ownedTaskIngress:true,prepareTimeoutMs:30000,stopTimeoutMs:15000,
   authorizeRoleAccess(c){return live(c)&&c.surface==='web'&&c.host===release.database.host&&c.port===5432&&c.databaseName==='neondb'&&(c.kind==='prepare-platform-web-deployment'?c.roles?.join(',')==='reader,activator,executor':c.kind==='read-platform-role-password'&&['reader','activator','executor'].includes(c.role)&&c.user==='ytv_ai_'+c.role);},
   runtime:{taskCatalog:release.taskCatalog,policies:release.policies,budgetBindings:release.budgetBindings,operatingBudget:release.operatingBudget,
    administrativeAgentReadiness:{checkCredential:c=>readAgent(c,false),checkModelAvailability:c=>readAgent(c,true)},
    catalogAdapters:[{providerId:'ideogram',adapterVersion:'brand-image-v1',enabled:true,credentialRef:'env:IDEOGRAM_API_KEY',models:{'ideogram-v3':{verified:true,executors:['ai'],capabilities:['image_generation','json','text']}}}],
    getRuntimes:()=>release.runtimes,
    authorize(c){const p=release.policies[c?.taskType],ids=release.budgetBindings[c?.taskType];if(!p||!ids?.length||p.budget.maxCostMicros===0)fail();const user=typeof c.userId==='string'&&c.userId.trim()===c.userId&&c.userId.length>0&&c.userId.length<=256;if(user?Object.hasOwn(c,'serviceId'):Object.hasOwn(c,'userId')||!p.serviceIds?.includes(c.serviceId))fail();return Object.freeze({budgetId:release.operatingBudget.budgetId});}
   },
   observerChannel:{policy:release.observerPolicy,pins,clock:()=>new Date(),verifyAgentOriginal(c){return live(c)&&c.peerId===pins.responder.peerId&&c.keyId===pins.responder.keyId&&/^obs_[A-Za-z0-9_-]{16,96}$/.test(c.requestId)&&['claim','result','read-observation'].includes(c.action)&&(c.action!=='read-observation'||c.configurationRevision===release.observerPolicy.configurationRevision&&c.configurationDigest===release.observerPolicy.configurationDigest&&/^[a-f0-9]{64}$/.test(c.requestDigest)&&/^[a-f0-9]{64}$/.test(c.bindingDigest));}}
  },
  providers:{stopTimeoutMs:15000,anthropic:{models:release.models,apiVersion:'2023-06-01',workspaceId:null,credentialTimeoutMs:15000,callTimeoutMs:120000,maxRequestBytes:16777216,maxResponseBytes:16777216,
   authorizeMetadataRead:c=>account(c),
   requestReservation:{revision:WEB_RESERVATION_REVISION,pricingSelections:release.modelIds.map(model=>({tariffRevision:'anthropic-public-2026-10-28',model,mode:'standard-global-direct',cacheWriteTtl:'5m'})),
    authorizeTokenCount:c=>account(c)&&c.operation==='count-input-tokens'&&c.countingScope==='messages-and-system'&&/^[a-f0-9]{64}$/.test(c.payloadDigest),
    authorizeCountedReservation:c=>account(c)&&c.reservationRevision===WEB_RESERVATION_REVISION&&(c.reservationBasis==='counted-double-plus4096'||c.reservationBasis==='haiku-vision-context-200000'&&c.model==='claude-haiku-4-5-20251001'&&['public.thumbnail-review','youtube.thumbnail-preview'].includes(c.taskType)&&c.maxToolCalls===0)&&/^[a-f0-9]{64}$/.test(c.payloadDigest)&&typeof c.requestId==='string'&&c.requestId.length<=128&&Number.isSafeInteger(c.maxCostMicros)&&c.maxCostMicros>=0&&c.maxCostMicros<=3000000&&Number.isSafeInteger(c.maxOutputTokens)&&c.maxOutputTokens>0&&c.maxOutputTokens<=32000&&Number.isSafeInteger(c.maxToolCalls)&&c.maxToolCalls>=0&&c.maxToolCalls<=3
   }}},
  bindingStopTimeoutMs:15000,
  authorizeCredentialAccess:c=>live(c)&&c.kind==='read-native-platform-provider-credential'&&c.runtimeId==='web'&&c.providerId==='anthropic'&&c.credentialRef==='env:ANTHROPIC_API_KEY',
  nativeObserverIdentity:{policy:release.observerPolicy,identity:{peerId:identity.peerId,keyId:identity.keyId,spkiSha256:identity.spkiSha256},clock:()=>new Date(),
   authorizeSigning:c=>signing(c)&&c.kind==='sign-original-observer-request-v1'&&c.request.configurationRevision===release.observerPolicy.configurationRevision&&c.request.configurationDigest===release.observerPolicy.configurationDigest&&c.request.deadline-c.request.issuedAt<=300000,
   authorizeIdentityAccess:c=>signing(c)&&c.kind==='use-native-platform-observer-identity'&&c.binding==='env:YTV_AI_OBSERVER_SIGNING_PRIVATE_KEY'&&['read-private-key','sign-request'].includes(c.phase)&&c.configurationRevision===release.observerPolicy.configurationRevision&&c.configurationDigest===release.observerPolicy.configurationDigest&&/^[a-f0-9]{64}$/.test(c.signingTextDigest)
  }
 };
 registerOriginalNativePlatformWebHostConfiguration(config,{prepareTimeoutMs:30000,stopTimeoutMs:15000});registered=true;
}
module.exports={registerYTubViralNativeRelease};
