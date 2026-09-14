'use strict';
const fs=require('node:fs');const path=require('node:path');
const {ERROR_POLICIES,STATUSES}=require('./core.cjs');
const {outputSchema,checkpointSchema}=require('./coding.cjs');
const str={type:'string',minLength:1};const nullableString={type:['string','null']};
const integer={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const strings={type:'array',items:str};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const budget=object({currency:{type:'string',pattern:'^[A-Z]{3}$'},maxCostMicros:integer,maxOutputTokens:{...integer,minimum:1},deadlineMs:{type:'integer',minimum:1,maximum:2147483647}});
const selection=object({providerId:str,model:str});
const common={requestId:str,taskType:str,contractVersion:{const:'1.0'},inputVersion:str,language:str,instructions:{type:'string'},instructionsVersion:str,requiredCapabilities:strings,budget,idempotencyKey:str};
const requiredCommon=Object.keys(common).filter(key=>key!=='idempotencyKey');
const request=object({...common,
 messages:{type:'array',minItems:1,items:object({role:{enum:['user','assistant','system','tool']},content:{type:'array',minItems:1,items:{oneOf:[object({type:{const:'text'},text:{type:'string'}}),object({type:{const:'image'},url:{type:'string',pattern:'^https://'},mediaType:str})]}}})},
 outputSchema:{$ref:'urn:ytubviral:ai:v1:output-schema'},toolPolicy:object({allowed:strings,maxCalls:integer}),
},[...requiredCommon,'messages','toolPolicy']);
const subset=object({
 type:{enum:['object','array','string','number','integer','boolean','null']},
 properties:{type:'object',additionalProperties:{$ref:'urn:ytubviral:ai:v1:output-schema'}},required:strings,
 additionalProperties:{type:'boolean'},items:{$ref:'urn:ytubviral:ai:v1:output-schema'},
 enum:{type:'array',minItems:1,items:{type:['string','number','boolean','null']}},
 minimum:{type:'number'},maximum:{type:'number'},minLength:integer,maxLength:integer,minItems:integer,maxItems:integer,
},['type']);
const usage=object({inputTokens:{...integer,type:['integer','null']},outputTokens:{...integer,type:['integer','null']},cacheReadTokens:{...integer,type:['integer','null']},cacheWriteTokens:{...integer,type:['integer','null']},toolCalls:{...integer,type:['integer','null']},costMicros:{...integer,type:['integer','null']},currency:{type:'string',pattern:'^[A-Z]{3}$'},priceVersion:nullableString,estimated:{type:'boolean'}});
const result=object({requestId:str,runId:str,contractVersion:{const:'1.0'},providerId:str,model:str,adapterVersion:str,configRevision:str,instructionsVersion:str,status:{enum:STATUSES},text:nullableString,data:{},sources:{type:'array',items:object({url:{type:'string',pattern:'^https?://'},title:str})},usage,error:{anyOf:[{type:'null'},object({code:{enum:Object.keys(ERROR_POLICIES)},message:str,retryable:{type:'boolean'}})]}});
const configuration=object({contractVersion:{const:'1.0'},revision:str,fallback:{const:'none'},activeProfile:str,profiles:{type:'object',minProperties:1,additionalProperties:{type:'object',minProperties:1,additionalProperties:selection}},exceptions:{type:'array',items:object({scope:{enum:['task','agent']},id:str,selection,authorizedBy:str,reason:str})}});
const coding=object({...common,objective:str,repositoryId:str,baseRevision:str,allowedFiles:strings,permissions:object({read:{type:'boolean'},edit:{type:'boolean'},execute:{type:'boolean'},commit:{type:'boolean'},deploy:{const:false},communicate:{const:false}}),allowedCommands:{type:'array',items:{type:'array',minItems:1,items:{type:'string'}}},checkpoint:checkpointSchema},[...requiredCommon,'objective','repositoryId','baseRevision','allowedFiles','permissions','allowedCommands']);
const codingResult=structuredClone(result);codingResult.properties.checkpoint={anyOf:[{type:'null'},checkpointSchema]};codingResult.required.push('checkpoint');
codingResult.allOf=[{if:{properties:{status:{const:'completed'}}},then:{properties:{data:outputSchema}}}];
const schemas={'output-schema':subset,request,result,configuration,'coding-request':coding,'coding-result':codingResult};
for(const [name,schema]of Object.entries(schemas))fs.writeFileSync(path.join(__dirname,name+'.schema.json'),JSON.stringify({$schema:'http://json-schema.org/draft-07/schema#',$id:'urn:ytubviral:ai:v1:'+name,...schema},null,2)+'\n');
console.log('Generated six structural schemas; cross-field authorization and capability checks remain in the runtime validators.');
