'use strict';
const {performance}=require('node:perf_hooks');
const {ContractError}=require('./core.cjs');
const {controlSchemaFor}=require('./control-store.cjs');
const roles=Object.freeze({reader:'ytv_ai_reader',activator:'ytv_ai_activator',executor:'ytv_ai_executor'});
const fail=(code,message)=>{throw new ContractError(code,message);};
const identitySql="SELECT current_database() AS database_name,current_user AS role_name,session_user AS session_role,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,r.rolreplication,r.rolbypassrls,(SELECT count(*)::int FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS memberships FROM pg_catalog.pg_roles r WHERE r.rolname=current_user";

// The connection method is an original native capability, not a URL, pool
// configuration, serialized receipt, or a role name that can confer authority.
// Preparation never imports pg, discovers environment variables or opens a pool.
function createPostgresControlDatabase(options={}){
 const keys=['role','controlSchema','databaseName','connect','timeoutMs'];
 if(!options||Object.keys(options).some(k=>!keys.includes(k))||!Object.hasOwn(roles,options.role)
  ||options.controlSchema!=='ytv_ai_v1'||typeof options.databaseName!=='string'||!options.databaseName.trim()
  ||options.databaseName.length>128||typeof options.connect!=='function'||!Number.isSafeInteger(options.timeoutMs)
  ||options.timeoutMs<1||options.timeoutMs>30000)fail('configuration','Explicit operational database capability required');
 const role=options.role,controlSchema=controlSchemaFor(options),databaseName=options.databaseName,timeoutMs=options.timeoutMs;
 const connect=options.connect,expectedRole=roles[role];
 return Object.freeze({role,controlSchema,async transaction(work,{signal}={}){
  if(typeof work!=='function'||signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration','Bounded transaction callback required');
  if(signal?.aborted)fail('cancelled','Storage transaction was cancelled');
  const deadline=performance.now()+timeoutMs;
  let client,release,query,timer,retired=false,commitAttempted=false,committed=false,inTransaction=false,released=false;
  const check=()=>{if(retired||signal?.aborted)fail('cancelled','Storage transaction was retired');if(performance.now()>=deadline)fail('deadline','Storage transaction deadline exceeded');};
  const closeStream=()=>{try{client?.connection?.stream?.destroy?.();}catch{}};
  const destroy=()=>{if(release&&!released){released=true;try{release(true);}catch{closeStream();}}};
  let rejectRetired;
  const cancelled=new Promise((_,reject)=>{rejectRetired=reject;});void cancelled.catch(()=>{});
  const retire=code=>{retired=true;destroy();rejectRetired(new ContractError(commitAttempted?'uncertain':code,commitAttempted?'Commit acknowledgement is uncertain':'Storage transaction was retired'));};
  const abort=()=>retire('cancelled');
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>retire('deadline'),timeoutMs);
  const original=(async()=>{
   try{
    check();client=await connect({signal});
    if(!client||typeof client.query!=='function'||typeof client.release!=='function')fail('configuration','Original pooled PostgreSQL client required');
    release=client.release.bind(client);query=client.query.bind(client);
    if(retired||signal?.aborted||performance.now()>=deadline){destroy();check();}
    const stream=client.connection?.stream;
    if(stream?.encrypted!==true||stream.authorized!==true)fail('permissions','Verified native PostgreSQL TLS required');
    await query(role==='reader'?'BEGIN READ ONLY':'BEGIN READ WRITE');inTransaction=true;check();
    await query('SET LOCAL search_path=pg_catalog');check();
    await query('SET LOCAL statement_timeout='+timeoutMs);check();
    const result=await query(identitySql);check();
    const row=result?.rows?.[0];
    if(result?.rows?.length!==1||row.database_name!==databaseName||row.role_name!==expectedRole||row.session_role!==expectedRole
     ||row.rolsuper!==false||row.rolcreatedb!==false||row.rolcreaterole!==false||row.rolinherit!==false
     ||row.rolreplication!==false||row.rolbypassrls!==false||row.memberships!==0)fail('permissions','Native runtime role or database differs');
    const tx=Object.freeze({query:async(sql,args)=>{check();if(typeof sql!=='string'||args!==undefined&&!Array.isArray(args))fail('configuration','Explicit transaction query required');const value=await query(sql,args);check();return value.rows;}});
    const value=await work(tx);check();
    commitAttempted=true;await query('COMMIT');committed=true;inTransaction=false;return value;
   }catch(error){
    if(commitAttempted&&!committed)fail('uncertain','Commit acknowledgement is uncertain; retain original accounting and execution identity');
    if(inTransaction&&!retired){try{await query('ROLLBACK');inTransaction=false;}catch{destroy();}}
    throw error;
   }finally{if(release&&!released){released=true;try{release(retired||inTransaction);}catch{closeStream();}}}
  })();
  // A late connection is owned and reaped by the original continuation. It can
  // never run the callback after retirement or become a replacement capability.
  void original.catch(()=>{});
  try{return await Promise.race([original,cancelled]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }});
}
module.exports={createPostgresControlDatabase};
