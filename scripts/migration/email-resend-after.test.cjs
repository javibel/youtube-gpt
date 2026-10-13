'use strict';
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const assert=require('node:assert/strict'),{fixture}=require('./email-verification-resend.test.cjs'),{load}=require('./route-harness.cjs');
const {NextResponse,after}=require('next/server'),{AfterContext}=require('next/dist/server/after/after-context');
const {workAsyncStorage}=require('next/dist/server/app-render/work-async-storage.external'),{workUnitAsyncStorage}=require('next/dist/server/app-render/work-unit-async-storage.external');
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
async function run(){
 const results=[];
 for(const outcome of ['provider-accepted','unconfirmed','not-configured']){
  let resolve;const pending=new Promise(r=>{resolve=r;}),h=fixture({mail:()=>pending}),close=[],wait=[],errors=[];
  const ctx=new AfterContext({waitUntil:p=>wait.push(p),onClose:fn=>close.push(fn),onTaskError:e=>errors.push(e)});
  const route=load('app/api/auth/resend-verification/route.ts',{'next/server':{NextResponse,after},'@/lib/email-verification-resend':h.api,'@/lib/rate-limit-db':{rateLimitRequest:async()=>true}},{console:{info(){}}});
  await workAsyncStorage.run({afterContext:ctx},()=>workUnitAsyncStorage.run({phase:'action',type:'request'},async()=>{
   const r=await route.POST(new Request('https://synthetic.invalid/api/auth/resend-verification',{method:'POST',body:JSON.stringify({email:'synthetic-resend@example.invalid',lang:'es'})}));
   assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(h.calls.mail.length,0);assert.equal(h.store.marker,true);assert.equal(wait.length,1);
   for(const fn of close)fn();await flush();assert.equal(h.calls.mail.length,1);let settled=false;const original=Promise.all(wait).then(()=>{settled=true;});await flush();assert.equal(settled,false);
   resolve(outcome);await original;assert.equal(h.store.marker,outcome==='unconfirmed');assert.equal(h.calls.mail.length,1);assert.equal(errors.length,0);
  }));
  results.push({name:'installed Next after joins same resend original '+outcome+' after request ACK',status:'PASS'});
 }
 return{status:'PASS',scope:'Installed Next after/ALS/waitUntil with closed synthetic SQL/provider originals. No listener, actual mail/account/delivery acceptance or serialized recovery.',results};
}
module.exports={run};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing resend after terminal');process.exit(1);},25000);run().then(r=>{clearTimeout(timer);console.log(JSON.stringify(r,null,2));}).catch(e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});}
