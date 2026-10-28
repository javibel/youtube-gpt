'use strict';
const {types}=require('node:util');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const deny=code=>{throw new ContractError(code,'Bound model metadata observation unavailable');};
async function checkModelMetadata(check,binding){
 if(typeof check!=='function')deny('configuration');
 const context=Object.freeze({...binding});let original;
 try{original=await check(context);}catch(error){deny(error instanceof ContractError&&['cancelled','deadline','permissions'].includes(error.code)?error.code:'credentials');}
 if(!original||typeof original!=='object'||Array.isArray(original)||types.isProxy(original))deny('credentials');
 const fields=['runtimeId','providerId','credentialRef','requestedModel','resolvedModel','exactModelMatch','metadataAccessible','selectionUnchanged','generationVerified','budgetVerified'],descriptors=Object.getOwnPropertyDescriptors(original);
 if(Reflect.ownKeys(descriptors).length!==fields.length||fields.some(k=>!Object.hasOwn(descriptors,k)||!Object.hasOwn(descriptors[k],'value')))deny('credentials');
 const value=Object.fromEntries(fields.map(k=>[k,descriptors[k].value]));
 if(['runtimeId','providerId','credentialRef'].some(k=>value[k]!==context[k])||value.requestedModel!==context.model||typeof value.resolvedModel!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.resolvedModel)||value.exactModelMatch!==(value.requestedModel===value.resolvedModel)||value.metadataAccessible!==true||value.selectionUnchanged!==true||value.generationVerified!==false||value.budgetVerified!==false)deny('credentials');
 return Object.freeze(value);
}
module.exports={checkModelMetadata};
