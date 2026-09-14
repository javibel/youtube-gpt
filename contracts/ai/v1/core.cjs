'use strict';
// Portable contract core. No filesystem, network, provider SDK or operational state.
const CONTRACT_VERSION = '1.0';
const STATUSES = Object.freeze(['completed','incomplete','refused','failed','cancelled']);
const ERROR_POLICIES = Object.freeze({
  credentials:{retryable:false}, permissions:{retryable:false}, quota:{retryable:false},
  rate_limit:{retryable:true}, deadline:{retryable:false}, transport:{retryable:true},
  capability:{retryable:false}, invalid_format:{retryable:false}, uncertain:{retryable:false},
  configuration:{retryable:false}, cancelled:{retryable:false},
});
class ContractError extends Error {
  constructor(code,message){super(message);this.name='ContractError';this.code=code;this.retryable=ERROR_POLICIES[code]?.retryable??false;}
}
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.trim().length>0;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
const clone=value=>structuredClone(value);
function only(value,keys,label){if(!record(value))fail('invalid_format',label+' must be an object');for(const key of Object.keys(value))if(!keys.includes(key))fail('invalid_format','Unsupported '+label+' field: '+key);}
function validateSchema(schema){
  only(schema,['type','properties','required','additionalProperties','items','enum','minimum','maximum','minLength','maxLength','minItems','maxItems'],'output schema');
  if(!['object','array','string','number','integer','boolean','null'].includes(schema.type))fail('invalid_format','Unsupported schema type');
  if(schema.properties!==undefined){if(schema.type!=='object'||!record(schema.properties))fail('invalid_format','Invalid schema properties');for(const child of Object.values(schema.properties))validateSchema(child);}
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.some(key=>!text(key)||!Object.hasOwn(schema.properties??{},key))))fail('invalid_format','Invalid required properties');
  if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean')fail('invalid_format','additionalProperties must be boolean');
  if(schema.type==='array'){if(!schema.items)fail('invalid_format','Array item schema required');validateSchema(schema.items);}
  for(const key of ['minimum','maximum','minLength','maxLength','minItems','maxItems'])if(schema[key]!==undefined&&(!Number.isFinite(schema[key])||(['minLength','maxLength','minItems','maxItems'].includes(key)&&!integer(schema[key]))))fail('invalid_format','Invalid schema bound');
  for(const [keys,types] of [[['minimum','maximum'],['number','integer']],[['minLength','maxLength'],['string']],[['minItems','maxItems'],['array']]])if(keys.some(key=>schema[key]!==undefined)&&!types.includes(schema.type))fail('invalid_format','Schema bound does not apply to its type');
  if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||schema.enum.length===0||schema.enum.some(value=>value!==null&&!['string','number','boolean'].includes(typeof value))))fail('invalid_format','Only scalar enums are supported');
}
function matches(schema,value){
  if(schema.enum&&!schema.enum.some(item=>item===value))return false;
  switch(schema.type){
    case 'null':return value===null;
    case 'boolean':return typeof value==='boolean';
    case 'string':return typeof value==='string'&&(schema.minLength===undefined||value.length>=schema.minLength)&&(schema.maxLength===undefined||value.length<=schema.maxLength);
    case 'number':case 'integer':return typeof value==='number'&&Number.isFinite(value)&&(schema.type!=='integer'||Number.isSafeInteger(value))&&(schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum);
    case 'array':return Array.isArray(value)&&(schema.minItems===undefined||value.length>=schema.minItems)&&(schema.maxItems===undefined||value.length<=schema.maxItems)&&value.every(item=>matches(schema.items,item));
    case 'object':return record(value)&&(schema.required??[]).every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>Object.hasOwn(schema.properties??{},key)?matches(schema.properties[key],value[key]):schema.additionalProperties!==false);
    default:return false;
  }
}
function validateData(schema,value){validateSchema(schema);if(!matches(schema,value))fail('invalid_format','Data does not match schema');return value;}
function validateRequest(request){
  only(request,['requestId','taskType','contractVersion','inputVersion','language','messages','instructions','instructionsVersion','requiredCapabilities','outputSchema','toolPolicy','budget','idempotencyKey'],'request');
  for(const key of ['requestId','taskType','inputVersion','language','instructionsVersion'])if(!text(request[key]))fail('invalid_format','Missing '+key);
  if(request.contractVersion!==CONTRACT_VERSION)fail('invalid_format','Unsupported contract version');
  if(typeof request.instructions!=='string'||!Array.isArray(request.messages)||request.messages.length===0)fail('invalid_format','Instructions and messages required');
  for(const message of request.messages){
    only(message,['role','content'],'message');
    if(!['user','assistant','system','tool'].includes(message.role)||!Array.isArray(message.content)||message.content.length===0)fail('invalid_format','Invalid message');
    for(const part of message.content){
      if(part?.type==='text'){only(part,['type','text'],'content');if(typeof part.text!=='string')fail('invalid_format','Invalid text');}
      else if(part?.type==='image'){only(part,['type','url','mediaType'],'content');if(!text(part.url)||!/^https:\/\//.test(part.url)||!text(part.mediaType))fail('invalid_format','Invalid image reference');}
      else fail('capability','Content type is not supported in contract 1.0');
    }
  }
  if(!Array.isArray(request.requiredCapabilities)||request.requiredCapabilities.some(cap=>!text(cap)))fail('invalid_format','Capabilities required');
  if(request.messages.some(message=>message.content.some(part=>part.type==='image'))&&!request.requiredCapabilities.includes('vision'))fail('capability','Image input requires vision capability');
  if(request.outputSchema!==undefined){validateSchema(request.outputSchema);if(!request.requiredCapabilities.includes('json'))fail('capability','Structured output requires json capability');}
  if(request.requiredCapabilities.includes('json')&&!request.outputSchema)fail('invalid_format','JSON tasks require a schema');
  only(request.toolPolicy,['allowed','maxCalls'],'tool policy');
  if(!Array.isArray(request.toolPolicy.allowed)||request.toolPolicy.allowed.some(tool=>!text(tool))||!integer(request.toolPolicy.maxCalls))fail('invalid_format','Invalid tool policy');
  only(request.budget,['currency','maxCostMicros','maxOutputTokens','deadlineMs'],'budget');
  if(!/^[A-Z]{3}$/.test(request.budget.currency)||!integer(request.budget.maxCostMicros)||!integer(request.budget.maxOutputTokens)||request.budget.maxOutputTokens===0||!integer(request.budget.deadlineMs)||request.budget.deadlineMs===0||request.budget.deadlineMs>2147483647)fail('invalid_format','Invalid bounded budget');
  if(request.idempotencyKey!==undefined&&!text(request.idempotencyKey))fail('invalid_format','Invalid idempotency key');
  return freeze(clone(request));
}
function validateResult(result,request,snapshot,runId){
  only(result,['status','text','data','sources','usage','error'],'adapter result');
  if(!STATUSES.includes(result.status))fail('invalid_format','Invalid result status');
  if(result.status==='completed'){
    if(request.outputSchema){if(!matches(request.outputSchema,result.data))fail('invalid_format','Output does not match task schema');}
    else if(!text(result.text))fail('invalid_format','Completed text must not be empty');
    if(result.error!=null)fail('invalid_format','Completed output cannot contain an error');
  }
  if(result.text!==undefined&&result.text!==null&&typeof result.text!=='string')fail('invalid_format','Invalid result text');
  if(result.usage!=null&&!record(result.usage))fail('invalid_format','Usage must be an object');
  const usage={inputTokens:null,outputTokens:null,cacheReadTokens:null,cacheWriteTokens:null,toolCalls:null,costMicros:null,currency:request.budget.currency,priceVersion:null,estimated:true,...(result.usage??{})};
  only(usage,['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','toolCalls','costMicros','currency','priceVersion','estimated'],'usage');
  for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','toolCalls','costMicros'])if(usage[key]!==null&&!integer(usage[key]))fail('invalid_format','Invalid usage metric');
  if(usage.currency!==request.budget.currency||typeof usage.estimated!=='boolean'||(usage.costMicros!==null&&!text(usage.priceVersion)))fail('invalid_format','Cost provenance required');
  if(usage.priceVersion!==null&&!text(usage.priceVersion))fail('invalid_format','Invalid price version');
  const sources=result.sources??[];
  if(!Array.isArray(sources))fail('invalid_format','Invalid sources');
  for(const source of sources){only(source,['url','title'],'source');if(!text(source.url)||!/^https?:\/\//.test(source.url)||!text(source.title))fail('invalid_format','Invalid source');}
  let error=null;
  if(result.error!=null){only(result.error,['code','message'],'error');if(!Object.hasOwn(ERROR_POLICIES,result.error.code))fail('invalid_format','Unknown error category');error={code:result.error.code,message:'The task could not complete: '+result.error.code,retryable:ERROR_POLICIES[result.error.code].retryable};}
  if(result.status==='failed'&&!error)fail('invalid_format','Failed result requires a normalized error');
  return freeze({requestId:request.requestId,runId,contractVersion:CONTRACT_VERSION,providerId:snapshot.providerId,model:snapshot.model,adapterVersion:snapshot.adapterVersion,configRevision:snapshot.configRevision,instructionsVersion:request.instructionsVersion,status:result.status,text:result.text??null,data:result.status==='completed'?clone(result.data??null):null,sources:clone(sources),usage,error});
}
async function executeBounded(execute,context,parentSignal){
  const controller=new AbortController();let timer;let onCancel;
  const cancelled={status:'cancelled',error:{code:'cancelled',message:'Cancelled'}};
  if(parentSignal?.aborted)return cancelled;
  const interruption=new Promise(resolve=>{
    timer=setTimeout(()=>{controller.abort();resolve({status:'failed',error:{code:'deadline',message:'Deadline reached'}});},context.request.budget.deadlineMs);
    onCancel=()=>{controller.abort();resolve(cancelled);};
    parentSignal?.addEventListener('abort',onCancel,{once:true});
  });
  try {
    const execution=Promise.resolve().then(()=>controller.signal.aborted ? cancelled : execute({...context,signal:controller.signal})).catch(()=>({status:'failed',error:{code:'uncertain',message:'Adapter outcome is unknown'}}));
    return await Promise.race([execution,interruption]);
  } finally {clearTimeout(timer);parentSignal?.removeEventListener('abort',onCancel);}
}
function createRegistry(){
  const providers=new Map();
  return Object.freeze({
    register(definition){
      only(definition,['providerId','adapterVersion','enabled','credentialRef','models','execute'],'provider');
      if(!text(definition.providerId)||!text(definition.adapterVersion)||typeof definition.enabled!=='boolean'||! /^(test|env|vault):[A-Za-z0-9._-]+$/.test(definition.credentialRef)||!record(definition.models)||typeof definition.execute!=='function')fail('configuration','Invalid provider registration');
      if(providers.has(definition.providerId))fail('configuration','Provider is already registered');
      for(const model of Object.values(definition.models)){
        only(model,['executors','capabilities','verified'],'model');
        if(!Array.isArray(model.executors)||model.executors.some(x=>!['ai','coding'].includes(x))||!Array.isArray(model.capabilities)||model.capabilities.some(x=>!text(x))||model.verified!==true)fail('configuration','Models require verified capabilities and executors');
      }
      const {execute,...metadata}=definition;providers.set(definition.providerId,{metadata:freeze(clone(metadata)),execute});
    },
    resolve(config,request,{agentId,executor='ai'}={}){
      if(!['ai','coding'].includes(executor))fail('configuration','Unknown executor');
      only(config,['contractVersion','revision','fallback','profiles','activeProfile','exceptions'],'configuration');
      if(config?.contractVersion!==CONTRACT_VERSION||!text(config.revision)||config.fallback!=='none'||!record(config.profiles)||!text(config.activeProfile))fail('configuration','Invalid configuration or hidden fallback');
      if(!Array.isArray(config.exceptions))fail('configuration','Explicit exceptions list required');
      for(const ex of config.exceptions){only(ex,['scope','id','selection','authorizedBy','reason'],'exception');only(ex.selection,['providerId','model'],'exception selection');if(!['task','agent'].includes(ex.scope)||!text(ex.id)||!text(ex.authorizedBy)||!text(ex.reason)||!text(ex.selection.providerId)||!text(ex.selection.model))fail('configuration','Every exception requires authorization provenance');}
      const matches=config.exceptions.filter(ex=>ex.scope==='task'?ex.id===request.taskType:ex.scope==='agent'&&ex.id===agentId);
      const taskExceptions=matches.filter(ex=>ex.scope==='task'),agentExceptions=matches.filter(ex=>ex.scope==='agent');
      if(taskExceptions.length>1||agentExceptions.length>1)fail('configuration','Ambiguous exceptions');
      const exception=taskExceptions[0]??agentExceptions[0];
      const profile=Object.hasOwn(config.profiles,config.activeProfile)?config.profiles[config.activeProfile]:undefined;
      const selection=exception?.selection??(record(profile)&&Object.hasOwn(profile,request.taskType)?profile[request.taskType]:undefined);
      if(!selection)fail('configuration','Task has no explicit model assignment');
      only(selection,['providerId','model'],'selection');
      const provider=providers.get(selection.providerId);
      if(!provider||!provider.metadata.enabled)fail('configuration','Provider is not enabled');
      const model=Object.hasOwn(provider.metadata.models,selection.model)?provider.metadata.models[selection.model]:undefined;
      if(!model||!model.executors.includes(executor)||request.requiredCapabilities.some(cap=>!model.capabilities.includes(cap)))fail('capability','Selected model lacks a required capability');
      return freeze({providerId:selection.providerId,model:selection.model,adapterVersion:provider.metadata.adapterVersion,credentialRef:provider.metadata.credentialRef,configRevision:config.revision,profileId:config.activeProfile,executor,exception:exception?{scope:exception.scope,id:exception.id,authorizedBy:exception.authorizedBy}:null});
    },
    async run(config,rawRequest,{runId,agentId,signal}={}){
      if(!text(runId))fail('invalid_format','Stable run ID required');
      const request=validateRequest(rawRequest);const snapshot=this.resolve(config,request,{agentId});
      const provider=providers.get(snapshot.providerId);
      const result=await executeBounded(provider.execute,{request,snapshot,runId},signal);
      return validateResult(result,request,snapshot,runId);
    },
    async runCoding(config,rawRequest,{runId,agentId,signal}={}){
      const {validateCodingRequest,validateCodingResult}=require('./coding.cjs');
      if(!text(runId))fail('invalid_format','Stable run ID required');
      const request=validateCodingRequest(rawRequest);const snapshot=this.resolve(config,request,{agentId,executor:'coding'});
      const result=await executeBounded(providers.get(snapshot.providerId).execute,{request,snapshot,runId},signal);
      return validateCodingResult(result,request,snapshot,runId);
    },
    async runPinned(rawSnapshot,rawRequest,{runId,signal}={}){
      only(rawSnapshot,['providerId','model','adapterVersion','credentialRef','configRevision','profileId','executor','exception'],'snapshot');
      if(!text(runId)||!text(rawSnapshot.configRevision)||!['ai','coding'].includes(rawSnapshot.executor))fail('invalid_format','Invalid pinned execution');
      const coding=rawSnapshot.executor==='coding';
      const request=coding?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
      const provider=providers.get(rawSnapshot.providerId);
      const model=provider&&Object.hasOwn(provider.metadata.models,rawSnapshot.model)?provider.metadata.models[rawSnapshot.model]:null;
      if(!provider?.metadata.enabled||provider.metadata.adapterVersion!==rawSnapshot.adapterVersion||provider.metadata.credentialRef!==rawSnapshot.credentialRef||!model?.executors.includes(rawSnapshot.executor)||request.requiredCapabilities.some(cap=>!model.capabilities.includes(cap)))fail('capability','Pinned adapter revision is unavailable or incompatible');
      const snapshot=freeze(clone(rawSnapshot));
      const result=await executeBounded(provider.execute,{request,snapshot,runId},signal);
      return coding?require('./coding.cjs').validateCodingResult(result,request,snapshot,runId):validateResult(result,request,snapshot,runId);
    },
  });
}
module.exports={CONTRACT_VERSION,STATUSES,ERROR_POLICIES,ContractError,validateRequest,validateSchema,validateData,validateResult,createRegistry};
