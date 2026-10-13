'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),fixtures=require('./direct-email-fixture.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const packet={to:'synthetic@example.invalid',subject:'Synthetic',html:'<p>HTML</p>',text:'Original plaintext\nhttps://example.invalid'};
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 for(const kind of ['password','invitation'])await test(kind+' shares fixed hello headers and exact plaintext/negative idempotency routing',async()=>{
  const calls=[],m=fixtures[kind]({send:async(p,s,init,url)=>{calls.push({p,s,init,url});return Response.json({id:'native-ack'});}});let checks=0,issued=0;
  await (kind==='password'?m.sendPasswordChangeNotice(packet,'synthetic-original',()=>checks++,()=>issued++):m.sendInvitationEmail(packet,'synthetic-original'));
  assert.equal(calls.length,1);const {p,s,init}=calls[0];assert.equal(p.from,'YTubViral <hello@ytubviral.com>');assert.equal(p.reply_to,'hello@ytubviral.com');assert.equal(p.text,packet.text);assert.equal(p.headers,undefined);assert.equal(s.idempotencyKey,'synthetic-original');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');if(kind==='password'){assert.equal(checks,2);assert.equal(issued,1);}
 });
 for(const key of ['',undefined,null,{},'bad key','bad\r\nheader','x'.repeat(129)])await test('invalid provider routing key cannot dispatch '+String(JSON.stringify(key)).slice(0,40),async()=>{
  let calls=0,issued=0;const m=fixtures.password({send:async()=>{calls++;return Response.json({id:'id'});}});
  await assert.rejects(m.sendPasswordChangeNotice(packet,key,()=>{},()=>issued++),e=>e.outcome==='not-issued');assert.equal(calls,0);assert.equal(issued,0);
 });
 for(const text of [null,{},'', 'x'.repeat(1048577)])await test('invalid plaintext '+typeof text+' never issues or coerces',async()=>{
  let calls=0;const d=fixtures.domain({send:async()=>{calls++;return Response.json({id:'id'});}});assert.equal(d.prepareDomainEmailOriginal({...packet,text}),undefined);assert.equal(calls,0);
 });
 await test('missing configuration checks caller once without marking HTTP dispatch',async()=>{
  let checks=0,issued=0;const m=fixtures.password({noProvider:true});await assert.rejects(m.sendPasswordChangeNotice(packet,'id',()=>checks++,()=>issued++),e=>e.outcome==='not-configured');assert.equal(checks,1);assert.equal(issued,0);
 });
 for(const stage of ['first','boundary','dispatch-marker'])await test('retired '+stage+' callback has genuine nonissuance and never retries',async()=>{
  let calls=0,checks=0,marks=0;const m=fixtures.password({send:async()=>{calls++;return Response.json({id:'id'});}});
  await assert.rejects(m.sendPasswordChangeNotice(packet,'id',()=>{if(++checks===(stage==='first'?1:2)&&stage!=='dispatch-marker')throw Error('Private retired');},()=>{marks++;if(stage==='dispatch-marker')throw Error('Private retired');}));
  assert.equal(calls,0);assert.equal(marks,stage==='dispatch-marker'?1:0);
 });
 await test('guard is rechecked after deferred dispatch and before HTTP in same continuation',async()=>{
  let retired=false,calls=0,marks=0;const m=fixtures.password({send:async()=>{calls++;return Response.json({id:'id'});}});
  const original=m.sendPasswordChangeNotice(packet,'id',()=>{if(retired)throw Error('retired');},()=>marks++);retired=true;
  await assert.rejects(original,e=>e.outcome==='not-issued');assert.equal(calls,0);assert.equal(marks,0);
 });
 await test('invitation caller live guard rejects retirement in the native dispatch boundary',async()=>{
  let retired=false,calls=0;const m=fixtures.invitation({send:async()=>{calls++;return Response.json({id:'id'});}});
  const p=m.sendInvitationEmail(packet,'id',()=>{if(retired)throw Error('retired');});retired=true;await assert.rejects(p,e=>e.outcome==='not-issued');assert.equal(calls,0);
 });
 await test('one private guard/native promise survives duplicates and rejects cloned metadata',async()=>{
  let calls=0,guards=0;const g=deferred(),d=fixtures.domain({send:()=>{calls++;return g.promise;}}),input={...packet,idempotencyKey:'id'},own=d.prepareDomainEmailOriginal(input,()=>guards++);
  input.text='mutated';input.idempotencyKey='foreign';const a=d.dispatchDomainEmailOriginal(own),b=d.dispatchDomainEmailOriginal(own);assert.equal(a,b);
  assert.equal(await d.dispatchDomainEmailOriginal({...own,idempotencyKey:'id'}),'not-issued');await flush();assert.equal(calls,1);assert.equal(guards,1);
  g.resolve(Response.json({id:'native-ack'}));assert.equal(await a,'provider-accepted');assert.equal(d.dispatchDomainEmailOriginal(own),a);assert.equal(guards,1);
 });
 for(const kind of ['password','invitation'])for(const shape of ['503-id','mixed','lost'])await test(kind+' native '+shape+' retains uncertainty without fallback/second HTTP',async()=>{
  let calls=0;const m=fixtures[kind]({send:async()=>{calls++;if(shape==='lost')throw Error('Private transport');return Response.json(shape==='mixed'?{id:'id',error:null}:{id:'id'},{status:shape==='503-id'?503:200});}});
  await assert.rejects(kind==='password'?m.sendPasswordChangeNotice(packet,'id',()=>{},()=>{}):m.sendInvitationEmail(packet,'id'),e=>e.outcome==='unconfirmed'&&!e.message.includes('Private'));assert.equal(calls,1);
 });
 for(const kind of ['password','invitation'])await test(kind+' owns its pending native reader through late result',async()=>{
  const g=deferred();let calls=0,settled=false;const m=fixtures[kind]({send:()=>{calls++;return g.promise;}}),p=kind==='password'?m.sendPasswordChangeNotice(packet,'id',()=>{},()=>{}):m.sendInvitationEmail(packet,'id');p.then(()=>settled=true);await flush();assert.equal(calls,1);assert.equal(settled,false);g.resolve(Response.json({id:'late-ack'}));await p;assert.equal(calls,1);
 });
 await test('invitation original expiry and token remain unchanged in actual native packet',async()=>{
  let sent;const m=fixtures.invitation({send:async(p)=>{sent=p;return Response.json({id:'id'});}}),input={email:packet.to,teamName:'Synthetic <team>',inviter:'Synthetic',language:'en',token:'a'.repeat(64),expiresAt:'2026-10-18T00:00:00.000Z'};
  const p=m.prepareInvitationEmail(input,'https://example.invalid');await m.sendInvitationEmail(p,'id');assert.equal(sent.text,p.text);assert.ok(sent.text.includes(input.expiresAt));assert.ok(sent.html.includes(input.expiresAt));assert.ok(sent.text.includes(input.token));assert.equal(input.expiresAt,'2026-10-18T00:00:00.000Z');
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual direct adapters and shared private native boundary. Closed synthetic HTTP; routing key never reconstructs business authority, no real delivery/consent/expiry renewal.',results};
}
module.exports={run};
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
