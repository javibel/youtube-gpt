'use strict';
const {ContractError,createRegistry}=require('../../../contracts/ai/v1/core.cjs');
const {createAnthropicAdapter}=require('./anthropic.cjs');
const {createAnthropicHttpTransport}=require('./anthropic-http.cjs');
const {createAnthropicHttpsFetch}=require('./anthropic-https.cjs');
const fail=()=>{throw new ContractError('configuration','Original Anthropic transport, catalog and pricing capabilities required');};
// Inert trusted server composition. The returned original adapter can join the
// shared registry; nothing installs a runtime or reads credentials at import.
function createAnthropicHttpAdapter(options={}){
 const keys=['fetch','readCredential','credentialRef','apiVersion','workspaceId','maxRequestBytes','maxResponseBytes','models','preflight','priceUsage'];
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!keys.includes(k))||typeof options.preflight!=='function'||typeof options.priceUsage!=='function')fail();
 const {models,preflight,priceUsage,...http}=options;
 let catalog;try{catalog=structuredClone(models);}catch{fail();}
 if(!catalog||typeof catalog!=='object'||Array.isArray(catalog)||!Object.keys(catalog).length)fail();
 const transport=createAnthropicHttpTransport(http);
 const adapter=createAnthropicAdapter({models:catalog,credentialRef:http.credentialRef,transport,preflight,priceUsage});
 createRegistry().register(adapter);
 return adapter;
}
function createAnthropicHttpsAdapter(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||typeof options.resolveAddress!=='function'||Object.hasOwn(options,'fetch'))fail();
 const {resolveAddress,...rest}=options;
 const fetch=createAnthropicHttpsFetch({resolveAddress,apiVersion:rest.apiVersion,workspaceId:rest.workspaceId,maxRequestBytes:rest.maxRequestBytes});
 return createAnthropicHttpAdapter({...rest,fetch});
}
module.exports={createAnthropicHttpAdapter,createAnthropicHttpsAdapter};
