'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture:transport}=require('./shared-email.test.cjs'),{deferred}=require('./lifecycle-fixture.cjs');
function fixture(options={}){
 const account={id:'synthetic-user',email:'synthetic@example.invalid',name:'<name>',lang:'es',emailVerified:new Date(),marketingOptOut:false,...options.account};
 const calls=[],queries=[],records=new Map(),markers=new Map(),writes=[],pending=[],entered={},gates={};
 const mail=transport({missing:options.missing,fetch:options.fetch});
 function track(stage,fn){calls.push(stage);entered[stage]=true;const p=(async()=>{if(options.held===stage)await(gates[stage]??=deferred()).promise;if(options.fail===stage)throw Error('PRIVATE_FAILURE');return fn();})();pending.push(p);void p.catch(()=>{});return p;}
 const query=(sql,...args)=>track(sql.includes('WITH locked_clock')?'admit':sql.includes('AS eligible')?'eligible':sql.includes('DELETE FROM lifecycle')?'close':'lock',()=>{
  queries.push({sql,args});if(options.sql)return options.sql(sql,args);
  const [id,noticeId,token]=args;
  if(sql.includes('WITH locked_clock')){if(options.denied||options.prior||records.has(id)||markers.has(id))return[];
   markers.set(id,{noticeId});records.set(id,{id:noticeId,userId:id,token,lang:account.lang,rating:null,comment:null,submittedAt:null});
   const r=[{noticeId,token}];return options.badAdmission?options.badAdmission(r):r;
  }
  if(sql.includes('AS eligible'))return options.badEligibility??[{eligible:!options.ineligible}];
  if(sql.includes('DELETE FROM lifecycle')){
   if(markers.get(id)?.noticeId!==noticeId)return[];
   if(sql.includes('WITH accepted')){writes.push({id,noticeId,token});}
   markers.delete(id);return options.badClose??[{noticeId}];
  }
  return options.absent?[]:[account];
 });
 let transactions=0;
 const prisma=options.prisma??{$queryRawUnsafe:query,$transaction:async cb=>{const r=await cb({$queryRawUnsafe:query});if(++transactions===1&&options.lostCommit)throw Error('PRIVATE_COMMIT');return r;},
 user:{findMany:async()=>[{id:account.id,email:account.email}],findUnique:async()=>options.absent?null:{id:account.id}}};
 const clock={at:Date.now(),elapsed:100},controller=new AbortController(),globals={Date:new Proxy(Date,{get(t,k,r){return k==='now'?()=>clock.at:Reflect.get(t,k,r);}}),Buffer,Headers,AbortController,performance:{now:()=>clock.elapsed},process:{env:{CRON_SECRET:'closed-feedback-evening-secret',AUTH_URL:'http://127.0.0.1:4300',LIFECYCLE_EMAILS_LIVE:'true',...options.env}}};
 const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/send-email':mail.api,'@/lib/internal-accounts':{isInternalAccount:e=>e==='internal@example.invalid'}};
 const api=load('lib/feedback-email-original.ts',deps,globals),native=load('lib/cron-dispatch-original.ts',{'node:crypto':require('node:crypto')},globals),agentModule=load('lib/agent/feedback-agent.ts',{'@/lib/prisma':{prisma:{user:{findMany:q=>track('scan',()=>prisma.user.findMany(q))}}},'@/lib/feedback-email-original':api,'@/lib/cron-dispatch-original':native},globals),make=(slot='evening')=>new Request(globals.process.env.AUTH_URL+'/api/cron/'+slot,{headers:{authorization:'Bearer '+globals.process.env.CRON_SECRET},signal:controller.signal}),begin=(run,slot='evening')=>{const p=native.runCronDispatch(native.authorizeCronDispatch(make(slot),slot),async(...args)=>{const cap=args[11]();return args[0](()=>run?run(cap):agentModule.runFeedbackAgent(cap));});pending.push(p);void p.catch(()=>{});return p;},agent={runFeedbackAgent:()=>begin()};
 const admin=load('app/api/admin/send-feedback/route.ts',{'next/server':{NextResponse:Response},'@/lib/prisma':{prisma},'@/lib/feedback-email-original':api,'@/lib/auth-guards':{requireAdmin:async()=>options.unauthorized?{ok:false,response:Response.json({error:'No autorizado'},{status:403})}:{ok:true,email:'synthetic-admin@example.invalid'}}},globals);
 function dispatch(expected=account.email,before){const o=api.prepareFeedbackOriginal(account.id,expected,before),p=api.dispatchFeedbackOriginal(o);pending.push(p);return p;}
 function post(value={email:account.email},signal){const p=admin.POST(new Request('https://example.invalid/api/admin/send-feedback',{method:'POST',body:JSON.stringify(value),headers:{'content-type':'application/json'},signal}));pending.push(p);return p;}
 return{track,api,agent,agentModule,native,clock,controller,begin,make,admin,account,prisma,mail,records,markers,writes,pending,queries,calls,entered,gates,deps,globals,dispatch,post,
  async reach(stage){for(let i=0;i<500&&!entered[stage];i++)await new Promise(r=>setTimeout(r,2));assert(entered[stage]);},
  async finish(){for(const g of Object.values(gates))g.resolve();await Promise.allSettled(pending);}};
}
module.exports={fixture,deferred};
