'use strict';
globalThis.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
const assert=require('node:assert/strict'),{fixture,body}=require('./waitlist-fixture.cjs'),{load}=require('./route-harness.cjs'),{NextResponse,after}=require('next/server'),{AfterContext}=require('next/dist/server/after/after-context'),{workAsyncStorage}=require('next/dist/server/app-render/work-async-storage.external'),{workUnitAsyncStorage}=require('next/dist/server/app-render/work-unit-async-storage.external'),{deferred}=require('./lifecycle-fixture.cjs');
async function run(){const results=[];
 for(const outcome of ['accepted','unknown','unconfigured']){
  const gate=deferred(),h=fixture(outcome==='unconfigured'?{missing:true}:{fetch:()=>gate.promise}),closed=[],wait=[],errors=[],ctx=new AfterContext({waitUntil:p=>wait.push(p),onClose:fn=>closed.push(fn),onTaskError:e=>errors.push(e)});
  const route=load('app/api/waitlist/route.ts',{'next/server':{NextResponse,after},'@/lib/prisma':{prisma:h.prisma},'@/lib/waitlist-server':h.api,'@/lib/rate-limit-db':{rateLimitRequest:async()=>true,rateLimitDb:async()=>true}});
  try{
   await workAsyncStorage.run({afterContext:ctx},()=>workUnitAsyncStorage.run({phase:'action',type:'request'},async()=>{
    const reply=await route.POST(new Request('https://example.invalid/api/waitlist',{method:'POST',body:JSON.stringify(body)}));assert.equal(reply.status,202);assert.deepEqual(await reply.json(),{ok:true,status:'accepted'});assert.equal(h.calls.sql.length,0);assert.equal(h.calls.mail.length,0);assert.equal(wait.length,1);
    for(const fn of closed)fn();
    if(outcome!=='unconfigured'){await h.reach('mail');let settled=false;const original=Promise.all(wait).then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);gate.resolve(Response.json({id:'native-ack'},{status:outcome==='unknown'?503:200}));await original;}else await Promise.all(wait);
    assert.equal(h.calls.mail.length,outcome==='unconfigured'?0:1);assert.equal(h.calls.sql.length,outcome==='unknown'?2:3);assert.equal(errors.length,0);
   }));results.push({name:'installed Next after holds own waitlist job through '+outcome,status:'PASS'});
  }finally{gate.resolve(Response.json({id:'own-finally-release'}));for(const fn of closed)fn();await Promise.allSettled(wait);}
 }
 return{status:'PASS',scope:'Installed Next after/ALS/waitUntil and actual route/job, closed SQL/HTTP only; no cross-process scheduling recovery or operational admission/source/consent/freshness/delivery.',results};
}
module.exports={run};if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});
