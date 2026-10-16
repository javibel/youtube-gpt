'use strict';
const fs=require('node:fs'),path=require('node:path');
const {plan:compilePlan}=require('./compile-only.cjs');
const {fixture,cancellationFixture}=require('../../lib/migration/local-fixture.cjs');
function plan(environment=process.env,args=[]){
 const base=compilePlan(environment,args);
 if(!fs.existsSync(path.join(base.cwd,'.next/BUILD_ID')))throw Error('ISOLATION_BLOCKED: protected local build required');
 const config=JSON.parse(fs.readFileSync(path.join(base.cwd,'../migration-config.json'),'utf8'));
 return {cwd:base.cwd,host:'127.0.0.1',port:4300,env:{...base.env,DATABASE_URL:config.databaseUrl,DATABASE_URL_DIRECT:config.databaseUrl,AUTH_URL:'http://127.0.0.1:4300',AUTH_SECRET:'synthetic-local-server-secret-with-no-real-account',AUTH_TRUST_HOST:'true',ADMIN_EMAIL:fixture.email,YTV_MIGRATION_WEB_TEST:'1',STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',TEMP:path.join(base.cwd,'.migration-tmp'),TMP:path.join(base.cwd,'.migration-tmp')}};
}
function paymentFixtures(){
 const userId=fixture.userId;
 return [
  {operation:'customers.create',args:[{email:fixture.email,name:'Cuenta ficticia de pruebas locales',metadata:{userId}}],result:{id:'cus_synthetic_http'}},
  {operation:'checkout.sessions.create',args:[{
   customer:'cus_synthetic_http',payment_method_types:['card'],line_items:[{price:'price_synthetic_monthly',quantity:1}],
   mode:'subscription',currency:'eur',allow_promotion_codes:true,locale:'es',
   success_url:'https://ytubviral.com/stripe/success',cancel_url:'https://ytubviral.com/dashboard',
   metadata:{userId},subscription_data:{description:'YTubViral.com — Plan Pro (200 generaciones/mes)',
    metadata:{userId,service:'YTubViral.com',plan:'pro'},trial_period_days:7},
   custom_text:{submit:{message:'7 días gratis, luego 9,99€/mes. Cancela antes del día 7 sin coste.'}}
  }],result:{url:'https://example.invalid/checkout'}},
  {operation:'subscriptions.list',args:[{customer:cancellationFixture.customerId,status:'all',limit:10}],result:{data:[{id:'sub_synthetic_cancel',status:'active',cancel_at_period_end:false}]}},
  {operation:'subscriptions.update',args:['sub_synthetic_cancel',{cancel_at_period_end:true}],result:{id:'sub_synthetic_cancel',cancel_at_period_end:true}}
 ];
}
async function main(){
 const task=plan(process.env,process.argv.slice(2));
 fs.mkdirSync(task.env.TEMP,{recursive:true});
 for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,task.env);process.chdir(task.cwd);
 const guard=path.join(__dirname,'runtime-guard.cjs');process.execArgv.push('--require',guard);require(guard);
 const {createFixtureLifecycle,installFixtureLifecycle}=require('../../lib/migration/local-fixture-lifecycle.cjs');
 let server,app;
 const lifecycle=createFixtureLifecycle({beforeDrain:()=>new Promise((resolve,reject)=>{if(!server)return resolve();server.close(error=>error?reject(error):resolve());}),afterDrain:()=>app?.close()});
 installFixtureLifecycle(lifecycle);
 let stopping;const stop=()=>stopping??=(async()=>{
  const receipt=await lifecycle.stop();console.log('Synthetic fixture drainage: '+JSON.stringify(receipt));
  if(process.connected)await new Promise(resolve=>process.send({type:'fixture-drain-terminal',receipt},()=>resolve()));
  process.exit(receipt.status==='drained'?0:1);
 })();
 process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
 // This native parent channel can request process shutdown only. No HTTP/body,
 // reset, admission recovery or serialized receipt is accepted as authority.
 if(process.connected)process.on('message',message=>{if(message==='ytv-local-fixture-stop')void stop();});
 try{
 const {connectLocalFixture}=require('../../lib/migration/local-fixture.cjs');const prepared=await lifecycle.openResource(()=>connectLocalFixture({seed:true}));await lifecycle.closeResource(prepared);lifecycle.check();
 require('../../lib/migration-payments.cjs').installFixtures(paymentFixtures());
 app=require('next')({dev:false,dir:task.cwd,hostname:task.host,port:task.port});await lifecycle.runWork(()=>app.prepare());lifecycle.check();
 const handler=app.getRequestHandler(),{protectResponse}=require('./runtime-http-policy.cjs');
 server=require('node:http').createServer(async(request,response)=>{
  protectResponse(response);
  if(request.headers.host!=='127.0.0.1:4300'||!request.url?.startsWith('/')||request.url.startsWith('//')){response.writeHead(400);response.end('Invalid local request');return;}
  delete request.headers['x-forwarded-host'];request.headers['x-forwarded-proto']='http';
  // Analytics is outside this fixture story;do not mutate inherited tracking counters.
  if(request.url.split('?')[0]==='/api/track'){response.writeHead(204);response.end();return;}
  try{lifecycle.check();await lifecycle.runWork(()=>handler(request,response));}catch(error){console.error('Local fixture request failed:',error.message);if(!response.headersSent)response.writeHead(503);response.end('Local test request unconfirmed');}
 });
 server.listen(task.port,task.host,()=>{try{lifecycle.check();console.log('Synthetic local web ready at http://127.0.0.1:4300/admin/ai-configuration');}catch{/* Stop during startup never reports readiness. */}});
 }catch(error){console.error('Local fixture startup failed:',error.message);const receipt=await lifecycle.stop();console.error('Synthetic fixture startup drainage: '+JSON.stringify(receipt));process.exitCode=1;}
}
module.exports={plan,paymentFixtures};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
