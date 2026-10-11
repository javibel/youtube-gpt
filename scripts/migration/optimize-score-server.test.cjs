'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const draft={videoId:'synthetic01',title:'7 Best synthetic educational ideas',description:'Synthetic description',tags:['synthetic']};
function harness(options={}){
 let now=10000,serial=0;const calls=[],timers=new Map(),gates={auth:deferred(),body:deferred()},entered={auth:deferred(),body:deferred()},controller=new AbortController();
 const session={user:{id:options.userId??'fixture-one',email:options.email??'fixture-one@example.invalid'}};
 const step=async(s,fn)=>{calls.push(s);entered[s].resolve();if(options.fail===s)throw Error('Private failure');if(options.held===s||options.held?.includes?.(s))await gates[s].promise;return fn();};
 const forbidden=new Proxy(()=>{throw Error('Forbidden external effect');},{get:()=>forbidden});
 const route=load('app/api/youtube/optimize/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:()=>step('auth',async()=>options.authReader?options.authReader():options.anonymous?null:session)},'@/lib/prisma':{prisma:forbidden},'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/plans':{getUserPlan:forbidden,isPaid:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden}},{fetch:forbidden,performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 const request={signal:controller.signal,json:()=>step('body',()=>options.body===undefined?draft:options.body)};if(options.preAborted)controller.abort();
 const original=route.POST(request);
 return{original,session,request,controller,calls,timers,gates,entered,advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
async function response(h,status=200){const r=await h.original;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);return r.json();}
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 for(const stage of ['auth','body'])for(const reason of ['deadline','abort','late-before-timer'])await test(stage+' '+reason+' retires original and prohibits late next stage',async()=>{const h=harness({held:stage});await h.entered[stage].promise;if(reason==='abort')h.controller.abort();else h.advance(25000,reason!=='late-before-timer');if(reason==='late-before-timer')h.gates[stage].resolve();try{assert.deepEqual(await response(h,503),{error:'score_unavailable'});}finally{h.gates[stage].resolve();await flush();}assert.equal(h.calls.filter(x=>x===stage).length,1);if(stage==='auth')assert.deepEqual(h.calls,['auth']);});
 await test('single25s monotonic budget covers auth and body without renewal',async()=>{const h=harness({held:['auth','body']});await h.entered.auth.promise;h.advance(20000);h.gates.auth.resolve();await h.entered.body.promise;h.advance(5000);await response(h,503);h.gates.body.resolve();await flush();});
 await test('pre-aborted invokes no auth/body/effect',async()=>{const h=harness({preAborted:true});await response(h,503);assert.equal(h.calls.length,0);});
 await test('anonymous invokes no body/effect',async()=>{const h=harness({anonymous:true});await response(h,401);assert.deepEqual(h.calls,['auth']);});
 await test('auth exception remains generic',async()=>{assert.deepEqual(await response(harness({fail:'auth'}),503),{error:'score_unavailable'});});
 await test('malformed original JSON is invalid input',async()=>{assert.deepEqual(await response(harness({fail:'body'}),400),{error:'invalid_input'});});
 for(const body of [null,[],{}, {...draft,videoId:''},{...draft,videoId:'inject&x=1'},{...draft,title:3},{...draft,title:'t'.repeat(101)},{...draft,description:null},{...draft,description:'x'.repeat(5001)},{...draft,tags:'tag'},{...draft,tags:[null]},{...draft,tags:Array(101).fill('x')},{...draft,tags:['x'.repeat(501)]}])await test('invalid bounded draft '+JSON.stringify(body).slice(0,90),async()=>{await response(harness({body}),400);});
 await test('authenticated owner captured before original body wait, body identity cannot redirect',async()=>{const h=harness({held:'body',body:{...draft,userId:'foreign'}});await h.entered.body.promise;h.session.user.id='foreign';h.session.user.email='foreign@example.invalid';h.gates.body.resolve();const b=await response(h);assert.equal(b.userId,'fixture-one');assert.equal(b.email,'fixture-one@example.invalid');assert.deepEqual(b.draft,draft);});
 await test('existing weights and score preserved using fixed criteria, no token/plan/model/SQL calls',async()=>{const b=await response(harness());assert.equal(b.score,35);assert.equal(b.checks.length,13);assert.equal(b.checks.reduce((s,c)=>s+c.w,0),68);assert.deepEqual(b.checks.filter(c=>c.ok).map(c=>c.key),['title_length','title_number','title_caps','title_power','tags_short']);});
 await test('empty editable fields remain valid and score0',async()=>{const b=await response(harness({body:{...draft,title:'',description:'',tags:[]}}));assert.equal(b.score,0);assert(b.checks.every(c=>!c.ok));});
 await test('every criterion satisfied produces100 without generating text',async()=>{const b=await response(harness({body:{...draft,title:'7 Best synthetic educational ideas 🔥',description:Array(100).fill('word').join(' ')+' https://example.invalid 1:20 #tag subscribe',tags:['tag','a b c','two','three','four']}}));assert.equal(b.score,100);});
 await test('maximum accepted payload remains bounded and preserves exact whitespace/tags',async()=>{const body={videoId:'x'.repeat(128),title:' '.repeat(100),description:' '.repeat(5000),tags:Array(100).fill(' '.repeat(500))};assert.deepEqual((await response(harness({body}))).draft,body);});
 return{scope:'actual local Optimize POST, fake auth/body clock; every OAuth/Google/model/plan/SQL dependency forbidden',results};
}
module.exports={harness,response,draft,run};
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.results.some(x=>x.status==='FAIL'))process.exitCode=1;});

