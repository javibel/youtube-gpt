'use strict';
// Original host registration only. Never populated from flags or HTTP JSON.
let service;
function installObserverChannel(original){
 if(service||!original||['create','status','cancel','claim','result'].some(k=>typeof original[k]!=='function'))throw Error('Original observer channel already installed or incomplete');
 service=Object.freeze(Object.fromEntries(['create','status','cancel','claim','result',...(typeof original.observe==='function'?['observe']:[])].map(k=>[k,original[k].bind(original)])));
}
module.exports={installObserverChannel,getObserverChannel:()=>service};
