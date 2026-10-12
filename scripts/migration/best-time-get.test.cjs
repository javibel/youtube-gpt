'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
const owner={id:'best-time-owner',email:'best-time-owner@example.invalid'};
const cache=()=>({userId:owner.id,heatmap:Array.from({length:7},()=>Array(24).fill(0)),topSlots:[],videoCount:3,aiTip:null,analyzedAt:new Date(0)});
function harness(options={}){
 let now=0,next=0,transaction;const timers=new Map(),calls=[],gates={},signal=new AbortController();
 const state={session:{user:{...owner}},owner:{...owner},cache:cache(),...options.state};
 const step=async(stage,value)=>{calls.push(stage);if(options.held===stage){gates[stage]=deferred();gates[stage].value=value();return gates[stage].promise;}return value();};
 const tx={$executeRawUnsafe:async sql=>{assert.equal(sql,'SET TRANSACTION READ ONLY');return step('read-only',()=>0);},
 user:{findUnique:input=>{assert.deepEqual({...input.where},{email:owner.email});return step('owner',()=>state.owner);}},
 bestTimeAnalysis:{findUnique:input=>{assert.deepEqual({...input.where},{userId:owner.id});assert.deepEqual(Object.keys(input.select).sort(),['aiTip','analyzedAt','heatmap','topSlots','userId','videoCount']);return step('cache',()=>state.cache);}}};
 const prisma={};
 prisma.$transaction=(fn,opts)=>{assert.deepEqual({...opts},{isolationLevel:'RepeatableRead',maxWait:25000,timeout:25000});transaction=(async()=>{await step('transaction',()=>null);const result=await fn(tx);return step('ack',()=>result);})();void transaction.catch(()=>{});return transaction;};
 const forbidden=()=>{throw Error('GET may not invoke producers, tokens, plans or writes');};
 const mocks={'next/server':{NextResponse:{json(body,opts){const r=Response.json(body,opts);if(options.serializeElapsed&&opts.status===200)now+=options.serializeElapsed;return r;}}},'@/auth':{auth:()=>step('auth',()=>state.session)},'@/lib/prisma':{prisma},'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/plans':{getUserPlan:forbidden,isPaid:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden}};
 const api=load('app/api/youtube/best-time/route.ts',mocks,{performance:{now:()=>now},setTimeout(fn,ms){assert.equal(ms,25000);const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);}});
 if(options.aborted)signal.abort();const original=api.GET(new Request('https://example.invalid/api/youtube/best-time',{signal:signal.signal}));
 return {state,original,calls,gates,signal,timers,get transaction(){return transaction;},advance(ms,fire=true){now+=ms;if(fire)for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
async function expect(h,status){const response=await h.original;assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);return response.json();}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
async function run(){
 await test('cached facts and epoch zero remain declared, with own ID/email and no producer calls',async()=>{const h=harness();const body=await expect(h,200);assert.deepEqual(body.owner,owner);assert.equal(body.data.analyzedAt,'1970-01-01T00:00:00.000Z');assert.deepEqual(h.calls,['auth','transaction','read-only','owner','cache','ack']);});
 await test('missing cache is an explicit owner-bound empty result',async()=>{const h=harness({state:{cache:null}});assert.deepEqual(await expect(h,200),{owner,data:null});});
 for(const session of [null,{user:{id:owner.id}},{user:{id:'',email:owner.email}},{user:{id:3,email:owner.email}},{user:{id:owner.id,email:''}}])await test('invalid session '+JSON.stringify(session)+' stops before SQL',async()=>{const h=harness({state:{session}});await expect(h,401);assert.deepEqual(h.calls,['auth']);});
 for(const [selected,status]of [[null,404],[{id:'foreign',email:owner.email},401],[{id:owner.id,email:'foreign'},401]])await test('owner mismatch or absence stops before cache '+status,async()=>{const h=harness({state:{owner:selected}});await expect(h,status);assert.equal(h.calls.includes('cache'),false);});
 const changes=[
 ['foreign cache',c=>c.userId='foreign'],['rows',c=>c.heatmap=[]],['columns',c=>c.heatmap[0]=[]],
 ['fraction',c=>c.heatmap[0][0]=1.5],['negative',c=>c.heatmap[0][0]=-1],['high',c=>c.heatmap[0][0]=101],['nan',c=>c.heatmap[0][0]=NaN],
 ['invalid total',c=>c.videoCount=0],['oversized total',c=>c.videoCount=51],['string total',c=>c.videoCount='3'],
 ['slots not list',c=>c.topSlots={}],['oversized slots',c=>c.topSlots=Array(4).fill({})],
 ['invalid day',c=>c.topSlots=[{day:7,hour:0,score:1,videoCount:1}]],
 ['invalid hour',c=>c.topSlots=[{day:0,hour:24,score:1,videoCount:1}]],
 ['score mismatch',c=>c.topSlots=[{day:0,hour:0,score:1,videoCount:1}]],
 ['unknown field',c=>c.topSlots=[{day:0,hour:0,score:1,videoCount:1,authority:true}]],
 ['tip missing language',c=>c.aiTip={es:'x'}],['tip extra field',c=>c.aiTip={es:'x',en:'y',confirmed:true}],
 ['tip type',c=>c.aiTip={es:3,en:'y'}],['tip too long',c=>c.aiTip={es:'x'.repeat(4097),en:'y'}],
 ['date string',c=>c.analyzedAt='2026-10-12'],['invalid date',c=>c.analyzedAt=new Date(NaN)]];
 for(const[name,change]of changes)await test('malformed cached '+name+' remains unconfirmed',async()=>{const c=cache();change(c);const h=harness({state:{cache:c}});assert.deepEqual(await expect(h,503),{error:'best_time_read_unconfirmed'});});
 await test('valid bounded slots/tip are copied before original transaction acknowledgement',async()=>{const c=cache();c.heatmap[0][2]=100;c.topSlots=[{day:0,hour:2,score:100,videoCount:3}];c.aiTip={es:'hola',en:'hello'};const h=harness({held:'ack',state:{cache:c}});await flush();c.heatmap[0][2]=0;c.topSlots[0].hour=23;c.aiTip.es='changed';c.analyzedAt.setTime(Date.now());h.gates.ack.resolve(h.gates.ack.value);const b=await expect(h,200);assert.equal(b.data.heatmap[0][2],100);assert.equal(b.data.topSlots[0].hour,2);assert.equal(b.data.aiTip.es,'hola');assert.equal(b.data.analyzedAt,'1970-01-01T00:00:00.000Z');});
 for(const stage of ['auth','transaction','read-only','owner','cache','ack'])for(const mode of ['deadline','abort'])await test('held '+stage+' '+mode+' cannot continue after HTTP retirement',async()=>{const h=harness({held:stage});await flush();assert.equal(h.calls.at(-1),stage);if(mode==='deadline')h.advance(25000);else h.signal.abort();await expect(h,503);const length=h.calls.length;h.gates[stage].resolve(h.gates[stage].value);await flush();if(h.transaction)await h.transaction.catch(()=>{});assert.equal(h.calls.length,length);});
 await test('already aborted request dispatches no auth or SQL',async()=>{const h=harness({aborted:true});await expect(h,503);assert.equal(h.calls.length,0);});
 await test('delayed timer callback does not extend one budget',async()=>{const h=harness({held:'cache'});await flush();h.advance(25000,false);h.gates.cache.resolve(h.gates.cache.value);await expect(h,503);assert.equal(h.calls.includes('ack'),false);});
 await test('session mutation cannot retarget captured owner during SQL',async()=>{const h=harness({held:'owner'});await flush();h.state.session.user.id='foreign';h.state.session.user.email='foreign';h.gates.owner.resolve(h.gates.owner.value);assert.deepEqual((await expect(h,200)).owner,owner);});
 await test('serialization crossing the budget is never a successful response',async()=>{await expect(harness({serializeElapsed:25000}),503);});
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual GET/cache helper with synthetic auth/SQL/clock; POST and operational acceptance excluded',results};
}
module.exports={harness,cache,owner,expect};
if(require.main===module){const watchdog=setTimeout(()=>{console.error('GET contracts missing terminal');process.exit(1);},15000);run().then(report=>{clearTimeout(watchdog);console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;},error=>{clearTimeout(watchdog);console.error(error);process.exitCode=1;});}
