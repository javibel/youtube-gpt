'use strict';
const assert=require('node:assert/strict');
const {harness,success,writeSuccess}=require('./calendar-client-retry.test.cjs');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const draft=async(h,title='Original addition')=>{h.render();await flush();h.open();h.field('title',title);};
const ack=writeSuccess;
const retry=h=>h.button('retryCalendarCreation');
const results=[];const test=async(name,run)=>{await run();results.push({name,status:'PASS'});};
(async()=>{
 await test('lost create acknowledgement retains one exact key/body and explicit retry queries only the original',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>{throw Error('Lost ack');};await h.button('saveEntry')();
  const original=h.writeRequests[0];assert.match(original.headers['Idempotency-Key'],/^[-A-Za-z0-9._:]{1,128}$/);assert.equal(original.headers['X-Calendar-Write-Recovery'],undefined);
  assert.ok(retry(h));h.field('title','Changed draft');h.state.write=ack(h);await retry(h)();
  assert.equal(h.writeRequests[1].headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(h.writeRequests[1].body,original.body);assert.equal(h.writeRequests[1].headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.equal(retry(h),undefined);assert.equal(h.button('saveEntry'),undefined);assert.equal(h.listRequests.length,2);
 });

 for(const failure of ['http','json','fields'])await test(failure+' retains original and never falls back after absent/conflicting lookup',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>failure==='http'?{ok:false,status:503}:failure==='json'?{ok:true,json:async()=>{throw Error('Malformed');}}:{ok:true,json:async()=>({entry:{}})};
  await h.button('saveEntry')();const first=h.writeRequests[0];for(const status of [503,409,403]){h.state.write=async()=>({ok:false,status});await retry(h)();assert.ok(retry(h));}
  assert.equal(new Set(h.writeRequests.map(r=>r.headers['Idempotency-Key'])).size,1);assert(h.writeRequests.every(r=>r.body===first.body));assert.equal(h.writeRequests.length,4);assert.equal(h.listRequests.length,1);
 });
 await test('same-tab reload offers explicit original lookup with no POST or UUID until clicked',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();h.unmount();const second=harness(h.storage);second.render();await flush();assert.equal(second.writeRequests.length,0);assert.ok(retry(second));
  second.state.write=ack(second);await retry(second)();assert.equal(second.writeRequests[0].headers['Idempotency-Key'],h.writeRequests[0].headers['Idempotency-Key']);assert.equal(second.writeRequests[0].body,h.writeRequests[0].body);assert.equal(second.writeRequests[0].headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.equal(second.storage.size,0);
 });
 for(const [name,change]of [['account',h=>h.state.user='other'],['email',h=>h.state.email='other@example.invalid'],['lang',h=>h.state.lang='en'],['logout',h=>h.state.auth='unauthenticated']])await test(name+' cannot query an original from a captured button or adopt its selector',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const old=retry(h);change(h);h.render();await flush();await old();assert.equal(h.writeRequests.length,1);assert.equal(retry(h),undefined);assert.equal(h.storage.size,1);
 });
 await test('month transition retains original exact date/body in memory and only queries it explicitly',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const old=retry(h);h.button('nextMonth')();h.render();await flush();await old();assert.equal(h.writeRequests.length,1);assert.ok(retry(h));h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);assert.equal(h.writeRequests[1].headers['X-Calendar-Write-Recovery'],'retained-only-v1');
 });
 await test('blocked storage warns accurately while retaining the exact original in memory',async()=>{
  const h=harness();h.state.storageDenied=true;await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();assert.match(h.text(),/recargar puede perderla/);h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);assert.equal(h.writeRequests[0].headers['Idempotency-Key'],h.writeRequests[1].headers['Idempotency-Key']);
 });
 for(const stage of ['fetch','json'])await test(stage+' timeout keeps identity, blocks duplicate retry and ignores late success',async()=>{
  const h=harness();await draft(h);let release;const held=new Promise(r=>release=r);h.state.write=stage==='fetch'?()=>held:async()=>({ok:true,status:201,json:()=>held});const pending=h.button('saveEntry')();await flush();h.advance(30000);await pending;assert.ok(retry(h));
  let nextRelease;h.state.write=()=>new Promise(r=>nextRelease=r);const action=retry(h),discard=h.button('discardUnconfirmedWrite');const next=action();await action();discard();assert.equal(h.writeRequests.length,2);nextRelease({ok:false});await next;const res=await ack(h)('',h.writeRequests[0]);release(stage==='fetch'?res:await res.json());await flush();assert.ok(retry(h));assert.equal(h.listRequests.length,1);assert.equal(h.timers.size,0);
 });
 await test('explicit discard never cancels server work and the next creation has a distinct key',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const before=h.writeRequests[0];h.button('discardUnconfirmedWrite')();assert.equal(h.writeRequests.length,1);assert.equal(h.storage.size,0);h.state.write=ack(h);await h.button('saveEntry')();assert.notEqual(h.writeRequests[1].headers['Idempotency-Key'],before.headers['Idempotency-Key']);assert.equal(h.writeRequests[1].headers['X-Calendar-Write-Recovery'],undefined);
 });
 await test('synthetic suggestion addition also uses the original key on explicit lookup',async()=>{
  const h=harness();h.state.send=success;await h.click();const add=h.nodes().find(n=>n.type==='button'&&typeof n.props.children?.at?.(-1)==='string'&&n.props.children.at(-1).endsWith('adir')).props.onClick;
  h.state.write=async()=>({ok:false});await add();h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);assert.equal(h.writeRequests[0].headers['Idempotency-Key'],h.writeRequests[1].headers['Idempotency-Key']);assert.doesNotMatch(h.text(),/Synthetic topic/);assert.equal(h.requests.length,1);
 });
 await test('strict bounded selector rejects injected authority, bad key, altered body and another owner',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const [slot,raw]=[...h.storage][0];const original=JSON.parse(raw);
  for(const value of [{...original,authority:true},{...original,key:'bad key'},{...original,body:'x'.repeat(65537)},{...original,body:JSON.stringify({...JSON.parse(original.body),authority:true})}]){const other=harness(new Map([[slot,JSON.stringify(value)]]));other.render();await flush();assert.equal(retry(other),undefined);assert.equal(other.writeRequests.length,0);}
 });
 await test('confirmation does not erase a later different selector already stored in the tab',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const [slot,raw]=[...h.storage][0];const newer=JSON.stringify({...JSON.parse(raw),key:'other-original'});h.storage.set(slot,newer);h.state.write=ack(h);await retry(h)();assert.equal(h.storage.get(slot),newer);
 });

 await test('captured original retry/discard cannot retarget a later explicitly chosen addition',async()=>{
  const h=harness();await draft(h);h.state.write=async()=>({ok:false});await h.button('saveEntry')();const oldRetry=retry(h),oldDiscard=h.button('discardUnconfirmedWrite');oldDiscard();h.field('title','Later chosen addition');await h.button('saveEntry')();const newer=h.writeRequests[1];await oldRetry();oldDiscard();assert.equal(h.writeRequests.length,2);assert.ok(retry(h));h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[2].headers['Idempotency-Key'],newer.headers['Idempotency-Key']);assert.equal(h.writeRequests[2].body,newer.body);
 });
 await test('serialized selector capacity failure preserves memory without writing an unreadable reload selector',async()=>{
  const h=harness();await draft(h);h.field('description','"'.repeat(32500));h.state.write=async()=>({ok:false});await h.button('saveEntry')();assert.equal(h.storage.size,0);assert.match(h.text(),/recargar puede perderla/);h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);
 });
 await test('pending original abort on unmount remains available only as an explicit lookup after reload',async()=>{
  const h=harness();await draft(h);h.state.write=()=>new Promise(()=>{});const pending=h.button('saveEntry')();h.unmount();await pending;const restored=harness(h.storage);restored.render();await flush();assert.equal(restored.writeRequests.length,0);restored.state.write=async()=>({ok:false});await retry(restored)();assert.equal(restored.writeRequests[0].headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.equal(restored.writeRequests[0].body,h.writeRequests[0].body);
 });
 console.log(JSON.stringify({scope:'actual calendar page; synthetic hooks and HTTP',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
