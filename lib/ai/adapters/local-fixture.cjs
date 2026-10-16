'use strict';
const {createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const {createAnthropicAdapter}=require('./anthropic.cjs');
const {createOpenAIAdapter}=require('./openai.cjs');
const {socialPreviewFixture}=require('../../migration/social-preview-fixture.cjs');
function createFixtureAdapters(){
 const adapters=[];
 const options={models:{'synthetic-only':{verified:true,executors:['ai'],capabilities:['text','json']},[socialPreviewFixture.model]:{verified:true,executors:['ai'],capabilities:['text','prompt_cache','web_search']}},credentialRef:'test:local-fixture',preflight:async()=>({upperBoundMicros:1,currency:'EUR',priceVersion:'synthetic-free-v1'}),priceUsage:async()=>({costMicros:0,currency:'EUR',priceVersion:'synthetic-free-v1',estimated:false})};
 const reply=(taskType,label)=>{
  if(taskType==='youtube.ab-title-suggestions')return JSON.stringify({variantA:`[Simulación ${label}] Título A`,variantB:`[Simulación ${label}] Título B`});
  if(taskType==='youtube.best-time-tip')return JSON.stringify({es:`[Simulación ${label}] Prueba los horarios UTC destacados y compara el rendimiento observado, sin garantía de resultados.`,en:`[${label} simulation] Try the highlighted UTC slots and compare observed performance; results are not guaranteed.`});
  if(taskType===socialPreviewFixture.taskType)return `[Simulación local ${label}] Preview social de prueba. No se ha ejecutado ningún modelo ni búsqueda reales. No publicar.`;
  throw Error('ISOLATION_BLOCKED: unknown synthetic task');
 };
 for(const [create,label]of [[createAnthropicAdapter,'Anthropic'],[createOpenAIAdapter,'OpenAI']]){
  const metadata=create({...options,transport:{create:async()=>{throw Error('Unbound fixture transport');}}});
  // Each invocation captures its validated portable task. No mutable shared
  // routing state, prompt inspection, caller model selection or real fallback.
  adapters.push({...metadata,async execute(context){
   if((context.request.taskType===socialPreviewFixture.taskType)!==(context.snapshot.model===socialPreviewFixture.model))throw Error('ISOLATION_BLOCKED: synthetic preview task/model mismatch');
   const text=reply(context.request.taskType,label);
   const transport={create:async()=>label==='Anthropic'
    ?{stop_reason:'end_turn',content:[{type:'text',text}],usage:{input_tokens:5,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0}}
    :{status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}],usage:{input_tokens:5,output_tokens:5,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}}}};
   return create({...options,transport}).execute(context);
  }});
 }
 return adapters;
}
function createFixtureRegistry(adapters=createFixtureAdapters()){const registry=createRegistry();for(const adapter of adapters)registry.register(adapter);return registry;}
function initialConfiguration(taskType){return {contractVersion:'1.0',revision:'migration-ui-fixture-v2',fallback:'none',activeProfile:'Prueba Anthropic',profiles:{'Prueba Anthropic':{[taskType]:{providerId:'anthropic',model:'synthetic-only'},'youtube.best-time-tip':{providerId:'anthropic',model:'synthetic-only'}},'Prueba OpenAI':{[taskType]:{providerId:'openai',model:'synthetic-only'},'youtube.best-time-tip':{providerId:'openai',model:'synthetic-only'}}},exceptions:[]};}
module.exports={createFixtureAdapters,createFixtureRegistry,initialConfiguration};
