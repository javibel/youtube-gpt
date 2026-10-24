'use strict';
const {createPostgresControlDatabase}=require('./postgres-storage.cjs');
const {ContractError}=require('./core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const names=Object.freeze({reader:'ytv_ai_reader',activator:'ytv_ai_activator',executor:'ytv_ai_executor'});

// Fresh deployment connection owner. Passwords come from the original secret
// reader and never leave this closure. Serialized receipts/flags do not create
// a pool, recover an execution, select another account, or replace a role.
function createRoleConnectionOwner(options={}){
 const keys=['surface','host','port','databaseName','getPassword','createPool','timeoutMs','maxConnections'];
 if(!options||Object.keys(options).some(key=>!keys.includes(key))||!['web','agent'].includes(options.surface)
  ||typeof options.host!=='string'||!/^[A-Za-z0-9.-]{1,253}$/.test(options.host)
  ||!Number.isSafeInteger(options.port)||options.port<1||options.port>65535
  ||typeof options.databaseName!=='string'||!options.databaseName.trim()||options.databaseName.length>128
  ||typeof options.getPassword!=='function'||typeof options.createPool!=='function'
  ||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000
  ||!Number.isSafeInteger(options.maxConnections)||options.maxConnections<1||options.maxConnections>10)fail('configuration','Explicit native role connection owner required');
 const {host,port,databaseName,timeoutMs,maxConnections,surface}=options,getPassword=options.getPassword,createPool=options.createPool;
 const roles=surface==='web'?['reader','activator','executor']:['reader','executor'];
 const owners=[],connections={},shutdown=new AbortController();
 let original,originalSignal,closed=false,close;
 const stop=()=>{closed=true;shutdown.abort();return close??=Promise.allSettled(owners.map(owner=>Promise.resolve().then(owner.end))).then(results=>Object.freeze({closed:results.every(result=>result.status==='fulfilled'),poolCount:owners.length}));};
 const check=signal=>{if(closed||signal?.aborted)fail('cancelled','Original connection owner is retired');};
 return Object.freeze({
  prepare({signal}={}){
   if(signal!==undefined&&!(signal instanceof AbortSignal))fail('configuration','Original connection owner signal required');
   if(original){if(signal!==originalSignal)fail('permissions','Connection owner already has an original waiter');return original;}
   originalSignal=signal;
   original=Promise.resolve().then(async()=>{
    let timer,rejectDeadline;const expired=new Promise((_,reject)=>{rejectDeadline=reject;});void expired.catch(()=>{});
    const ownedSignal=signal?AbortSignal.any([signal,shutdown.signal]):shutdown.signal;
    const abort=()=>rejectDeadline(new ContractError('cancelled','Original connection preparation cancelled'));
    ownedSignal.addEventListener('abort',abort,{once:true});
    const work=async()=>{
     for(const role of roles){
      check(ownedSignal);const password=await getPassword({surface,role,user:names[role],signal:ownedSignal});check(ownedSignal);
      if(typeof password!=='string'||!password.length||password.length>16384||password.includes('\0'))fail('credentials','Native role credential unavailable');
      const pool=createPool({host,port,database:databaseName,user:names[role],password,ssl:{rejectUnauthorized:true},max:maxConnections,connectionTimeoutMillis:timeoutMs,idleTimeoutMillis:10000,allowExitOnIdle:true});
      if(typeof pool?.connect!=='function'||typeof pool.end!=='function')fail('configuration','Original native PostgreSQL pool required');
      const connect=pool.connect.bind(pool),end=pool.end.bind(pool);owners.push({end});
      connections[role]=async({signal:transactionSignal}={})=>{check(transactionSignal);const client=await connect();if(closed||transactionSignal?.aborted){try{client.release(true);}catch{}fail('cancelled','Late native client belongs to a retired connection owner');}return client;};
     }
     check(ownedSignal);
     // Native TLS, session_user, role flags and database identity are checked
     // before these original connections can be given to either runtime.
     for(const role of roles)await createPostgresControlDatabase({role,connect:connections[role],controlSchema:'ytv_ai_v1',databaseName,timeoutMs}).transaction(tx=>tx.query('SELECT 1'),{signal:ownedSignal});
     check(ownedSignal);return Object.freeze({databaseName,connections:Object.freeze(connections),surface});
    };
    try{check(ownedSignal);timer=setTimeout(()=>{rejectDeadline(new ContractError('deadline','Original connection preparation deadline exceeded'));void stop();},timeoutMs);return await Promise.race([work(),expired]);}
    catch(error){void stop();throw error;}
    finally{clearTimeout(timer);ownedSignal.removeEventListener('abort',abort);}
   });return original;
  },
  close:stop,
 });
}
module.exports={createRoleConnectionOwner};
