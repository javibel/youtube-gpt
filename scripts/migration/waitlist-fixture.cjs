'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture:transport}=require('./shared-email.test.cjs'),{deferred}=require('./lifecycle-fixture.cjs');
const body={email:' SYNTHETIC@EXAMPLE.INVALID ',lang:'es',source:'launch-page',referrer:'https://referrer.invalid/a?private=secret#fragment'};
function fixture(options={}){
 let now=0,serial=0;const timers=new Map(),calls={sql:[],mail:[],ip:[],email:[]},rows=new Map(),admissions=new Map(),afterJobs=[],owned=[],entered={},gates={};
 const env={WAITLIST_EMAILS_LIVE:'true',...options.env};
 function step(name,fn){entered[name]=true;const p=(async()=>{if(options.held===name)await(gates[name]??=deferred()).promise;if(options.fail===name)throw Error('PRIVATE_FAILURE');return fn();})();owned.push(p);void p.catch(()=>{});return p;}
 const sql=(query,...args)=>step(query.includes('WITH created')?'create':query.includes('AS eligible')?'eligible':'complete',()=>{
  calls.sql.push({query,args});if(options.sql)return options.sql(query,args);
  if(query.includes('WITH created')){
   const [id,email,source,referrer,lang,noticeId]=args;if(options.prior||rows.has(email))return[];
   rows.set(email,{id,email,source,referrer,lang});admissions.set(email,{noticeId,rowId:id,status:'pending'});
   const r=[{id,email,lang,noticeId}];return options.badCreate?options.badCreate(r):r;
  }
  if(query.includes('AS eligible'))return options.badEligibility??[{eligible:!options.ineligible}];
  const [email,noticeId,rowId,status]=args;if(admissions.get(email)?.noticeId!==noticeId)return[];
  Object.assign(admissions.get(email),{status,completed:true});return options.badComplete??[{noticeId}];
 });
 const prisma=options.prisma??{$queryRawUnsafe:sql,launchWaitlist:{count:async()=>options.count??rows.size}};
 const mail=transport({missing:options.missing,fetch:(url,init)=>step('mail',()=>{calls.mail.push({url,init});return options.fetch?options.fetch(url,init):Response.json({id:'synthetic-provider-ack'});})});
 const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/send-email':mail.api,'@/lib/emails':load('lib/emails.ts')};
 const api=load('lib/waitlist-server.ts',deps,{process:{env}}),reply=load('lib/waitlist-response.ts');
 const limiters={rateLimitRequest:(r,p,n,m,closed)=>step('ip',()=>{calls.ip.push({p,n,m,closed});return options.ipDenied?false:true;}),rateLimitDb:(k,n,m,closed)=>step('email',()=>{calls.email.push({k,n,m,closed});return options.emailDenied?false:true;})};
 const route=load('app/api/waitlist/route.ts',{'next/server':{NextResponse:Response,after:fn=>{afterJobs.push(fn);if(options.afterThrow)throw Error('PRIVATE_AFTER_FAILURE');}},'@/lib/prisma':{prisma},'@/lib/rate-limit-db':limiters,'@/lib/waitlist-server':api},{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 function job(value=body){return api.prepareWaitlistJob(api.parseWaitlistInput(value));}
 function dispatch(value=body){const o=job(value),p=api.dispatchWaitlistJob(o);owned.push(p);return p;}
 function post(value=body,signal){const p=route.POST(new Request('https://example.invalid/api/waitlist',{method:'POST',body:JSON.stringify(value),headers:{'content-type':'application/json'},signal}));owned.push(p);return p;}
 return{api,route,reply,prisma,deps,env,mail,calls,rows,admissions,afterJobs,owned,timers,entered,gates,job,dispatch,post,
  async runAfter(){const jobs=afterJobs.map(fn=>fn());owned.push(...jobs);return Promise.all(jobs);},
  advance(ms=25000){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  async reach(stage){for(let i=0;i<400&&!entered[stage];i++)await new Promise(r=>setTimeout(r,2));assert(entered[stage]);},
  async finish(){for(const g of Object.values(gates))g.resolve();await Promise.allSettled(owned);}};
}
module.exports={fixture,body,deferred};
