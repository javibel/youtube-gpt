'use strict';
const {ContractError,validateData}=require('../../../contracts/ai/v1/core.cjs'),{schema}=require('../brand-image-reference.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
function payload(request,model){
 if(model!=='ideogram-v3'||request.taskType!=='brand.image-generation'||request.language!=='en'||request.instructionsVersion!=='brand-image-generation-v1'||!request.requiredCapabilities.includes('image_generation')||!request.outputSchema||request.instructions!==''||request.toolPolicy.maxCalls!==0||request.toolPolicy.allowed.length||request.messages.length!==1||request.messages[0].role!=='user'||request.messages[0].content.length!==1||request.messages[0].content[0].type!=='text')fail('capability','Unsupported original image task');
 const prompt=request.messages[0].content[0].text;if(!prompt.trim()||Array.from(prompt).length>200)fail('invalid_format','Invalid original image prompt');
 return {prompt:prompt+'. No text, no words, no letters. Cinematic lighting, rich colors, editorial style.',resolution:'1024x1024',rendering_speed:'TURBO',magic_prompt:'ON',style_type:'REALISTIC',negative_prompt:'text, words, letters, numbers, watermark, logo, blurry, low quality, distorted'};
}
function createIdeogramAdapter({models,credentialRef,transport,preflight,priceUsage}={}){
 if(typeof transport?.create!=='function'||typeof preflight!=='function'||priceUsage!==undefined&&typeof priceUsage!=='function')fail('configuration','Explicit original transport and conservative quote required');
 return {providerId:'ideogram',adapterVersion:'brand-image-v1',enabled:true,models,credentialRef,async execute({request,snapshot,signal}){
  let body,quote;
  try{body=payload(request,snapshot.model);quote=await preflight({payload:structuredClone(body),request,snapshot,signal});if(!quote||!Number.isSafeInteger(quote.upperBoundMicros)||quote.upperBoundMicros<0||quote.currency!==request.budget.currency||typeof quote.priceVersion!=='string'||!quote.priceVersion)fail('configuration','Explicit image quote required');if(quote.upperBoundMicros>request.budget.maxCostMicros)fail('quota','Image exceeds reserved budget');}
  catch(error){return {status:'failed',error:{code:error instanceof ContractError?error.code:'configuration',message:'Image preflight rejected'},usage:{costMicros:0,currency:request.budget.currency,priceVersion:'not-dispatched-v1',estimated:false}};}
  if(signal?.aborted)return{status:'cancelled',error:{code:'cancelled',message:'Image cancelled before dispatch'}};
  let response;try{response=await transport.create(body,{signal,timeout:Math.min(30000,request.budget.deadlineMs),maxRetries:0});validateData(schema,response);}catch{return{status:'failed',error:{code:'uncertain',message:'Image result unconfirmed'}};}
  const result={status:'completed',data:response,usage:{toolCalls:0}};
  if(priceUsage)try{const cost=await priceUsage({snapshot,quote,response:structuredClone(response)});if(cost){if(!Number.isSafeInteger(cost.costMicros)||cost.costMicros<0||cost.currency!==request.budget.currency||typeof cost.priceVersion!=='string'||!cost.priceVersion||typeof cost.estimated!=='boolean')throw Error('Unknown image cost');Object.assign(result.usage,{costMicros:cost.costMicros,currency:cost.currency,priceVersion:cost.priceVersion,estimated:cost.estimated});}}catch{/* Actual cost remains unknown and the common reservation stays held. */}
  return result;
 }};
}
module.exports={createIdeogramAdapter,payload};
