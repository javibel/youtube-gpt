'use strict';
const {harness:sharedHarness}=require('./shared-runtime.test.cjs');
const {createIdeogramHttp}=require('../../lib/ai/adapters/ideogram-http.cjs');
function harness(){
 const h=sharedHarness(),state=h.state,task='brand.image-generation';
 state.imageRequests=[];state.imageQuote={upperBoundMicros:50,currency:'EUR',priceVersion:'synthetic-image-v1'};
 state.imagePrice={costMicros:40,currency:'EUR',priceVersion:'synthetic-image-v1',estimated:false};
 for(const tasks of Object.values(state.head.profiles))tasks[task]={providerId:'ideogram',model:'ideogram-v3'};
 state.declarations[0].adapters.ideogram='brand-image-v1';
 h.options.taskCatalog[task]={executor:'ai',capabilities:['text','json','image_generation'],runtimeIds:['web']};
 h.options.policies[task]={serviceIds:['brand-agent'],maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:100,maxOutputTokens:2048,deadlineMs:1000}};
 h.options.budgetBindings[task]=['synthetic-budget'];
 h.options.image={models:{'ideogram-v3':{verified:true,executors:['ai'],capabilities:['text','json','image_generation']}},credentialRef:'test:shared-image',pricing:{currency:'EUR',version:'synthetic-image-v1'},
  transport:createIdeogramHttp({apiKey:'closed-shared-image-key',downloadHosts:['images.example.invalid'],fetch:async(url,settings)=>{state.imageRequests.push({url,settings});return state.imageResponse?state.imageResponse(url,settings):Response.json({data:[{url:'https://images.example.invalid/own.png'}]});}}),
  preflight:async()=>state.imageQuote,priceUsage:async()=>state.imagePrice};
 return h;
}
module.exports={harness};
