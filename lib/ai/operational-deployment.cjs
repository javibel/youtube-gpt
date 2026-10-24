'use strict';
const {createRoleConnectionOwner}=require('../../contracts/ai/v1/postgres-connections.cjs');
const {createOperationalWebComposition}=require('./operational-composition.cjs');
function nativePool(options){const {Pool}=require('pg');const pool=new Pool(options);pool.on('error',()=>{});return pool;}

// Trusted deployment code supplies credential readers, real adapters and native
// session/budget authorization. No environment lookup or model default exists.
function createOperationalWebDeployment(options={}){
 if(!options||Object.keys(options).some(key=>!['database','runtime'].includes(key)))throw Error('Explicit original web deployment required');
 const owner=createRoleConnectionOwner({...options.database,surface:'web',createPool:nativePool});
 let bound,original,originalSignal,stopped=false;
 const connect=role=>async context=>{if(!bound||stopped)throw Error('Original web role connections unavailable');return bound.connections[role](context);};
 const composition=createOperationalWebComposition({...options.runtime,connections:{reader:connect('reader'),activator:connect('activator'),executor:connect('executor')},databaseName:options.database.databaseName,timeoutMs:options.database.timeoutMs});
 const assertOpen=()=>{if(stopped)throw Error('Web deployment is retired');};
 return Object.freeze({dependencies:composition.dependencies,assertOpen,prepare({signal}={}){
  if(original){if(signal!==originalSignal)throw Error('Web deployment already has an original waiter');return original;}
  originalSignal=signal;original=Promise.resolve().then(async()=>{if(stopped)throw Error('Web deployment is retired');bound=await owner.prepare({signal});if(stopped)throw Error('Web deployment is retired');return composition.prepare({signal});});void original.catch(()=>{void owner.close();});return original;
 },close(){stopped=true;return owner.close();}});
}
module.exports={createOperationalWebDeployment};
