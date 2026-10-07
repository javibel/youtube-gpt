'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Module=require('node:module'),ts=require('typescript');
const {validate}=require('./isolation.cjs');
const runtime=require('./payment-fixtures.cjs');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo);
const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const context={root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent']};
validate(config,{...context,environment:process.env});
function compile(relative){
 const file=path.join(repo,relative),entry=new Module(file,module);
 entry.filename=file;entry.paths=Module._nodeModulePaths(path.dirname(file));
 entry._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
 return entry.exports;
}
const pricing=compile('lib/pricing.ts');
const user={id:'synthetic',email:'synthetic@example.invalid',name:'Synthetic',subscription:null};
const subscriptionWrites=[];
const mocks={'@/auth':{auth:async()=>({user:{email:user.email}})},
 '@/lib/prisma':{prisma:{user:{findUnique:async()=>user},subscription:{update:async args=>{subscriptionWrites.push(args);return args.data;}}}},
 '@/lib/stripe':{stripe:runtime.stripe},
 '@/lib/pricing':pricing,
 '@/lib/plans':{isPaidStatus:status=>['active','trialing'].includes(status)},
 'next/server':{NextResponse:Response}};
const originalLoad=Module._load,originalFetch=global.fetch,oldPrice=process.env.STRIPE_PRO_PRICE_ID;
let externalAttempts=0;
Module._load=function(name,...args){
 if(Object.hasOwn(mocks,name))return mocks[name];
 if(['stripe','http','https','net','tls','child_process','node:http','node:https','node:net','node:tls','node:child_process'].includes(name)){
  externalAttempts++;throw Error('External dependency forbidden');
 }
 return originalLoad.call(this,name,...args);
};
global.fetch=()=>{externalAttempts++;throw Error('Network forbidden');};
(async()=>{try{
 const {POST}=compile('app/api/stripe/checkout/route.ts');
 runtime.configureOffline({config,context,paymentFixtures:[
  {operation:'customers.create',args:[{email:user.email,name:user.name,metadata:{userId:user.id}}],result:{id:'cus_synthetic'}},
  {operation:'checkout.sessions.create',args:[{
   customer:'cus_synthetic',payment_method_types:['card'],line_items:[{price:'price_synthetic_monthly',quantity:1}],
   mode:'subscription',currency:'eur',allow_promotion_codes:true,locale:'es',
   success_url:'https://ytubviral.com/stripe/success',cancel_url:'https://ytubviral.com/dashboard',
   metadata:{userId:user.id},subscription_data:{description:'YTubViral.com — Plan Pro (200 generaciones/mes)',
    metadata:{userId:user.id,service:'YTubViral.com',plan:'pro'},trial_period_days:7},
   custom_text:{submit:{message:'7 días gratis, luego 9,99€/mes. Cancela antes del día 7 sin coste.'}}
  }],result:{url:'https://example.invalid/checkout'}},
  {operation:'subscriptions.list',args:[{customer:'cus_synthetic',status:'all',limit:10}],result:{data:[{id:'sub_synthetic',status:'active',cancel_at_period_end:false}]}},
  {operation:'subscriptions.update',args:['sub_synthetic',{cancel_at_period_end:true}],result:{id:'sub_synthetic',cancel_at_period_end:true}}
 ]});
 process.env.STRIPE_PRO_PRICE_ID='price_synthetic_monthly';
 const response=await POST(new Request('https://example.invalid/api/stripe/checkout',{
  method:'POST',headers:{'content-type':'application/json','x-vercel-ip-country':'ES'},
  body:JSON.stringify({plan:'monthly',lang:'es'})}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{userId:user.id,email:user.email,mode:'simulated',url:'https://example.invalid/checkout'});
 user.subscription={stripeCustomerId:'cus_synthetic'};
 const {POST:cancel}=compile('app/api/stripe/cancel/route.ts');
 const cancelled=await cancel();
 assert.equal(cancelled.status,200);assert.deepEqual(await cancelled.json(),{ok:true,userId:user.id,email:user.email,cancelAtPeriodEnd:true});
 assert.deepEqual(subscriptionWrites,[{where:{userId:user.id},data:{cancelAtPeriodEnd:true}}]);
 delete process.env.STRIPE_PRO_PRICE_ID;
 runtime.configureOffline({config,context,paymentFixtures:[
  {operation:'subscriptions.list',args:[{customer:'cus_synthetic',status:'all',limit:10}],result:{data:[{id:'sub_synthetic',status:'active',cancel_at_period_end:true}]}}
 ]});
 user.subscription={stripeCustomerId:'cus_synthetic',cancelAtPeriodEnd:false};
 const reconciled=await cancel();
 assert.equal(reconciled.status,200);assert.deepEqual(await reconciled.json(),{ok:true,userId:user.id,email:user.email,cancelAtPeriodEnd:true});
 assert.equal(subscriptionWrites.length,2);
 user.subscription={stripeCustomerId:'cus_unconfigured'};
 const unconfigured=await cancel();
 assert.equal(unconfigured.status,500);
 assert.equal(subscriptionWrites.length,2);
 assert.equal(externalAttempts,0);
 console.log('PASS: actual checkout and cancellation routes compose with exact synthetic payment fixtures; no external effect');
}finally{
 runtime.reset();Module._load=originalLoad;global.fetch=originalFetch;
 if(oldPrice===undefined)delete process.env.STRIPE_PRO_PRICE_ID;else process.env.STRIPE_PRO_PRICE_ID=oldPrice;
}})().catch(error=>{console.error(error);process.exitCode=1;});
