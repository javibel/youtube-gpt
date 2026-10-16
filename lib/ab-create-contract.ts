import { abNativeSuggestionInput,abEditorialTitle } from '@/lib/ab-suggestions-contract';
// Selection and editorial drafts are data,never an admission or recovery grant.
export function abNativeCreateInput(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_input');
 const v=value as Record<string,unknown>,keys=['videoId','channelId','originalTitle','variantA','variantB','hoursPerVariant','lang'];
 if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))throw Error('invalid_input');
 const selected=abNativeSuggestionInput({title:v.originalTitle,videoId:v.videoId,channelId:v.channelId,lang:v.lang});
 const comparable=(t:string)=>t.normalize('NFKC').replace(/\s+/gu,' ').toLowerCase();
 if(!abEditorialTitle(v.variantA)||!abEditorialTitle(v.variantB)||comparable(v.variantA)===comparable(v.variantB))throw Error('invalid_input');
 const variants={variantA:v.variantA,variantB:v.variantB};
 if(typeof v.hoursPerVariant!=='number'||!Number.isInteger(v.hoursPerVariant)||v.hoursPerVariant<12||v.hoursPerVariant>168)throw Error('invalid_input');
 return Object.freeze({videoId:selected.videoId,channelId:selected.channelId,originalTitle:selected.title,variantA:variants.variantA,variantB:variants.variantB,hoursPerVariant:v.hoursPerVariant,lang:selected.lang});
}
