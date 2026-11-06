'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./route-harness.cjs'),{fixture}=require('./admin-native-authorization.test.cjs');
(async()=>{
 const raw='synthetic-cold-start-auth-secret-with-whitespace\n',normalized=raw.trim(),issuer=await fixture({settings:{secret:normalized}}),early=await fixture({settings:{secret:raw}});
 const issued=await issuer.login();assert(issued.decoded&&issued.decoded.isAdmin===true);early.setHeaders(issuer.headers());assert.equal((await issuer.guard.requireAdmin()).ok,true);assert.equal((await early.guard.requireAdmin()).ok,false,'Differently captured bytes must never decrypt this cookie');
 const results=[];
 for(const mode of ['cold','normalized','revoked']){
  const env={NEXT_RUNTIME:'nodejs',YTV_OPERATIONAL_RUNTIME:'1',AUTH_SECRET:mode==='normalized'?normalized:raw,SECRET_BYTES:'  synthetic provider bytes  '};let runtime,actor,authLoads=0,phase=null;const calls=[];
  const runtimeMocks={'server-only':{},'node:crypto':crypto,'./configuration-service.cjs':{createConfigurationService:d=>Object.freeze({actor:d.getActor})}};
  Object.defineProperty(runtimeMocks,'@/lib/auth-guards',{enumerable:true,get(){authLoads++;phase=env.AUTH_SECRET===normalized?'normalized':'raw';return (phase==='normalized'?issuer:early).guard;}});
  const mocks={'./lib/ai/ytubviral-native-release.cjs':{registerYTubViralNativeRelease:o=>{actor=o.getAdministrativeActor;calls.push('register');}},'./lib/ai/platform-web-host':{prepareConfiguredPlatformWebHost:async()=>{assert.equal(env.SECRET_BYTES,'  synthetic provider bytes  ');calls.push('prepare');}},'./lib/ai/operational-runtime':{installConfiguredOperationalWebRuntime:async()=>{assert.equal(env.SECRET_BYTES,'synthetic provider bytes');calls.push('install');}},'./lib/migration/local-fixture-runtime':{installLocalFixture:()=>{throw Error('No fixture activation');}}};
  Object.defineProperty(mocks,'./lib/ai/configuration-runtime',{enumerable:true,get(){return runtime??=load('lib/ai/configuration-runtime.ts',runtimeMocks,{process:{env}});}});
  const instrumentation=load('instrumentation.ts',mocks,{process:{env}});await instrumentation.register();assert.deepEqual(calls,['register','prepare','install']);
  const before={...issuer.calls};if(mode==='revoked')issuer.setAccount(null);
  const observed=await actor(),expected=mode==='revoked'?null:'admin_'+crypto.createHash('sha256').update(issued.decoded.email).digest('hex');
  assert.equal(observed,expected,'Cold-start actor differs from genuine post-normalization native credentials session;auth import phase='+phase);
  assert.equal(phase,'normalized');assert.equal(authLoads,1);assert.equal(issuer.calls.refresh,before.refresh);assert.equal(issuer.calls.writes,0);
  if(mode!=='revoked'){const service=runtime.createAuthenticatedConfigurationService({});assert.equal(await service.actor(),expected);assert.equal(authLoads,2);}
  results.push({mode,status:'PASS',sameOriginalAuthenticatedGuard:true,noSessionRefresh:true});
 }
 console.log(JSON.stringify({complete:true,results,actualInstrumentationAndConfigurationRuntime:true,actualAuthCoreCredentialsAndEncryptedCookies:true,syntheticSecretsAccountsAndClockOnly:true,networkCalls:0,originalCookieReads:0,operationalAccepted:false}));
})().catch(e=>{console.error(JSON.stringify({complete:false,code:e.code??'COLD_START_AUTH_FAILED',message:e.message,scope:'Synthetic original native cookie and actual boot source only;no operational account or credential'}));process.exitCode=1;});
