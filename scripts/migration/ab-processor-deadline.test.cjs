'use strict';
const metadata=require('./ab-metadata-fixture.cjs');
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred}=require('./calendar-http-read-deadline.test.cjs');
const flush=async()=>{for(let n=0;n<120;n++)await Promise.resolve();};
function harness(options={}){
 const phase=options.phase??'variant_a',calls=[],gates={},entered={},timers=new Map(),completed=deferred();let now=0,next=0,result,error,pending=false,saved=false,lastTitle;
 const stages=['scanA','scanB','token','videoHeaders','videoJSON','admission','admissionAck','title','taskSetup','insight','sql'];
 const row={id:'synthetic-test',userId:'synthetic-owner',videoId:'synthetic-video',status:phase,startedAt:new Date(Date.now()-3*3600000),switchedAt:phase==='variant_b'?new Date(Date.now()-2*3600000):null,hoursPerVariant:1,initialViews:0,switchViews:10,variantA:'Original A',variantB:'Original B',originalTitle:'Original'};
 const state={scanA:phase==='variant_a'?[row]:[],scanB:phase==='variant_b'?[row]:[],token:'synthetic-token',videoJSON:metadata.list(row.videoId,{views:40}),title:{ok:true},insight:{content:[{type:'text',text:'{"es":"Sintético","en":"Synthetic"}'}]}};
 for(const stage of stages){gates[stage]=deferred();entered[stage]=deferred();}
 const held=stage=>options.held===stage||Array.isArray(options.held)&&options.held.includes(stage);
 const step=stage=>{calls.push(stage);entered[stage].resolve();if(options.fail===stage)return Promise.reject(Error('Private '+stage));return held(stage)?gates[stage].promise:Promise.resolve(state[stage]);};
 state.videoHeaders=metadata.response(()=>step('videoJSON'));state.title=metadata.response(()=>metadata.ack(lastTitle));state.taskSetup={create:()=>step('insight')};
 const helper={beginAbTestTransition:async(user,snapshot,transition,guard)=>{
  assert.equal(user,row.userId);assert.equal(snapshot.id,row.id);await step('admission');guard();pending=true;await step('admissionAck');
  return {ok:true,complete:async insight=>{await step('sql');saved=true;pending=false;completed.resolve({transition,insight});return {...row,status:phase==='variant_a'?'variant_b':'completed'};}};
 }};
 const mod=load('lib/ab-test-processor.ts',{'@/lib/prisma':{prisma:{abTest:{findMany:q=>step(q.where.status==='variant_a'?'scanA':'scanB')}}},'@/lib/youtube-auth':{getAccessToken:()=>step('token')},'@/lib/ab-test':helper,'@/lib/ai/task-runtime':{getMessagesTask:()=>step('taskSetup')}},{performance:{now:()=>now},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,init={})=>{assert.match(url,/^https:\/\/www.googleapis.com\/youtube\/v3\/videos\?/);if(init.method==='PUT')lastTitle=JSON.parse(init.body);return step(init.method==='PUT'?'title':'videoHeaders');}});
 const original=mod.processAbTests();void original.then(r=>{result=r;},e=>{error=e;});
 return {original,completed,state,calls,gates,entered,timers,get result(){return result;},get error(){return error;},get lastTitle(){return lastTitle;},get pending(){return pending;},get saved(){return saved;},advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},release(stage,reject=false){if(reject)gates[stage].reject(Error('Private late '+stage));else gates[stage].resolve(state[stage]);},close(){for(const stage of stages)gates[stage].resolve(state[stage]);}};
}
async function entry(h,stage){let timer;try{await Promise.race([h.entered[stage].promise,h.original.then(()=>{throw Error('Caller finished before '+stage);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing original '+stage)),500);})]);}finally{clearTimeout(timer);}}
async function retired(h){await flush();assert(h.result,'Processor caller did not retire');assert.equal(h.result.unconfirmed,true);assert.equal(h.result.switched,0);assert.equal(h.result.completed,0);assert.equal(h.result.errors.join(','),'ab_processor_unconfirmed');assert.equal(h.error,undefined);assert.equal(h.timers.size,0);}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
 const phases={variant_a:['scanA','token','videoHeaders','videoJSON','admission','admissionAck','title','sql','scanB'],variant_b:['scanB','token','videoHeaders','videoJSON','admission','admissionAck','title','taskSetup','insight','sql']};
 for(const[phase,stages]of Object.entries(phases))for(const stage of stages)for(const mode of ['deadline','late-before-timer','late-rejection'])await test(phase+' '+stage+' '+mode+' retires only caller; prerequisites cannot start effects; invoked producers stay observed',async()=>{
  const h=harness({phase,held:stage});try{
   await entry(h,stage);h.advance(55000,mode!=='late-before-timer');if(mode==='late-before-timer')h.release(stage);
   await retired(h);const response=h.result;if(mode!=='late-before-timer')h.release(stage,mode==='late-rejection');await flush();
   assert.equal(h.result,response);assert.equal(h.timers.size,0);assert.equal(h.calls.filter(s=>s==='title').length,['title','taskSetup','insight','sql'].includes(stage)||phase==='variant_a'&&stage==='scanB'?1:0);
   assert.equal(h.calls.filter(s=>s==='insight').length,stage==='insight'||phase==='variant_b'&&stage==='sql'?1:0);
   const retain=['title','taskSetup','insight','sql'].includes(stage),prior=phase==='variant_a'&&stage==='scanB';
   const failedMutation=mode==='late-rejection'&&['title','sql'].includes(stage);
   assert.equal(h.saved,prior||retain&&!failedMutation);assert.equal(h.pending,(retain&&failedMutation)||stage==='admissionAck');
  }finally{h.close();await flush();}
 });
 await test('one monotonic budget spans scan token and video; no renewed per-step wait',async()=>{const h=harness({held:['scanA','token','videoJSON']});try{await entry(h,'scanA');h.advance(30000);h.release('scanA');await entry(h,'token');h.advance(20000);h.release('token');await entry(h,'videoJSON');h.advance(4999);await flush();assert.equal(h.result,undefined);h.advance(1);await retired(h);h.release('videoJSON');await flush();assert(!h.calls.includes('admission'));}finally{h.close();await flush();}});
 for(const phase of ['variant_a','variant_b'])await test(phase+' success preserves counters and original title/SQL; clears timer',async()=>{const h=harness({phase});await h.original;await flush();assert.equal(h.result.unconfirmed,undefined);assert.equal(h.result.switched,phase==='variant_a'?1:0);assert.equal(h.result.completed,phase==='variant_b'?1:0);assert.equal(h.saved,true);assert.equal(h.pending,false);assert.equal(h.timers.size,0);});
 await test('deadline before scheduled first scan invokes no dependency',async()=>{const h=harness();h.advance(55000,false);await retired(h);assert.equal(h.calls.length,0);});
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results};
}
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='PASS'?0:1;});
module.exports={run,harness,entry,flush};
