'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture:transport}=require('./shared-email.test.cjs'),{deferred}=require('./lifecycle-fixture.cjs');
const body={name:' <Synthetic & channel> ',email:' SYNTHETIC@EXAMPLE.INVALID ',lang:'es',channelInfo:'first <script>bad</script>\r\nsecond "line"'};
function fixture(options={}){
 let now=0,serial=0;const timers=new Map(),calls={sql:[],mail:[],ip:[],email:[]},rows=new Map(),admissions=new Map(),afterJobs=[],owned=[],entered={},gates={};
 const features={AFFILIATES_DORMANT:options.dormant??false},env={AFFILIATE_APPLICATION_EMAILS_LIVE:'true',...options.env};
 function step(name,fn){entered[name]=true;const p=(async()=>{if(options.held===name)await(gates[name]??=deferred()).promise;if(options.fail===name)throw Error('PRIVATE_FAILURE');return fn();})();owned.push(p);void p.catch(()=>{});return p;}
 const sql=(query,...args)=>step(query.includes('WITH admitted')?'create':query.includes('AS eligible')?'eligible':'complete',()=>{
  calls.sql.push({query,args});if(options.sql)return options.sql(query,args);
  if(query.includes('WITH admitted')){
   const [email,noticeId,id,lang,code,name,channelInfo]=args;if(options.prior||rows.has(email)||admissions.has(email))return[];
   rows.set(email,{id,code,name,email,channelInfo,status:'pending'});admissions.set(email,{noticeId,affiliateId:id,lang,status:'pending'});
   const r=[{id,code,name,email,channelInfo,lang,noticeId}];return options.badCreate?options.badCreate(r):r;
  }
  if(query.includes('AS eligible'))return Object.hasOwn(options,'badEligibility')?options.badEligibility:[{eligible:!options.ineligible}];
  const [email,noticeId,id,status]=args;if(admissions.get(email)?.noticeId!==noticeId)return[];
  Object.assign(admissions.get(email),{status,completed:true});return options.badComplete??[{noticeId}];
 });
 const prisma=options.prisma??{$queryRawUnsafe:sql};
 const mail=transport({missing:options.missing,fetch:(url,init)=>step('mail',()=>{calls.mail.push({url,init});return options.fetch?options.fetch(url,init):Response.json({id:'synthetic-provider-ack'});})});
 const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/send-email':mail.api,'@/lib/features':features,'@/lib/admin-email':{ADMIN_EMAIL:options.admin??'synthetic-admin@example.invalid'},'@/lib/disposable-domains':load('lib/disposable-domains.ts')};
 const api=load('lib/affiliate-application.ts',deps,{process:{env}}),reply=load('lib/affiliate-application-response.ts');
 const limiters={rateLimitRequest:(r,p,n,m,closed)=>step('ip',()=>{calls.ip.push({p,n,m,closed});return !options.ipDenied;}),rateLimitDb:(k,n,m,closed)=>step('email',()=>{calls.email.push({k,n,m,closed});return !options.emailDenied;})};
 const route=load('app/api/affiliates/apply/route.ts',{'next/server':{NextResponse:Response,after:fn=>{afterJobs.push(fn);if(options.afterThrow)throw Error('PRIVATE_AFTER_FAILURE');}},'@/lib/features':features,'@/lib/rate-limit-db':limiters,'@/lib/affiliate-application':api},{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 const job=(value=body)=>api.prepareAffiliateApplicationJob(api.parseAffiliateApplication(value));
 const dispatch=(value=body)=>{const o=job(value),p=api.dispatchAffiliateApplication(o);owned.push(p);return p;};
 const post=(value=body,signal)=>{const p=route.POST(new Request('https://example.invalid/api/affiliates/apply',{method:'POST',body:JSON.stringify(value),headers:{'content-type':'application/json'},signal}));owned.push(p);return p;};
 return{api,route,reply,prisma,deps,env,features,mail,calls,rows,admissions,afterJobs,owned,timers,entered,gates,job,dispatch,post,
  runAfter(){const jobs=afterJobs.map(fn=>fn());owned.push(...jobs);return Promise.all(jobs);},
  advance(ms=25000){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  async reach(stage){for(let i=0;i<400&&!entered[stage];i++)await new Promise(r=>setTimeout(r,2));assert(entered[stage]);},
  async finish(){for(const g of Object.values(gates))g.resolve();await Promise.allSettled(owned);}
 };
}
module.exports={fixture,body,deferred};
