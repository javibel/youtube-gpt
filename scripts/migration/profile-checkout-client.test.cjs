'use strict';
const assert=require('node:assert/strict'),profile=require('./profile-client.test.cjs'),{deferred,flush,reply}=require('./chat-widget-harness.cjs');
const own=h=>({userId:h.state.user,email:h.state.email}),mutations=h=>h.requests.filter(r=>r.url==='/api/stripe/checkout');
function create(options={}) {
 const h=profile.create(options),snapshot=h.snapshot,base=h.state.send;h.state.plan='free';
 h.snapshot=r=>{const b=snapshot(r);if(h.state.plan==='pro'){b.stats={...b.stats,plan:'pro',isPro:true,limit:200,remaining:197,videoTipsRemaining:null};}return b;};
 h.checkoutAck=r=>({userId:r.owner,email:r.email,key:r.init.headers['Idempotency-Key'],plan:r.body.plan,lang:r.body.lang,mode:'simulated',url:'https://example.invalid/checkout'});
 h.state.send=r=>r.url==='/api/stripe/checkout'?reply(h.checkoutAck(r)):base(r);return h;
}
const ready=profile.ready;
const upgrade=h=>h.nodes().find(n=>n.type==='button'&&(h.text(n)==='Upgrade →'||h.text(n)==='Subir a Business'||h.text(n)==='Upgrade to Business'||h.text(n)==='...')&&n.props.onClick);
const submit=h=>{const b=upgrade(h);assert(b,'Upgrade button must exist');b.props.onClick();};
const originalButton=h=>h.button(h.state.lang==='en'?'Observe original checkout session':'Consultar sesión de pago original');
async function run() {
 const results=[],test=async(name,fn)=>{const h=create();try{await fn(h);results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.name+'; '+(e.stack?.split('\n').find(l=>l.includes('profile-checkout-client.test.cjs'))?.trim()??'directed contract failed')});}finally{h.unmount();}};
 for(const lang of ['es','en'])for(const paid of [false,true])await test(lang+' '+(paid?'Business':'Pro')+' exact original200 navigates synthetic session once and retains denial, not payment acceptance',async h=>{
  h.state.lang=lang;h.state.plan=paid?'pro':'free';await ready(h);const cb=upgrade(h).props.onClick;cb();cb();await ready(h);
  assert.equal(mutations(h).length,1);const r=mutations(h)[0];assert.deepEqual(r.body,{plan:paid?'business_monthly':'monthly',lang});assert.equal(r.init.cache,'no-store');assert.equal(r.init.signal,undefined);assert.match(r.init.headers['Idempotency-Key'],/^[\w-]{1,128}$/);
  assert.equal(h.state.navigationWrites.length,1);assert.equal(h.state.href,'https://example.invalid/checkout');assert.match(h.text(),lang==='en'?/does not confirm payment/:/No acredita un pago/);
  const c=h.load('lib/profile-checkout-client.ts'),a=c.retainedCheckout(own(h)),o=c.trustedCheckoutOutcome(a);
  assert(Object.isFrozen(a));assert(Object.isFrozen(a.owner));assert(Object.isFrozen(o.receipt));assert.equal(Object.keys(a).sort().join(','),'key,lang,owner,plan');assert.equal(Object.keys(o.receipt).length,7);assert(c.checkoutBlocked(own(h)));assert.deepEqual([...h.storage.values()],['pending']);
  cb();await ready(h);assert.equal(mutations(h).length,1);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.navigationWrites.length,2);assert.equal(mutations(h).length,1);
 });
 for(const held of ['headers','JSON'])await test(held+'60s releases UI wait, late original cannot navigate until explicit observation',async h=>{
  const g=deferred(),base=h.state.send;let reads=0;h.state.send=r=>r.url==='/api/stripe/checkout'?held==='headers'?g.promise.then(()=>reply(h.checkoutAck(r))):Promise.resolve({ok:true,status:200,json:()=>{reads++;return g.promise.then(()=>h.checkoutAck(r));}}):base(r);
  await ready(h);const cb=upgrade(h).props.onClick;cb();await ready(h);assert(!h.state.href);h.advance(60000);await ready(h);assert.match(h.text(),/sin confirmar/);assert(upgrade(h).props.disabled);cb();await ready(h);assert.equal(mutations(h).length,1);
  g.resolve();await ready(h);assert(!h.state.href);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.href,'https://example.invalid/checkout');assert.equal(mutations(h).length,1);if(held==='JSON')assert.equal(reads,1);
 });
 await test('headers and JSON share one monotonic60s budget including delayed timer delivery',async h=>{
  const headers=deferred(),json=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?headers.promise.then(()=>({ok:true,status:200,json:()=>json.promise.then(()=>h.checkoutAck(r))})):base(r);
  await ready(h);submit(h);await ready(h);h.advance(45000);headers.resolve();await ready(h);h.advance(16000,false);json.resolve();await ready(h);assert(!h.state.href);assert.match(h.text(),/sin confirmar/);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.navigationWrites.length,1);
 });
 await test('second original observation is bounded and coalesces its waiter, never a new POST',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?g.promise.then(()=>reply(h.checkoutAck(r))):base(r);
  await ready(h);submit(h);await ready(h);h.advance(60000);await ready(h);const cb=originalButton(h).props.onClick;cb();cb();await ready(h);assert.equal(h.timers.size,1);h.advance(60000);await ready(h);assert.match(h.text(),/sin confirmar/);assert.equal(mutations(h).length,1);g.resolve();await ready(h);assert(!h.state.href);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.navigationWrites.length,1);
 });
 for(const field of ['userId','email','key','plan','lang','mode','url'])await test('foreign '+field+' receipt cannot navigate or release denial',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?reply({...h.checkoutAck(r),[field]:field==='plan'?'yearly':field==='lang'?'en':field==='url'?'https://checkout.stripe.com/private':'foreign',privateDiagnostic:'PRIVATE_DO_NOT_DISPLAY'}):base(r);
  await ready(h);submit(h);await ready(h);assert(!h.state.href);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE'));originalButton(h).props.onClick();await ready(h);assert(!h.state.href);assert.equal(mutations(h).length,1);assert(upgrade(h).props.disabled);
 });
 for(const url of ['http://example.invalid/checkout','https://example.invalid:444/checkout','https://u:p@example.invalid/checkout','https://example.invalid.evil/checkout','https://example.invalid/other','https://example.invalid/checkout#private',' https://example.invalid/checkout','javascript:alert(1)','//example.invalid/checkout','https://EXAMPLE.invalid/checkout'])await test('synthetic redirect rejects '+url,async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?reply({...h.checkoutAck(r),url}):base(r);await ready(h);submit(h);await ready(h);assert(!h.state.href);assert.match(h.text(),/sin confirmar/);assert.equal(mutations(h).length,1);
 });
 for(const status of [201,202,400,401,403,404,409,500,503])await test('success-shaped HTTP'+status+' never navigates or creates a second session',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?reply(h.checkoutAck(r),status):base(r);await ready(h);submit(h);await ready(h);assert(!h.state.href);submit(h);await ready(h);assert.equal(mutations(h).length,1);
 });
 for(const failure of ['network','JSON'])await test(failure+' rejection retains uncertainty and private diagnostics never reach UI',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?failure==='network'?Promise.reject(Error('PRIVATE_TOKEN')):{ok:true,status:200,json:async()=>{throw Error('PRIVATE_TOKEN');}}:base(r);
  await ready(h);submit(h);await ready(h);assert.match(h.text(),/sin confirmar/);assert(!h.state.href);assert(!h.text().includes('PRIVATE'));assert(upgrade(h).props.disabled);
 });
 for(const change of ['account','email','auth','language'])await test(change+' synchronously retires old callbacks and cycling never revives them',async h=>{
  await ready(h);const cb=upgrade(h).props.onClick,previous={...h.state};if(change==='account')h.state.user='other';else if(change==='email')h.state.email='other@example.invalid';else if(change==='auth')h.state.auth='unauthenticated';else h.state.lang='en';h.view(true);cb();await ready(h);assert.equal(mutations(h).length,0);
  Object.assign(h.state,previous);h.view(true);cb();await ready(h);assert.equal(mutations(h).length,0);
 });
 for(const change of ['account','email','auth'])for(const held of ['headers','JSON'])await test(change+' after '+held+' retires original body and navigation authority',async h=>{
  const g=deferred(),base=h.state.send;let reads=0;h.state.send=r=>r.url==='/api/stripe/checkout'?held==='headers'?g.promise.then(()=>({ok:true,status:200,json:async()=>{reads++;return h.checkoutAck(r);}})):{ok:true,status:200,json:()=>{reads++;return g.promise.then(()=>h.checkoutAck(r));}}:base(r);
  await ready(h);submit(h);await ready(h);if(change==='account')h.state.user='other';else if(change==='email')h.state.email='other@example.invalid';else h.state.auth='unauthenticated';h.view(true);g.resolve();await ready(h);assert(!h.state.href);assert.equal(reads,held==='headers'?0:1);
 });
 await test('language change after JSON prevents automatic navigation; explicit observation cannot redirect a different selection',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?{ok:true,status:200,json:()=>g.promise.then(()=>h.checkoutAck(r))}:base(r);
  await ready(h);submit(h);await ready(h);h.state.lang='en';h.view(true);g.resolve();await ready(h);assert(!h.state.href);originalButton(h).props.onClick();await ready(h);assert(!h.state.href);assert.match(h.text(),/another plan or language/);
  const old=originalButton(h).props.onClick;h.state.lang='es';h.view(true);old();await ready(h);assert(!h.state.href);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.navigationWrites.length,1);assert.equal(mutations(h).length,1);
 });
 await test('plan refresh after dispatch retires old navigation and preserves current Pro UI',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?g.promise.then(()=>reply(h.checkoutAck(r))):base(r);
  await ready(h);submit(h);await ready(h);h.state.plan='pro';h.click('Actualizar perfil');await ready(h);g.resolve();await ready(h);assert(!h.state.href);assert(h.text().includes('Subir a Business'));originalButton(h).props.onClick();await ready(h);assert(!h.state.href);assert.match(h.text(),/otro plan o idioma/);assert.equal(mutations(h).length,1);
 });
 await test('Strict/remount does not repost or auto-navigate; explicit same live original can be observed',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?g.promise.then(()=>reply(h.checkoutAck(r))):base(r);
  await ready(h);submit(h);await ready(h);h.strictEffects();h.unmount();await ready(h);g.resolve();await ready(h);assert(!h.state.href);originalButton(h).props.onClick();await ready(h);assert.equal(h.state.navigationWrites.length,1);assert.equal(mutations(h).length,1);
 });
 await test('lost module sees denial only; storage and copied receipt cannot restore producer or navigate',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?g.promise.then(()=>reply(h.checkoutAck(r))):base(r);
  await ready(h);submit(h);await ready(h);const lost=create({storage:h.storage});try{await ready(lost);submit(lost);await ready(lost);assert.equal(mutations(lost).length,0);assert(!lost.state.href);assert.equal(lost.load('lib/profile-checkout-client.ts').retainedCheckout(own(lost)),undefined);}finally{lost.unmount();g.resolve();await ready(h);}
 });
 for(const failure of ['get','set'])await test('storage '+failure+' denial cannot authorize dispatch or recovery',async h=>{
  await ready(h);h.state.storageFailure=failure;h.view();submit(h);await ready(h);assert.equal(mutations(h).length,0);assert(upgrade(h).props.disabled);assert(!h.state.href);
 });
 await test('navigation exception preserves confirmed same original without another POST or acceptance of payment',async h=>{
  h.state.navigationFailure=true;await ready(h);submit(h);await ready(h);assert(!h.state.href);assert.match(h.text(),/No se pudo abrir/);h.state.navigationFailure=false;originalButton(h).props.onClick();await ready(h);assert.equal(mutations(h).length,1);assert.equal(h.state.navigationWrites.length,1);
 });
 await test('frozen minimal handles and copied/forged receipts cannot grant original observation',async h=>{
  await ready(h);submit(h);await ready(h);const c=h.load('lib/profile-checkout-client.ts'),a=c.retainedCheckout(own(h));assert.throws(()=>Object.defineProperty(a,'key',{value:'forged'}));const fake={...a,original:Promise.resolve({status:'confirmed',receipt:{url:'https://example.invalid/checkout'}})};assert.equal(c.trustedCheckoutOutcome(fake),undefined);assert.equal((await c.observeCheckoutOriginal(fake)).status,'unconfirmed');assert.equal(mutations(h).length,1);
 });
 for(const plan of ['monthly','yearly','business_monthly','business_yearly'])await test('library captures '+plan+' exactly and strips private receipt fields',async h=>{
  await ready(h);const c=h.load('lib/profile-checkout-client.ts'),base=h.state.send;h.state.send=r=>r.url==='/api/stripe/checkout'?reply({...h.checkoutAck(r),private:'PRIVATE',extraURL:'https://checkout.stripe.com/'}):base(r);const a=c.beginCheckout(own(h),plan,'en',()=>true);await ready(h);const result=await a.waiter;assert.equal(result.status,'confirmed');assert.equal(result.receipt.plan,plan);assert.equal(result.receipt.lang,'en');assert.equal(Object.keys(result.receipt).length,7);assert(!JSON.stringify(a).includes('PRIVATE'));assert(!h.state.href);
 });
 for(const mode of ['plan','language','owner','withdrawn'])await test('invalid '+mode+' blocks before storage/key/POST',async h=>{
  await ready(h);const c=h.load('lib/profile-checkout-client.ts');assert.equal(c.beginCheckout(mode==='owner'?{userId:'../bad',email:h.state.email}:own(h),mode==='plan'?'unexpected':'monthly',mode==='language'?'unexpected':'es',()=>mode!=='withdrawn'),null);assert.equal(mutations(h).length,0);assert.equal(h.storage.size,0);
 });
 return{suite:'profile-checkout-client',status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',results};
}
if(require.main===module)run().then(report=>{console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;});
module.exports={run,create,ready,submit,upgrade,mutations,originalButton,own};
