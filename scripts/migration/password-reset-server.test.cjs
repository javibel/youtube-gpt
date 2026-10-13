'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),direct=require('./direct-email-fixture.cjs');
const token='a'.repeat(64),password='SyntheticNew2',hash='$2b$12$'+'x'.repeat(53),body={token,password,lang:'es'};
function fixture(options={}){
 let now=1000,serial=0;const calls=[],queries=[],packets=[],timers=new Map(),entered={},gates={},pending=[];
 const step=(name,fn)=>{calls.push(name);(entered[name]??=deferred()).resolve();const p=(async()=>{if(options.fail===name)throw Error('PRIVATE_NATIVE_FAILURE');if([options.held].flat().includes(name))await(gates[name]??=deferred()).promise;return fn();})();pending.push(p);void p.catch(()=>{});return p;};
 const input=load('lib/password-reset-input.ts',{'node:buffer':require('node:buffer')});
 const notice=direct.password({noProvider:options.noProvider,templates:{passwordChangedEmail:(name,lang)=>{assert(!name.includes('<name>'));return load('lib/emails.ts').passwordChangedEmail(name,lang);}},
 send:(p,s)=>{packets.push({p,s});return step('mail',()=>options.response?options.response():Response.json({id:'native-provider-ack'}));}});
 const deps={'bcryptjs':{hash:(p,n)=>step('hash',()=>{assert.equal(p,password);assert.equal(n,12);return options.badHash?'invalid':hash;})},
 'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:{$queryRawUnsafe:(sql,...values)=>step('SQL',()=>{
  queries.push({sql,values});if(options.sql)return options.sql(sql,...values);
  const row=options.invalid?{outcome:'invalid',id:null,email:null,name:null,noticeId:null}:{outcome:'changed',id:'synthetic-user',email:'synthetic@example.invalid',name:'<name>',noticeId:values[2]};
  return options.receipt?options.receipt(row):[row];
 })}},'@/lib/password':load('lib/password.ts'),'@/lib/password-reset-input':input,'@/lib/password-change-notice':notice};
 const helper=load('lib/password-reset-server.ts',deps),controller=new AbortController();
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const route=load('app/api/auth/reset-password/route.ts',{'next/server':{NextResponse:Response},
 '@/lib/rate-limit-db':{rateLimitRequest:(r,p,l,w,closed)=>step('limit',()=>{assert.equal(p,'reset-pw');assert.equal(l,10);assert.equal(w,15);assert.equal(closed,true);return !options.denied;})},
 '@/lib/password-reset-input':input,'@/lib/password-reset-server':helper},globals);
 const post=(data=body)=>{const p=route.POST({signal:controller.signal,json:()=>step('body',()=>data)});pending.push(p);void p.catch(()=>{});return p;};
 return{calls,queries,packets,input,helper,deps,post,controller,timers,entered,gates,
 advance(ms=55000,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
 async reach(name){for(let i=0;i<100&&!entered[name];i++)await flush();assert(entered[name],'Missing '+name);},
 async finish(){for(const g of Object.values(gates))g.resolve();let n=0;while(n<pending.length){const list=pending.slice(n);n=pending.length;await Promise.allSettled(list);await flush();}}
 };
}
async function response(p,status){const r=await p;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('set-cookie'),null);const b=await r.json();assert(!JSON.stringify(b).includes(token));assert(!JSON.stringify(b).includes(password));assert(!JSON.stringify(b).includes('PRIVATE'));return b;}
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 for(const lang of ['es','en'])await test('exact native change '+lang+' exposes password confirmation separate from domain acknowledgement',async()=>{
  const h=fixture(),b=await response(h.post({...body,lang}),200);assert.deepEqual(b,{ok:true,status:'updated',notification:'acknowledged'});assert.equal(h.queries.length,1);assert.equal(h.packets.length,1);
  const q=h.queries[0];assert.equal(q.values[0],token);assert.equal(q.values[1],hash);assert.equal(h.packets[0].s.idempotencyKey,q.values[2]);assert.equal(h.packets[0].p.reply_to,'hello@ytubviral.com');assert(h.packets[0].p.html.includes('&lt;name&gt;'));
  assert(q.sql.includes('FOR UPDATE'));assert(q.sql.includes('DELETE FROM password_reset_tokens'));assert(q.sql.includes('UPDATE users'));assert(q.sql.includes("timezone('UTC', clock_timestamp())"));assert.equal(h.timers.size,0);
 });
 const invalid=[null,[],{}, {...body,token:1},{...body,token:'a'.repeat(63)},{...body,token:'A'.repeat(64)},{...body,token:token+' '},{...body,password:3},{...body,password:''},{...body,password:'a1'.repeat(37)},{...body,password:'a1'+'🙂'.repeat(18)},{...body,lang:'fr'},{...body,resume:true},{...body,noticeId:'id'}];
 for(let i=0;i<invalid.length;i++)await test('closed factor input#'+i+' cannot hash/query/issue',async()=>{const h=fixture();await response(h.post(invalid[i]),400);assert.equal(h.queries.length,0);assert(!h.calls.includes('hash'));assert.equal(h.packets.length,0);});
 await test('weak password policy denies before bcrypt/SQL without coercion',async()=>{const h=fixture(),p=h.input.parsePasswordResetInput({...body,password:'short1'});const r=await h.helper.consumePasswordResetOriginal(p,()=>{});assert.equal(r.status,'weak-password');assert(!h.calls.includes('hash'));});
 await test('input is captured privately, one-use; JSON/clone/other parser cannot adopt it',async()=>{
  const h=fixture(),raw={...body},p=h.input.parsePasswordResetInput(raw);raw.password='changed';raw.token='foreign';
  assert.deepEqual(Object.keys(p),['kind']);assert(Object.isFrozen(p));
  for(const copy of [{...p},JSON.parse(JSON.stringify(p))])assert.equal((await h.helper.consumePasswordResetOriginal(copy,()=>{})).status,'invalid');
  const other=load('lib/password-reset-input.ts',{'node:buffer':require('node:buffer')});assert.equal((await h.helper.consumePasswordResetOriginal(other.parsePasswordResetInput(body),()=>{})).status,'invalid');
  assert.equal((await h.helper.consumePasswordResetOriginal(p,()=>{})).status,'changed');assert.equal((await h.helper.consumePasswordResetOriginal(p,()=>{})).status,'invalid');assert.equal(h.queries.length,1);
 });
 await test('private change handle owns one notice promise; public receipt/ID/JSON cannot recover it',async()=>{
  const h=fixture({held:'mail'}),r=await h.helper.consumePasswordResetOriginal(h.input.parsePasswordResetInput(body),()=>{}),c=r.change;
  const a=h.helper.dispatchPasswordResetNotice(c,()=>{},()=>{}),b=h.helper.dispatchPasswordResetNotice(c,()=>{throw Error('not original');},()=>{});assert.equal(a,b);
  for(const copy of [{...c},JSON.parse(JSON.stringify(c)),{kind:c.kind,noticeId:h.queries[0].values[2],token}])assert.equal(await h.helper.dispatchPasswordResetNotice(copy,()=>{},()=>{}),'not_started');
  const other=load('lib/password-reset-server.ts',h.deps);assert.equal(await other.dispatchPasswordResetNotice(c,()=>{},()=>{}),'not_started');await h.reach('mail');assert.equal(h.packets.length,1);await h.finish();assert.equal(await a,'acknowledged');assert.equal(h.helper.dispatchPasswordResetNotice(c,()=>{},()=>{}),a);assert.equal(h.queries.length,1);
 });
 for(const edit of [r=>[],r=>[r,r],r=>[{...r,noticeId:'foreign'}],r=>[{...r,email:'Padded@example.invalid'}],r=>[{...r,id:''}],r=>[{...r,outcome:'other'}],r=>[{...r,name:{private:true}}],r=>[{...r,extra:true}]])await test('mixed/missing/foreign native receipt never grants changed/notice authority',async()=>{const h=fixture({receipt:edit});await response(h.post(),503);assert.equal(h.queries.length,1);assert.equal(h.packets.length,0);});
 for(const stage of ['limit','body','hash','SQL'])for(const why of ['abort','deadline','late-before-timer'])await test(stage+'/'+why+' retires original observer without another SQL/notice',async()=>{
  const h=fixture({held:stage}),p=h.post();await h.reach(stage);if(why==='abort')h.controller.abort();else h.advance(55000,why!=='late-before-timer');
  if(why==='late-before-timer')h.gates[stage].resolve();const b=await response(p,stage==='SQL'&&why==='late-before-timer'?200:503);if(stage==='SQL'&&why==='late-before-timer')assert.equal(b.notification,'not_started');await h.finish();assert.equal(h.calls.filter(x=>x===stage).length,1);assert.equal(h.packets.length,0);
  if(stage!=='SQL')assert.equal(h.queries.length,0);else assert.equal(h.queries.length,1);
 });
 await test('limit/body/hash share one55s budget, no renewed waits',async()=>{
  const h=fixture({held:['limit','body','hash']}),p=h.post();await h.reach('limit');h.advance(20000);h.gates.limit.resolve();await h.reach('body');h.advance(20000);h.gates.body.resolve();await h.reach('hash');h.advance(15000);await response(p,503);await h.finish();assert.equal(h.queries.length,0);
 });
 for(const fail of ['limit','hash','SQL'])await test('original '+fail+' failure never retries or emits diagnostics',async()=>{const h=fixture({fail});await response(h.post(),503);assert.equal(h.calls.filter(x=>x===fail).length,1);assert.equal(h.packets.length,0);});
 await test('pre-abort and closed limiter deny body/hash/SQL',async()=>{const h=fixture();h.controller.abort();await response(h.post(),503);assert.equal(h.calls.length,0);const denied=fixture({denied:true});await response(denied.post(),429);assert(!denied.calls.includes('body'));});
 await test('malformed JSON, invalid/expired factor and invalid bcrypt result remain closed',async()=>{await response(fixture({fail:'body'}).post(),400);const h=fixture({invalid:true});await response(h.post(),400);assert.equal(h.packets.length,0);const b=fixture({badHash:true});await response(b.post(),503);assert.equal(b.queries.length,0);});
 for(const kind of ['missing','503','mixed','throw','deadline','abort'])await test('confirmed password stays200 while notice is '+kind+' without replay',async()=>{
  const h=fixture(kind==='missing'?{noProvider:true}:kind==='503'?{response:()=>Response.json({id:'id'},{status:503})}:kind==='mixed'?{response:()=>Response.json({id:'id',error:null})}:kind==='throw'?{fail:'mail'}:{held:'mail'}),p=h.post();
  if(['deadline','abort'].includes(kind)){await h.reach('mail');if(kind==='abort')h.controller.abort();else h.advance();}
  const b=await response(p,200);assert.equal(b.status,'updated');assert.equal(b.notification,kind==='missing'?'not_started':'unconfirmed');await h.finish();assert.equal(h.queries.length,1);assert.equal(h.packets.length,kind==='missing'?0:1);
 });
 await test('retired change before notice retains acknowledged commit with no native mail',async()=>{
  const h=fixture(),r=await h.helper.consumePasswordResetOriginal(h.input.parsePasswordResetInput(body),()=>{});const p=h.helper.dispatchPasswordResetNotice(r.change,()=>{throw Error('retired');},()=>{});assert.equal(await p,'not_started');assert.equal(h.packets.length,0);assert.equal(h.helper.dispatchPasswordResetNotice(r.change,()=>{},()=>{}),p);
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual strict reset input/private SQL-ACK consumer, guarded route and native domain notice; synthetic bcrypt/SQL/clock/HTTP only. No real factor/account/provider/delivery acceptance.',results};
}
module.exports={run,fixture,body,token,password,hash,response};
if(require.main===module){const timer=setTimeout(()=>{console.error('Missing password reset terminal');process.exit(1);},30000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(timer));}
