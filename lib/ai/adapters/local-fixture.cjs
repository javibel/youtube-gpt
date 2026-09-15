'use strict';
const {createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const {createAnthropicAdapter}=require('./anthropic.cjs');
const {createOpenAIAdapter}=require('./openai.cjs');
function createFixtureRegistry(){
 const registry=createRegistry();
 const options={models:{'synthetic-only':{verified:true,executors:['ai'],capabilities:['text','json']}},credentialRef:'test:local-fixture',preflight:async()=>({upperBoundMicros:1,currency:'EUR',priceVersion:'synthetic-free-v1'}),priceUsage:async()=>({costMicros:0,currency:'EUR',priceVersion:'synthetic-free-v1',estimated:false})};
 registry.register(createAnthropicAdapter({...options,transport:{create:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({variantA:'[Simulación Anthropic] Título A',variantB:'[Simulación Anthropic] Título B'})}],usage:{input_tokens:5,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0}})}}));
 registry.register(createOpenAIAdapter({...options,transport:{create:async()=>({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({variantA:'[Simulación OpenAI] Título A',variantB:'[Simulación OpenAI] Título B'}),annotations:[]}]}],usage:{input_tokens:5,output_tokens:5,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}}})}}));
 return registry;
}
function initialConfiguration(taskType){return {contractVersion:'1.0',revision:'migration-ui-fixture-v1',fallback:'none',activeProfile:'Prueba Anthropic',profiles:{'Prueba Anthropic':{[taskType]:{providerId:'anthropic',model:'synthetic-only'}},'Prueba OpenAI':{[taskType]:{providerId:'openai',model:'synthetic-only'}}},exceptions:[]};}
module.exports={createFixtureRegistry,initialConfiguration};
