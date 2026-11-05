'use strict';
const {createHash}=require('node:crypto');
const {ContractError}=require('./core.cjs');
const fail=(code,message)=>{throw new ContractError(code,message);};
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
const guards=Object.freeze([
 Object.freeze({name:'ytv_operating_model_budget_row_v1',table:'budgets',fn:'guard_operating_model_budget_row_v1',type:23,columns:[],digest:'1f0f54199dade13a04704132e85b9a3c76eb1170800477f7af16e2eeec7549cd'}),
 Object.freeze({name:'ytv_operating_model_reservation_v1',table:'reservations',fn:'guard_operating_model_reservation_v1',type:23,columns:[],digest:'2637dbb3ad6ba2901e87423e88077e2ec6c632de9f495a031ebc29535f9a3855'}),
 Object.freeze({name:'ytv_operating_model_dispatch_v1',table:'runs',fn:'guard_operating_model_dispatch_v1',type:19,columns:['created_at','dispatch_digest','dispatched_at'],digest:'894409723564ba512c4e4a0c76cffe46d034533d6c7be110a2f5f182b3821ab5'})
]);
const inspectionSql=`SELECT current_user AS role_name,to_char(clock_timestamp() AT TIME ZONE 'Europe/Madrid','YYYY-MM') AS native_month,
 has_table_privilege(current_user,'ytv_ai_v1.operating_model_budget_status_v1','SELECT') AS status_read,
 has_any_column_privilege(current_user,'ytv_ai_v1.operating_model_budget_status_v1','INSERT,UPDATE') OR has_table_privilege(current_user,'ytv_ai_v1.operating_model_budget_status_v1','DELETE') AS status_write,
 (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'table',c.relname,'fn',p.proname,'functionSchema',pn.nspname,'type',t.tgtype::int,'enabled',t.tgenabled,'internal',t.tgisinternal,'conditional',t.tgqual IS NOT NULL,'deferrable',t.tgdeferrable,'securityDefiner',p.prosecdef,'config',p.proconfig,'args',p.pronargs,'returnsTrigger',p.prorettype='trigger'::regtype,'language',l.lanname,'body',p.prosrc,'columns',ARRAY(SELECT a.attname FROM unnest(t.tgattr) WITH ORDINALITY chosen(attnum,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=chosen.attnum ORDER BY chosen.ord))) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE n.nspname='ytv_ai_v1' AND t.tgname=ANY($1::text[])) AS guards`;
const statusSql='SELECT budget_id,currency,limit_micros,reserved_micros,settled_micros,blocked,encumbered_micros,alert_at_24_usd,settled_at_24_usd FROM ytv_ai_v1.operating_model_budget_status_v1 WHERE budget_id=$1';

// Configuration data narrows an existing original authorization. It never
// creates a budget, supplies credentials, grants work or changes a model.
function captureOperatingBudget(policy,bindings,policies){
 const keys=['budgetId','currency','monthlyLimitMicros','dailyLimitMicros','alertAtMonthlyMicros','timezone'];
 if(!record(policy)||Object.keys(policy).sort().join(',')!==[...keys].sort().join(',')
  ||Object.values(Object.getOwnPropertyDescriptors(policy)).some(d=>!Object.hasOwn(d,'value'))
  ||typeof policy.budgetId!=='string'||!/^ytv-operating-models:[0-9]{4}-(0[1-9]|1[0-2])$/.test(policy.budgetId)
  ||policy.currency!=='USD'||policy.monthlyLimitMicros!==30000000||policy.dailyLimitMicros!==3000000
  ||policy.alertAtMonthlyMicros!==24000000||policy.timezone!=='Europe/Madrid'||!record(bindings)||!record(policies))fail('configuration','Explicit approved operating budget required');
 const captured=Object.freeze({...policy}),tasks=[];
 for(const [task,ids]of Object.entries(bindings)){
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))fail('configuration','Explicit operating task budgets required');
  if(ids.some(id=>id.startsWith('ytv-operating-models:'))){
   if(ids.length!==1||ids[0]!==captured.budgetId||policies[task]?.budget?.currency!=='USD'
    ||count(policies[task]?.budget?.maxCostMicros)===null||policies[task].budget.maxCostMicros>captured.dailyLimitMicros)fail('configuration','Operating task budget differs from the shared approved pool');
   tasks.push(task);
  }
 }
 if(!tasks.length)fail('configuration','Operating model task coverage is empty');
 const bound=new Set(tasks);Object.freeze(tasks);
 return Object.freeze({policy:captured,taskTypes:tasks,async requestMaximum(tx,scope){
  const keys=['runId','requestId','taskType','budgetId','maximumCostMicros','currency'];
  if(!record(scope)||Object.keys(scope).sort().join(',')!==keys.sort().join(',')||typeof tx?.query!=='function'||!bound.has(scope.taskType)||scope.budgetId!==captured.budgetId||scope.currency!=='USD'||!['runId','requestId'].every(k=>typeof scope[k]==='string'&&/^[-A-Za-z0-9._:]{1,128}$/.test(scope[k]))||count(scope.maximumCostMicros)===null||scope.maximumCostMicros>captured.dailyLimitMicros)fail('permissions','Original operating request scope required');
  // This read ONLY narrows an existing original request ceiling. The original
  // admission transaction/unchanged DB guards remain the reservation authority.
  // A repeated operation keeps its original ceiling/fingerprint even after
  // settlement or a native day change; no run is adopted or redispatched here.
  const previous=await tx.query('SELECT r.run_id,r.request_id,r.task_type,q.budget_id,q.amount_micros FROM ytv_ai_v1.runs r LEFT JOIN ytv_ai_v1.reservations q USING(run_id) WHERE r.run_id=$1 OR r.request_id=$2 LIMIT 2',[scope.runId,scope.requestId]);
  if(previous.length){const p=previous[0],amount=count(p.amount_micros);if(previous.length!==1||p.run_id!==scope.runId||p.request_id!==scope.requestId||p.task_type!==scope.taskType||p.budget_id!==captured.budgetId||amount===null||amount>scope.maximumCostMicros)fail('uncertain','Original operating request ceiling unavailable');return amount;}
  const rows=await tx.query("WITH d AS (SELECT clock_timestamp() AS instant), w AS (SELECT instant,date_trunc('day',instant AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid' AS begin_at,(date_trunc('day',instant AT TIME ZONE 'Europe/Madrid')+interval '1 day') AT TIME ZONE 'Europe/Madrid' AS end_at FROM d) SELECT b.budget_id,b.currency,b.limit_micros,b.reserved_micros,b.settled_micros,b.blocked,to_char(w.instant AT TIME ZONE 'Europe/Madrid','YYYY-MM') AS native_month,(SELECT coalesce(sum(CASE WHEN q.state='settled' THEN q.actual_micros ELSE q.amount_micros END),0) FROM ytv_ai_v1.reservations q JOIN ytv_ai_v1.runs r USING(run_id) WHERE q.budget_id=b.budget_id AND r.created_at>=w.begin_at AND r.created_at<w.end_at) AS daily_encumbered_micros FROM ytv_ai_v1.budgets b CROSS JOIN w WHERE b.budget_id=$1",[captured.budgetId]);
  const b=rows[0],limit=count(b?.limit_micros),reserved=count(b?.reserved_micros),settled=count(b?.settled_micros),daily=count(b?.daily_encumbered_micros);
  if(rows.length!==1||b.budget_id!==captured.budgetId||b.currency!=='USD'||b.blocked!==false||captured.budgetId!=='ytv-operating-models:'+b.native_month||limit===null||limit>captured.monthlyLimitMicros||reserved===null||settled===null||reserved+settled>limit||daily===null||daily>captured.dailyLimitMicros)fail('quota','Native operating headroom unavailable');
  const maximum=Math.min(scope.maximumCostMicros,limit-reserved-settled,captured.dailyLimitMicros-daily);if(maximum<=0)fail('quota','Native operating headroom exhausted');return maximum;
 },validateAdmission({taskType,snapshot,budgetId}={}){
  if(typeof taskType!=='string'||!record(snapshot)||typeof snapshot.providerId!=='string'||typeof budgetId!=='string')fail('permissions','Resolved operating admission required');
  const modelProvider=['anthropic','openai'].includes(snapshot.providerId);
  if(modelProvider?(!bound.has(taskType)||budgetId!==captured.budgetId):(bound.has(taskType)||budgetId.startsWith('ytv-operating-models:')))fail('permissions','Resolved admission differs from the approved model pool');
  return true;
 },verifyAssignments(assignments){
  if(!Array.isArray(assignments)||!assignments.length)fail('configuration','Resolved operating model assignments required');
  const seen=new Set();
  for(const a of assignments){if(!record(a)||typeof a.taskType!=='string'||typeof a.providerId!=='string')fail('configuration','Resolved operating model assignment is invalid');
   const modelProvider=['anthropic','openai'].includes(a.providerId);
   if(modelProvider!==bound.has(a.taskType))fail('permissions','Every Anthropic/OpenAI assignment must use the one approved pool; other providers remain separately budgeted');
   if(modelProvider)seen.add(a.taskType);
  }
  if(tasks.some(task=>!seen.has(task)))fail('configuration','Operating model task coverage is incomplete');
 },async verifyStorage(tx){
  if(typeof tx?.query!=='function')fail('configuration','Original operating budget read required');
  const rows=await tx.query(inspectionSql,[guards.map(g=>g.name)]),r=rows?.[0];
  if(rows?.length!==1||!['ytv_ai_reader','ytv_ai_executor'].includes(r?.role_name)||r.status_read!==true||r.status_write!==false
   ||r.native_month!==captured.budgetId.slice('ytv-operating-models:'.length)||!Array.isArray(r.guards)||r.guards.length!==guards.length)fail('permissions','Current native operating budget protections are unavailable');
  for(const expected of guards){const g=r.guards.find(g=>g.name===expected.name);
   if(!g||g.table!==expected.table||g.fn!==expected.fn||g.functionSchema!=='ytv_ai_v1'||g.type!==expected.type||g.enabled!=='O'
    ||g.internal!==false||g.conditional!==false||g.deferrable!==false||g.securityDefiner!==false||g.args!==0||g.returnsTrigger!==true||g.language!=='plpgsql'
    ||JSON.stringify(g.config)!=='["search_path=pg_catalog"]'||!Array.isArray(g.columns)||JSON.stringify([...g.columns].sort())!==JSON.stringify(expected.columns)
    ||typeof g.body!=='string'||createHash('sha256').update(g.body.replace(/\r\n/g,'\n')).digest('hex')!==expected.digest)fail('permissions','Native operating budget guard differs from the reviewed implementation');
  }
  const budgets=await tx.query(statusSql,[captured.budgetId]),b=budgets?.[0],limit=count(b?.limit_micros),reserved=count(b?.reserved_micros),settled=count(b?.settled_micros);
  if(budgets?.length!==1||b.budget_id!==captured.budgetId||b.currency!=='USD'||b.blocked!==false||limit===null||limit>captured.monthlyLimitMicros
   ||reserved===null||settled===null||reserved>limit||settled>limit-reserved||count(b.encumbered_micros)!==reserved+settled
   ||b.alert_at_24_usd!==(reserved+settled>=captured.alertAtMonthlyMicros)||b.settled_at_24_usd!==(settled>=captured.alertAtMonthlyMicros))fail('quota','Approved native operating budget is unavailable');
  return Object.freeze({...captured,taskTypes:tasks,guardsVerified:true,nativeMonth:r.native_month});
 }});
}
module.exports={captureOperatingBudget};
