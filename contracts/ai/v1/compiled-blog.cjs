'use strict';
// Public article data only. This module grants no publication or recovery right.
const fail=()=>{throw Error('Invalid bounded compiled blog content');};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>record(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
function capture(input){
 let nodes=0,characters=0;
 function copy(v,depth){
  if(++nodes>200000||depth>9)fail();
  if(typeof v==='string'){characters+=v.length;if(v.length>5000||characters>8388608||/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v))fail();return v;}
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
  if(!v||typeof v!=='object')fail();
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v),descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)fail();
  if(keys.some(k=>typeof k!=='string'))fail();
  if(array){const length=descriptors.length?.value;if(!Number.isInteger(length)||length<0||length>1000||keys.length!==length+1)fail();const out=[];for(let i=0;i<length;i++){const d=descriptors[i];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail();out.push(copy(d.value,depth+1));}return out;}
  if(keys.length>20)fail();const out={};
  for(const k of keys){const d=descriptors[k];if(k==='__proto__'||!d.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}
  return out;
 }
 return copy(input,0);
}
function validateDelivery(value){
 if(!exact(value,'version,publicationId,payloadDigest,slug,lang,cat,readMin,publishedAt,author,title,excerpt,blocks,canonicalUrl')||value.version!==1
  ||!/^publication_[a-f0-9]{64}$/.test(value.publicationId)||!/^[a-f0-9]{64}$/.test(value.payloadDigest)
  ||typeof value.slug!=='string'||value.slug.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)||!['es','en'].includes(value.lang)
  ||!['ai','youtube','marketing','tutorials'].includes(value.cat)||!Number.isSafeInteger(value.readMin)||value.readMin<1||value.readMin>120
  ||typeof value.publishedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.publishedAt)
  ||!Number.isFinite(Date.parse(value.publishedAt))||new Date(value.publishedAt).toISOString().slice(0,10)!==value.publishedAt
  ||!exact(value.author,'name,role,avatar')||!text(value.author.name,128)||!text(value.author.role,256)||!text(value.author.avatar,8)
  ||!text(value.title,300)||!text(value.excerpt,2000)||!Array.isArray(value.blocks)||!value.blocks.length||value.blocks.length>200
  ||value.canonicalUrl!=='https://ytubviral.com'+(value.lang==='en'?'/en':'')+'/blog/'+value.slug)fail();
 const shapes={p:['t'],h2:['t'],h3:['t'],list:['items'],callout:['t'],'callout-mid':['t','sub','cta'],'callout-final':['t','sub','cta'],'callout-gear':['t','sub','cta'],video:['videoId']};
 for(const block of value.blocks){
  const keys=record(block)&&Object.hasOwn(shapes,block.type)?shapes[block.type]:null;
  if(!keys||Object.keys(block).some(k=>k!=='type'&&!keys.includes(k)&&!(k==='href'&&['callout-mid','callout-final'].includes(block.type)))
   ||keys.some(k=>k==='items'?(!Array.isArray(block.items)||!block.items.length||block.items.length>100||block.items.some(t=>!text(t,5000))):!text(block[k],5000)))fail();
  if(block.type==='video'&&!/^[A-Za-z0-9_-]{11}$/.test(block.videoId))fail();
  if(Object.hasOwn(block,'href')){let decoded;try{decoded=decodeURIComponent(block.href);}catch{fail();}if(typeof block.href!=='string'||!/^\/(?!\/)/.test(decoded)||/[\\\s\x00-\x1F\x7F]/.test(decoded))fail();}
 }
 return value;
}
function validatePublicBlogDelivery(input){return validateDelivery(capture(input));}
function validatePublicBlogDocument(input){
 const doc=capture(input);
 if(!exact(doc,'version,deliveries')||doc.version!==1||!Array.isArray(doc.deliveries)||doc.deliveries.length>1000)fail();
 const keys=new Set(),ids=new Set(),slugs=new Map();
 for(const value of doc.deliveries){
  validateDelivery(value);const key=value.slug+':'+value.lang;
  if(keys.has(key)||ids.has(value.publicationId))fail();keys.add(key);ids.add(value.publicationId);
  const prior=slugs.get(value.slug);
  if(prior&&[prior.cat,prior.readMin,prior.author.name,prior.author.avatar].join('\0')!==[value.cat,value.readMin,value.author.name,value.author.avatar].join('\0'))fail();
  slugs.set(value.slug,value);
 }
 return doc;
}
function appendPublicBlogDelivery(document,delivery){
 const doc=validatePublicBlogDocument(document),value=validatePublicBlogDelivery(delivery);
 doc.deliveries.push(value);return validatePublicBlogDocument(doc);
}
function serializePublicBlogDelivery(delivery){
 return JSON.stringify(validatePublicBlogDelivery(delivery)).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
}
function readPublicBlogMarker(html){
 if(typeof html!=='string'||html.length>16777216)fail();
 const matches=[...html.matchAll(/<script\b(?=[^>]*\bid="ytv-blog-publication")(?=[^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/g)];
 if(matches.length!==1)fail();let value;try{value=JSON.parse(matches[0][1]);}catch{fail();}return validatePublicBlogDelivery(value);
}
module.exports={validatePublicBlogDelivery,validatePublicBlogDocument,appendPublicBlogDelivery,serializePublicBlogDelivery,readPublicBlogMarker};
