'use strict';
// Responses protocol only. Transport, model catalog and pricing are injected.
const {ContractError,validateRequest,validateData}=require('../../../contracts/ai/v1/core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function toResponse(rawRequest,model){
 const request=validateRequest(rawRequest),instructions=[],input=[];
 if(request.instructions)instructions.push(request.instructions);
 let conversation=false;
 for(const message of request.messages){
  if(message.role==='tool')fail('capability','Tool-result history requires a portable extension');
  if(message.role==='system'){
   if(conversation||message.content.some(part=>part.type!=='text'))fail('capability','Only leading text system messages are supported');
   instructions.push(...message.content.map(part=>part.text));continue;
  }
  conversation=true;
  if(message.role==='assistant'&&message.content.some(part=>part.type!=='text'))fail('capability','Assistant image history is unsupported');
  input.push({role:message.role,content:message.content.map(part=>part.type==='text'?{type:'input_text',text:part.text}:{type:'input_image',image_url:part.url,detail:'auto'})});
 }
 if(!input.length||input[0].role!=='user'||input.at(-1).role!=='user')fail('capability','Conversation must begin and end with user input');
 if(request.outputSchema)instructions.push('Return only valid JSON matching this schema: '+JSON.stringify(request.outputSchema));
 if(request.requiredCapabilities.includes('prompt_cache')&&!instructions.length)fail('capability','Instruction caching requires a system prefix');
 const payload={model,input,max_output_tokens:request.budget.maxOutputTokens,store:false,stream:false,background:false,truncation:'disabled'};
 if(instructions.length)payload.instructions=instructions.join('\n\n');
 const search=request.requiredCapabilities.includes('web_search');
 if(request.toolPolicy.allowed.some(name=>name!=='web_search')||search!==request.toolPolicy.allowed.includes('web_search')||(search&&request.toolPolicy.maxCalls<1))fail('capability','Only explicit bounded web search is supported');
 if(search){payload.tools=[{type:'web_search'}];payload.max_tool_calls=request.toolPolicy.maxCalls;payload.parallel_tool_calls=false;}
 return payload;
}
function usageOf(response,toolCalls){
 const usage=response.usage??{},total=count(usage.input_tokens),cacheRead=count(usage.input_tokens_details?.cached_tokens),cacheWrite=count(usage.input_tokens_details?.cache_write_tokens);
 // Match the Anthropic adapter's uncached input bucket. Do not assume absent
 // cache counters are zero or count overlapping provider totals twice.
 const uncached=total!==null&&cacheRead!==null&&cacheWrite!==null&&total>=cacheRead+cacheWrite?total-cacheRead-cacheWrite:null;
 return {inputTokens:uncached,outputTokens:count(usage.output_tokens),cacheReadTokens:cacheRead,cacheWriteTokens:cacheWrite,toolCalls,costMicros:null,priceVersion:null,estimated:true};
}
function normalize(response,request){
 if(!response||!Array.isArray(response.output))fail('invalid_format','Invalid provider response');
 const text=[],sources=[];let refusal=false,toolFailure=false,incompleteItem=false,toolCalls=0;
 for(const item of response.output){
  if(item?.type==='message'){
   if(item.role!=='assistant'||!Array.isArray(item.content))fail('invalid_format','Invalid assistant message');
   if(item.status!=='completed')incompleteItem=true;
   for(const part of item.content){
    if(part?.type==='refusal'){refusal=true;continue;}
    if(part?.type!=='output_text'||typeof part.text!=='string')fail('capability','Unsupported response content');
    text.push(part.text);
    for(const citation of part.annotations??[])if(citation.type==='url_citation'&&typeof citation.url==='string'&&/^https?:\/\//.test(citation.url)&&typeof citation.title==='string'&&citation.title.trim())sources.push({url:citation.url,title:citation.title});
   }
  }else if(item?.type==='web_search_call'){toolCalls++;if(item.status!=='completed')toolFailure=true;}
  else if(item?.type!=='reasoning')fail('capability','Unsupported response item');
 }
 let status=response.status==='completed'?'completed':response.status==='incomplete'?'incomplete':response.status==='cancelled'?'cancelled':'failed';
 if(refusal)status='refused';else if(status==='completed'&&incompleteItem)status='incomplete';
 const result={status,text:text.join('\n'),data:null,sources:sources.filter((s,i)=>sources.findIndex(o=>o.url===s.url&&o.title===s.title)===i),usage:usageOf(response,toolCalls)};
 if(status==='failed')result.error={code:'uncertain',message:'Provider did not complete the response'};
 if(status==='cancelled')result.error={code:'cancelled',message:'Provider cancelled the response'};
 if(toolFailure){result.status='failed';result.error={code:'transport',message:'Provider search did not complete'};}
 if(toolCalls>request.toolPolicy.maxCalls){result.status='failed';result.error={code:'permissions',message:'Provider exceeded the tool budget'};}
 if(result.status==='completed'&&request.outputSchema){try{const cleaned=result.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,'$1').trim();result.data=JSON.parse(cleaned);validateData(request.outputSchema,result.data);}catch{result.status='failed';result.data=null;result.error={code:'invalid_format',message:'Structured output did not match the contract'};}}
 else if(result.status==='completed'&&!result.text.trim()){result.status='failed';result.error={code:'invalid_format',message:'Empty completed response'};}
 return result;
}
function normalizeError(error){const code=error?.status===401?'credentials':error?.status===403?'permissions':error?.status===402?'quota':error?.status===429?'rate_limit':[400,413,422].includes(error?.status)?'invalid_format':error?.status===404?'capability':'uncertain';return {status:'failed',error:{code,message:'Provider request failed'}};}
function createOpenAIAdapter({models,credentialRef,transport,preflight,priceUsage}={}){
 if(typeof transport?.create!=='function'||typeof preflight!=='function'||(priceUsage!==undefined&&typeof priceUsage!=='function'))fail('configuration','Injected transport and conservative preflight are required');
 return {providerId:'openai',adapterVersion:'responses-v1',enabled:true,credentialRef,models,async execute({request,snapshot,signal}){
  let payload,quote;
  try{
   payload=toResponse(request,snapshot.model);quote=await preflight({payload:structuredClone(payload),request,snapshot,signal});
   if(!quote||!Number.isSafeInteger(quote.upperBoundMicros)||quote.upperBoundMicros<0||quote.currency!==request.budget.currency||typeof quote.priceVersion!=='string'||!quote.priceVersion)fail('configuration','Bounded price preflight unavailable');
   if(quote.upperBoundMicros>request.budget.maxCostMicros)fail('quota','Request exceeds reserved budget');
  }catch(error){return {status:'failed',error:{code:error instanceof ContractError?error.code:'configuration',message:'Local preflight rejected'},usage:{costMicros:0,currency:request.budget.currency,priceVersion:'not-dispatched-v1',estimated:false}};}
  if(signal?.aborted)return {status:'cancelled',error:{code:'cancelled',message:'Cancelled before dispatch'}};
  let response;try{response=await transport.create(payload,{signal,timeout:request.budget.deadlineMs,maxRetries:0});}catch(error){return normalizeError(error);}
  const result=normalize(response,request);
  if(priceUsage){try{const cost=await priceUsage({usage:structuredClone(result.usage),snapshot,quote});if(cost){if(!Number.isSafeInteger(cost.costMicros)||cost.costMicros<0||cost.currency!==request.budget.currency||typeof cost.priceVersion!=='string'||!cost.priceVersion||typeof cost.estimated!=='boolean')throw Error('Invalid pricing evidence');result.usage={...result.usage,costMicros:cost.costMicros,currency:cost.currency,priceVersion:cost.priceVersion,estimated:cost.estimated};}}catch{/* Measured counters remain; cost stays unknown. */}}
  return result;
 }};
}
module.exports={toResponse,normalize,normalizeError,createOpenAIAdapter};
