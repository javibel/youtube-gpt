'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const copy=v=>JSON.parse(JSON.stringify(v));
function harness(options={}){
 let now=1000,serial=0,txs=0,row=options.prior?{id:'retained',state:options.prior}:null;
 const calls=[],running=[],gates={},entered={},timers=new Map(),queries=[],controller=new AbortController();
 const state={owner:options.anonymous?null:{id:'own',email:'own@example.invalid'},body:{plan:'monthly',lang:'es'},key:'key',user:{id:'own',email:'own@example.invalid',name:'Synthetic',subscription:null},country:'ES'};
 Object.assign(state,options.state??{});
 const step=async(name,work)=>{calls.push(name);(entered[name]??=deferred()).resolve();const p=(async()=>{if(options.fail===name)throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');if([options.held].flat().includes(name))await(gates[name]??=deferred()).promise;return work();})();running.push(p);void p.catch(()=>{});return p;};
 const db={user:{findUnique:q=>{queries.push(q);return step('read',()=>state.user&&copy(state.user));}},$transaction:(fn,settings)=>{
  const i=++txs;assert.deepEqual(copy(settings),{maxWait:10000,timeout:i===1?15000:55000});let locks=0;
  const attempt={findUnique:q=>step(i===1?'prior':'attempt',()=>options.foreignAttempt&&i===2?{...row,key:'foreign'}:row),
   create:q=>{queries.push(q);return step('admit',()=>row={...q.data});},updateMany:q=>{queries.push(q);return step('mark',()=>{if(!options.noMark)row.state='complete';return{count:options.noMark?0:1};});}};
  const tx={subscriptionSyncAttempt:{findUnique:()=>step('sync',()=>options.syncPrior?{state:options.syncPrior}:null)},subscriptionCancellationAttempt:{findUnique:()=>step('cancellation',()=>options.cancellationPrior?{state:options.cancellationPrior}:null)},subscriptionDowngradeAttempt:{findUnique:async()=>null},$queryRawUnsafe:(sql,...args)=>{queries.push({sql,args});return step('lock'+i+'-'+(++locks),()=>state.user?[copy(state.user)]:[]);},
   user:{findUnique:q=>step('selection'+i,()=>state.user&&copy(state.user))},checkoutAttempt:attempt};
  const p=(async()=>{const prior=row&&{...row};let r;try{r=await fn(tx);}catch(e){row=prior;throw e;}return step('ack'+i,()=>options.foreignAdmission&&i===1?{...r,priceId:'price_foreign'}:r);})();running.push(p);void p.catch(()=>{});return p;
 }};
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),process:{env:options.noPrice?{}:{STRIPE_PRO_PRICE_ID:'price_synthetic_monthly',STRIPE_PRO_YEARLY_PRICE_ID:'price_synthetic_yearly',STRIPE_BUSINESS_PRICE_ID:'price_synthetic_business_monthly',STRIPE_BUSINESS_YEARLY_PRICE_ID:'price_synthetic_business_yearly'}}};
 const stripe={customers:{create:args=>{queries.push({customer:args});return step('customer',()=>options.badCustomer?{id:'foreign'}:{id:'cus_synthetic'});}},checkout:{sessions:{create:args=>{queries.push({checkout:args});return step('session',()=>({url:options.url??'https://example.invalid/checkout'}));}}}};
 const deps={'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/stripe':{stripe},'@/lib/pricing':load('lib/pricing.ts')};
 const helper=load('lib/checkout-session.ts',deps,globals),route=load('app/api/stripe/checkout/route.ts',{'@/auth':{auth:()=>step('auth',()=>state.owner?{user:state.owner}:null)},'next/server':{NextResponse:Response},'node:crypto':require('node:crypto'),'@/lib/checkout-session':helper,'@/lib/pricing':deps['@/lib/pricing']},globals);
 if(options.preAborted)controller.abort();
 const original=route.POST({signal:controller.signal,headers:{get:k=>k==='Idempotency-Key'?state.key:state.country},json:()=>step('body',()=>state.body)});running.push(original);
 return{state,calls,queries,timers,controller,original,row:()=>row,
  advance(ms=55000,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  async reach(name){for(let i=0;i<100&&!entered[name];i++)await flush();assert(entered[name],'Missing '+name);},
  async release(name){gates[name]?.resolve();await flush();},
  async finish(){Object.values(gates).forEach(g=>g.resolve());let n=0;while(n<running.length){const batch=running.slice(n);n=running.length;await Promise.allSettled(batch);await flush();}}
 };
}
async function observe(h,status){const r=await h.original;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(h.timers.size,0);const b=await r.json();assert(!JSON.stringify(b).includes('PRIVATE'));if(status===503)assert.deepEqual(b,{error:'checkout_unconfirmed'});return b;}
async function run(){const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 for(const plan of ['monthly','yearly','business_monthly','business_yearly'])for(const lang of ['es','en'])for(const country of ['ES','US'])await test(plan+'/'+lang+'/'+country+' exact original metadata/no payment claim',async()=>{
  const h=harness({state:{body:{plan,lang},country}}),b=await observe(h,200);assert.deepEqual(b,{userId:'own',email:'own@example.invalid',key:'key',plan,lang,mode:'simulated',url:'https://example.invalid/checkout'});assert.equal(h.row().state,'complete');assert.equal(h.row().currency,country==='US'?'usd':'eur');assert.equal(h.row().priceId,'price_synthetic_'+plan);assert(!Object.keys(h.row()).some(k=>/url|customer|secret|token|payload/.test(k)));assert(!JSON.stringify(b).includes(h.row().id));assert.equal(h.calls.filter(x=>x==='session').length,1);
 });
 const stages=['auth','body','read','lock1-1','lock1-2','selection1','prior','admit','ack1','lock2-1','lock2-2','selection2','attempt','customer','session','mark','ack2'];
 for(const held of stages)for(const action of ['timeout','abort'])await test(held+'/'+action+' original once; no late producer or recovered acknowledgement',async()=>{
  const h=harness({held});await h.reach(held);if(action==='abort')h.controller.abort();else h.advance();await observe(h,503);await h.finish();assert.equal(h.calls.filter(x=>x===held).length,1);if(stages.indexOf(held)<stages.indexOf('session'))assert(!h.calls.includes('session'));if(!['mark','ack2'].includes(held))assert(h.row()?.state!=='complete');
 });
 for(const held of ['auth','body','read','ack1','attempt','customer','session'])await test(held+' monotonic55s guard without timer delivery',async()=>{
  const h=harness({held});await h.reach(held);h.advance(55000,false);await h.release(held);await observe(h,503);await h.finish();assert(h.row()?.state!=='complete');
 });
 await test('auth/body/customer share budget; no per-stage renewal',async()=>{
  const h=harness({held:['auth','body','customer']});await h.reach('auth');h.advance(20000);await h.release('auth');await h.reach('body');h.advance(20000);await h.release('body');await h.reach('customer');h.advance(15000);await observe(h,503);await h.finish();assert(!h.calls.includes('session'));
 });
 for(const prior of ['pending','complete'])await test(prior+' row only denies; no recovery or fresh session',async()=>{const h=harness({prior});await observe(h,503);assert(!h.calls.includes('customer'));assert(!h.calls.includes('session'));assert.equal(h.row().state,prior);});
 for(const options of [{foreignAdmission:true},{foreignAttempt:true},{noMark:true},{badCustomer:true}])await test('closed admission/provider/marker '+Object.keys(options)[0],async()=>{const h=harness(options);await observe(h,503);await h.finish();assert(h.row()?.state!=='complete');});
 for(const url of ['https://checkout.stripe.com/x','http://example.invalid/checkout','https://example.invalid:443/checkout','https://evil.example/checkout','https://u@example.invalid/checkout','https://example.invalid/other','https://example.invalid/checkout#x','https://example.invalid/checkout ','//example.invalid/checkout'])await test('provider URL rejects '+url,async()=>{const h=harness({url});await observe(h,503);assert.equal(h.row().state,'pending');});
 for(const fail of stages)await test(fail+' private failure; no replay',async()=>{const h=harness({fail});await observe(h,fail==='body'?400:503);await h.finish();assert.equal(h.calls.filter(x=>x===fail).length,1);});
 for(const body of [null,[],{}, {plan:'bad',lang:'es'},{plan:'monthly',lang:'bad'},{plan:'monthly',lang:'es',currency:'usd'},{plan:'monthly'},{lang:'es'}])await test('closed body '+JSON.stringify(body),async()=>{const h=harness({state:{body}});await observe(h,400);assert(!h.calls.includes('read'));});
 for(const state of [{key:'bad key'},{owner:{email:'own@example.invalid'}},{owner:{id:'own',email:'foreign@example.invalid'}},{user:null}])await test('invalid identity/key '+JSON.stringify(state),async()=>{const h=harness({state});await observe(h,Object.hasOwn(state,'key')?400:401);assert(!h.calls.includes('customer'));});
 await test('keyless legacy shape still uses fresh immutable durable admission',async()=>{const h=harness({state:{key:null}});assert.deepEqual(await observe(h,200),{userId:'own',email:'own@example.invalid',mode:'simulated',url:'https://example.invalid/checkout'});assert(h.row().key&&h.row().key!=='null');});
 await test('missing price is500 before admission/effect',async()=>{const h=harness({noPrice:true});await observe(h,500);assert.equal(h.row(),null);assert(!h.calls.includes('read'));});
 await test('captured owner/input/currency/price survive mutation while original SQL is held',async()=>{const h=harness({held:'read'});await h.reach('read');h.state.owner.email='foreign@example.invalid';h.state.body.plan='yearly';h.state.body.lang='en';h.state.country='US';await h.release('read');const b=await observe(h,200);assert.equal(b.email,'own@example.invalid');assert.equal(b.plan,'monthly');assert.equal(b.lang,'es');assert.equal(h.row().currency,'eur');});
 for(const field of ['email','name','subscription'])await test(field+' changes after original admission deny provider',async()=>{const h=harness({held:'ack1'});await h.reach('ack1');h.state.user[field]=field==='subscription'?{id:'new',stripeCustomerId:'cus_new',stripePriceId:'price_new'}:'changed';await h.release('ack1');await observe(h,503);assert.equal(h.row().state,'pending');assert(!h.calls.includes('customer'));});
 for(const syncPrior of ['pending','complete'])await test('sync '+syncPrior+' excludes a fresh original without retiring or recovering sync',async()=>{const h=harness({syncPrior});await observe(h,503);assert.equal(h.row(),null);assert(!h.calls.includes('customer'));});
 for(const cancellationPrior of ['pending','complete'])await test('cancellation '+cancellationPrior+' denies checkout overlap',async()=>{const h=harness({cancellationPrior});await observe(h,503);assert.equal(h.row(),null);assert(!h.calls.includes('customer'));});
 return results;
}
module.exports={run,harness};if(require.main===module)run().then(results=>{console.log(JSON.stringify({scope:'Actual checkout server/55s/closed payload/durable denial, unit transport only',results},null,2));if(results.some(x=>x.status!=='PASS'))process.exitCode=1;});
