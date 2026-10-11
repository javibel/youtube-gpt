'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
function harness(method,options={}){
 let now=0,next=0,transactions=0,writes=0;const timers=new Map(),calls=[],gates={auth:deferred(),plan:deferred(),body:deferred(),lookup:deferred(),ack:deferred()},controller=new AbortController();
 const owner='synthetic-write-owner',original={id:'entry-original',userId:owner,title:'Original',description:null,date:'2026-10-10',status:'idea',color:null,createdAt:new Date('2026-10-01'),updatedAt:new Date('2026-10-01')},rows=new Map([[original.id,{...original}]]),receipts=new Map();
 const fields=e=>({title:e.title,description:e.description,date:e.date,status:e.status,color:e.color});
 const body=method==='POST'?{title:'New original',date:'2026-10-10',status:'idea'}:method==='PUT'?{id:original.id,title:'Updated original',expected:fields(original)}:{expected:fields(original)};
 const state={auth:Object.hasOwn(options,'auth')?options.auth:{user:{id:owner,email:owner+'@example.invalid'}},plan:options.plan??'pro',body};
 const held=stage=>options.held===stage||Array.isArray(options.held)&&options.held.includes(stage);
 const step=async(stage,make)=>{calls.push(stage);return held(stage)?gates[stage].promise:make();};
 const entry={findUnique:async({where})=>step('lookup',()=>rows.get(where.id)??null),count:async()=>rows.size,
  create:async({data})=>{writes++;const e={id:'entry-created',createdAt:new Date('2026-10-01'),updatedAt:new Date('2026-10-01'),...data};rows.set(e.id,e);return e;},
  update:async({where,data})=>{writes++;const e={...rows.get(where.id),...data};rows.set(e.id,e);return e;},
  delete:async({where})=>{writes++;const e=rows.get(where.id);rows.delete(where.id);return e;}};
 const tx={$queryRawUnsafe:async(sql,id,user)=>sql.includes('calendar_entries')?(rows.get(id)?.userId===user?[{id}]:[]):sql.includes('subscriptions')?[{id:'sub-'+owner}]:[{id:owner,email:owner+'@example.invalid'}],subscription:{findUnique:async()=>step('plan',()=>({id:'sub-'+owner,userId:owner,plan:state.plan,status:state.plan==='free'?'canceled':'active',stripeCustomerId:null,currentPeriodEnd:null}))},calendarEntry:entry,
  calendarCreationReceipt:{findUnique:async({where})=>receipts.get(where.userId_key.key)??null,create:async({data})=>{receipts.set(data.key,data);return data;}},
  calendarMutationReceipt:{findUnique:async({where})=>receipts.get(where.userId_key.key)??null,create:async({data})=>{receipts.set(data.key,data);return data;}}};
 const prisma={calendarEntry:entry,$transaction:async fn=>{transactions++;calls.push('transaction');const value=await fn(tx);calls.push('committed');if(held('ack'))await gates.ack.promise;return value;}};
 const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:()=>step('auth',()=>state.auth)},'@/lib/plans':{getUserPlan:()=>step('plan',()=>state.plan),isPaid:p=>p==='pro',hasPaidAccess:sub=>sub?.status==='active'},'@/lib/prisma':{prisma}},
 {performance:{now:()=>now},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}});
 const request=new Request('https://example.invalid/api/calendar'+(method==='DELETE'?'?id='+original.id:''),{method,headers:options.legacy?{}:{'Idempotency-Key':'original-write-key','Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
 request.json=()=>step('body',()=>state.body);
 let response,error;const originalResponse=route[method](request);void originalResponse.then(r=>{response=r;},e=>{error=e;});
 return {state,calls,gates,controller,rows,receipts,timers,original,originalResponse,get response(){return response;},get error(){return error;},get transactions(){return transactions;},get writes(){return writes;},advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
async function failed(h){assert(h.response,'HTTP write remained unresolved');assert.equal(h.response.status,503);assert.deepEqual(await h.response.json(),{error:'calendar_write_unconfirmed'});assert.equal(h.response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);}
async function run(){
 for(const method of ['POST','PUT','DELETE'])for(const stage of ['auth','plan','body'])for(const retire of ['deadline','abort'])await test(method+' '+stage+' '+retire+' cannot begin a writer after late dependency',async()=>{
  const h=harness(method,{held:stage});await flush();assert.equal(h.calls.at(-1),stage);if(retire==='deadline')h.advance(30000);else h.controller.abort();await flush();await failed(h);
  const before=h.calls.length;h.gates[stage].resolve(h.state[stage]);await flush();assert.equal(h.calls.length,before);assert.equal(h.transactions,stage==='plan'?1:0);assert.equal(h.writes,0);assert.equal(h.error,undefined);
 });
 for(const method of ['POST','PUT','DELETE'])for(const retire of ['deadline','abort'])await test(method+' committed original '+retire+' cannot convert late acknowledgement into HTTP success or dispatch again',async()=>{
  const h=harness(method,{held:'ack'});await flush();assert(h.calls.includes('committed'));assert.equal(h.writes,1);assert.equal(h.receipts.size,1);if(retire==='deadline')h.advance(30000);else h.controller.abort();await flush();await failed(h);
  h.gates.ack.resolve();await flush();assert.equal(h.response.status,503);assert.equal(h.transactions,1);assert.equal(h.writes,1);assert.equal(h.receipts.size,1);assert.equal(h.error,undefined);
 });
 await test('POST auth, body and locked plan share one total budget before insertion',async()=>{
  const h=harness('POST',{held:['auth','plan','body']});await flush();h.advance(20000);h.gates.auth.resolve(h.state.auth);await flush();assert.equal(h.calls.at(-1),'body');h.advance(9000);h.gates.body.resolve(h.state.body);await flush();assert.equal(h.calls.at(-1),'plan');h.advance(1000);await flush();await failed(h);h.gates.plan.resolve(h.state.plan);await flush();assert.equal(h.transactions,1);assert.equal(h.writes,0);
 });
 for(const method of ['PUT','DELETE'])for(const retire of ['deadline','abort'])await test(method+' legacy owner lookup '+retire+' cannot dispatch a later write',async()=>{
  const h=harness(method,{legacy:true,held:'lookup'});await flush();assert.equal(h.calls.at(-1),'lookup');if(retire==='deadline')h.advance(30000);else h.controller.abort();await flush();await failed(h);h.gates.lookup.resolve(h.original);await flush();assert.equal(h.writes,0);
 });
 for(const method of ['PUT','DELETE'])for(const retire of ['deadline','abort'])await test(method+' legacy committed '+retire+' preserves uncertainty without claiming an original receipt',async()=>{
  const h=harness(method,{legacy:true,held:'ack'});await flush();assert(h.calls.includes('committed'));assert.equal(h.writes,1);if(retire==='deadline')h.advance(30000);else h.controller.abort();await flush();await failed(h);h.gates.ack.resolve();await flush();assert.equal(h.response.status,503);assert.equal(h.receipts.size,0);assert.equal(h.transactions,1);assert.equal(h.writes,1);
 });
 for(const method of ['POST','PUT','DELETE'])await test(method+' success and anonymous denial keep original business behavior and close timers',async()=>{
  const h=harness(method);await h.originalResponse;assert.equal(h.response.status,method==='POST'?201:200);assert.equal(h.writes,1);assert.equal(h.receipts.size,1);assert.equal(h.response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);
  const denied=harness(method,{auth:null});await denied.originalResponse;assert.equal(denied.response.status,401);assert.equal(denied.transactions,0);assert.equal(denied.writes,0);assert.equal(denied.timers.size,0);
 });
 return {scope:'actual calendar mutation routes; synthetic HTTP, clock, auth and transactions',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results};
}
module.exports={harness};if(require.main===module){const watchdog=setTimeout(()=>{console.error('No original write-test terminal report within 15 seconds');process.exit(1);},15000);run().then(report=>{clearTimeout(watchdog);console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;},error=>{clearTimeout(watchdog);console.error(error);process.exitCode=1;});}
