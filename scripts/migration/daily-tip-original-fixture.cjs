'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
function fixture(o={}){
 const clock={at:o.at??Date.UTC(2026,9,16,12),elapsed:100},controller=new AbortController(),env={CRON_SECRET:'closed-tip-cron-secret',AUTH_URL:'http://127.0.0.1:4300'},calls=[],pending=[],entered={},gate=deferred(),store=o.store??{attempts:new Map(),tips:new Map()};
 const globals={Buffer,Headers,Date:new Proxy(Date,{get(t,k,r){return k==='now'?()=>clock.at:Reflect.get(t,k,r);}}),performance:{now:()=>clock.elapsed},process:{env}};
 function stage(name,fn){const p=(async()=>{calls.push(name);(entered[name]??=deferred()).resolve();if(o.held===name)await gate.promise;if(o.fail===name)throw Error('Closed '+name+' failure');const value=await fn();if(o.lost===name)throw Error('Closed lost '+name+' ACK');return value;})();pending.push(p);void p.catch(()=>{});return p;}
 const query=(sql,...args)=>{const name=sql.includes('WITH own AS')?'complete':'admit';return stage(name,async()=>{if(o.sql)return o.sql(sql,args);const [id,date,es,en]=args;if(name==='admit'){if(store.attempts.has(date)||store.tips.has(date))return[];const row={id,date,state:'pending',createdAt:'original-created',completedAt:null};store.attempts.set(date,row);const ack=[{id,date,state:row.state}];return o.badAdmission?o.badAdmission(ack):ack;}
 const row=store.attempts.get(date);if(!row||row.id!==id||row.state!=='pending'||store.tips.has(date))return[];if(o.zeroCompletion)return[];store.tips.set(date,{date,es,en});row.state='completed';row.completedAt='same-original-completed';const ack=[{date,attemptId:id}];return o.badCompletion?o.badCompletion(ack):ack;});};
 const db={dailyTip:{findUnique:q=>stage('read',async()=>o.read?o.read(q):store.tips.get(q.where.date)??null)},$queryRawUnsafe:query};
 const runtime={getMessagesTask:identity=>stage('task',async()=>{assert.equal(identity.taskType,'site.daily-tip');assert.equal(identity.serviceId,'morning-cron');assert.match(identity.operationKey,/^[0-9a-f-]{36}$/);return{create:params=>stage('model',async()=>{assert.equal(params.max_tokens,300);return{content:[{type:'text',text:o.text??'{"es":"Consejo cerrado","en":"Closed tip"}'}]};})};})};
 const native=load('lib/cron-dispatch-original.ts',{'node:crypto':crypto},globals),mocks={'node:crypto':crypto,'@/lib/prisma':{prisma:db},'@/lib/ai/task-runtime':runtime,'@/lib/cron-dispatch-original':native},tip=load('lib/daily-tip-original.ts',mocks,globals);
 const make=()=>new Request(env.AUTH_URL+'/api/cron/morning',{headers:{authorization:'Bearer '+env.CRON_SECRET},signal:controller.signal});
 const b={clock,controller,env,calls,pending,entered,store,db,native,tip,mocks,globals,cap:null,make,release:()=>gate.resolve(),begin(run){const p=native.runCronDispatch(native.authorizeCronDispatch(make(),'morning'),async(step,issue)=>{b.cap=issue();return step(()=>run?run(b.cap,tip):tip.generateDailyTipOriginal(b.cap));});pending.push(p);void p.catch(()=>{});return p;},module:()=>load('lib/daily-tip-original.ts',mocks,globals)};
 return b;
}
async function reached(b,name){let timer;try{await Promise.race([(b.entered[name]??=deferred()).promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Missing daily tip stage '+name)),4000))]);}finally{clearTimeout(timer);}}
async function drain(b){b.release();let n;do{n=b.pending.length;await Promise.allSettled(b.pending);await flush();}while(n!==b.pending.length);}
module.exports={fixture,reached,drain};
