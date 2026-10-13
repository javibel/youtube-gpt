'use strict';
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {load}=require('./route-harness.cjs');
const email='migration-admin@example.invalid',origin='http://127.0.0.1:4300';
const secret='synthetic-admin-authorization-secret-not-operational';
let passwordHash;
async function fixture({env={},settings={},accountPatch={},decoder,adminEmail=email}={}){
 const {Auth}=await import('@auth/core'),jwt=await import('next-auth/jwt'),Credentials=(await import('next-auth/providers/credentials')).default,bcrypt=require('bcryptjs');
 passwordHash??=await bcrypt.hash('closed-fixture-password-19',8);
 let config,incoming=new Headers(),account={id:'fixture-native-admin',email,name:'Closed fixture',password:passwordHash,emailVerified:new Date(Date.now()-10000),createdAt:new Date('2026-10-01T00:00:00Z'),...accountPatch};
 const calls={native:0,credentialReads:0,accountReads:0,refresh:0,factors:0,writes:0,read:0},clock={offset:0};
 const GuardDate=new Proxy(Date,{get(target,key,receiver){return key==='now'?()=>Date.now()+clock.offset:Reflect.get(target,key,receiver);}});
 const prisma={user:{findUnique:async query=>{if(query.where.email){calls.credentialReads++;return account;}
 calls.accountReads++;if(query.where.id!==account?.id)return null;return account;},update:async()=>{calls.writes++;throw Error('No account mutation in native guard fixture');},create:async()=>{calls.writes++;throw Error('No Google/real account creation');}}};
 const fixtureEnv={AUTH_URL:origin,...env};
 const auth=load('auth.ts',{'next-auth':options=>{config=options;Object.assign(config,{secret,basePath:'/api/auth',trustHost:true,session:{strategy:'jwt',maxAge:300}},settings);config.providers=config.providers.filter(x=>x.id==='credentials');
 const native=req=>{calls.native++;return Auth(req,{...config,logger:{debug(){},warn(){},error(){}}});};return{handlers:{GET:native,POST:native}};},
 'next-auth/jwt':jwt,'next-auth/providers/credentials':Credentials,'next-auth/providers/google':()=>({id:'google'}),'./auth.config':load('auth.config.ts'),
 '@/lib/prisma':{prisma},bcryptjs:bcrypt,'next/headers':{cookies:()=>{throw Error('No ambient attribution');}},
 '@/lib/admin-email':{ADMIN_EMAIL:adminEmail},'@/lib/admin-totp-consumption':{consumeAdminTotp:async()=>{calls.factors++;return false;}},
 '@/lib/rate-limit-db':{rateLimitDb:async()=>true},'@/lib/totp-account':load('lib/totp-account.ts'),'@/lib/features':{AFFILIATES_DORMANT:true},'./lib/migration/local-auth-redirect.cjs':{}},
 {Date,Headers,crypto:webcrypto,process:{env:fixtureEnv}});
 const originUsed=env.AUTH_URL??env.NEXTAUTH_URL??origin,secure=settings.useSecureCookies??new URL(originUsed).protocol==='https:';
 const cookieName=settings.cookies?.sessionToken?.name??(secure?'__Secure-authjs.session-token':'authjs.session-token');
 const authBindings={readNativeSessionCookie:async req=>{calls.read++;assert.equal(req.headers.get('authorization'),null);return decoder?decoder(req):auth.readNativeSessionCookie(req);},
 auth:async()=>{calls.refresh++;const response=await auth.handlers.GET(new Request(origin+'/api/auth/session',{headers:incoming}));return response.json();}};
 const guard=load('lib/auth-guards.ts',{'next/server':{NextResponse:Response},'next/headers':{headers:async()=>incoming},'@/auth':authBindings,'@/lib/prisma':{prisma},'@/lib/admin-email':{ADMIN_EMAIL:adminEmail}},
 {Date:GuardDate,Headers,process:{env:fixtureEnv}});
 async function login({password='closed-fixture-password-19',csrf=true,totp}={}){
  const nativeOrigin=new URL(originUsed).origin;
  const csrfResponse=await auth.handlers.GET(new Request(nativeOrigin+'/api/auth/csrf')),csrfBody=await csrfResponse.json();
  assert.equal(csrfResponse.status,200);
  const cookie=csrfResponse.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const body=new URLSearchParams({email,password,csrfToken:csrf?csrfBody.csrfToken:'wrong-native-csrf',callbackUrl:nativeOrigin+'/'});
  if(totp!==undefined)body.set('totp',totp);
  const response=await auth.handlers.POST(new Request(nativeOrigin+'/api/auth/callback/credentials',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body}));
  const cookies=response.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>x.startsWith(cookieName+'=')||x.startsWith(cookieName+'.'));
  incoming=new Headers({cookie:cookies.join('; ')});
  const decoded=await auth.readNativeSessionCookie(new Request(nativeOrigin+'/api/auth/session',{headers:incoming}));
  return{response,decoded,cookies};
 }
 async function negativeCookie(token,{maxAge=300,name=cookieName,encodeSecret=secret}={}){
  incoming=new Headers({cookie:name+'='+await jwt.encode({token,secret:encodeSecret,salt:name,maxAge})});
 }
 return{auth,guard,config,jwt,cookieName,calls,clock,login,negativeCookie,
 headers:()=>incoming,setHeaders:value=>{incoming=new Headers(value);},account:()=>account,setAccount:value=>{account=value;},prisma,authBindings};
}
async function denied(f,{reads}={}){
 const before={...f.calls},result=await f.guard.requireAdmin();
 assert.equal(result.ok,false);assert.equal(result.response.status,403);
 assert.deepEqual(await result.response.json(),{error:'No autorizado'});assert.equal(result.response.headers.get('Cache-Control'),'no-store');
 assert.equal(result.response.headers.getSetCookie().length,0);assert.equal(f.calls.native,before.native);assert.equal(f.calls.refresh,before.refresh);assert.equal(f.calls.writes,0);
 if(reads!==undefined)assert.equal(f.calls.accountReads-before.accountReads,reads);
}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 let genuine;
 await test('installed Auth.js native CSRF/credentials/bcrypt/callback/JWE grants only its fully eligible synthetic principal',async()=>{
 const f=await fixture(),issued=await f.login();assert.equal(issued.response.status,200);assert.equal(issued.cookies.length,1);
 genuine=issued.decoded;assert.equal(genuine.id,'fixture-native-admin');assert.equal(genuine.email,email);assert.equal(genuine.isAdmin,true);assert.equal(genuine.requiresVerification,false);assert.equal(genuine.requiresTotp,false);
 assert.match(genuine.authSessionRef,/^[a-f0-9-]{36}$/);const before=f.calls.native;
 const result=await f.guard.requireAdmin();assert.deepEqual(JSON.parse(JSON.stringify(result)),{ok:true,email});
 assert.equal(f.calls.native,before);assert.equal(f.calls.refresh,0);assert.equal(f.calls.accountReads,1);assert.equal(f.calls.writes,0);assert.equal(f.calls.read,1);
 assert.deepEqual(f.headers().getSetCookie(),[]);
 });
 await test('wrong password cannot issue an eligible native cookie',async()=>{const f=await fixture(),issued=await f.login({password:'wrong'});assert.equal(issued.cookies.length,0);await denied(f,{reads:0});});
 await test('native CSRF failure cannot issue an eligible cookie',async()=>{const f=await fixture(),issued=await f.login({csrf:false});assert.equal(issued.cookies.length,0);assert.equal(f.calls.credentialReads,0);await denied(f,{reads:0});});
 for(const totp of [undefined,'123456'])await test('configured native credentials factor cannot be bypassed '+String(totp),async()=>{const f=await fixture({env:{ADMIN_TOTP_SECRET:'synthetic-secret-only'}}),issued=await f.login({totp});assert.equal(issued.cookies.length,0);assert.equal(f.calls.factors,totp?1:0);await denied(f,{reads:0});});
 await test('native credentials session for new unverified synthetic account is denied without backfill',async()=>{const f=await fixture({accountPatch:{emailVerified:null}}),issued=await f.login();assert.equal(issued.decoded.requiresVerification,true);await denied(f,{reads:0});});
 assert.ok(genuine,'Native fixture issuance failed');
 const patches=[['pending TOTP',{requiresTotp:true}],['pending verification',{requiresVerification:true}],['false admin role',{isAdmin:false}],['string admin role',{isAdmin:'true'}],['numeric TOTP flag',{requiresTotp:0}],['string verification flag',{requiresVerification:'false'}],['changed email',{email:'other@example.invalid'}],['noncanonical email',{email:email.toUpperCase()}],['invalid ID',{id:'../fixture-native-admin'}],['missing ID',{id:undefined}],['changed native subject',{sub:'another-user'}],['missing native subject',{sub:undefined}],['missing email',{email:undefined}],['legacy reference',{authSessionRef:undefined}],['public reference',{authSessionRef:'fixture-native-session-one'}],['missing role',{isAdmin:undefined}],['missing verification',{requiresVerification:undefined}],['missing TOTP',{requiresTotp:undefined}]];
 for(const [name,patch]of patches)await test('negative synthetic JWE '+name+' cannot authorize or consult dependent account',async()=>{const f=await fixture();await f.negativeCookie({...genuine,...patch});await denied(f,{reads:0});});
 await test('native decoder expiry tolerance cannot renew an already expired principal',async()=>{const f=await fixture();await f.negativeCookie(genuine,{maxAge:-1});await denied(f,{reads:0});});
 await test('expiry during dependent account read still denies',async()=>{const f=await fixture();await f.login();const find=f.prisma.user.findUnique;f.prisma.user.findUnique=async q=>{const record=await find(q);f.clock.offset=600000;return record;};await denied(f,{reads:1});});
 for(const [name,account]of [['removed',null],['ID changed',{id:'another-user'}],['email changed',{email:'other@example.invalid'}],['verification revoked',{emailVerified:null}],['string date',{emailVerified:'2026-01-01'}],['invalid date',{emailVerified:new Date(NaN)}],['future date',{emailVerified:new Date(Date.now()+3600000)}]])
 await test('dependent stored account is negative only: '+name,async()=>{const f=await fixture();await f.login();f.setAccount(account===null?null:{...f.account(),...account});await denied(f,{reads:1});});
 await test('account outage denies and sanitizes without issuing or refreshing JWT',async()=>{const f=await fixture();await f.login();f.prisma.user.findUnique=async()=>{throw Error('private-database-diagnostic');};await denied(f);});
 await test('tampered actual issued cookie is denied',async()=>{const f=await fixture();await f.login();f.setHeaders({cookie:f.cookieName+'=invalid-jwe'});await denied(f,{reads:0});});
 await test('bearer containing actual native credential cookie is not an alternative principal',async()=>{const f=await fixture();await f.login();const bearer=f.headers().get('cookie').split('=')[1];f.setHeaders({authorization:'Bearer '+bearer,'X-YTV-Admin-Proof':JSON.stringify(genuine)});await denied(f,{reads:0});assert.equal(f.calls.read,0);});
 await test('wrong native encryption secret is denied',async()=>{const f=await fixture();await f.negativeCookie(genuine,{encodeSecret:'another-synthetic-secret'});await denied(f,{reads:0});});
 for(const settings of [{useSecureCookies:true},{cookies:{sessionToken:{name:'fixture-admin-custom',options:{httpOnly:true,sameSite:'lax',path:'/',secure:false}}}}])
 await test('issuer and read-only guard share native cookie options '+JSON.stringify(settings),async()=>{const f=await fixture({settings});await f.login();assert.equal((await f.guard.requireAdmin()).ok,true);assert.equal(f.calls.refresh,0);});
 await test('secure configured origin denies a plain cookie alias',async()=>{const f=await fixture({env:{AUTH_URL:'https://fixture.example.invalid'}});await f.negativeCookie(genuine,{name:'authjs.session-token'});await denied(f,{reads:0});});
 for(const configured of ['', 'http://external.example.invalid','https://u:p@fixture.example.invalid','https://fixture.example.invalid/?proof=1','https://fixture.example.invalid/#x','invalid'])
 await test('invalid/missing configured native origin fails closed '+configured,async()=>{const f=await fixture();await f.login();const guard=load('lib/auth-guards.ts',{'next/server':{NextResponse:Response},'next/headers':{headers:async()=>f.headers()},'@/auth':f.authBindings,'@/lib/prisma':{prisma:f.prisma},'@/lib/admin-email':{ADMIN_EMAIL:email}},{Headers,Date,process:{env:{AUTH_URL:configured}}});f.guard=guard;await denied(f,{reads:0});});
 for(const value of [null,[],{}, {...genuine,exp:'9999999999'}, {...genuine,iat:Date.now()/1000+3600}])
 await test('decoder boundary malformed principal remains denial '+JSON.stringify(value).slice(0,65),async()=>{const f=await fixture({decoder:async()=>value});f.setHeaders({cookie:'synthetic-boundary-only'});await denied(f,{reads:0});});
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Installed Auth.js native HTTP/CSRF/credentials/bcrypt/callback/JWE with synthetic configuration/account only; negative JWE and malformed decoder fixtures never establish operational authentication. Read-only administrative cookie authorization, dependent account read for denial, no native refresh, writer, OAuth/network/listener/production/real TOTP or cross-device revocation acceptance.',results};
}
module.exports={fixture,denied,run};if(require.main===module)run().then(x=>{console.log(JSON.stringify(x,null,2));if(x.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
