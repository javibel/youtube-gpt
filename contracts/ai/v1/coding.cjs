'use strict';
const {ContractError,validateRequest,validateData,validateResult}=require('./core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const string={type:'string'};
const strings={type:'array',items:string};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const checkpointSchema=object({objective:string,progress:string,changes:strings,tests:strings,pending:strings});
const outputSchema=object({
 changes:{type:'array',items:object({path:string,kind:{type:'string',enum:['create','modify','delete']},patch:string})},
 commands:{type:'array',items:object({argv:{type:'array',items:string,minItems:1},exitCode:{type:'integer'}})},
 answer:string,
 validations:{type:'array',items:object({name:string,passed:{type:'boolean'}})},pending:strings,
},['changes','commands','validations','pending']);
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
const relative=value=>typeof value==='string'&&value.length>0&&!/[\\:*?\u0000]/.test(value)&&!value.startsWith('/')&&!value.split('/').some(part=>!part||part==='.'||part==='..')&&!value.startsWith('.git/')&&value!=='.git'&&!/(^|\/)\.env(?:\.|$)/.test(value);
function validateCodingRequest(request){
 if(!request||typeof request!=='object'||Array.isArray(request))fail('invalid_format','Coding request must be an object');
 const allowed=['requestId','taskType','contractVersion','inputVersion','language','instructions','instructionsVersion','requiredCapabilities','budget','idempotencyKey','objective','repositoryId','baseRevision','allowedFiles','permissions','allowedCommands','checkpoint'];
 for(const key of Object.keys(request))if(!allowed.includes(key))fail('invalid_format','Unsupported coding field: '+key);
 for(const field of ['objective','repositoryId','baseRevision'])if(typeof request[field]!=='string'||!request[field].trim())fail('invalid_format','Missing '+field);
 if(!Array.isArray(request.allowedFiles)||!request.allowedFiles.every(relative))fail('permissions','Files must be explicit safe repository-relative paths');
 const permissionKeys=['read','edit','execute','commit','deploy','communicate'];
 if(!request.permissions||Object.keys(request.permissions).length!==permissionKeys.length||permissionKeys.some(key=>typeof request.permissions[key]!=='boolean'))fail('permissions','Explicit coding permissions required');
 if(request.permissions.deploy||request.permissions.communicate)fail('permissions','Deployment and communication are disabled during local preparation');
 if(!Array.isArray(request.allowedCommands)||request.allowedCommands.some(argv=>!Array.isArray(argv)||argv.length===0||argv.some(arg=>typeof arg!=='string'||arg.includes('\0'))))fail('invalid_format','Commands require explicit argument arrays');
 if(!request.permissions.execute&&request.allowedCommands.length)fail('permissions','Commands require execute permission');
 for(const argv of request.allowedCommands){
  if(argv.some(arg=>/skip.permissions|bypass.approvals|dangerously/i.test(arg)))fail('permissions','Permission bypass flags are forbidden');
  if(/(^|[\/\\])(?:vercel|pm2|schtasks)(?:\.exe)?$/i.test(argv[0])||(/(^|[\/\\])git(?:\.exe)?$/i.test(argv[0])&&argv.includes('push')))fail('permissions','Operational command is forbidden');
  if(/(^|[\/\\])git(?:\.exe)?$/i.test(argv[0])&&argv.includes('commit')&&!request.permissions.commit)fail('permissions','Commit permission is required');
 }
 if(request.checkpoint!==undefined)validateData(checkpointSchema,request.checkpoint);
 const {objective,repositoryId,baseRevision,allowedFiles,permissions,allowedCommands,checkpoint,...common}=request;
 validateRequest({...common,messages:[{role:'user',content:[{type:'text',text:objective}]}],toolPolicy:{allowed:[],maxCalls:0},...(common.requiredCapabilities?.includes('json')?{outputSchema}:{} )});
 if(!request.requiredCapabilities.includes('coding'))fail('capability','Coding capability must be explicit');
 return freeze({...structuredClone(request),outputSchema:structuredClone(outputSchema)});
}
function validateCodingResult(result,request,snapshot,runId){
 const {checkpoint,...common}=result;
 if(checkpoint!==undefined)validateData(checkpointSchema,checkpoint);
 const normalized=validateResult(common,request,snapshot,runId);
 if(normalized.status==='completed'){
  if(normalized.data.changes.length&&!request.permissions.edit)fail('permissions','Editing not permitted');
  for(const change of normalized.data.changes)if(!relative(change.path)||!request.allowedFiles.includes(change.path))fail('permissions','Proposed change exceeds file scope');
  if(normalized.data.commands.length&&!request.permissions.execute)fail('permissions','Command execution not permitted');
  for(const command of normalized.data.commands)if(!request.allowedCommands.some(argv=>JSON.stringify(argv)===JSON.stringify(command.argv)))fail('permissions','Reported command exceeds approved argument vector');
 }
 return freeze({...normalized,checkpoint:checkpoint===undefined?null:structuredClone(checkpoint)});
}
module.exports={validateCodingRequest,validateCodingResult,outputSchema,checkpointSchema};
