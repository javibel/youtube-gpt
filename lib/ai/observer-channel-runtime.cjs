'use strict';
// One immutable original service shared by independent Node/Next bundles.
// The registry publishes existing capabilities; data never creates an owner.
const {types}=require('node:util');
const key=Symbol.for('ytubviral.ai.observer-channel.v1'),server=globalThis;
const required=['create','status','cancel','claim','result'];
const fail=()=>{throw Error('Original observer channel registration unconfirmed');};
function methods(original){
 if(!original||typeof original!=='object'||Array.isArray(original)||types.isProxy(original))fail();
 const d=Object.getOwnPropertyDescriptors(original),names=[...required,...(Object.hasOwn(d,'observe')?['observe']:[])];
 if(names.some(k=>!d[k]||!Object.hasOwn(d[k],'value')||typeof d[k].value!=='function'||types.isProxy(d[k].value)))fail();
 return {d,names};
}
function installObserverChannel(original){
 if(Object.getOwnPropertyDescriptor(server,key))fail();
 const {d,names}=methods(original),service=Object.freeze(Object.fromEntries(names.map(k=>[k,Function.prototype.bind.call(d[k].value,original)])));
 Object.defineProperty(server,key,{value:Object.freeze({service}),writable:false,configurable:false});
}
function getObserverChannel(){
 const descriptor=Object.getOwnPropertyDescriptor(server,key);if(!descriptor)return undefined;
 if(!Object.hasOwn(descriptor,'value')||descriptor.writable!==false||descriptor.configurable!==false)fail();
 const holder=descriptor.value;if(!holder||typeof holder!=='object'||types.isProxy(holder)||!Object.isFrozen(holder))fail();
 const h=Object.getOwnPropertyDescriptors(holder);if(Reflect.ownKeys(h).join()!=='service'||!Object.hasOwn(h.service,'value'))fail();
 const service=h.service.value;methods(service);if(!Object.isFrozen(service))fail();return service;
}
module.exports={installObserverChannel,getObserverChannel};
