'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),direct=require('./direct-email-fixture.cjs');
const email='forgot-synthetic@example.invalid',body={email,lang:'es'},empty=outcome=>({outcome,email:null,userId:null,noticeId:null,tokenId:null,token:null,expiresAt:null});
function fixture(options={}){
 let now=1000,serial=0;const calls={sql:[],mail:[],after:[],limits:[],stages:[]},timers=new Map(),gates={},entered={},owned=[],store=options.store??{record:null,marker:false};
 const step=(name,fn)=>{calls.stages.push(name);(entered[name]??=deferred()).resolve();const p=(async()=>{if(options.fail===name)throw Error('PRIVATE_DETAIL');if([options.held].flat().includes(name))await(gates[name]??=deferred()).promise;return fn();})();owned.push(p);void p.catch(()=>{});return p;};
 const native=(sql,...args)=>{
  if(sql.includes('WITH account')){
   if(options.noAccount)return[empty('not-required')];if(store.marker)return[empty('busy')];
   const [email,token,noticeId,tokenId]=args;store.marker=true;store.record={outcome:'prepared',email,userId:'synthetic-user',noticeId,tokenId,token,expiresAt:'2026-10-13T15:00:00.000Z'};return[store.record];
  }
  if(sql.includes('SELECT EXISTS'))return[{eligible:Object.hasOwn(options,'eligible')?options.eligible:!!store.record&&['email','noticeId','userId','tokenId','token','expiresAt'].every((k,i)=>store.record[k]===args[i])}];
  if(sql.startsWith('DELETE FROM password_reset_request_admissions')){if(!store.record||!['email','noticeId','userId','tokenId'].every((k,i)=>store.record[k]===args[i]))return[];store.marker=false;return[{noticeId:args[1]}];}
  throw Error('Unexpected synthetic SQL');
 };
 const transport=direct.domain({noProvider:options.noProvider,send:(p,s)=>{calls.mail.push({p,s});return step('mail',()=>options.response?options.response():Response.json({id:'native-ack'}));}});
 const api=load('lib/forgot-password-server.ts',{'node:crypto':options.crypto??require('node:crypto'),'@/lib/prisma':{prisma:{$queryRawUnsafe:(sql,...args)=>{calls.sql.push({sql,args});return step(sql.includes('WITH account')?'prepare':sql.includes('SELECT EXISTS')?'eligible':'close',()=>options.sql?options.sql(sql,args,native):native(sql,...args));}}},'@/lib/send-email':transport});
 const controller=new AbortController(),globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),process:{env:{APP_PUBLIC_URL:Object.hasOwn(options,'origin')?options.origin:'https://example.invalid'}}};
 const route=load('app/api/auth/forgot-password/route.ts',{'next/server':{NextResponse:Response,after:fn=>{calls.after.push(fn);if(options.afterError)throw Error('PRIVATE_SCHEDULER');}},'@/lib/forgot-password-server':api,
 '@/lib/rate-limit-db':{rateLimitRequest:(...args)=>{calls.limits.push(args.slice(1));return step('ipLimit',()=>options.ipLimit??true);},rateLimitDb:(...args)=>{calls.limits.push(args);return step('emailLimit',()=>options.emailLimit??true);}}},globals);
 const post=(data=body)=>{const p=route.POST({signal:controller.signal,json:()=>step('body',()=>data)});owned.push(p);return p;};
 const job=(data=body,origin='https://example.invalid')=>api.prepareForgotPasswordJob(api.parseForgotPasswordInput(data),origin);
 return{api,post,job,store,calls,transport,controller,timers,gates,entered,native,advance(ms=25000,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async reach(name){for(let n=0;n<100&&!entered[name];n++)await flush();assert(entered[name],'Missing '+name);},async finish(){for(const g of Object.values(gates))g.resolve();let n=0;while(n<owned.length){const list=owned.slice(n);n=owned.length;await Promise.allSettled(list);await flush();}}};
}
async function response(p,status){const r=await p;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('set-cookie'),null);const b=await r.json();assert(!JSON.stringify(b).includes('PRIVATE'));assert(!JSON.stringify(b).includes(email));return b;}
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 for(const variant of ['account','missing','busy'])await test('uniform202 before account lookup '+variant+' makes no delivery claim',async()=>{
  const h=fixture(variant==='missing'?{noAccount:true}:variant==='busy'?{store:{marker:true,record:null}}:{});assert.deepEqual(await response(h.post(),202),{ok:true,status:'accepted'});
  assert.equal(h.calls.sql.length,0);assert.equal(h.calls.mail.length,0);assert.equal(h.calls.after.length,1);assert.deepEqual(h.calls.limits[0],['forgot-password',5,15,true]);assert.deepEqual(h.calls.limits[1],['forgot-password:email:'+email,3,60,true]);await h.calls.after[0]();assert.equal(h.calls.mail.length,variant==='account'?1:0);
 });
 const invalid=[null,[],{}, {email:1},{email:{}},{email:''},{email:'bad'},{email:'one@example.invalid,two@example.invalid'},{email:'a"@example.invalid'},{email:'x'.repeat(255)+'@example.invalid'},{email,lang:'fr'},{email,lang:null},{email,token:'a'.repeat(64)},{email,noticeId:'metadata'}];
 for(let i=0;i<invalid.length;i++)await test('strict body#'+i+' denies before scheduling or native writes',async()=>{const h=fixture();await response(h.post(invalid[i]),400);assert.equal(h.calls.after.length,0);assert.equal(h.calls.sql.length,0);});
 for(const origin of [undefined,'','http://example.invalid','https://u:p@example.invalid','https://example.invalid/path','https://example.invalid/?x=1','https://example.invalid/#h','javascript:x'])await test('missing/unsafe trusted origin '+String(origin)+' leaves job unissued',async()=>{const h=fixture({origin});await response(h.post(),503);assert.equal(h.calls.after.length,0);assert.equal(h.calls.sql.length,0);});
 for(const lang of ['es','en'])await test('captured canonical input/'+lang+' preserves own plaintext/link expiry and domain sender',async()=>{
  const h=fixture(),data={email:' FORGOT-SYNTHETIC@EXAMPLE.INVALID ',lang},job=h.job(data);data.email='foreign@example.invalid';data.lang='foreign';assert.deepEqual(Object.keys(job),['kind']);assert(Object.isFrozen(job));assert.equal(await h.api.dispatchForgotPasswordJob(job),'provider-accepted');const {p,s}=h.calls.mail[0];
  assert.equal(p.to,email);assert.equal(p.from,'YTubViral <hello@ytubviral.com>');assert.equal(p.reply_to,'hello@ytubviral.com');assert.equal(s.idempotencyKey,h.store.record.noticeId);assert(p.html.includes(h.store.record.expiresAt));assert(p.text.includes(h.store.record.expiresAt));assert(p.text.includes(h.store.record.token));assert(p.text.includes('https://example.invalid/reset-password?token='));assert(p.subject.includes(lang==='en'?'Reset your':'Restablecer'));assert.equal(h.store.marker,false);assert.equal(h.calls.sql.length,3);
 });
 await test('same job joins one promise through SQL/provider waits, clones/JSON/other module cannot send/close',async()=>{
  const h=fixture({held:['prepare','mail']}),job=h.job(),a=h.api.dispatchForgotPasswordJob(job),b=h.api.dispatchForgotPasswordJob(job);assert.equal(a,b);
  for(const clone of [{...job},JSON.parse(JSON.stringify(job)),{kind:job.kind,email,noticeId:'known'}])assert.equal(await h.api.dispatchForgotPasswordJob(clone),'not-issued');const other=fixture();assert.equal(await other.api.dispatchForgotPasswordJob(job),'not-issued');assert.equal(other.calls.sql.length,0);
  await h.reach('prepare');h.gates.prepare.resolve();await h.reach('mail');assert.equal(h.calls.mail.length,1);const sibling=fixture({store:h.store});assert.equal(await sibling.api.dispatchForgotPasswordJob(sibling.job()),'busy');h.gates.mail.resolve();assert.equal(await a,'provider-accepted');assert.equal(h.api.dispatchForgotPasswordJob(job),a);assert.equal(h.calls.mail.length,1);
 });
 await test('private parsed input cannot be taken twice or adopted from another module',async()=>{
  const h=fixture(),p=h.api.parseForgotPasswordInput(body),j=h.api.prepareForgotPasswordJob(p,'https://example.invalid');assert(j);assert.equal(h.api.prepareForgotPasswordJob(p,'https://example.invalid'),undefined);assert.equal(h.api.prepareForgotPasswordJob({...p},'https://example.invalid'),undefined);assert.equal(fixture().api.prepareForgotPasswordJob(p,'https://example.invalid'),undefined);assert.equal(h.calls.sql.length,0);
 });
 for(const field of ['noticeId','tokenId','token','email','userId','expiresAt'])await test('foreign native prepare '+field+' grants no provider or marker-closing permission',async()=>{
  const h=fixture({sql:(sql,args,native)=>{const r=native(sql,...args);if(sql.includes('WITH account'))r[0]={...r[0],[field]:'foreign'};return r;}});assert.equal(await h.api.dispatchForgotPasswordJob(h.job()),'unconfirmed');assert.equal(h.store.marker,true);assert.equal(h.calls.mail.length,0);assert.equal(h.calls.sql.length,field==='userId'?3:1);
 });
 for(const rows of [null,[],[empty('busy'),empty('busy')],[{...empty('busy'),noticeId:'foreign'}],[{...empty('not-required'),extra:1}]])await test('malformed native prepare '+JSON.stringify(rows)+' has no recovered job',async()=>{const h=fixture({sql:()=>rows});assert.equal(await h.api.dispatchForgotPasswordJob(h.job()),'unconfirmed');assert.equal(h.calls.mail.length,0);});
 for(const stage of ['prepare','eligible','mail','close'])await test('lost '+stage+' ACK never repeats original, even from visible marker/token',async()=>{
  const h=fixture({fail:stage}),j=h.job(),p=h.api.dispatchForgotPasswordJob(j);assert.equal(await p,'unconfirmed');assert.equal(h.api.dispatchForgotPasswordJob(j),p);assert.equal(h.calls.stages.filter(x=>x===stage).length,1);assert.equal(h.calls.mail.length,stage==='mail'||stage==='close'?1:0);
 });
 await test('lost committed prepare ACK leaves pending exclusion that another live invocation cannot rotate',async()=>{
  const store={marker:false,record:null},h=fixture({store,sql:(sql,args,native)=>{native(sql,...args);throw Error('lost native ACK');}});assert.equal(await h.api.dispatchForgotPasswordJob(h.job()),'unconfirmed');const saved={...store.record},other=fixture({store});assert.equal(await other.api.dispatchForgotPasswordJob(other.job()),'busy');assert.deepEqual(store.record,saved);assert.equal(other.calls.mail.length,0);
 });
 for(const eligible of [false,'true',null])await test('native negative/unknown eligibility '+String(eligible)+' never renews expiry or adopts token',async()=>{
  const h=fixture({eligible}),j=h.job();assert.equal(await h.api.dispatchForgotPasswordJob(j),eligible===false?'not-issued':'unconfirmed');assert.equal(h.calls.mail.length,0);assert.equal(h.store.record.expiresAt,'2026-10-13T15:00:00.000Z');assert.equal(h.store.marker,eligible!==false);
 });
 await test('native missing transport configuration closes only its own unissued marker',async()=>{const h=fixture({noProvider:true});assert.equal(await h.api.dispatchForgotPasswordJob(h.job()),'not-configured');assert.equal(h.calls.mail.length,0);assert.equal(h.store.marker,false);});
 for(const kind of ['503','mixed','empty'])await test('native provider '+kind+' retains pending without retry/fallback',async()=>{
  const h=fixture({response:()=>Response.json(kind==='empty'?{}:kind==='mixed'?{id:'id',error:null}:{id:'id'},{status:kind==='503'?503:200})});assert.equal(await h.api.dispatchForgotPasswordJob(h.job()),'unconfirmed');assert.equal(h.calls.mail.length,1);assert.equal(h.store.marker,true);
 });
 await test('scheduling uncertainty may still run its original callback once; public503 never requeues it',async()=>{
  const h=fixture({afterError:true});await response(h.post(),503);assert.equal(h.calls.sql.length,0);assert.equal(h.calls.after.length,1);await Promise.all([h.calls.after[0](),h.calls.after[0]()]);assert.equal(h.calls.mail.length,1);assert.equal(h.calls.sql.length,3);
 });
 for(const stage of ['ipLimit','body','emailLimit'])for(const why of ['abort','deadline','late-before-timer'])await test(stage+'/'+why+' retires25s request without scheduling/native account lookup',async()=>{
  const h=fixture({held:stage}),p=h.post();await h.reach(stage);if(why==='abort')h.controller.abort();else h.advance(25000,why!=='late-before-timer');if(why==='late-before-timer')h.gates[stage].resolve();await response(p,503);await h.finish();assert.equal(h.calls.after.length,0);assert.equal(h.calls.sql.length,0);assert.equal(h.timers.size,0);
 });
 await test('negative/nonboolean limits suppress work, email denial retains uniform202',async()=>{for(const ipLimit of [false,'true']){const h=fixture({ipLimit});await response(h.post(),429);assert.equal(h.calls.after.length,0);}const h=fixture({emailLimit:false});await response(h.post(),202);assert.equal(h.calls.after.length,0);assert.equal(h.calls.sql.length,0);});
 await test('malformed body and closed limiter failure expose no private diagnostics',async()=>{await response(fixture({fail:'body'}).post(),400);await response(fixture({fail:'ipLimit'}).post(),503);await response(fixture({fail:'emailLimit'}).post(),503);});
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual uniform acceptance route/private scheduled job, atomic SQL-ACK token+negative marker and native domain transport; closed synthetic SQL/clock/HTTP. No operative account existence, consent/delivery/freshness/recovery acceptance.',results};
}
module.exports={run,fixture,body,email,response};
if(require.main===module){const timer=setTimeout(()=>{console.error('Missing forgot password terminal');process.exit(1);},30000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(timer));}
