'use strict';
// These credentials are explicitly synthetic inputs; reports never include them.
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),oldInput='SyntheticOld1',newInput='SyntheticNew2',oldHash='synthetic-old-hash',newHash='$2b$12$'+'x'.repeat(53);
function harness(options={}){
 let now=1000,serial=0,transactions=0,pending;const calls=[],timers=new Map(),gates={},entered={},queries=[],packets=[],running=[],controller=new AbortController();
 const state={owner:{id:'own',email:'own@example.invalid'},body:{currentPassword:oldInput,newPassword:newInput,lang:'es'},key:'synthetic-key',db:{id:'own',email:'own@example.invalid',password:oldHash,name:'<name>'}};
 if(Object.hasOwn(options,'body'))state.body=options.body;if(options.anonymous)state.owner=null;if(options.noKey)state.key=null;if(options.invalidKey)state.key='bad key';if(options.badEmail)state.db.email='foreign@example.invalid';if(options.noPassword)state.db.password=null;if(options.missingId)delete state.owner.id;
 const step=async(stage,fn)=>{
  calls.push(stage);(entered[stage]??=deferred()).resolve();
  const p=(async()=>{if(options.fail===stage)throw Error('NEVER_PUBLIC_PRIVATE');if([options.held].flat().includes(stage))await(gates[stage]??=deferred()).promise;return fn();})();running.push(p);void p.catch(()=>{});return p;
 };
 const prior=()=>options.prior||pending?{id:'retained'}:null;
 const db={user:{findUnique:q=>{queries.push(q);return step('read',()=>options.missing?null:{...state.db});}},passwordChangeAttempt:{findFirst:q=>{queries.push(q);return step('prior0',prior);}},
  $transaction:async(fn,settings)=>{
   assert.deepEqual(copy(settings),{maxWait:10000,timeout:15000});const i=++transactions;
   const tx={$queryRawUnsafe:(sql,...values)=>{queries.push({sql,values});return step('lock'+i,()=>[{...state.db}]);},
    passwordChangeAttempt:{findFirst:q=>{queries.push(q);return step('prior1',prior);},create:q=>{queries.push(q);return step('admit',()=>pending={...q.data});},
     findUnique:()=>step('attempt',()=>options.foreignAttempt?{...pending,key:'foreign'}:pending),
     updateMany:q=>{queries.push(q);return step('mark',()=>{if(!options.noMark)pending.state='complete';return{count:options.noMark?0:1};});}},
    user:{updateMany:q=>{queries.push(q);return step('update',()=>{if(!options.noUpdate)Object.assign(state.db,q.data);return{count:options.noUpdate?0:1};});}}
   };
   const p=(async()=>{const r=await fn(tx);return step('ack'+i,()=>options.foreignAdmission&&i===1?{...r,row:{...r.row,email:'foreign@example.invalid'}}:r);})();running.push(p);void p.catch(()=>{});return p;
  }};
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const bcrypt={compare:(value,hash)=>step('compare',()=>value===oldInput&&hash===oldHash),hash:(value,rounds)=>step('hash',()=>{assert.equal(rounds,12);assert.equal(value,newInput);return options.badHash?'invalid':newHash;})};
 const helper=load('lib/password-change.ts',{'node:crypto':require('node:crypto'),'node:buffer':require('node:buffer'),'bcryptjs':bcrypt,'@/lib/prisma':{prisma:db},'@/lib/password':load('lib/password.ts')},globals);
 const notice=require('./direct-email-fixture.cjs').password({noProvider:options.noProvider,
  send:(packet,settings)=>{packets.push({packet,settings});return step('mail',()=>Response.json(options.mailAck?.data??{id:'synthetic-provider-ack'}));},
  templates:{passwordChangedEmail:(name,lang)=>{calls.push('prepare');if(options.prepareFail)throw Error('PRIVATE_TEMPLATE');return load('lib/emails.ts').passwordChangedEmail(name,lang);}}});

 const route=load('app/api/user/change-password/route.ts',{'next/server':{NextResponse:Response},'node:crypto':require('node:crypto'),
  '@/auth':{auth:()=>step('auth',()=>state.owner?{user:state.owner}:null)},'@/lib/password-change':helper,'@/lib/password-change-notice':notice},globals);
 if(options.preAborted)controller.abort();
 const original=route.POST({signal:controller.signal,headers:{get:()=>state.key},json:()=>step('body',()=>state.body)});running.push(original);void original.catch(()=>{});
 return{original,state,calls,queries,packets,timers,controller,gates,entered,pending:()=>pending,
  advance(ms=55000,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  async reach(stage){for(let i=0;i<100&&!entered[stage];i++)await flush();assert(entered[stage],'Missing original stage '+stage);},
  async release(stage){gates[stage]?.resolve();await flush();},
  async finish(){for(const g of Object.values(gates))g.resolve();let n=0;while(n<running.length){const ps=running.slice(n);n=running.length;await Promise.allSettled(ps);await flush();}}
 };
}
async function observe(h,status){
 let t;try{const r=await Promise.race([h.original,new Promise((_,reject)=>t=setTimeout(()=>reject(Error('Missing HTTP terminal')),1000))]);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);const b=await r.json();assert(!JSON.stringify(b).includes(oldInput)&&!JSON.stringify(b).includes(newInput),'Public receipt leaked synthetic credential');assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));if(status===503)assert.deepEqual(b,{error:'password_change_unconfirmed'});return b;}finally{clearTimeout(t);}
}
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 for(const lang of ['es','en'])await test(lang+' exact password acknowledgement separates provider acknowledgement and excludes original nonce/secrets',async()=>{
  const h=harness();h.state.body.lang=lang;const b=await observe(h,200);assert.deepEqual(b,{ok:true,userId:'own',email:'own@example.invalid',key:'synthetic-key',status:'updated',lang,notification:'acknowledged'});assert.equal(h.pending().state,'complete');
  assert.equal(h.state.db.password,newHash);assert.equal(h.packets.length,1);assert.equal(h.packets[0].settings.idempotencyKey,h.pending().id);assert(!JSON.stringify(b).includes(h.pending().id));
  assert(h.packets[0].packet.html.includes('&lt;name&gt;'));assert(h.packets[0].packet.html.includes(lang==='en'?'SECURITY NOTICE':'AVISO DE SEGURIDAD'));assert(!JSON.stringify(h.packets).includes(oldInput));assert(!JSON.stringify(h.packets).includes(newInput));
  assert.deepEqual(copy(h.queries.find(q=>q.data?.password).where),{id:'own',email:'own@example.invalid',password:oldHash});assert(!Object.keys(h.pending()).some(k=>/password|hash|digest|notice/i.test(k)));
 });
 const stages=['auth','body','read','prior0','compare','hash','lock1','prior1','admit','ack1','lock2','attempt','update','mark','ack2'];
 for(const held of stages)for(const why of ['deadline','abort'])await test(held+'/'+why+' retires55s observer; original admission/CAS/marker never repeated',async()=>{
  const h=harness({held});await h.reach(held);if(why==='abort')h.controller.abort();else h.advance();await observe(h,503);await h.finish();assert.equal(h.calls.filter(c=>c===held).length,1);assert(!h.calls.includes('mail'));
  if(stages.indexOf(held)<stages.indexOf('update'))assert(!h.calls.includes('update'));else{assert.equal(h.pending().state,'complete');assert.equal(h.state.db.password,newHash);}
 });
 for(const held of ['auth','body','read','prior0','compare','hash','ack1','attempt'])await test(held+' monotonic guard blocks late dispatch before timer callback',async()=>{
  const h=harness({held});await h.reach(held);h.advance(55000,false);await h.release(held);await observe(h,503);await h.finish();assert(!h.calls.includes('update'));assert(!h.calls.includes('mail'));
 });
 await test('Auth/body/compare share one55s budget instead of renewing each wait',async()=>{
  const h=harness({held:['auth','body','compare']});await h.reach('auth');h.advance(20000);await h.release('auth');await h.reach('body');h.advance(20000);await h.release('body');await h.reach('compare');h.advance(15000);await observe(h,503);await h.finish();assert(!h.calls.includes('admit'));
 });
 for(const why of ['deadline','abort','rejection','missing-ack'])await test('Committed password remains200 while original notice is '+why+'; never fallback/retry',async()=>{
  const h=harness(why==='missing-ack'?{mailAck:{data:{}}}:why==='rejection'?{fail:'mail'}:{held:'mail'});if(!['rejection','missing-ack'].includes(why)){await h.reach('mail');if(why==='abort')h.controller.abort();else h.advance();}
  const b=await observe(h,200);assert.equal(b.notification,'unconfirmed');assert.equal(h.pending().state,'complete');assert.equal(h.state.db.password,newHash);await h.finish();assert.equal(h.packets.length,1);assert.equal(h.calls.filter(c=>c==='mail').length,1);assert.equal(b.notification,'unconfirmed');
 });
 for(const options of [{noProvider:true},{prepareFail:true}])await test('Confirmed password distinguishes notice not started without broad sender/Gmail fallback',async()=>{
  const h=harness(options),b=await observe(h,200);assert.equal(b.notification,'not_started');assert.equal(h.pending().state,'complete');assert(!h.calls.includes('mail'));
 });
 for(const options of [{anonymous:true},{missingId:true},{badEmail:true},{missing:true},{prior:true},{foreignAdmission:true},{foreignAttempt:true},{noUpdate:true},{noMark:true},{badHash:true}])await test('Closed identity/admission/marker denial '+Object.keys(options)[0],async()=>{
  const name=Object.keys(options)[0],status=['anonymous','missingId','badEmail','missing'].includes(name)?401:503,h=harness(options);await observe(h,status);assert(!h.calls.includes('mail'));if(!['noUpdate','noMark'].includes(name))assert(!h.calls.includes('update'));await h.finish();
 });
 for(const stage of stages.filter(n=>n!=='body'))await test(stage+' private failure never echoes diagnostics or retries',async()=>{
  const h=harness({fail:stage});await observe(h,503);await h.finish();assert.equal(h.calls.filter(c=>c===stage).length,1);assert(!h.calls.includes('mail'));
 });
 const invalid=[null,[],{}, {currentPassword:3,newPassword:newInput},{currentPassword:oldInput,newPassword:3},
  {currentPassword:'',newPassword:newInput},{currentPassword:oldInput,newPassword:''},
  {currentPassword:oldInput,newPassword:newInput,lang:'fr'},{currentPassword:oldInput,newPassword:newInput,resume:true},
  {currentPassword:oldInput,newPassword:'a1'.repeat(37)},{currentPassword:'a1'.repeat(37),newPassword:newInput},
  {currentPassword:oldInput,newPassword:'a1'+'🙂'.repeat(18)}];
 for(let i=0;i<invalid.length;i++)await test('Invalid closed credential body#'+i+' denies before SQL/bcrypt, including UTF8 byte ceiling',async()=>{
  const h=harness({body:invalid[i]});await observe(h,400);assert(!h.calls.includes('read'));assert(!h.calls.includes('compare'));
 });
 await test('Existing password policy errors remain bilingual and do not read SQL',async()=>{
  for(const lang of ['es','en']){const h=harness({body:{currentPassword:oldInput,newPassword:'short1',lang}}),b=await observe(h,400);assert(b.error.includes(lang==='en'?'8 characters':'8 caracteres'));assert(!h.calls.includes('read'));}
 });
 await test('Wrong current credential and passwordless account deny without admissions/notices',async()=>{
  const bad=harness();bad.state.body.currentPassword='InvalidSynthetic1';await observe(bad,400);assert(!bad.calls.includes('admit'));
  const none=harness({noPassword:true}),b=await observe(none,400);assert(b.error.includes('cuenta'));assert(!none.calls.includes('compare'));
 });
 await test('Legacy no-key POST remains fresh; key is not authority and invalid supplied key is400',async()=>{
  const h=harness({noKey:true}),b=await observe(h,200);assert(/^[\w-]+$/.test(b.key));assert.equal(h.pending().key,b.key);await observe(harness({invalidKey:true}),400);
 });
 await test('Captured session, body and key cannot redirect delayed original',async()=>{
  const h=harness({held:'read'});await h.reach('read');h.state.owner.id='foreign';h.state.owner.email='foreign@example.invalid';h.state.body.currentPassword='foreign';h.state.body.newPassword='foreign';h.state.key='foreign';await h.release('read');const b=await observe(h,200);assert.equal(b.userId,'own');assert.equal(b.email,'own@example.invalid');assert.equal(b.key,'synthetic-key');assert.equal(h.packets[0].packet.to,'own@example.invalid');
 });
 for(const field of ['email','password'])await test('Revalidate '+field+' after admission; retained marker cannot authorize changed account',async()=>{
  const h=harness({held:'ack1'});await h.reach('ack1');h.state.db[field]='changed';await h.release('ack1');await observe(h,503);assert(!h.calls.includes('update'));assert.equal(h.pending().state,'pending');assert(!h.calls.includes('mail'));
 });
 await test('Concurrent password snapshot changed before admission gets409 without overwriting or leaving new marker',async()=>{
  const h=harness({held:'hash'});await h.reach('hash');h.state.db.password='changed';await h.release('hash');const b=await observe(h,409);assert.equal(b.error,'password_changed');assert.equal(h.pending(),undefined);assert(!h.calls.includes('update'));
 });
 await test('Pre-aborted request and malformed JSON never dispatch password work',async()=>{
  const h=harness({preAborted:true});await observe(h,503);assert.equal(h.calls.length,0);const malformed=harness({fail:'body'});await observe(malformed,400);assert(!malformed.calls.includes('read'));
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Synthetic password auth/bcrypt/SQL/clock/notice transport; no real credentials, recovery or emails',results};
}
module.exports={harness,observe,run};
if(require.main===module){const watchdog=setTimeout(()=>{console.error('Password server fixture missing terminal');process.exit(1);},30000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));}
