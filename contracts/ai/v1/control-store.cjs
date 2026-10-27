'use strict';
const {createHash}=require('node:crypto');
const {ContractError,validateRequest,validateResult}=require('./core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
const immutable=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))immutable(child);}return value;};
// Only explicit isolated or operational namespaces are supported. Routing is
// not an activation, a grant, or authority to recover any previous execution.
const controlSchemas=Object.freeze(['ytv_ai_test_v1','ytv_ai_v1']);
function controlSchemaFor(database){
 const schema=database?.controlSchema??'ytv_ai_test_v1';
 if(!controlSchemas.includes(schema))fail('configuration','Unknown control storage schema');
 return schema;
}
function sqlForControlSchema(schema,sql){
 if(!controlSchemas.includes(schema)||typeof sql!=='string')fail('configuration','Explicit control SQL schema required');
 return sql.replaceAll('__ytv_control__',schema);
}
const headLock=tx=>tx.query("SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('__ytv_control__:active'))");
function createControlStore(database,registry,options={}){
 if(!['reader','activator','executor'].includes(database.role)||typeof database.transaction!=='function')fail('configuration','A role-bound database adapter is required');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='validateAdmission')||options.validateAdmission!==undefined&&typeof options.validateAdmission!=='function')fail('configuration','Original admission restriction required');
 const validateAdmission=options.validateAdmission;
 const restrict=(taskType,snapshot,budgetId,executor)=>{if(validateAdmission&&validateAdmission(immutable({taskType,snapshot,budgetId,executor}))!==true)fail('permissions','Admission is outside the configured operating scope');};
 const role=database.role,controlSchema=controlSchemaFor(database),originalTransaction=database.transaction.bind(database);
 database=Object.freeze({role,controlSchema,transaction:work=>originalTransaction(tx=>work(Object.freeze({query:(sql,args)=>tx.query(sqlForControlSchema(controlSchema,sql),args)})))});
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
   return database.transaction(async tx=>{await tx.query('INSERT INTO __ytv_control__.revisions(revision,contract_version,payload,actor) VALUES($1,$2,$3::jsonb,$4)',[config.revision,config.contractVersion,payload,actor]);return {revision:config.revision};});
  },
  async activate(revision,{expectedRevision=null,actor,reason}={}){
   requireRole('activator');if(typeof actor!=='string'||!actor.trim()||typeof reason!=='string'||!reason.trim())fail('permissions','Actor and reason required');
   return database.transaction(async tx=>{
    await headLock(tx);
    const candidate=(await tx.query('SELECT revision FROM __ytv_control__.revisions WHERE revision=$1',[revision]))[0];
    if(!candidate)fail('configuration','Candidate revision does not exist');
    const current=(await tx.query('SELECT revision FROM __ytv_control__.active_revision WHERE singleton=true'))[0]?.revision??null;
    if(current!==expectedRevision)fail('configuration','Active revision changed; preview again');
    await tx.query('INSERT INTO __ytv_control__.active_revision(singleton,revision) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision',[revision]);
    await tx.query('INSERT INTO __ytv_control__.switch_events(previous_revision,revision,actor,reason) VALUES($1,$2,$3,$4)',[current,revision,actor,reason]);
    return {previousRevision:current,revision};
   });
  },
  async active(){return database.transaction(async tx=>(await tx.query('SELECT r.payload FROM __ytv_control__.active_revision a JOIN __ytv_control__.revisions r ON r.revision=a.revision WHERE a.singleton=true'))[0]?.payload??null);},
  async revision(revision){if(typeof revision!=='string'||!revision.trim())fail('invalid_format','Revision identity required');return database.transaction(async tx=>(await tx.query('SELECT payload FROM __ytv_control__.revisions WHERE revision=$1',[revision]))[0]?.payload??null);},
  async metrics({from,to}={}){
   requireRole('reader');
   const start=new Date(from),end=new Date(to);
   if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end)fail('invalid_format','Valid metrics interval required');
   return database.transaction(async tx=>{
    const rows=await tx.query(`SELECT r.snapshot->>'providerId' AS provider_id,r.revision,r.task_type,r.agent_id,b.currency,
      count(*)::int AS run_count,
      count(*) FILTER (WHERE r.status='completed')::int AS completed_count,
      count(*) FILTER (WHERE r.status IN ('failed','refused','cancelled','incomplete'))::int AS noncompleted_count,
      count(*) FILTER (WHERE q.state<>'settled')::int AS unsettled_count,
      coalesce(sum(q.actual_micros),0)::text AS known_cost_micros,
      coalesce(sum(q.amount_micros) FILTER (WHERE q.state<>'settled'),0)::text AS retained_micros,
      coalesce(sum(CASE WHEN q.state='uncertain' AND jsonb_typeof(r.usage->'costMicros')='number' THEN (r.usage->>'costMicros')::numeric ELSE 0 END),0)::text AS reported_unsettled_cost_micros,
      count(*) FILTER (WHERE q.state<>'settled' AND jsonb_typeof(r.usage->'costMicros') IS DISTINCT FROM 'number')::int AS held_without_cost_count,
      count(*) FILTER (WHERE r.finished_at IS NOT NULL)::int AS latency_samples,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (r.finished_at-r.created_at))*1000) FILTER (WHERE r.finished_at IS NOT NULL) AS latency_p95_ms
     FROM __ytv_control__.runs r JOIN __ytv_control__.reservations q ON q.run_id=r.run_id
     JOIN __ytv_control__.budgets b ON b.budget_id=q.budget_id
     WHERE r.created_at >= $1 AND r.created_at < $2
     GROUP BY r.snapshot->>'providerId',r.revision,r.task_type,r.agent_id,b.currency
     ORDER BY r.revision,r.task_type,r.agent_id,r.snapshot->>'providerId',b.currency`,[start.toISOString(),end.toISOString()]);
    return rows.map(row=>Object.freeze({providerId:row.provider_id,revision:row.revision,taskType:row.task_type,agentId:row.agent_id,currency:row.currency,
     runs:row.run_count,completed:row.completed_count,noncompleted:row.noncompleted_count,unsettled:row.unsettled_count,
     knownCostMicros:row.known_cost_micros,retainedMicros:row.retained_micros,reportedUnsettledCostMicros:row.reported_unsettled_cost_micros,
     heldWithoutCostCount:row.held_without_cost_count,latencySamples:row.latency_samples,latencyP95Ms:row.latency_p95_ms===null?null:Number(row.latency_p95_ms)}));
   });
  },
  async admit(rawRequest,{runId,budgetId,agentId,principalId,executor='ai'}={}){
   requireRole('executor');if(!['ai','coding'].includes(executor))fail('configuration','Unknown executor');
   const request=executor==='coding'?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
   if(typeof runId!=='string'||!runId||typeof budgetId!=='string'||!budgetId)fail('invalid_format','Run and budget identity required');
   if(principalId!==undefined&&(typeof principalId!=='string'||!principalId.trim()))fail('permissions','Invalid principal scope');
   if(agentId!==undefined&&(typeof agentId!=='string'||!agentId.trim()))fail('invalid_format','Invalid agent identity');
   const {requestId,...operation}=request;
   const fingerprint=createHash('sha256').update(stable({operation,budgetId,agentId:agentId??null,principalId:principalId??null,executor})).digest('hex');
   return database.transaction(async tx=>{
    await headLock(tx);
    const matches=await tx.query('SELECT run_id,request_fingerprint,snapshot,status FROM __ytv_control__.runs WHERE request_id=$1 OR (task_type=$2 AND idempotency_key=$3)',[requestId,request.taskType,request.idempotencyKey??null]);
    if(matches.length>1)fail('invalid_format','Request and idempotency identities name different executions');
    const existing=matches[0];
    if(existing){
     if(existing.request_fingerprint!==fingerprint)fail('invalid_format','Idempotency identity reused for different input or principal');
     restrict(request.taskType,existing.snapshot,budgetId,executor);
     const saved=(await tx.query('SELECT o.payload,r.state FROM __ytv_control__.results o JOIN __ytv_control__.reservations r ON r.run_id=o.run_id WHERE o.run_id=$1',[existing.run_id]))[0];
     return {runId:existing.run_id,snapshot:immutable(existing.snapshot),status:existing.status,replay:true,...(saved?{result:immutable(saved.payload),accounting:{state:saved.state,replay:true}}:{})};
    }
    const cfg=(await tx.query('SELECT r.payload FROM __ytv_control__.active_revision a JOIN __ytv_control__.revisions r ON r.revision=a.revision WHERE a.singleton=true'))[0]?.payload;
    if(!cfg)fail('configuration','No active configuration');
    const snapshot=registry.resolve(cfg,request,{agentId,executor});
    // Narrow the selected snapshot while holding the original head lock and
    // before any reservation. A later profile change cannot bypass the pool.
    restrict(request.taskType,snapshot,budgetId,executor);
    const budget=(await tx.query('SELECT currency FROM __ytv_control__.budgets WHERE budget_id=$1',[budgetId]))[0];
    if(!budget||budget.currency!==request.budget.currency)fail('configuration','Budget group or currency mismatch');
    const reserved=await tx.query('UPDATE __ytv_control__.budgets SET reserved_micros=reserved_micros+$2 WHERE budget_id=$1 AND NOT blocked AND reserved_micros+settled_micros+$2<=limit_micros RETURNING budget_id',[budgetId,request.budget.maxCostMicros]);
    if(reserved.length!==1)fail('quota','Insufficient unreserved budget');
    await tx.query("INSERT INTO __ytv_control__.runs(run_id,request_id,task_type,idempotency_key,request_fingerprint,revision,snapshot,agent_id,status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'running')",[runId,requestId,request.taskType,request.idempotencyKey??null,fingerprint,cfg.revision,JSON.stringify(snapshot),agentId??null]);
    await tx.query("INSERT INTO __ytv_control__.reservations(run_id,budget_id,amount_micros,state) VALUES($1,$2,$3,'reserved')",[runId,budgetId,request.budget.maxCostMicros]);
    return {runId,snapshot,status:'running',replay:false};
   });
  },
  // A retained, settled result may be read without admitting or dispatching a
  // task. Absence and uncertainty never authorize a replacement execution.
  async retrieve(rawRequest,{runId,budgetId,agentId,principalId,executor='ai'}={}){
   requireRole('executor');
   if(executor!=='ai')fail('capability','Coding continuation requires its existing supervisor');
   const request=validateRequest(rawRequest);
   if(typeof runId!=='string'||!runId||typeof budgetId!=='string'||!budgetId
     ||typeof principalId!=='string'||!principalId.trim())fail('permissions','Authenticated result scope required');
   if(agentId!==undefined&&(typeof agentId!=='string'||!agentId.trim()))fail('invalid_format','Invalid agent identity');
   const {requestId,...operation}=request;
   const fingerprint=createHash('sha256').update(stable({operation,budgetId,agentId:agentId??null,principalId,executor})).digest('hex');
   return database.transaction(async tx=>{
    const matches=await tx.query(`SELECT r.run_id,r.request_fingerprint,r.snapshot,r.status,r.usage,
      o.payload,q.state,q.budget_id,q.actual_micros,b.currency
     FROM __ytv_control__.runs r
     LEFT JOIN __ytv_control__.results o ON o.run_id=r.run_id
     LEFT JOIN __ytv_control__.reservations q ON q.run_id=r.run_id
     LEFT JOIN __ytv_control__.budgets b ON b.budget_id=q.budget_id
     WHERE r.request_id=$1 OR (r.task_type=$2 AND r.idempotency_key=$3)`,[requestId,request.taskType,request.idempotencyKey??null]);
    if(matches.length>1)fail('invalid_format','Request and idempotency identities name different executions');
    const saved=matches[0];if(!saved)return null;
    if(saved.run_id!==runId||saved.request_fingerprint!==fingerprint||saved.budget_id!==budgetId)fail('invalid_format','Result differs from authenticated operation');
    if(!['completed','incomplete'].includes(saved.status)||saved.state!=='settled'||!saved.payload)return null;
    const result=saved.payload;
    const normalized=validateResult({status:result.status,text:result.text,data:result.data,sources:result.sources,
     usage:result.usage,error:result.error?{code:result.error.code,message:result.error.message}:null},request,saved.snapshot,runId);
    if(result.runId!==runId||result.requestId!==requestId||result.instructionsVersion!==request.instructionsVersion
      ||result.status!==saved.status||stable(result.usage)!==stable(saved.usage)
      ||!Number.isSafeInteger(result.usage?.costMicros)||result.usage.costMicros<0
      ||saved.actual_micros===null||saved.actual_micros===undefined
      ||Number(saved.actual_micros)!==result.usage.costMicros||result.usage.currency!==saved.currency
      ||!Number.isSafeInteger(result.usage?.outputTokens)||result.usage.outputTokens<0
      ||stable(normalized)!==stable(result))fail('uncertain','Retained result unavailable');
    return {runId,snapshot:immutable(saved.snapshot),status:saved.status,replay:true,
     result:immutable(result),accounting:{state:'settled',replay:true}};
   });
  },
  async claimDispatch(rawRequest,{runId,budgetId,agentId,principalId,executor='ai',dispatchDigest}={}){
   requireRole('executor');
   if(!['ai','coding'].includes(executor)||typeof dispatchDigest!=='string'||!/^[a-f0-9]{64}$/.test(dispatchDigest)||typeof runId!=='string'||!runId||typeof budgetId!=='string'||!budgetId)fail('invalid_format','Pinned dispatch identity required');
   const request=executor==='coding'?require('./coding.cjs').validateCodingRequest(rawRequest):validateRequest(rawRequest);
   const {requestId,...operation}=request;
   const fingerprint=createHash('sha256').update(stable({operation,budgetId,agentId:agentId??null,principalId:principalId??null,executor})).digest('hex');
   return database.transaction(async tx=>{
    // Same lock order as reconciliation; no new reservation or approval ledger.
    const reservation=(await tx.query('SELECT * FROM __ytv_control__.reservations WHERE run_id=$1 FOR UPDATE',[runId]))[0];
    if(!reservation||reservation.budget_id!==budgetId||reservation.state!=='reserved')fail('permissions','Active reservation required');
    const run=(await tx.query("SELECT *,floor(extract(epoch FROM (created_at + ($2 * interval '1 millisecond') - clock_timestamp())) * 1000)::double precision AS remaining_ms FROM __ytv_control__.runs WHERE run_id=$1 FOR UPDATE",[runId,request.budget.deadlineMs]))[0];
    if(!run||run.request_id!==requestId||run.request_fingerprint!==fingerprint||run.status!=='running')fail('permissions','Dispatch differs from admitted execution');
    restrict(request.taskType,run.snapshot,budgetId,executor);
    if(run.dispatch_digest!==null)fail('uncertain','Dispatch already claimed; reconcile instead of retrying');
    if(run.remaining_ms<=0)fail('deadline','Admitted execution deadline elapsed');
    const budget=(await tx.query('SELECT blocked FROM __ytv_control__.budgets WHERE budget_id=$1 FOR UPDATE',[budgetId]))[0];
    if(!budget||budget.blocked)fail('quota','Budget group is blocked');
    const claimed=(await tx.query("UPDATE __ytv_control__.runs SET dispatch_digest=$2,dispatched_at=clock_timestamp() WHERE run_id=$1 RETURNING floor(extract(epoch FROM (created_at + ($3 * interval '1 millisecond') - clock_timestamp())) * 1000)::double precision AS remaining_ms",[runId,dispatchDigest,request.budget.deadlineMs]))[0];
    if(!claimed||claimed.remaining_ms<=0)fail('deadline','Deadline elapsed while claiming dispatch');
    return {runId,snapshot:immutable(run.snapshot),dispatchDigest,remainingDeadlineMs:claimed.remaining_ms};
   });
  },
  async reconcile(runId,{status,usage,result}={}){
   requireRole('executor');
   if(!['completed','incomplete','refused','failed','cancelled','uncertain'].includes(status))fail('invalid_format','Invalid terminal status');
   const cost=usage?.costMicros??null;
   if(cost!==null&&(!Number.isSafeInteger(cost)||cost<0||typeof usage?.priceVersion!=='string'||!usage.priceVersion))fail('invalid_format','Cost requires valid amount and tariff revision');
   return database.transaction(async tx=>{
    const reservation=(await tx.query('SELECT * FROM __ytv_control__.reservations WHERE run_id=$1 FOR UPDATE',[runId]))[0];
    if(!reservation)fail('configuration','Unknown reservation');
    if(result!==undefined){
     const run=(await tx.query('SELECT request_id,snapshot FROM __ytv_control__.runs WHERE run_id=$1',[runId]))[0];
     if(!result||result.runId!==runId||result.requestId!==run.request_id||result.contractVersion!=='1.0'||!['completed','incomplete','refused','failed','cancelled'].includes(result.status)||result.status!==status&&!(status==='uncertain'&&result.error?.code==='uncertain')||stable(result.usage)!==stable(usage))fail('invalid_format','Result does not match reconciliation');
     for(const key of ['providerId','model','adapterVersion','configRevision'])if(result[key]!==run.snapshot[key])fail('invalid_format','Result does not match pinned configuration');
     const prior=(await tx.query('SELECT payload FROM __ytv_control__.results WHERE run_id=$1',[runId]))[0];
     if(prior&&stable(prior.payload)!==stable(result))fail('uncertain','Stored output is immutable');
     if(!prior)await tx.query('INSERT INTO __ytv_control__.results(run_id,payload) VALUES($1,$2::jsonb)',[runId,JSON.stringify(result)]);
    }
    const budget=(await tx.query('SELECT currency FROM __ytv_control__.budgets WHERE budget_id=$1',[reservation.budget_id]))[0];
    if(cost!==null&&usage.currency!==budget.currency)fail('invalid_format','Cost currency differs from reserved currency');
    if(reservation.state==='settled'){
     if(Number(reservation.actual_micros)!==cost)fail('uncertain','Conflicting repeated reconciliation');
     const prior=(await tx.query('SELECT status,usage FROM __ytv_control__.runs WHERE run_id=$1',[runId]))[0];
     if(prior.status!==status||stable(prior.usage)!==stable(usage))fail('uncertain','Repeated reconciliation changes outcome or usage evidence');
     return {state:'settled',replay:true};
    }
    const amount=Number(reservation.amount_micros);
    if(cost===null||cost>amount||status==='uncertain'){
     if(cost!==null&&cost>amount)await tx.query('UPDATE __ytv_control__.budgets SET blocked=true WHERE budget_id=$1',[reservation.budget_id]);
     await tx.query("UPDATE __ytv_control__.reservations SET state='uncertain' WHERE run_id=$1",[runId]);
     await tx.query("UPDATE __ytv_control__.runs SET status=$2,usage=$3::jsonb,finished_at=CASE WHEN $2='uncertain' THEN NULL ELSE now() END WHERE run_id=$1",[runId,status,JSON.stringify(usage??null)]);
     return {state:'uncertain',retainedMicros:amount};
    }
    await tx.query('UPDATE __ytv_control__.budgets SET reserved_micros=reserved_micros-$2,settled_micros=settled_micros+$3 WHERE budget_id=$1',[reservation.budget_id,amount,cost]);
    await tx.query("UPDATE __ytv_control__.reservations SET state='settled',actual_micros=$2 WHERE run_id=$1",[runId,cost]);
    await tx.query('UPDATE __ytv_control__.runs SET status=$2,usage=$3::jsonb,finished_at=now() WHERE run_id=$1',[runId,status,JSON.stringify(usage)]);
    return {state:'settled',replay:false};
   });
  },
 });
}
module.exports={createControlStore,controlSchemaFor,sqlForControlSchema};
