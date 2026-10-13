'use strict';
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const assert=require('node:assert/strict'),{fixture,body}=require('./signup-server.test.cjs'),{load}=require('./route-harness.cjs');
const {NextResponse,after}=require('next/server'),{AfterContext}=require('next/dist/server/after/after-context');
const {workAsyncStorage}=require('next/dist/server/app-render/work-async-storage.external'),{workUnitAsyncStorage}=require('next/dist/server/app-render/work-unit-async-storage.external');
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
async function run(){
 const results=[];
 for(const outcome of ['provider-accepted','unconfirmed','not-configured']){
  let resolve;const pending=new Promise(r=>{resolve=r;}),h=fixture({mail:()=>pending}),close=[],wait=[],errors=[];
  const ctx=new AfterContext({waitUntil:p=>wait.push(p),onClose:fn=>close.push(fn),onTaskError:e=>errors.push(e)});
  const route=load('app/api/signup/route.ts',{'next/server':{NextResponse,after},'@/lib/signup-input':h.inputApi,'@/lib/signup-turnstile':h.captcha,'@/lib/email-verification-resend':h.notices,'@/lib/rate-limit-db':{rateLimitRequest:async()=>true}},{...h.globals,console:{info(){}}});
  try{
   await workAsyncStorage.run({afterContext:ctx},()=>workUnitAsyncStorage.run({phase:'action',type:'request'},async()=>{
    const r=await route.POST(new Request('https://synthetic.invalid/api/signup',{method:'POST',body:JSON.stringify(body)}));
    assert.equal(r.status,201);assert.deepEqual(await r.json(),{success:true});assert.equal(r.headers.get('set-cookie'),null);assert.equal(h.calls.mail.length,0);assert.equal(h.calls.sql.length,1);assert.equal(wait.length,1);
    for(const fn of close)fn();await flush();assert.equal(h.calls.mail.length,1);let settled=false;const original=Promise.all(wait).then(()=>{settled=true;});await flush();assert.equal(settled,false);
    resolve(outcome);await original;assert.equal(h.calls.sql.length,outcome==='unconfirmed'?2:3);assert.equal(h.calls.mail.length,1);assert.equal(errors.length,0);
   }));
   results.push({name:'installed Next after joins original signup notice '+outcome+' after account ACK',status:'PASS'});
  }finally{resolve('unconfirmed');for(const fn of close)fn();await Promise.allSettled(wait);}
 }
 return{status:'PASS',scope:'Installed Next after/ALS/waitUntil. Declared fixed synthetic Siteverify, SQL and provider originals, no operative freshness/authentication/account/email/delivery acceptance.',results};
}
module.exports={run};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing signup after terminal');process.exit(1);},25000);run().then(r=>{clearTimeout(timer);console.log(JSON.stringify(r,null,2));}).catch(e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});}
