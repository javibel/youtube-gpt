'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {load}=require('./route-harness.cjs');
const email='synthetic-email@example.invalid',code='123456';
const verified={outcome:'verified',id:'synthetic-account',email,name:'Synthetic'};
const negative=outcome=>({outcome,id:null,email:null,name:null});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(options={}){
 const calls={sql:[],limits:[],mail:[],after:[],logs:[]};
 const prisma={$queryRawUnsafe:async(sql,...args)=>{calls.sql.push({sql,args});return options.sql?options.sql(sql,...args):[verified];}};
 const consume=load('lib/email-verification-server.ts',{'@/lib/prisma':{prisma}});
 const limiter=options.nativeRate?load('lib/rate-limit-db.ts',{'@/lib/prisma':{prisma}}):{rateLimitRequest:async(...args)=>{calls.limits.push(args);if(options.limit) return options.limit(...args);return true;}};
 const route=load('app/api/auth/verify-email/route.ts',{
  'next/server':{NextResponse:require('next/server').NextResponse,after:fn=>{if(options.afterError)throw Error('synthetic scheduler unavailable');calls.after.push(fn);}},
  '@/lib/email-verification-server':consume,'@/lib/rate-limit-db':limiter,
  '@/lib/send-email':{sendDomainEmailOriginal:async input=>{calls.mail.push(input);return options.mail?options.mail(input):'provider-accepted';}},
 },{console:{info:(...args)=>calls.logs.push(args)}});
 const post=(body={email,code},raw=false)=>route.POST(new Request('https://synthetic.invalid/api/auth/verify-email',{method:'POST',body:raw?body:JSON.stringify(body)}));
 return{calls,post,consume};
}
function domain(options={}){
 const calls=[];const api=load('lib/send-email.ts',{}, {process:{env:options.missing?{}:{RESEND_API_KEY:'synthetic-test-only'}},fetch:async(url,init)=>{calls.push(JSON.parse(init.body));if(options.fetch)return options.fetch(url,init);if(options.send){const answer=await options.send();return Response.json(answer.error===null?answer.data:{error:'synthetic-unconfirmed'},{status:answer.error===null?200:503});}return Response.json({id:'synthetic-notice'});}});
 return{calls,send:()=>api.sendDomainEmailOriginal({to:email,subject:'Synthetic',html:'<p>Synthetic</p>'})};
}
async function run(options={}){
 const results=[];const test=async(name,fn)=>{if(options.onlySdk&&!name.startsWith('native transport'))return;if(options.onlyTransport&&!/^(domain|absent domain transport|native transport)/.test(name))return;try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 await test('own exact SQL receipt acknowledges verification without cookies or waiting for welcome',async()=>{
  const h=fixture(),r=await h.post();assert.equal(r.status,200);assert.deepEqual(await r.json(),{verified:true});assert.equal(r.headers.get('set-cookie'),null);assert.equal(h.calls.sql.length,1);assert.deepEqual(h.calls.sql[0].args,[email,code]);assert.equal(h.calls.after.length,1);assert.equal(h.calls.mail.length,0);assert.equal(h.calls.limits[0][4],true);
 });
 await test('canonical email is bound to the native SQL receipt',async()=>{const h=fixture(),r=await h.post({email:' Synthetic-Email@Example.Invalid ',code});assert.equal(r.status,200);assert.deepEqual(h.calls.sql[0].args,[email,code]);});
 for(const outcome of ['invalid','expired'])await test('exact native '+outcome+' acknowledgment remains a known negative',async()=>{
  const h=fixture({sql:async()=>[negative(outcome)]}),r=await h.post();assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:outcome+'_code'});assert.equal(h.calls.after.length,0);
 });
 for(const [name,body,raw]of [['null',null],['array',[]],['number email',{email:1,code}],['object email',{email:{toString:()=>email},code}],['numeric code',{email,code:123456}],['short code',{email,code:'12345'}],['space code',{email,code:'123456 '}],['unicode code',{email,code:'１２３４５６'}],['empty email',{email:' ',code}],['bad email',{email:'x@y',code}],['too long email',{email:'x'.repeat(255)+'@y.invalid',code}],['public receipt',{email,code,verified:true}],['malformed JSON','{',true]])await test('strict input denies '+name+' without consuming',async()=>{
  const h=fixture(),r=await h.post(body,raw);assert.equal(r.status,400);assert.equal(h.calls.sql.length,0);assert.equal(h.calls.after.length,0);
 });
 for(const [name,rows]of [['null',null],['empty',[]],['duplicate',[verified,verified]],['foreign email',[{...verified,email:'foreign@example.invalid'}]],['missing account',[{...verified,id:null}]],['foreign outcome',[{...verified,outcome:'success'}]],['malformed negative',[{...negative('invalid'),id:'serialized-id'}]]])await test('malformed/foreign SQL '+name+' never claims verification or notice',async()=>{
  const h=fixture({sql:async()=>rows}),r=await h.post();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'verification_unconfirmed'});assert.equal(h.calls.after.length,0);
 });
 await test('lost SQL acknowledgment closes without retries or independent lookup',async()=>{const h=fixture({sql:async()=>{throw Error('synthetic lost committed acknowledgment');}}),r=await h.post();assert.equal(r.status,503);assert.equal(h.calls.sql.length,1);assert.equal(h.calls.after.length,0);});
 await test('same original SQL promise supplies late result; no second SQL while held',async()=>{const d=deferred(),h=fixture({sql:()=>d.promise});let done=false;const original=h.post().then(r=>{done=true;return r;});await flush();assert.equal(done,false);assert.equal(h.calls.sql.length,1);assert.equal(h.calls.after.length,0);d.resolve([verified]);assert.equal((await original).status,200);assert.equal(h.calls.sql.length,1);});
 for(const [name,value]of [['denied',false],['string','true'],['failure',undefined]])await test('limiter '+name+' closes before code/body effects',async()=>{const h=fixture({limit:async()=>{if(value===undefined)throw Error('synthetic unavailable');return value;}}),r=await h.post();assert.equal(r.status,429);assert.equal(h.calls.sql.length,0);});
 for(const rows of [null,[],[{hits:0}],[{hits:11}],[{hits:'1'}],[{hits:1},{hits:1}],[{hits:1.5}]])await test('actual native rate SQL denies '+JSON.stringify(rows),async()=>{const h=fixture({nativeRate:true,sql:async()=>rows}),r=await h.post();assert.equal(r.status,429);assert.equal(h.calls.sql.length,1);assert.ok(h.calls.sql[0].sql.includes('INSERT INTO rate_limits'));});
 await test('actual rate SQL infra failure stays closed',async()=>{const h=fixture({nativeRate:true,sql:async()=>{throw Error('synthetic store failure');}});assert.equal((await h.post()).status,429);assert.equal(h.calls.sql.length,1);});
 await test('actual rate SQL own accounting allows one subsequent consumption',async()=>{const h=fixture({nativeRate:true,sql:async sql=>sql.includes('rate_limits')?[{hits:1}]:[verified]});assert.equal((await h.post()).status,200);assert.equal(h.calls.sql.length,2);});
 await test('welcome callback duplicates join the same native notice, without blocking verification',async()=>{const d=deferred(),h=fixture({mail:()=>d.promise}),r=await h.post();const a=h.calls.after[0](),b=h.calls.after[0]();assert.equal(a,b);assert.equal(h.calls.mail.length,1);assert.equal(r.status,200);d.resolve('unconfirmed');await a;assert.equal(h.calls.sql.length,1);assert.equal(h.calls.mail.length,1);assert.equal(h.calls.logs[0][1],'unconfirmed');});
 await test('failed scheduling keeps verification acknowledged and notice unissued',async()=>{const h=fixture({afterError:true});assert.equal((await h.post()).status,200);assert.equal(h.calls.mail.length,0);assert.equal(h.calls.logs[0][0],'[verify-email] Welcome notice: not-scheduled');});
 await test('native account name is escaped in welcome HTML',async()=>{const h=fixture({sql:async()=>[{...verified,name:'<script> Synthetic'}]});await h.post();await h.calls.after[0]();assert.ok(h.calls.mail[0].html.includes('&lt;script&gt;'));assert.equal(h.calls.mail[0].html.includes('<script>'),false);});
 await test('domain transport has exact From/Reply-To and one provider invocation',async()=>{const h=domain();assert.equal(await h.send(),'provider-accepted');assert.equal(h.calls.length,1);assert.equal(h.calls[0].from,'YTubViral <hello@ytubviral.com>');assert.equal(h.calls[0].reply_to,'hello@ytubviral.com');});
 await test('absent domain transport stays unissued without Gmail/default fallback',async()=>{const h=domain({missing:true});assert.equal(await h.send(),'not-configured');assert.equal(h.calls.length,0);});
 for(const [name,answer]of [['provider error',{data:null,error:{message:'synthetic'}}],['missing id',{data:{},error:null}],['mixed receipt',{data:{id:'synthetic'},error:{message:'synthetic'}}]])await test('domain '+name+' stays uncertain without fallback/retry',async()=>{const h=domain({send:async()=>answer});assert.equal(await h.send(),'unconfirmed');assert.equal(h.calls.length,1);});
 await test('domain lost acknowledgment never falls back or sends again',async()=>{const h=domain({send:async()=>{throw Error('synthetic lost ack');}});assert.equal(await h.send(),'unconfirmed');assert.equal(h.calls.length,1);});
 // Native transport owns exact HTTP/body parsing; previous installed SDK
 // observations remain historical, not proof of the current transport.
 for(const [name,status,body]of [['accepted',200,{id:'synthetic-native-notice'}],['non-2xx',503,{message:'synthetic unavailable'}],['empty acknowledgment',200,{}]])await test('native transport '+name+' original HTTP with domain alias',async()=>{
  const calls=[],h=domain({fetch:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');calls.push(init);return Response.json(body,{status});}});assert.equal(await h.send(),name==='accepted'?'provider-accepted':'unconfirmed');assert.equal(calls.length,1);const payload=JSON.parse(calls[0].body);assert.equal(payload.from,'YTubViral <hello@ytubviral.com>');assert.equal(payload.reply_to,'hello@ytubviral.com');assert.equal(new Headers(calls[0].headers).get('authorization'),'Bearer synthetic-test-only');
 });
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Actual route/SQL consumer/limiter and native domain transport with controlled private original promises and closed synthetic HTTP. Atomic concurrency is separately verified on identified local PostgreSQL; no real email/account/authentication/delivery/operational acceptance.',results};
}
module.exports={run,fixture};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing email server terminal');process.exit(1);},20000);run().then(x=>{clearTimeout(timer);console.log(JSON.stringify(x,null,2));if(x.status!=='PASS')process.exitCode=1;}).catch(e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});}
