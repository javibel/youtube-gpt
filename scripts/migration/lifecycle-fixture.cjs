'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture:transport}=require('./shared-email.test.cjs');
const env={LIFECYCLE_EMAILS_LIVE:'true',EMAIL_TOKEN_SECRET:'synthetic-unsubscribe-secret-32-bytes'};
function fixture(options={}){
 const calls=[],queries=[],writes=[],pending=[],markers=new Map(),logs=[],entered={},gates={};
 const account={id:'synthetic-user',email:'synthetic@example.invalid',name:'<name>',lang:'es',emailVerified:new Date(),marketingOptOut:false,...options.account};
 const templates=load('lib/lifecycle-emails.ts',{'./email-token':{signUnsubscribe:()=> 'synthetic-local-unsubscribe'}});
 const mail=transport({missing:options.missing,fetch:options.fetch});
 function track(stage,fn){calls.push(stage);entered[stage]=true;const p=(async()=>{if(options.held===stage)await(gates[stage]??=deferred()).promise;if(options.fail===stage)throw Error('PRIVATE_failure');return fn();})();pending.push(p);void p.catch(()=>{});return p;}
 const query=async(sql,...args)=>track(sql.includes('WITH locked_clock')?'admit':sql.includes('AS eligible')?'eligible':sql.includes('DELETE FROM lifecycle')?'close':'lock',async()=>{
  queries.push({sql,args});if(options.sql)return options.sql(sql,args);
  const [userId,id,seq,step]=args;
  if(sql.includes('WITH locked_clock')){
   if(options.denied||markers.has(userId)||logs.some(l=>l.userId===userId))return[];
   markers.set(userId,{userId,noticeId:id,sequence:seq,step});
   const row=[{noticeId:id}];return options.badAdmission?options.badAdmission(row):row;
  }
  if(sql.includes('AS eligible'))return options.badEligibility??[{eligible:!options.noLongerEligible}];
  if(sql.includes('DELETE FROM lifecycle')){
   if(!markers.has(userId)||markers.get(userId).noticeId!==id)return[];
   if(sql.includes('WITH accepted')){writes.push({userId,sequence:seq,step});logs.push({userId,sequence:seq,step});}
   markers.delete(userId);return options.badClose??[{noticeId:id}];
  }
  return options.absent?[]:[account];
 });
 let transactions=0;
 const prisma=options.prisma??{$queryRawUnsafe:query,$transaction:async cb=>{const r=await cb({$queryRawUnsafe:query});if(++transactions===1&&options.lostCommit)throw Error('PRIVATE_COMMIT');return r;},
  user:{findUnique:async()=>track('current',()=>options.current??account)},
  emailLog:{findUnique:async()=>null,findFirst:async()=>null,create:async q=>{writes.push(q.data);return{id:'synthetic'};}}};
 const globals={Date,process:{env:{...env,...options.env}}};
 const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/send-email':mail.api,
  '@/lib/lifecycle-emails':templates,'@/lib/internal-accounts':{isInternalAccount:e=>e==='internal@example.invalid'}};
 const api=load('lib/lifecycle-email-original.ts',deps,globals);
 const trigger=load('lib/lifecycle-trigger.ts',{...deps,'@/lib/lifecycle-email-original':api},globals);
 function dispatch(step='c3',seq='conv',extra,before){const o=api.prepareLifecycleOriginal(account.id,seq,step,extra,before);const p=api.dispatchLifecycleOriginal(o);pending.push(p);return p;}
 return{api,trigger,mail,prisma,account,queries,writes,markers,calls,pending,entered,gates,dispatch,deps,globals,
  async reach(stage){for(let i=0;i<400&&!entered[stage];i++)await new Promise(r=>setTimeout(r,2));assert(entered[stage],'Missing original '+stage);},
  async finish(){for(const g of Object.values(gates))g.resolve();await Promise.allSettled(pending);}};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
module.exports={fixture,deferred,env};
