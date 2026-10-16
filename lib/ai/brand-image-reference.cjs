'use strict';
const schema=Object.freeze({type:'object',properties:Object.freeze({kind:Object.freeze({type:'string',enum:Object.freeze(['brand-image-reference-v1'])}),url:Object.freeze({type:'string',minLength:1,maxLength:4096})}),required:Object.freeze(['kind','url']),additionalProperties:false});
function valid(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='kind,url'&&value.kind==='brand-image-reference-v1'&&typeof value.url==='string'&&value.url.length>0&&value.url.length<=4096;}
module.exports={schema,valid};
