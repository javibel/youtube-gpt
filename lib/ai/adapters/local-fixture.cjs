'use strict';
const {createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const {createAnthropicAdapter}=require('./anthropic.cjs');
const {createOpenAIAdapter}=require('./openai.cjs');
function createFixtureRegistry(){
 const registry=createRegistry();
 const options={models:{'synthetic-only':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:local-fixture',preflight:async()=>({upperBoundMicros:1,currency:'EUR',priceVersion:'synthetic-free-v1'}),priceUsage:async()=>({costMicros:0,currency:'EUR',priceVersion:'synthetic-free-v1',estimated:false})};
 const reply=(taskType,label)=>{
  if(taskType==='youtube.ab-title-suggestions')return JSON.stringify({variantA:`[Simulación ${label}] Título A`,variantB:`[Simulación ${label}] Título B`});
  if(taskType==='youtube.best-time-tip')return JSON.stringify({es:`[Simulación ${label}] Prueba los horarios UTC destacados y compara el rendimiento observado, sin garantía de resultados.`,en:`[${label} simulation] Try the highlighted UTC slots and compare observed performance; results are not guaranteed.`});
  throw Error('ISOLATION_BLOCKED: unknown synthetic task');
 };
 for(const [create,label]of [[createAnthropicAdapter,'Anthropic'],[createOpenAIAdapter,'OpenAI']]){
  const metadata=create({...options,transport:{create:async()=>{throw Error('Unbound fixture transport');}}});
  // Each invocation captures its validated portable task. No mutable shared
  // routing state, prompt inspection, caller model selection or real fallback.
  registry.register({...metadata,async execute(context){
   const text=reply(context.request.taskType,label);
   const transport={create:async()=>label==='Anthropic'
    ?{stop_reason:'end_turn',content:[{type:'text',text}],usage:{input_tokens:5,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0}}
    :{status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}],usage:{input_tokens:5,output_tokens:5,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}}}};
   return create({...options,transport}).execute(context);
  }});
 }
 return registry;
}
function initialConfiguration(taskType){return {contractVersion:'1.0',revision:'migration-ui-fixture-v2',fallback:'none',activeProfile:'Prueba Anthropic',profiles:{'Prueba Anthropic':{[taskType]:{providerId:'anthropic',model:'synthetic-only'},'youtube.best-time-tip':{providerId:'anthropic',model:'synthetic-only'}},'Prueba OpenAI':{[taskType]:{providerId:'openai',model:'synthetic-only'},'youtube.best-time-tip':{providerId:'openai',model:'synthetic-only'}}},exceptions:[]};}
module.exports={createFixtureRegistry,initialConfiguration};
