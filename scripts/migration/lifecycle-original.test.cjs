'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture,deferred}=require('./lifecycle-fixture.cjs');
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
await test('private handle owns one native transaction/HTTP/accepted log; clone/JSON/foreign module denied',async()=>{
 const h=fixture(),o=h.api.prepareLifecycleOriginal(h.account.id,'onboarding','a1'),a=h.api.dispatchLifecycleOriginal(o),b=h.api.dispatchLifecycleOriginal(o);
 assert.equal(a,b);assert(Object.isFrozen(o));assert.deepEqual(Object.keys(o),['kind']);
 for(const c of [{...o},JSON.parse(JSON.stringify(o)),{kind:o.kind,userId:h.account.id,noticeId:'known'}])assert.equal(await h.api.dispatchLifecycleOriginal(c),'not-issued');
 const other=load('lib/lifecycle-email-original.ts',h.deps,h.globals);assert.equal(await other.dispatchLifecycleOriginal(o),'not-issued');
 assert.equal(await a,'provider-accepted');assert.equal(h.mail.calls.length,1);assert.equal(h.writes.length,1);assert.equal(h.markers.size,0);
 const p=JSON.parse(h.mail.calls[0].init.body);assert.equal(p.from,'YTubViral <hello@ytubviral.com>');assert.equal(p.reply_to,'hello@ytubviral.com');assert(p.html.includes('&lt;name&gt;'));assert(p.headers['List-Unsubscribe']);
});
for(const [name,args]of [['id',['bad space','conv','c3']],['sequence',['synthetic-user','billing','c3']],['step',['synthetic-user','conv','foreign']],['injection',['synthetic-user','conv','c1',{resetDay:'<img>'}]],['unexpected-extra',['synthetic-user','conv','c3',{noticeId:'id'}]],['renew',['synthetic-user','conv','c1',{resetDay:32}]],['caller-hook',['synthetic-user','conv','c3',undefined,'hook']]])
 await test('strict captured input '+name,async()=>{const h=fixture();assert.equal(h.api.prepareLifecycleOriginal(...args),undefined);assert.equal(h.queries.length,0);assert.equal(h.mail.calls.length,0);});
await test('captured extra remains unchanged by caller; fixed configured template only',async()=>{const h=fixture(),extra={resetDay:1},o=h.api.prepareLifecycleOriginal(h.account.id,'conv','c1',extra);extra.resetDay=31;assert.equal(await h.api.dispatchLifecycleOriginal(o),'provider-accepted');assert(JSON.parse(h.mail.calls[0].init.body).html.includes('el día 1'));});
for(const [name,options]of [['dry-run',{env:{LIFECYCLE_EMAILS_LIVE:'false'}}],['missing-unsubscribe',{env:{EMAIL_TOKEN_SECRET:''}}],['unverified',{account:{emailVerified:null}}],['opt-out',{account:{marketingOptOut:true}}],['internal',{account:{email:'internal@example.invalid'}}],['absent',{absent:true}],['cooldown',{denied:true}]])
 await test('negative '+name+' never emits',async()=>{const h=fixture(options);await h.dispatch();assert.equal(h.mail.calls.length,0);assert.equal(h.markers.size,0);assert.equal(h.writes.length,0);});
for(const fail of ['lock','admit','eligible','current','close'])await test('native '+fail+' failure cannot fallback/replay/claim accepted',async()=>{
 const h=fixture({fail});assert.equal(await h.dispatch(),'unconfirmed');if(['eligible','current','close'].includes(fail))assert.equal(h.markers.size,1);assert.equal(h.mail.calls.length,fail==='close'?1:0);assert.equal(h.writes.length,0);
 if(h.markers.size){await h.trigger.triggerConversionEmail(h.account.id,'c1',{resetDay:1});assert.equal(h.mail.calls.length,fail==='close'?1:0);}
});
await test('unknown transaction commit retains marker without independent adoption',async()=>{const h=fixture({lostCommit:true});assert.equal(await h.dispatch(),'unconfirmed');assert.equal(h.mail.calls.length,0);assert.equal(h.markers.size,1);assert.equal(await h.dispatch('c1'),'not-required');});
for(const bad of [[],[{noticeId:'foreign'}],[{noticeId:'foreign',resume:true}],null])
 await test('malformed admission ACK cannot create mail authority '+JSON.stringify(bad),async()=>{const h=fixture({badAdmission:()=>bad});await h.dispatch();assert.equal(h.mail.calls.length,0);});
for(const stage of ['HTTP','body'])await test('held '+stage+' retains actual promise and excludes another conversion or cron candidate',async()=>{
 const gate=deferred();let reader;const h=fixture({fetch:()=>stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){reader=c;}}),{headers:{'content-type':'application/json'}})});
 const o=h.api.prepareLifecycleOriginal(h.account.id,'conv','c3'),p=h.api.dispatchLifecycleOriginal(o);h.pending.push(p);
 for(let i=0;i<100&&h.mail.calls.length===0;i++)await Promise.resolve();
 assert.equal(h.api.dispatchLifecycleOriginal(o),p);assert.equal(await h.dispatch('a1','onboarding'),'not-required');assert.equal(h.mail.calls.length,1);assert.equal(h.writes.length,0);
 if(stage==='HTTP')gate.resolve(Response.json({id:'late-own-ack'}));else{reader.enqueue(new TextEncoder().encode('{"id":"late-own-ack"}'));reader.close();}
 assert.equal(await p,'provider-accepted');assert.equal(h.writes.length,1);
});
await test('provider lost ACK retains durable negative admission, no clock/reset retry',async()=>{const h=fixture({fetch:()=>Response.json({id:'looks-accepted'},{status:503})});assert.equal(await h.dispatch(),'unconfirmed');assert.equal(h.markers.size,1);assert.equal(await h.dispatch('c1'),'not-required');assert.equal(await h.dispatch('a1','onboarding'),'not-required');assert.equal(h.mail.calls.length,1);assert.equal(h.writes.length,0);});
await test('known no provider emission closes only own admission without logging sent',async()=>{const h=fixture({missing:true});assert.equal(await h.dispatch(),'not-configured');assert.equal(h.mail.calls.length,0);assert.equal(h.writes.length,0);assert.equal(h.markers.size,0);});
await test('retired live hook after transaction ACK suppresses HTTP and closes only own unissued marker',async()=>{const h=fixture();let n=0;assert.equal(await h.dispatch('c3','conv',undefined,()=>{if(++n>=3)throw Error('retired');}),'not-issued');assert.equal(h.mail.calls.length,0);assert.equal(h.markers.size,0);});
for(const option of [{noLongerEligible:true},{current:{id:'synthetic-user',email:'foreign@example.invalid',lang:'es',name:null,emailVerified:new Date(),marketingOptOut:false}}])
 await test('dependent eligibility only denies a live admitted original',async()=>{const h=fixture(option);assert.equal(await h.dispatch(),'not-issued');assert.equal(h.mail.calls.length,0);assert.equal(h.markers.size,0);});
await test('close ACK unknown never replays accepted mail or substitutes public log as authority',async()=>{const h=fixture({badClose:[{noticeId:'foreign'}]});assert.equal(await h.dispatch(),'unconfirmed');assert.equal(h.writes.length,1);assert.equal(await h.dispatch('c1'),'not-required');assert.equal(h.mail.calls.length,1);});
await test('actual cron shares same original admission and only counts exact native acceptance',async()=>{
 const gate=deferred(),h=fixture({fetch:()=>gate.promise});h.prisma.user.findMany=async()=>[{...h.account,createdAt:new Date(Date.now()-70*86400000),updatedAt:new Date(),subscription:null,_count:{generations:16}}];
 h.prisma.emailLog.findMany=async()=>[];h.prisma.generation={findFirst:async()=>({createdAt:new Date()})};
 const route=load('app/api/cron/lifecycle-emails/route.ts',{'next/server':{NextResponse:Response},'@/lib/prisma':{prisma:h.prisma},'@/lib/lifecycle-email-original':h.api,'@/lib/lifecycle-emails':h.deps['@/lib/lifecycle-emails'],'@/lib/internal-accounts':{isInternalAccount:()=>false},'@/lib/plans':{hasPaidAccess:()=>false}},{process:{env:{LIFECYCLE_EMAILS_LIVE:'true',CRON_SECRET:'synthetic-cron'}}});
 const event=h.trigger.triggerConversionEmail(h.account.id,'c3');for(let i=0;i<100&&!h.mail.calls.length;i++)await Promise.resolve();
 const response=await route.GET(new Request('https://example.invalid/api/cron/lifecycle-emails',{headers:{authorization:'Bearer synthetic-cron'}})),body=await response.json();
 assert.equal(body.sent,0);assert.equal(h.mail.calls.length,1);gate.resolve(Response.json({id:'own'}));await event;assert.equal(h.writes.length,1);
 assert.equal((await route.GET(new Request('https://example.invalid'))).status,401);
});
return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Actual lifecycle helper, conversion caller, cron, fixed templates and native shared transport with closed SQL/HTTP. No operative consent/source/freshness/delivery.',results};}
module.exports={run};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing lifecycle terminal');process.exit(1);},30000);run().then(r=>{clearTimeout(timer);console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;});}
