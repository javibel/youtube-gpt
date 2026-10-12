'use strict';
const assert=require('node:assert/strict'),{data}=require('./checkout-webhook-business.test.cjs'),{binding:paidBinding,event:paidEvent}=require('./invoice-webhook-business.test.cjs'),{event:failedEvent}=require('./failed-invoice-webhook.test.cjs'),{event:subEvent}=require('./subscription-webhook-business.test.cjs'),{event:trialEvent}=require('./trial-ending-webhook.test.cjs'),{event:refundEvent,invoice:refundInvoice}=require('./refund-webhook.test.cjs'),{flush}=require('./stripe-webhook-intake.test.cjs');
const cases=['invoice.payment_succeeded','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted','customer.subscription.trial_will_end','charge.refunded'];
function facts(type,d=data()){
 let e,method;
 if(type==='invoice.payment_succeeded'){e=paidEvent(d);method='admitInvoiceOriginal';}
 if(type==='invoice.payment_failed'){e=failedEvent(d);method='admitFailedInvoiceOriginal';}
 if(type==='customer.subscription.updated'){e=subEvent(d,'updated','active');method='admitSubscriptionOriginal';}
 if(type==='customer.subscription.deleted'){e=subEvent(d,'deleted','canceled');method='admitSubscriptionOriginal';}
 if(type==='customer.subscription.trial_will_end'){e=trialEvent(d);method='admitSubscriptionOriginal';}
 if(type==='charge.refunded'){e=refundEvent(d);method='admitRefundOriginal';}
 return{event:e,method};
}
function binding(db,type=cases[0],options={},check=()=>{}){
 const d=options.data||data('pro','month','eur',type.includes('trial_will_end')?'trialing':'active'),f=facts(type,d);
 return{...paidBinding(db,d,{event:f.event,invoice:async()=>refundInvoice(d),...options},check),method:f.method};
}
function fixture(options={}){
 const d=data(),owner={id:'synthetic_user',email:d.customer.email,subscription:{id:'linked_row',userId:'synthetic_user',stripeCustomerId:'cus_synthetic'}},rows=[],calls=[];
 const tx={user:{findUnique:async()=>{calls.push('owner');return options.owner||owner;}},subscription:{findMany:async()=>{calls.push('links');return options.links||[{...owner.subscription}];}},affiliateCommission:{findUnique:async()=>null},
 $queryRawUnsafe:async sql=>{calls.push('lock');return sql.includes('FROM users')?[{id:owner.id,email:owner.email}]:[{id:owner.subscription.id}];},
 checkoutWebhookDenial:{findFirst:async()=>options.checkoutDenial||null},
 billingWebhookDenial:{findFirst:async()=>options.prior||rows[0]||null,create:async q=>{calls.push('create');const row={...q.data};rows.push(row);await options.afterCreate?.(row);return options.created||row;}}};
 for(const name of ['checkoutAttempt','subscriptionCancellationAttempt','subscriptionDowngradeAttempt','subscriptionSyncAttempt'])tx[name]={findUnique:async()=>options[name]||null};
 let n=0;const db={$transaction:async(fn,settings)=>{const i=++n;assert.deepEqual({...settings},i===1?{isolationLevel:'RepeatableRead',maxWait:5000,timeout:10000}:{maxWait:5000,timeout:10000});const before=rows.length;let r;try{r=await fn(tx);}catch(e){rows.splice(before);throw e;}if(i===2){await options.afterCommit?.();if(options.ackLost)throw Error('Native denial ACK lost');}return r;}};
 return{d,db,tx,rows,calls};
}
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push(name);}catch(e){console.error('Failed billing denial case:',name);throw e;}};
 for(const type of cases)await test(type+' original records one permanent negative gate, never delivery/entitlement permission',async()=>{const f=fixture(),a=binding(f.db,type),r=await a.h.original[a.method](a.token);assert.equal(r.denialAcknowledged,true);assert.equal(r.writeAuthorized,false);assert.equal(f.rows.length,1);assert.equal(f.rows[0].eventType,type);assert.equal(f.rows[0].state,'pending');assert(!Object.keys(f.rows[0]).some(k=>/body|signature|secret|lease|expires|capability|output|amount|price|period/i.test(k)));await assert.rejects(a.h.original[a.method](a.token),e=>e.status===503);a.p.close();});
 for(const type of cases)await test(type+' HTTP remains503 after its own committed negative ACK',async()=>{const f=fixture(),a=binding(f.db,type);assert.equal((await a.h.post()).status,503);assert.equal(f.rows.length,1);assert.equal(a.h.calls.other.length,0);assert.equal(a.h.calls.upsert.length,0);assert.equal(a.h.timers.size,0);a.p.close();});
 for(const name of ['checkoutAttempt','subscriptionCancellationAttempt','subscriptionDowngradeAttempt','subscriptionSyncAttempt'])for(const state of ['pending','complete'])await test(name+'/'+state+' excludes fresh webhook without retirement, reset or replacing existing admission',async()=>{const f=fixture({[name]:{state}}),a=binding(f.db);await assert.rejects(a.h.original[a.method](a.token),e=>e.status===503);assert.equal(f.rows.length,0);a.p.close();});
 for(const option of ['prior','checkoutDenial'])await test(option+' all states deny duplicate/out-of-order delivery, never read-back success',async()=>{const f=fixture({[option]:{state:'pending'}}),a=binding(f.db);assert.equal((await a.h.post()).status,503);assert.equal(f.rows.length,0);a.p.close();});
 await test('lost native denial ACK retains committed gate and permanently retires original',async()=>{const f=fixture({ackLost:true}),a=binding(f.db),snapshot=a.h.original.snapshotWebhookOriginal(a.token);await assert.rejects(a.h.original[a.method](a.token),/ACK lost/);assert.equal(f.rows.length,1);for(const v of [a.token,snapshot,{...f.rows[0]},JSON.parse(JSON.stringify(a.token))])await assert.rejects(a.h.original[a.method](v),e=>e.status===503);});
 await test('closed after commit cannot recover ACK from row',async()=>{let a;const f=fixture({afterCommit:()=>a.p.close()});a=binding(f.db);await assert.rejects(a.h.original[a.method](a.token),e=>e.status===503);assert.equal(f.rows.length,1);});
 await test('closed inside native create rolls back negative transaction without retiring foreign owners',async()=>{let a;const f=fixture({afterCreate:()=>a.p.close()});a=binding(f.db);await assert.rejects(a.h.original[a.method](a.token),e=>e.status===503);assert.equal(f.rows.length,0);});
 await test('foreign native create result is not ACK and rolls back, never read-back',async()=>{const f=fixture({created:{state:'pending'}}),a=binding(f.db);await assert.rejects(a.h.original[a.method](a.token),e=>e.status===503);assert.equal(f.rows.length,0);a.p.close();});
 await test('read-only consumption cannot be upgraded to durable admission from the same token',async()=>{const f=fixture(),a=binding(f.db);await a.h.original.preflightInvoiceOriginal(a.token);await assert.rejects(a.h.original.admitInvoiceOriginal(a.token),e=>e.status===503);assert.equal(f.rows.length,0);a.p.close();});
 await test('all native writes denied when storage delegate is unavailable',async()=>{const f=fixture();delete f.tx.billingWebhookDenial;const a=binding(f.db);assert.equal((await a.h.post()).status,503);assert.equal(f.rows.length,0);a.p.close();});
 for(const name of ['checkout','cancellation','downgrade','sync'])for(const stage of ['billingWebhookPrior','billingWebhookAtEffect'])await test(name+'/'+stage+' retains manual admission without provider/write/complete from webhook gate',async()=>{
  const file={checkout:'checkout',cancellation:'cancellation',downgrade:'downgrade',sync:'sync'}[name],h=require('./'+file+'-server.test.cjs').harness({[stage]:true}),r=await h.original;assert.equal(r.status,503);
  if(stage==='billingWebhookAtEffect')assert.equal(h.row().state,'pending');else assert.equal(h.row(),null);
  assert(!h.calls.includes('provider'));assert(!h.calls.includes('store'));assert(!h.calls.includes('mark'));assert(!h.calls.includes('list'));assert(!h.calls.includes('session'));await h.finish();
 });
 console.log(JSON.stringify({status:'PASS',scope:'Negative billing gate only; no writer, recovery, real SDK/mail/payment/model or operational acceptance',results},null,2));return results;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});module.exports={cases,facts,binding,fixture,run};
