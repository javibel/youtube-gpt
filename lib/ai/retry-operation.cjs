'use strict';
// One visible interaction: retain its identity after an uncertain response.
// This is an in-memory browser controller, not persistence across page reloads.
function createRetryOperation(newKey){
 if(typeof newKey!=='function')throw Error('Operation identity factory required');
 let pending;
 return function run(payload,send){
  const body=JSON.stringify(payload);
  if(pending?.flight){if(pending.body!==body)return Promise.reject(Error('Another operation is in progress'));return pending.flight;}
  if(!pending||pending.body!==body){const key=newKey();if(typeof key!=='string'||!/^[-A-Za-z0-9._:]{1,128}$/.test(key))return Promise.reject(Error('Invalid operation identity'));pending={body,key};}
  const operation=pending;
  operation.flight=Promise.resolve().then(()=>send(operation.body,operation.key)).then(result=>{if(pending===operation)pending=undefined;return result;}).finally(()=>{operation.flight=undefined;});
  return operation.flight;
 };
}
module.exports={createRetryOperation};
