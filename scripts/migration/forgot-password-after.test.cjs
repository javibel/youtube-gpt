'use strict';
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const assert=require('node:assert/strict'),{fixture,body}=require('./forgot-password-server.test.cjs'),{load}=require('./route-harness.cjs'),{NextResponse,after}=require('next/server'),{AfterContext}=require('next/dist/server/after/after-context'),{workAsyncStorage}=require('next/dist/server/app-render/work-async-storage.external'),{workUnitAsyncStorage}=require('next/dist/server/app-render/work-unit-async-storage.external'),{deferred,flush}=require('./chat-widget-harness.cjs');
async function run(){const results=[];
 for(const outcome of ['accepted','unknown','unconfigured']){
  const gate=deferred(),h=fixture(outcome==='unconfigured'?{noProvider:true}:{response:()=>gate.promise}),closed=[],wait=[],errors=[],ctx=new AfterContext({waitUntil:p=>wait.push(p),onClose:fn=>closed.push(fn),onTaskError:e=>errors.push(e)});
  const route=load('app/api/auth/forgot-password/route.ts',{'next/server':{NextResponse,after},'@/lib/forgot-password-server':h.api,'@/lib/rate-limit-db':{rateLimitRequest:async()=>true,rateLimitDb:async()=>true}},{process:{env:{APP_PUBLIC_URL:'https://example.invalid'}}});
  try{
   await workAsyncStorage.run({afterContext:ctx},()=>workUnitAsyncStorage.run({phase:'action',type:'request'},async()=>{
    const reply=await route.POST(new Request('https://example.invalid/api/auth/forgot-password',{method:'POST',body:JSON.stringify(body)}));assert.equal(reply.status,202);assert.deepEqual(await reply.json(),{ok:true,status:'accepted'});assert.equal(h.calls.sql.length,0);assert.equal(h.calls.mail.length,0);assert.equal(wait.length,1);
    for(const fn of closed)fn();await flush();
    if(outcome!=='unconfigured'){await h.reach('mail');let settled=false;const original=Promise.all(wait).then(()=>settled=true);await flush();assert.equal(settled,false);gate.resolve(Response.json({id:'native-ack'},{status:outcome==='unknown'?503:200}));await original;}
    else await Promise.all(wait);
    assert.equal(h.calls.mail.length,outcome==='unconfigured'?0:1);assert.equal(h.calls.sql.length,outcome==='unknown'?2:3);assert.equal(errors.length,0);
   }));
   results.push({name:'installed Next after holds original forgot job through native '+outcome,status:'PASS'});
  }finally{gate.resolve(Response.json({id:'released'}));for(const fn of closed)fn();await Promise.allSettled(wait);}
 }
 return{status:'PASS',scope:'Installed Next after/ALS/waitUntil with actual route and closed original SQL/provider; no durable scheduler, provider delivery or real account/authentication acceptance.',results};
}
module.exports={run};if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
