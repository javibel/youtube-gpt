'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function flush(){for(let i=0;i<35;i++)await Promise.resolve();}
function harness(options={}){
 let now=0,next=0;const timers=new Map(),calls=[],signal=new AbortController(),gates={auth:deferred(),plan:deferred(),query:deferred()};
 const state={auth:Object.hasOwn(options,'auth')?options.auth:{user:{id:'synthetic-calendar-owner'}},plan:options.plan??'pro',rows:[{id:'own-entry',userId:'synthetic-calendar-owner',title:'Synthetic retained row',date:'2026-10-10'}]};
 const read=stage=>async args=>{calls.push({stage,args});return options.held===stage||options.held?.includes(stage)?gates[stage].promise:state[stage==='query'?'rows':stage];};
 const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:read('auth')},'@/lib/plans':{getUserPlan:read('plan'),isPaid:p=>p==='pro'},'@/lib/prisma':{prisma:{calendarEntry:{findMany:read('query')}}}},
 {performance:{now:()=>now},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}});
 let response,error;const original=route.GET(new Request('https://example.invalid/api/calendar?from=2026-10-01&to=2026-10-31',{signal:signal.signal}));void original.then(r=>{response=r;},e=>{error=e;});
 return {state,calls,gates,timers,signal,original,get response(){return response;},get error(){return error;},elapseWithoutTimers(ms){now+=ms;},advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
async function run(){
 for(const stage of ['auth','plan','query'])for(const retire of ['deadline','abort'])await test(stage+' '+retire+' retires original HTTP waiter and never starts a later dependency',async()=>{
  const h=harness({held:stage});await flush();assert.equal(h.calls.at(-1).stage,stage);if(retire==='deadline')h.advance(30000);else h.signal.abort();await flush();
  assert(h.response,'HTTP read remained unresolved after retirement');assert.equal(h.response.status,503);assert.deepEqual(await h.response.json(),{error:'calendar_read_unconfirmed'});assert.equal(h.response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);
  const count=h.calls.length;h.gates[stage].resolve(stage==='auth'?h.state.auth:stage==='plan'?h.state.plan:h.state.rows);await flush();assert.equal(h.calls.length,count);assert.equal(h.response.status,503);assert.equal(h.error,undefined);
 });
 await test('one monotonic budget spans authorization, plan and query without extending after each step',async()=>{
  const h=harness({held:['auth','plan','query']});await flush();h.advance(20000);h.gates.auth.resolve(h.state.auth);await flush();assert.equal(h.calls.at(-1).stage,'plan');
  h.advance(9000);h.gates.plan.resolve(h.state.plan);await flush();assert.equal(h.calls.at(-1).stage,'query');assert.equal(h.response,undefined);
  h.advance(999);await flush();assert.equal(h.response,undefined);h.advance(1);await flush();assert.equal(h.response.status,503);assert.equal(h.timers.size,0);
  h.gates.query.resolve(h.state.rows);await flush();assert.equal(h.response.status,503);assert.equal(h.calls.filter(c=>c.stage==='query').length,1);
 });
 await test('authorized successful query keeps owner and date bounds and removes deadline',async()=>{
  const h=harness();await flush();assert.equal(h.response.status,200);assert.deepEqual(await h.response.json(),{entries:h.state.rows});assert.equal(h.response.headers.get('cache-control'),'no-store');const query=h.calls.find(c=>c.stage==='query').args;assert.equal(query.where.userId,h.state.auth.user.id);assert.equal(query.where.date.gte,'2026-10-01');assert.equal(query.where.date.lte,'2026-10-31');assert.equal(query.take,200);assert.equal(h.timers.size,0);
 });
 for(const[name,options,status]of [['anonymous',{auth:null},401],['free',{plan:'free'},403]])await test(name+' remains blocked before any calendar query',async()=>{
  const h=harness(options);await flush();assert.equal(h.response.status,status);assert.equal(h.calls.some(c=>c.stage==='query'),false);assert.equal(h.timers.size,0);
 });
 await test('late rejection of original query is observed without replacing failed response',async()=>{
  const h=harness({held:'query'});await flush();h.advance(30000);await flush();assert.equal(h.response.status,503);h.gates.query.reject(Error('Synthetic late database failure'));await flush();assert.equal(h.error,undefined);assert.equal(h.response.status,503);
 });
 for(const stage of ['auth','plan','query'])await test(stage+' failure is sanitized and never starts a later dependency',async()=>{
  const h=harness({held:stage});await flush();const count=h.calls.length;h.gates[stage].reject(Error('Synthetic private diagnostic'));await flush();assert.equal(h.response.status,503);assert.deepEqual(await h.response.json(),{error:'calendar_read_unconfirmed'});assert.equal(h.calls.length,count);assert.equal(h.timers.size,0);
 });
 await test('elapsed monotonic deadline blocks late authorization even before timer delivery',async()=>{
  const h=harness({held:'auth'});await flush();h.elapseWithoutTimers(30000);h.gates.auth.resolve(h.state.auth);await flush();assert.equal(h.response.status,503);assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
 });
 await test('abort before scheduled authorization does not call a dependency',async()=>{
  const h=harness({held:'auth'});h.signal.abort();await flush();assert(h.response);assert.equal(h.response.status,503);assert.equal(h.calls.length,0);
 });
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results};
}
module.exports={harness,deferred,flush};
if(require.main===module)run().then(report=>{console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;});
