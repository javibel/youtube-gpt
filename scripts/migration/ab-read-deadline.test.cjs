'use strict';
const assert=require('node:assert/strict'),{deferred}=require('./calendar-http-read-deadline.test.cjs'),{source}=require('./ab-mutation-deadline.test.cjs');
const flush=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
function harness(options={}){
 let now=0,sequence=0,response,error;const timers=new Map(),calls=[],gates={auth:deferred(),query:deferred()},entered={auth:deferred(),query:deferred()},controller=new AbortController();
 const state={auth:options.anonymous?null:{user:{id:'owner'}},rows:[{id:'own-test',userId:'owner',videoId:'video',status:'variant_a'}]};
 const read=s=>args=>{calls.push({stage:s,args});entered[s].resolve();if(options.fail===s)return Promise.reject(Error('Private '+s));return options.held===s||options.held?.includes(s)?gates[s].promise:Promise.resolve(s==='auth'?state.auth:state.rows);};
 const forbidden=()=>{throw Error('A/B read cannot invoke mutation/token/title/model');};
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 class JsonResponse extends Response {static json(body,init){if(body.tests){now+=options.serializationMs??0;if(options.abortSerialization)controller.abort();}return Response.json(body,init);}}
 const route=source('app/api/youtube/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:JsonResponse},'@/auth':{auth:read('auth')},'@/lib/prisma':{prisma:{abTest:{findMany:read('query'),create:forbidden,update:forbidden}}},'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/ab-test':{createAbTest:forbidden}},globals);
 const req=options.noRequest?undefined:new Request('https://example.invalid/api/youtube/ab-test',{signal:controller.signal});if(options.preAborted)controller.abort();
 const original=route.GET(req);void original.then(r=>{response=r;},e=>{error=e;});
 return {state,calls,gates,entered,timers,controller,original,get response(){return response;},get error(){return error;},advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
 const retired=async h=>{await flush();assert(h.response,'Original GET HTTP waiter did not retire');assert.equal(h.response.status,503);assert.deepEqual(await h.response.clone().json(),{error:'ab_read_unconfirmed'});assert.equal(h.response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);assert.equal(h.error,undefined);};
 for(const stage of ['auth','query'])for(const reason of ['deadline','abort','late-before-timer'])await test(stage+' '+reason+' retains original reader and stops later steps',async()=>{
  const h=harness({held:stage});await flush();assert.equal(h.calls.at(-1).stage,stage);if(reason==='abort')h.controller.abort();else h.advance(25000,reason!=='late-before-timer');
  try{if(reason==='late-before-timer')h.gates[stage].resolve(stage==='auth'?h.state.auth:h.state.rows);await retired(h);}finally{h.gates[stage].resolve(stage==='auth'?h.state.auth:h.state.rows);await flush();}
  assert.equal(h.calls.filter(c=>c.stage==='query').length,stage==='query'?1:0);assert.equal(h.response.status,503);assert.equal(h.error,undefined);
 });
 for(const stage of ['auth','query'])for(const late of [false,true])await test(stage+' rejection '+(late?'after retirement':'before deadline')+' is observed/sanitized',async()=>{
  const h=harness({held:stage});await flush();if(late){h.advance(25000);await retired(h);}h.gates[stage].reject(Error('Synthetic private SQL/token diagnostic'));await retired(h);assert.equal(h.calls.length,stage==='auth'?1:2);
 });
 await test('successful list captures owner/order/limit and returns no-store without any mutation',async()=>{const h=harness(),r=await h.original;assert.equal(r.status,200);assert.deepEqual(await r.json(),{userId:'owner',tests:h.state.rows});assert.equal(r.headers.get('cache-control'),'no-store');const query=h.calls.find(c=>c.stage==='query').args;assert.equal(query.where.userId,'owner');assert.equal(query.orderBy.startedAt,'desc');assert.equal(query.take,20);assert.equal(h.timers.size,0);});
 await test('anonymous401 closes timer/no-store without SQL',async()=>{const h=harness({anonymous:true}),r=await h.original;assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'Unauthorized'});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);});
 await test('original synthetic callers without Request preserve successful list',async()=>{const h=harness({noRequest:true});assert.equal((await h.original).status,200);assert.equal(h.timers.size,0);});
 for(const immediate of [false,true])await test((immediate?'pre-aborted':'immediate abort before dispatch')+' request invokes neither auth nor SQL',async()=>{const h=harness({preAborted:immediate});if(!immediate)h.controller.abort();await retired(h);assert.deepEqual(h.calls,[]);});
 await test('one25s budget spans authorization and SELECT rather than restarting',async()=>{const h=harness({held:['auth','query']});await flush();h.advance(20000);h.gates.auth.resolve(h.state.auth);await flush();assert.equal(h.calls.at(-1).stage,'query');h.advance(4999);await flush();assert.equal(h.response,undefined);h.advance(1);await retired(h);h.gates.query.resolve(h.state.rows);await flush();assert.equal(h.calls.filter(c=>c.stage==='query').length,1);assert.equal(h.response.status,503);});
 await test('mutable session cannot redirect owner/envelope while original SQL is delayed',async()=>{const h=harness({held:'query'});await flush();h.state.auth.user.id='neighbor';h.gates.query.resolve(h.state.rows);const r=await h.original;assert.equal((await r.json()).userId,'owner');assert.equal(h.calls.find(c=>c.stage==='query').args.where.userId,'owner');assert.equal(h.timers.size,0);});
 for(const options of [{serializationMs:25000},{abortSerialization:true}])await test('serialization also respects the original deadline/abort '+JSON.stringify(options),async()=>{const h=harness(options);await retired(h);assert.equal(h.calls.filter(c=>c.stage==='query').length,1);});
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual A/B GET with synthetic auth/SQL/clock/serialization; original read only; no title/OAuth/model/mutation/recovery authority',results};
}
module.exports={harness,flush};
if(require.main===module){const watchdog=setTimeout(()=>{console.error('FAIL: original A/B GET did not produce terminal report');process.exit(1);},15000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));}
