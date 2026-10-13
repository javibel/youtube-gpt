'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{fixture}=require('./admin-native-authorization.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const adminEmail='other-admin@example.invalid',bindings=[];
async function bound({held,fail,settings={},envOverride}={}){
 const f=await fixture({adminEmail,settings}),issued=await f.login();let now=1000,offset=0,serial=0;
 const events=[],timers=new Map(),gates={},entered={},controller=new AbortController(),originals=[];
 if(held)gates[held]=deferred();
 const state={user:{id:f.account().id,email:f.account().email,name:'Native statistics',lang:'es',createdAt:new Date('2026-10-01T00:00:00Z'),password:'NEVER_PUBLIC'},quota:{recorded:2,reserved:1,total:3},subscription:{id:'native-stats-plan',status:'active',plan:'pro',cancelAtPeriodEnd:true,currentPeriodEnd:new Date(Date.now()+86400000),stripeCustomerId:'manual_admin',private:'NEVER_PUBLIC'}};
 const step=async(name,fn)=>{events.push(name);(entered[name]??=deferred()).resolve();if(fail===name)throw Error('NEVER_PUBLIC native stats diagnostic');if(held===name)await gates[name].promise;return fn();};
 const ClockDate=new Proxy(Date,{get(target,key,receiver){return key==='now'?()=>Date.now()+offset:Reflect.get(target,key,receiver);}});
 const globals={Date:ClockDate,Headers,process:{env:envOverride??{AUTH_URL:'http://127.0.0.1:4300'}},performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const reader=load('lib/native-user-session.ts',{'next/headers':{headers:async()=>f.headers()},'@/auth':{readNativeSessionCookie:req=>step('decode',()=>f.authBindings.readNativeSessionCookie(req))},
 '@/lib/prisma':{prisma:{user:{findUnique:q=>step('account',()=>f.prisma.user.findUnique(q))}}},'@/lib/admin-email':{ADMIN_EMAIL:adminEmail}},globals);
 const native=load('lib/stats-native-authorization.ts',{'@/lib/native-user-session':reader},globals);
 const profile=load('lib/profile-native-authorization.ts',{'@/lib/native-user-session':reader,'@/lib/profile-update':{updateProfileOriginal(){throw Error('Stats cannot invoke profile effect');}}},globals);
 const route=load('app/api/user/stats/route.ts',{'next/server':{NextResponse:{json(body,init){return init.status===200?step('JSON',()=>Response.json(body,init)):Response.json(body,init);}}},
 '@/lib/stats-native-authorization':native,'@/lib/prisma':{prisma:{user:{findUnique:q=>step('user',()=>{assert.equal(q.where.email,issued.decoded.email);return state.user;})},
 generation:{count:q=>step(q.where.template?'tips':'total',()=>{assert.equal(q.where.userId,state.user.id);return q.where.template?1:3;}),findMany:q=>step('dates',()=>{assert.equal(q.where.userId,state.user.id);return[];})},
 subscription:{findUnique:q=>step('subscription',()=>{assert.equal(q.where.userId,state.user.id);return state.subscription;})}}},
 '@/lib/plans':load('lib/plans.ts',{'@/lib/prisma':{prisma:{}}}),
 '@/lib/generation-quota':{readGenerationQuotaSnapshot:(id)=>step('quota',()=>{assert.equal(id,state.user.id);return state.quota;})}},globals);
 const start=()=>{const p=route.GET(new Request('http://127.0.0.1:4300/api/user/stats?userId=foreign&email=foreign@example.invalid',{signal:controller.signal,headers:{'x-user-proof':JSON.stringify(issued.decoded)}}));originals.push(p);return p;};
 const reply=async(p,status)=>{const r=await p;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.getSetCookie().length,0);const body=await r.json();if(status===401)assert.deepEqual(body,{error:'No autorizado'});if(status===503)assert.deepEqual(body,{error:'Estadísticas no disponibles'});return body;};
 const binding={f,issued,native,reader,profile,route,state,events,timers,gates,entered,controller,originals,start,reply,
 expire(){offset=600000;},deadline(){now+=25000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async release(name){gates[name]?.resolve();await flush();}};
 bindings.push(binding);return binding;
}
async function reach(h,name){let timer;try{await Promise.race([(h.entered[name]??=deferred()).promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Original did not reach '+name)),8000))]);}finally{clearTimeout(timer);}}
async function run(){
 const results=[];async function test(name,fn){const first=bindings.length;try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}finally{for(const h of bindings.slice(first)){for(const g of Object.values(h.gates))g.resolve();await Promise.allSettled(h.originals);}}}
 await test('installed native credential issuer/JWE and dedicated capability return own public paid statistics without refresh or declared query authority',async()=>{
  const h=await bound(),before=h.f.calls.native,b=await h.reply(h.start(),200);
  assert.deepEqual(b.user,{id:h.state.user.id,email:h.state.user.email,name:'Native statistics',lang:'es',createdAt:'2026-10-01T00:00:00.000Z'});
  assert.equal(b.stats.plan,'pro');assert.equal(b.stats.generationsReserved,1);assert.equal(b.stats.remaining,197);assert.equal(b.subscription.cancelAtPeriodEnd,true);
  assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));assert(!JSON.stringify(b).includes('manual_admin'));assert(!JSON.stringify(b).includes('foreign'));
  assert.equal(h.f.calls.native,before);assert.equal(h.f.calls.refresh,0);assert.equal(h.events.filter(x=>x==='decode').length,1);assert.equal(h.events.filter(x=>x==='account').length,1);assert.equal(h.timers.size,0);
 });
 for(const[name,patch]of [['pending TOTP',{requiresTotp:true}],['pending verification',{requiresVerification:true}],['missing ref',{authSessionRef:undefined}],['subject mismatch',{sub:'foreign'}],['missing role',{isAdmin:undefined}],['foreign admin claim',{isAdmin:true}]])
 await test('negative synthetic native cookie '+name+' denies before account and data',async()=>{const h=await bound();await h.f.negativeCookie({...h.issued.decoded,...patch});await h.reply(h.start(),401);assert(!h.events.includes('account'));assert(!h.events.includes('user'));});
 for(const [name,record]of [['removed',null],['verification revoked',{emailVerified:null}],['changed email',{email:'foreign@example.invalid'}]])
 await test('dependent native account '+name+' only denies before public/business reads',async()=>{const h=await bound();h.f.setAccount(record===null?null:{...h.f.account(),...record});await h.reply(h.start(),401);assert(h.events.includes('account'));assert(!h.events.includes('user'));});
 for(const mode of ['absent','bearer','tampered'])await test('native cookie '+mode+' cannot be replaced by query/proof JSON',async()=>{const h=await bound();h.f.setHeaders(mode==='absent'?{}:mode==='bearer'?{authorization:'Bearer '+h.issued.cookies[0].split('=')[1]}:{cookie:h.f.cookieName+'=tampered'});await h.reply(h.start(),401);assert(!h.events.includes('user'));});
 for(const stage of ['decode','account'])await test('native '+stage+' failure sanitized before data dispatch',async()=>{const h=await bound({fail:stage});await h.reply(h.start(),503);assert(!h.events.includes('user'));});
 await test('unconfigured native origin cannot derive authority from request host or proof',async()=>{const h=await bound({envOverride:{}});await h.reply(h.start(),503);assert.equal(h.events.length,0);});
 await test('expired native cookie tolerance cannot renew data access',async()=>{const h=await bound();await h.f.negativeCookie(h.issued.decoded,{maxAge:-1});await h.reply(h.start(),401);assert(!h.events.includes('account'));assert(!h.events.includes('user'));});
 for(const stage of ['account','user','quota','JSON'])await test('expiry during '+stage+' preserves original and suppresses public response',async()=>{const h=await bound({held:stage}),p=h.start();await reach(h,stage);h.expire();await h.release(stage);await h.reply(p,stage==='account'?401:503);assert.equal(h.events.filter(x=>x===stage).length,1);if(stage==='account')assert(!h.events.includes('user'));});
 for(const stage of ['decode','account','quota'])for(const why of ['deadline','abort'])await test('25s '+why+' during native '+stage+' observes same original without next stage or retry',async()=>{const h=await bound({held:stage}),p=h.start();await reach(h,stage);if(why==='abort')h.controller.abort();else h.deadline();await h.reply(p,503);const count=h.events.length;await h.release(stage);await Promise.all(h.originals);assert.equal(h.events.length,count);assert.equal(h.events.filter(x=>x===stage).length,1);});
 await test('mutation capability/JSON/copy/another module cannot authorize statistics callback',async()=>{const h=await bound(),own=await h.native.authorizeNativeStats(),mutation=await h.profile.authorizeNativeProfile(),other=await bound(),foreign=await other.native.authorizeNativeStats();let reads=0;
  for(const fake of [mutation,JSON.parse(JSON.stringify(own)),{...own},foreign,{owner:{id:h.state.user.id,email:h.state.user.email},expires:9999999999,used:false}])await assert.rejects(h.native.runNativeStats(fake,async()=>{reads++;return{};}));
  assert.equal(reads,0);assert(!h.events.includes('user'));
 });
 await test('one genuine read original dispatches once and cannot repeat after completion',async()=>{const h=await bound(),own=await h.native.authorizeNativeStats();let reads=0;const g=deferred();const p=h.native.runNativeStats(own,async(owner,check)=>{reads++;check();await g.promise;check();return owner.id;});
  await assert.rejects(h.native.runNativeStats(own,async()=>{reads++;return'foreign';}));g.resolve();assert.equal(await p,h.state.user.id);await assert.rejects(h.native.runNativeStats(own,async()=>{reads++;return'foreign';}));assert.equal(reads,1);
 });
 await test('frozen native owner stays bound while later account declarations change',async()=>{const h=await bound({held:'user'}),p=h.start();await reach(h,'user');h.f.setAccount({...h.f.account(),id:'foreign',email:'foreign@example.invalid'});await h.release('user');const b=await h.reply(p,200);assert.equal(b.user.id,h.state.user.id);assert.equal(b.user.email,h.state.user.email);});
 await test('missing selected data denies without parallel business queries even after native authentication',async()=>{const h=await bound();h.state.user=null;await h.reply(h.start(),404);assert(h.events.includes('user'));assert(!h.events.includes('quota'));assert(!h.events.includes('subscription'));});
 for(const settings of [{useSecureCookies:true},{cookies:{sessionToken:{name:'fixture-stats-native',options:{httpOnly:true,sameSite:'lax',path:'/',secure:false}}}}])
 await test('native issuer/reader share configured cookie options '+JSON.stringify(settings),async()=>{const h=await bound({settings});await h.reply(h.start(),200);assert.equal(h.f.calls.refresh,0);});
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Actual stats route, distinct private read capability, shared native user cookie reader and installed Auth.js native HTTP/CSRF/credentials/bcrypt/callback/JWE with synthetic configuration/account/business read fixtures. No native SQL/operational auth/OAuth/TOTP/model/provider/mail/spend or cross-device freshness/revocation acceptance; profile mutation capability never grants this read.',results};
}
module.exports={bound,run};if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
