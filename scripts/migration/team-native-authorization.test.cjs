'use strict';
const assert=require('node:assert/strict'),{NextRequest}=require('next/server'),{load}=require('./route-harness.cjs'),{fixture}=require('./admin-native-authorization.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const methods=[
 {purpose:'read',file:'app/api/team/route.ts',method:'GET',error:'team_read_unavailable',success:200},
 {purpose:'create',file:'app/api/team/route.ts',method:'POST',error:'team_create_unconfirmed',success:201,helper:'createTeamOriginal',module:'team-creation',body:{name:'Native closed team'}},
 {purpose:'rename',file:'app/api/team/route.ts',method:'PATCH',error:'team_rename_unconfirmed',success:200,helper:'renameTeamOriginal',module:'team-rename',body:{teamId:'team-one',memberId:'member-own',previousRole:'owner',previousName:'Original team',name:'Changed team'}},
 {purpose:'exit',file:'app/api/team/route.ts',method:'DELETE',error:'team_exit_unconfirmed',success:200,helper:'exitTeamOriginal',module:'team-exit',body:{teamId:'team-one',memberId:'member-own',previousRole:'owner',operation:'delete'}},
 {purpose:'invite',file:'app/api/team/invite/route.ts',method:'POST',error:'team_invitation_unconfirmed',success:201,helper:'inviteTeamOriginal',module:'team-invitation',body:{teamId:'team-one',memberId:'member-own',previousRole:'owner',targetEmail:'recipient@example.invalid',role:'member'}},
 {purpose:'revoke',file:'app/api/team/invite/route.ts',method:'DELETE',error:'invitation_revocation_unconfirmed',success:200,helper:'revokeInvitationOriginal',module:'team-invitation-revocation',body:{teamId:'team-one',invitationId:'invitation-one',targetEmail:'recipient@example.invalid',previousRole:'member',previousExpiresAt:'2026-10-20T00:00:00.000Z'}},
 {purpose:'member-role',file:'app/api/team/members/route.ts',method:'PATCH',error:'member_mutation_unconfirmed',success:200,helper:'mutateTeamMemberOriginal',module:'team-member-mutation',body:{teamId:'team-one',memberId:'member-target',targetUserId:'target-one',previousRole:'member',role:'admin'}},
 {purpose:'member-remove',file:'app/api/team/members/route.ts',method:'DELETE',error:'member_mutation_unconfirmed',success:200,helper:'mutateTeamMemberOriginal',module:'team-member-mutation',body:{teamId:'team-one',memberId:'member-target',targetUserId:'target-one',previousRole:'member',role:null}},
 {purpose:'join',file:'app/api/team/join/route.ts',method:'POST',error:'team_join_unconfirmed',success:200,helper:'joinTeamOriginal',module:'team-join',body:{token:'a'.repeat(48)}},
];
const adminEmail='other-admin@example.invalid',bindings=[],copy=x=>JSON.parse(JSON.stringify(x));
async function bound(m,{held,fail,settings={},envOverride,replyExpires=false}={}){
 const f=await fixture({adminEmail,settings}),issued=await f.login();let now=1000,offset=0,serial=0;
 const events=[],gates={},entered={},timers=new Map(),running=[],effects=[],controller=new AbortController();
 if(held)for(const stage of [held].flat())gates[stage]=deferred();
 const state={body:copy(m.body??{}),key:'native-team-key'};
 const step=(name,fn)=>{
  events.push(name);(entered[name]??=deferred()).resolve();
  const p=(async()=>{if(fail===name)throw Error('NEVER_PUBLIC native team diagnostic');if(gates[name])await gates[name].promise;return fn();})();running.push(p);void p.catch(()=>{});return p;
 };
 const ClockDate=new Proxy(Date,{get(target,key,receiver){return key==='now'?()=>Date.now()+offset:Reflect.get(target,key,receiver);}});
 const globals={Date:ClockDate,Headers,process:{env:envOverride??{AUTH_URL:'http://127.0.0.1:4300'}},performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const reader=load('lib/native-user-session.ts',{'next/headers':{headers:async()=>f.headers()},'@/auth':{readNativeSessionCookie:req=>step('decode',()=>f.authBindings.readNativeSessionCookie(req))},'@/lib/prisma':{prisma:{user:{findUnique:q=>step('account',()=>f.prisma.user.findUnique(q))}}},'@/lib/admin-email':{ADMIN_EMAIL:adminEmail}},globals);
 const native=load('lib/team-native-authorization.ts',{'@/lib/native-user-session':reader},globals);
 const prisma={teamMember:{findMany:q=>step('data',()=>{assert.equal(q.where.userId,issued.decoded.id);assert.equal(q.take,2);assert(!JSON.stringify(q.select).includes('token'));return[];})}};
 const common={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/plans':{hasPaidAccess(){throw Error('Native auth test must not exercise plan operations');}},'@/lib/team-invitation-email':{}};
 const deps={'next/server':{NextResponse:{json(body,init){events.push('JSON'+init.status);const response=Response.json(body,init);if(replyExpires&&init.status<300)offset=600000;return response;}}},'@/lib/prisma':{prisma},'@/lib/team-native-authorization':native,'@/lib/team-read-contract':load('lib/team-read-contract.ts')};
 for(const kind of ['team-creation','team-rename','team-exit','team-invitation','team-invitation-revocation','team-member-mutation','team-join'])deps['@/lib/'+kind]=load('lib/'+kind+'.ts',common,globals);
 if(m.helper){
  deps['@/lib/'+m.module]={...deps['@/lib/'+m.module],[m.helper](owner,input,key,operationOrCheck,lastCheck){
   const p=(async()=>{
    const check=lastCheck??operationOrCheck;assert.equal(typeof check,'function');if(lastCheck)assert.equal(operationOrCheck,m.purpose==='member-role'?'role':'remove');
    const captured={owner:copy(owner),input:copy(input),key};assert(Object.isFrozen(owner));assert.deepEqual(captured.owner,{userId:issued.decoded.id,email:issued.decoded.email});assert.equal(key,'native-team-key');
    check();await step('admit',()=>{});check();
    // The explicit helper double mirrors an already dispatched write and its
    // late acknowledgement. Existing server suites exercise actual SQL helpers.
    await step('effect',()=>effects.push(captured));await step('ack',()=>{});check();
    return{ok:true,...captured.owner,key,operation:m.purpose,status:'closed-synthetic-result'};
   })();running.push(p);return p;
  }};
 }
 const route=load(m.file,deps,globals);
 const start=()=>{
  const request=new NextRequest('http://127.0.0.1:4300'+m.file.replace('app','').replace('/route.ts','')+'?userId=foreign&email=foreign@example.invalid',{method:m.method,signal:controller.signal,headers:{...Object.fromEntries(f.headers()),'content-type':'application/json','Idempotency-Key':state.key},...(m.method==='GET'?{}:{body:JSON.stringify(state.body)})});
  const observed=new Proxy(request,{get(target,key){if(key==='headers')return{get(name){events.push('key');return target.headers.get(name);}};if(key==='json')return()=>step('body',async()=>{const parsed=await target.json();state.parsed=parsed;return parsed;});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const p=route[m.method](observed);running.push(p);return p;
 };
 const reply=async(p,status)=>{const response=await p;assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.getSetCookie().length,0);const body=await response.json();assert(!JSON.stringify(body).includes('NEVER_PUBLIC'));if(status===401)assert.deepEqual(body,{error:'Unauthorized'});if(status===503)assert.deepEqual(body,{error:m.error});return body;};
 const h={f,issued,native,reader,route,deps,globals,prisma,state,events,gates,entered,timers,running,effects,controller,start,reply,
  expire(){offset=600000;},deadline(){now+=m.method==='GET'?25000:55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async release(name){gates[name]?.resolve();await flush();},
  async finish(){for(const g of Object.values(gates))g.resolve();let n=0;while(n<running.length){const ps=running.slice(n);n=running.length;await Promise.allSettled(ps);await flush();}}
 };bindings.push(h);return h;
}
async function reach(h,name){let timer;try{await Promise.race([(h.entered[name]??=deferred()).promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Original did not reach '+name)),8000))]);}finally{clearTimeout(timer);}}
async function run(){
 const results=[];async function test(name,fn){const first=bindings.length;try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}finally{for(const h of bindings.slice(first))await h.finish();}}
 for(const m of methods){
  await test(m.purpose+' installed Auth.js cookie/NextRequest binds own native actor before data or helper',async()=>{const h=await bound(m),b=await h.reply(h.start(),m.success);assert.equal(b.userId,h.issued.decoded.id);assert.equal(b.email,h.issued.decoded.email);assert.equal(h.f.calls.refresh,0);assert.equal(h.f.calls.writes,0);assert.equal(h.timers.size,0);assert.deepEqual(h.events.slice(0,2),['decode','account']);if(m.helper){assert.equal(h.effects.length,1);assert.equal(h.effects[0].key,h.state.key);}else{assert.equal(b.team,null);assert.equal(h.events.filter(x=>x==='data').length,1);}});
  for(const[name,patch]of [['pending TOTP',{requiresTotp:true}],['pending verification',{requiresVerification:true}],['missing ref',{authSessionRef:undefined}],['subject mismatch',{sub:'foreign'}],['foreign admin claim',{isAdmin:true}]])
  await test(m.purpose+' negative native cookie '+name+' denied before key/body/data/effects',async()=>{const h=await bound(m);await h.f.negativeCookie({...h.issued.decoded,...patch});await h.reply(h.start(),401);assert(!h.events.includes('key'));assert(!h.events.includes('body'));assert(!h.events.includes('data'));assert.equal(h.effects.length,0);});
  for(const[name,record]of [['removed',null],['verification revoked',{emailVerified:null}],['changed email',{email:'foreign@example.invalid'}]])
  await test(m.purpose+' dependent stored account '+name+' only denies',async()=>{const h=await bound(m);h.f.setAccount(record===null?null:{...h.f.account(),...record});await h.reply(h.start(),401);assert(h.events.includes('account'));assert(!h.events.includes('key'));assert(!h.events.includes('data'));assert.equal(h.effects.length,0);});
  await test(m.purpose+' bearer containing genuine native cookie cannot grant operation',async()=>{const h=await bound(m);h.f.setHeaders({authorization:'Bearer '+h.issued.cookies[0].split('=')[1]});await h.reply(h.start(),401);assert(!h.events.includes('key'));assert(!h.events.includes('data'));assert.equal(h.effects.length,0);});
  for(const stage of m.helper?['account','body','admit','effect','ack']:['account','data'])
  await test(m.purpose+' expiry during '+stage+' suppresses acknowledgement without replay/adoption',async()=>{const h=await bound(m,{held:stage}),p=h.start();await reach(h,stage);h.expire();await h.release(stage);await h.reply(p,stage==='account'?401:503);await h.finish();assert.equal(h.events.filter(x=>x===stage).length,1);assert.equal(h.effects.length,['effect','ack'].includes(stage)?1:0);});
  for(const stage of ['decode',m.helper?'effect':'data'])for(const why of ['deadline','abort'])
  await test(m.purpose+' original'+(m.helper?'55s':'25s')+' '+why+' during '+stage+' blocks response and duplicate effects',async()=>{const h=await bound(m,{held:stage}),p=h.start();await reach(h,stage);if(why==='abort')h.controller.abort();else h.deadline();await h.reply(p,503);await h.finish();assert.equal(h.events.filter(x=>x===stage).length,1);assert.equal(h.effects.length,stage==='effect'?1:0);});
  await test(m.purpose+' expiry crossing JSON cannot return late success',async()=>{const h=await bound(m,{replyExpires:true});await h.reply(h.start(),503);assert.equal(h.effects.length,m.helper?1:0);assert.equal(h.f.calls.refresh,0);});
  for(const stage of ['decode',m.helper?'effect':'data'])await test(m.purpose+' private '+stage+' failure sanitized without retry',async()=>{const h=await bound(m,{fail:stage});await h.reply(h.start(),503);assert.equal(h.events.filter(x=>x===stage).length,1);assert.equal(h.effects.length,0);});
 }
 await test('all nine purposes reject the72 cross-purpose combinations without granting an actor',async()=>{const h=await bound(methods[0]);let calls=0;for(const m of methods){const own=await h.native.authorizeNativeTeam(m.purpose);for(const other of methods.filter(x=>x.purpose!==m.purpose))await assert.rejects(h.native.runNativeTeam(own,other.purpose,async()=>{calls++;return{};}));assert.equal(calls,0);}});
 await test('one genuine private team original runs once; later fields/JSON/copy/foreign scope cannot recover it',async()=>{const h=await bound(methods[0]),own=await h.native.authorizeNativeTeam('create'),foreign=await bound(methods[0]),other=await foreign.native.authorizeNativeTeam('create');let calls=0;const g=deferred(),p=h.native.runNativeTeam(own,'create',async()=>{calls++;await g.promise;return{};});h.running.push(p);
  try{for(const fake of [JSON.parse(JSON.stringify(own)),{...own},other,{owner:{userId:h.issued.decoded.id,email:h.issued.decoded.email},purpose:'create',expires:9999999999,used:false}])await assert.rejects(h.native.runNativeTeam(fake,'create',async()=>{calls++;return{};}));await assert.rejects(h.native.runNativeTeam(own,'create',async()=>{calls++;return{};}));}finally{g.resolve();}await p;await assert.rejects(h.native.runNativeTeam(own,'create',async()=>{calls++;return{};}));assert.equal(calls,1);
 });
 await test('profile/password/stats/history permissions are not team permissions',async()=>{const h=await bound(methods[0]),deps={'@/lib/native-user-session':h.reader,'@/lib/profile-update':{},'@/lib/password-change':{}};const profile=load('lib/profile-native-authorization.ts',deps,h.globals),password=load('lib/password-native-authorization.ts',deps,h.globals),stats=load('lib/stats-native-authorization.ts',deps,h.globals),history=load('lib/history-native-authorization.ts',deps,h.globals);let calls=0;for(const fake of [await profile.authorizeNativeProfile(),await password.authorizeNativePasswordChange(),await stats.authorizeNativeStats(),await history.authorizeNativeHistory()])await assert.rejects(h.native.runNativeTeam(fake,'read',async()=>{calls++;return{};}));assert.equal(calls,0);});
 await test('unknown purpose never reads a native cookie or constructs an original',async()=>{const h=await bound(methods[0]),before=h.events.length;await assert.rejects(h.native.authorizeNativeTeam('administrative-public-proof'));assert.equal(h.events.length,before);});
 for(const m of methods.filter(x=>x.helper))await test(m.purpose+' capture ignores later native account, key and parsed-body declarations',async()=>{const h=await bound(m,{held:'admit'}),p=h.start();await reach(h,'admit');h.f.setAccount({...h.f.account(),id:'foreign',email:'foreign@example.invalid'});h.state.key='foreign';for(const k of Object.keys(h.state.parsed))h.state.parsed[k]='foreign';await h.release('admit');const b=await h.reply(p,m.success);assert.equal(b.userId,h.issued.decoded.id);assert.equal(b.key,'native-team-key');assert(!JSON.stringify(h.effects[0]).includes('foreign'));});
 for(const settings of [{useSecureCookies:true},{cookies:{sessionToken:{name:'fixture-team-native',options:{httpOnly:true,sameSite:'lax',path:'/',secure:false}}}}])await test('native issuer/reader cookie options shared by team scope '+JSON.stringify(settings),async()=>{const h=await bound(methods[0],{settings});await h.reply(h.start(),200);assert.equal(h.f.calls.refresh,0);});
 await test('native expired-cookie tolerance cannot renew team permission',async()=>{const h=await bound(methods[0]);await h.f.negativeCookie(h.issued.decoded,{maxAge:-1});await h.reply(h.start(),401);assert(!h.events.includes('account'));assert(!h.events.includes('data'));});
 await test('missing configured origin unavailable before request actor or effects',async()=>{const h=await bound(methods[0],{envOverride:{}});await h.reply(h.start(),503);assert(!h.events.includes('data'));assert.equal(h.events.filter(x=>x==='decode').length,0);});
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Actual four team route modules/nine HTTP methods and private purpose-bound native cookie authorization, installed Auth.js HTTP-CSRF-credentials-bcrypt-callback-JWE/NextRequest with closed identity/account/SQL/helper/clock fixtures.72 cross-purpose combinations in one assertion case. No physical SQL/real team/mail/credentials/OAuth/TOTP/model/provider/operative auth/provenance/consent/freshness/revocation/recovery acceptance.',results};
}
module.exports={methods,bound,reach,run};if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
