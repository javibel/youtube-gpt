'use strict';
const {createHash}=require('node:crypto');
const {ContractError,validateRequest}=require('./core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
const immutable=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))immutable(child);}return value;};
const headLock=tx=>tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('ytv_ai_test_v1:active'))");
function createControlStore(database,registry){
 if(!['reader','activator','executor'].includes(database.role)||typeof database.transaction!=='function')fail('configuration','A role-bound database adapter is required');
 const role=database.role;
 const requireRole=expected=>{if(role!==expected)fail('permissions','Operation not granted to this runtime role');};
 return Object.freeze({
  async publish(config,{actor}={}){
   requireRole('activator');if(typeof actor!=='string'||!actor.trim())fail('permissions','Activation actor required');
   // Validate every explicit assignment, including inactive profiles, without execution.
   if(!config?.profiles||typeof config.profiles!=='object'||Array.isArray(config.profiles)||Object.keys(config.profiles).length===0||!Object.hasOwn(config.profiles,config.activeProfile))fail('configuration','Profiles and a valid active profile required');
   for(const [profile,tasks]of Object.entries(config.profiles)){
    if(!tasks||typeof tasks!=='object'||Object.keys(tasks).length===0)fail('configuration','Profiles cannot be empty');
    for(const taskType of Object.keys(tasks)){
     try{registry.resolve({...config,exceptions:[],activeProfile:profile},{taskType,requiredCapabilities:[]});}
     catch(error){if(error.code!=='capability')throw error;registry.resolve({...config,exceptions:[],activeProfile:profile},{taskType,requiredCapabilities:[]},{executor:'coding'});}
    }
   }
   if(!Array.isArray(config.exceptions))fail('configuration','Explicit exceptions required');
   for(const exception of config.exceptions){
    if(!exception||!['task','agent'].includes(exception.scope))fail('configuration','Unknown exception scope');
    const candidate={...config,exceptions:[{...exception,scope:'task'}]};
    try{registry.resolve(candidate,{taskType:exception.id,requiredCapabilities:[]});}
    catch(error){if(error.code!=='capability')throw error;registry.resolve(candidate,{taskType:exception.id,requiredCapabilities:[]},{executor:'coding'});}
   }
   const payload=JSON.stringify(config);
   return database.transaction(async tx=>{await tx.query('INSERT INTO ytv_ai_test_v1.revisions(revision,contract_version,payload,actor) VALUES($1,$2,$3::jsonb,$4)',[config.revision,config.contractVersion,payload,actor]);return {revision:config.revision};});
  },
  async activate(revision,{expectedRevision=null,actor,reason}={}){
   requireRole('activator');if(typeof actor!=='string'||!actor.trim()||typeof reason!=='string'||!reason.trim())fail('permissions','Actor and reason required');
   return database.transaction(async tx=>{
    await headLock(tx);
    const candidate=(await tx.query('SELECT revision FROM ytv_ai_test_v1.revisions WHERE revision=$1',[revision]))[0];
    if(!candidate)fail('configuration','Candidate revision does not exist');
    const current=(await tx.query('SELECT revision FROM ytv_ai_test_v1.active_revision WHERE singleton=true'))[0]?.revision??null;
    if(current!==expectedRevision)fail('configuration','Active revision changed; preview again');
    await tx.query('INSERT INTO ytv_ai_test_v1.active_revision(singleton,revision) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision',[revision]);
    await tx.query('INSERT INTO ytv_ai_test_v1.switch_events(previous_revision,revision,actor,reason) VALUES($1,$2,$3,$4)',[current,revision,actor,reason]);
    return {previousRevision:current,revision};
   });
  },
  async active(){return database.transaction(async tx=>(await tx.query('SELECT r.payload FROM ytv_ai_test_v1.active_revision a JOIN ytv_ai_test_v1.revisions r ON r.revision=a.revision WHERE a.singleton=true'))[0]?.payload??null);},
  async admit(rawRequest,{runId,budgetId,agentId,executor='ai'}={}){
   requireRole('executor');if(!['ai','coding'].includes(executor))fail('configuration','Unknown executor');
   const request=executor==='coding'?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
   if(typeof runId!=='string'||!runId||typeof budgetId!=='string'||!budgetId)fail('invalid_format','Run and budget identity required');
   const {requestId,...operation}=request;
   const fingerprint=createHash('sha256').update(stable({operation,budgetId,agentId:agentId??null,executor})).digest('hex');
   return database.transaction(async tx=>{
    await headLock(tx);
    const matches=await tx.query('SELECT run_id,request_fingerprint,snapshot,status FROM ytv_ai_test_v1.runs WHERE request_id=$1 OR (task_type=$2 AND idempotency_key=$3)',[requestId,request.taskType,request.idempotencyKey??null]);
    if(matches.length>1)fail('invalid_format','Request and idempotency identities name different executions');
    const existing=matches[0];
    if(existing){if(existing.request_fingerprint!==fingerprint)fail('invalid_format','Idempotency identity reused for different input');return {runId:existing.run_id,snapshot:immutable(existing.snapshot),status:existing.status,replay:true};}
    const cfg=(await tx.query('SELECT r.payload FROM ytv_ai_test_v1.active_revision a JOIN ytv_ai_test_v1.revisions r ON r.revision=a.revision WHERE a.singleton=true'))[0]?.payload;
    if(!cfg)fail('configuration','No active configuration');
    const snapshot=registry.resolve(cfg,request,{agentId,executor});
    const budget=(await tx.query('SELECT currency FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[budgetId]))[0];
    if(!budget||budget.currency!==request.budget.currency)fail('configuration','Budget group or currency mismatch');
    const reserved=await tx.query('UPDATE ytv_ai_test_v1.budgets SET reserved_micros=reserved_micros+$2 WHERE budget_id=$1 AND NOT blocked AND reserved_micros+settled_micros+$2<=limit_micros RETURNING budget_id',[budgetId,request.budget.maxCostMicros]);
    if(reserved.length!==1)fail('quota','Insufficient unreserved budget');
    await tx.query("INSERT INTO ytv_ai_test_v1.runs(run_id,request_id,task_type,idempotency_key,request_fingerprint,revision,snapshot,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'running')",[runId,requestId,request.taskType,request.idempotencyKey??null,fingerprint,cfg.revision,JSON.stringify(snapshot)]);
    await tx.query("INSERT INTO ytv_ai_test_v1.reservations(run_id,budget_id,amount_micros,state) VALUES($1,$2,$3,'reserved')",[runId,budgetId,request.budget.maxCostMicros]);
    return {runId,snapshot,status:'running',replay:false};
   });
  },
  async reconcile(runId,{status,usage}={}){
   requireRole('executor');
   if(!['completed','incomplete','refused','failed','cancelled','uncertain'].includes(status))fail('invalid_format','Invalid terminal status');
   const cost=usage?.costMicros??null;
   if(cost!==null&&(!Number.isSafeInteger(cost)||cost<0||typeof usage?.priceVersion!=='string'||!usage.priceVersion))fail('invalid_format','Cost requires valid amount and tariff revision');
   return database.transaction(async tx=>{
    const reservation=(await tx.query('SELECT * FROM ytv_ai_test_v1.reservations WHERE run_id=$1 FOR UPDATE',[runId]))[0];
    if(!reservation)fail('configuration','Unknown reservation');
    const budget=(await tx.query('SELECT currency FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[reservation.budget_id]))[0];
    if(cost!==null&&usage.currency!==budget.currency)fail('invalid_format','Cost currency differs from reserved currency');
    if(reservation.state==='settled'){
     if(Number(reservation.actual_micros)!==cost)fail('uncertain','Conflicting repeated reconciliation');
     const prior=(await tx.query('SELECT status,usage FROM ytv_ai_test_v1.runs WHERE run_id=$1',[runId]))[0];
     if(prior.status!==status||prior.usage?.currency!==usage.currency||prior.usage?.priceVersion!==usage.priceVersion)fail('uncertain','Repeated reconciliation changes outcome or price provenance');
     return {state:'settled',replay:true};
    }
    const amount=Number(reservation.amount_micros);
    if(cost===null||cost>amount||status==='uncertain'){
     if(cost!==null&&cost>amount)await tx.query('UPDATE ytv_ai_test_v1.budgets SET blocked=true WHERE budget_id=$1',[reservation.budget_id]);
     await tx.query("UPDATE ytv_ai_test_v1.reservations SET state='uncertain' WHERE run_id=$1",[runId]);
     await tx.query("UPDATE ytv_ai_test_v1.runs SET status=$2,usage=$3::jsonb,finished_at=CASE WHEN $2='uncertain' THEN NULL ELSE now() END WHERE run_id=$1",[runId,status,JSON.stringify(usage??null)]);
     return {state:'uncertain',retainedMicros:amount};
    }
    await tx.query('UPDATE ytv_ai_test_v1.budgets SET reserved_micros=reserved_micros-$2,settled_micros=settled_micros+$3 WHERE budget_id=$1',[reservation.budget_id,amount,cost]);
    await tx.query("UPDATE ytv_ai_test_v1.reservations SET state='settled',actual_micros=$2 WHERE run_id=$1",[runId,cost]);
    await tx.query('UPDATE ytv_ai_test_v1.runs SET status=$2,usage=$3::jsonb,finished_at=now() WHERE run_id=$1',[runId,status,JSON.stringify(usage)]);
    return {state:'settled',replay:false};
   });
  },
 });
}
module.exports={createControlStore};
