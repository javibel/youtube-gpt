'use strict';
// Install the native Node ALS primitive before loading the installed Next runtime,
// as its server bootstrap does. This is fixture scope, never business recovery.
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {NextResponse,after}=require('next/server');
const {AfterContext}=require('next/dist/server/after/after-context');
const {workAsyncStorage}=require('next/dist/server/app-render/work-async-storage.external');
const {workUnitAsyncStorage}=require('next/dist/server/app-render/work-unit-async-storage.external');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function run(){
 const results=[];
 for(const notice of ['provider-accepted','unconfirmed','not-configured']){
  const close=[],wait=[],errors=[],mail=deferred();let calls=0;
  const context=new AfterContext({waitUntil:p=>wait.push(p),onClose:fn=>close.push(fn),onTaskError:e=>errors.push(e)});
  const route=load('app/api/auth/verify-email/route.ts',{'next/server':{NextResponse,after},'@/lib/rate-limit-db':{rateLimitRequest:async()=>true},'@/lib/email-verification-server':{consumeEmailVerification:async()=>({status:'verified',email:'synthetic@example.invalid',name:'Synthetic'})},'@/lib/send-email':{sendDomainEmailOriginal:()=>{calls++;return mail.promise;}}},{console:{info(){}}});
  await workAsyncStorage.run({afterContext:context},()=>workUnitAsyncStorage.run({phase:'action',type:'request'},async()=>{
   const r=await route.POST(new Request('https://synthetic.invalid/api/auth/verify-email',{method:'POST',body:JSON.stringify({email:'synthetic@example.invalid',code:'123456'})}));
   assert.equal(r.status,200);assert.deepEqual(await r.json(),{verified:true});assert.equal(calls,0);
   assert.equal(wait.length,1);for(const fn of close)fn();await flush();assert.equal(calls,1);
   let settled=false;const original=Promise.all(wait).then(()=>{settled=true;});await flush();assert.equal(settled,false);
   mail.resolve(notice);await original;assert.equal(settled,true);assert.equal(calls,1);assert.equal(errors.length,0);
  }));
  results.push({name:'installed Next after responds before '+notice+' notice and waitUntil joins original promise',status:'PASS'});
 }
 return{status:'PASS',scope:'Installed Next after/AfterContext/ALS and genuine waitUntil joining in a closed synthetic request scope. No listener, browser, actual domain mail or operational delivery acceptance.',results};
}
module.exports={run};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing Next after terminal');process.exit(1);},20000);run().then(r=>{clearTimeout(timer);console.log(JSON.stringify(r,null,2));},e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});}
