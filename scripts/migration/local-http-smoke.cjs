'use strict';
// Explicit HTTP contract check against the guarded synthetic server, never production.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture,cancellationFixture}=require('../../lib/migration/local-fixture.cjs');
const origin='http://127.0.0.1:4300',cookies=new Map();
async function request(route,options={}){
 const url=new URL(route,origin);assert.equal(url.origin,origin);
 const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{origin,cookie:[...cookies].map(([key,value])=>key+'='+value).join('; '),...options.headers}});
 for(const line of response.headers.getSetCookie()){const pair=line.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}
 assert.ok(response.status<300||response.status>=400,'Unexpected redirect in local API test');
 return response;
}
(async()=>{
 const csrf=await request('/api/auth/csrf');assert.equal(csrf.status,200);const {csrfToken}=await csrf.json();assert.equal(typeof csrfToken,'string');
 const login=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email:fixture.email,password:fixture.password,csrfToken,callbackUrl:origin+'/dashboard'})});
 assert.equal(login.status,200);assert.ok(!new URL((await login.json()).url).searchParams.has('error'));
 const session=await(await request('/api/auth/session')).json();assert.equal(session.user.email,fixture.email);
 const checkout=await request('/api/stripe/checkout',{method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':'ES'},
  body:JSON.stringify({plan:'monthly',lang:'es'})});
 assert.equal(checkout.status,200);assert.deepEqual(await checkout.json(),{url:'https://example.invalid/checkout'});
 const cancellation=await request('/api/stripe/cancel',{method:'POST'});
 assert.equal(cancellation.status,400);
 assert.match((await cancellation.json()).error,/No tienes una suscripción activa/);
 const current=await(await request('/api/admin/ai-configuration')).json();const profile=current.configuration.activeProfile;
 assert.ok(['Prueba OpenAI','Prueba Anthropic'].includes(profile));assert.equal(current.configuration.profiles[profile][fixture.taskType].model,'synthetic-only');
 const key='http-smoke-'+randomUUID(),body=JSON.stringify({title:'Prueba sintética de títulos locales',lang:'es'}),options={method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body};
 const first=await request('/api/youtube/ab-test/suggest',options);assert.equal(first.status,200);const result=await first.json();
 assert.match(result.variantA,/^\[Simulación /);assert.ok(result.variantA.includes(profile.replace('Prueba ','')));
 const replay=await request('/api/youtube/ab-test/suggest',options);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),result);
 const conflict=await request('/api/youtube/ab-test/suggest',{...options,body:JSON.stringify({title:'Entrada distinta con la misma identidad',lang:'es'})});assert.equal(conflict.status,503);
 const cancelCsrf=await request('/api/auth/csrf');assert.equal(cancelCsrf.status,200);const {csrfToken:cancelToken}=await cancelCsrf.json();
 const cancelLogin=await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email:cancellationFixture.email,password:cancellationFixture.password,csrfToken:cancelToken,callbackUrl:origin+'/dashboard'})});
 assert.equal(cancelLogin.status,200);assert.ok(!new URL((await cancelLogin.json()).url).searchParams.has('error'));
 assert.equal((await(await request('/api/auth/session')).json()).user.email,cancellationFixture.email);
 const before=await(await request('/api/user/stats')).json();assert.equal(before.subscription.cancelAtPeriodEnd,false);
 const scheduled=await request('/api/stripe/cancel',{method:'POST'});assert.equal(scheduled.status,200);assert.deepEqual(await scheduled.json(),{ok:true});
 const after=await(await request('/api/user/stats')).json();assert.equal(after.subscription.cancelAtPeriodEnd,true);
 console.log(JSON.stringify({status:'PASS',profile,checks:['normal fixture authentication','checkout returns a synthetic non-routable URL','cancellation blocked without a provider customer','configured synthetic provider','immutable replay','conflicting operation rejected','cancellation HTTP writes only the synthetic subscription'],result}));
})().catch(error=>{console.error(error);process.exitCode=1;});
