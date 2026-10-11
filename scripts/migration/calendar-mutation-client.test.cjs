'use strict';
const assert=require('node:assert/strict'),{harness,readSuccess}=require('./calendar-client-retry.test.cjs');
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const setup=async(storage)=>{const h=harness(storage),entry={id:'owned-original',title:'Original entry',description:null,status:'idea',color:null};h.state.list=async url=>{entry.date=new URL('https://example.invalid'+url).searchParams.get('from');return readSuccess(h,[{...entry}],url);};h.render();await flush();return {h,entry};};
const retry=h=>h.button('retryCalendarMutation');
const ack=h=>async(url,init)=>{const b=JSON.parse(init.body);return {ok:true,json:async()=>init.method==='DELETE'?{ok:true,id:decodeURIComponent(url.split('id=')[1]),originalMutation:true}:{entry:{...b.expected,...b,id:b.id,userId:h.state.user,description:Object.hasOwn(b,'description')?b.description?.trim()||null:b.expected.description,color:Object.hasOwn(b,'color')?b.color?.trim()||null:b.expected.color},originalMutation:true}};};
const start=async(method,storage)=>{const {h,entry}=await setup(storage);h.edit(entry.title);if(method==='PUT')h.field('title','Edited original');return {h,entry,run:()=>h.button(method==='PUT'?'saveEntry':'deleteEntry')()};};
const results=[],test=async(name,run)=>{await run();results.push({name,status:'PASS'});};
(async()=>{
 await test('lost edit keeps original key, body and expected fields for explicit retained lookup',async()=>{
  const {h,entry}=await setup();h.edit(entry.title);h.field('title','Edited original');h.state.write=async()=>{throw Error('Lost ack');};await h.button('saveEntry')();const first=h.writeRequests[0];assert.match(first.headers['Idempotency-Key'],/^[-A-Za-z0-9._:]{1,128}$/);assert.equal(JSON.parse(first.body).expected.title,entry.title);assert.ok(h.button('retryCalendarMutation'));
 });

 for(const method of ['PUT','DELETE'])await test(method+' exact retry confirms original operation without fresh identity/body and refreshes only GET state',async()=>{
  const {h,run}=await start(method);h.state.write=async()=>({ok:false});await run();const first=h.writeRequests[0];h.field('title','Later edited form');h.state.write=ack(h);await retry(h)();const next=h.writeRequests[1];assert.equal(next.method,method);assert.equal(next.url,first.url);assert.equal(next.body,first.body);assert.equal(next.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(next.headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.equal(retry(h),undefined);assert.equal(h.storage.size,0);assert.equal(h.button('saveEntry'),undefined);assert.equal(h.listRequests.length,2);
 });
 for(const method of ['PUT','DELETE'])await test(method+' reload offers explicit retained query only, with original id/expected/body',async()=>{
  const {h,run}=await start(method);h.state.write=async()=>({ok:false});await run();h.unmount();const {h:restored}=await setup(h.storage);assert.equal(restored.writeRequests.length,0);assert.ok(retry(restored));restored.state.write=ack(restored);await retry(restored)();assert.equal(restored.writeRequests[0].body,h.writeRequests[0].body);assert.equal(restored.writeRequests[0].url,h.writeRequests[0].url);assert.equal(restored.writeRequests[0].headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.equal(restored.writeRequests[0].headers['Idempotency-Key'],h.writeRequests[0].headers['Idempotency-Key']);
 });
 for(const method of ['PUT','DELETE'])await test(method+' absent/conflicting original never falls back to another mutation',async()=>{
  const {h,run}=await start(method);h.state.write=async()=>({ok:false,status:503});await run();for(const status of [503,409,403]){h.state.write=async()=>({ok:false,status});await retry(h)();assert.ok(retry(h));}assert.equal(new Set(h.writeRequests.map(r=>r.headers['Idempotency-Key'])).size,1);assert(h.writeRequests.every(r=>r.body===h.writeRequests[0].body));assert.equal(h.listRequests.length,1);assert.match(h.text(),/operación pasada, no el estado actual/);
 });
 for(const [name,change]of [['account',h=>h.state.user='other'],['email',h=>h.state.email='other@example.invalid'],['language',h=>h.state.lang='en'],['logout',h=>h.state.auth='unauthenticated']])await test(name+' isolates pending mutation selector and rejects captured retry',async()=>{
  const {h,run}=await start('PUT');h.state.write=async()=>({ok:false});await run();const old=retry(h);change(h);h.render();await flush();await old();assert.equal(h.writeRequests.length,1);assert.equal(retry(h),undefined);assert.equal(h.storage.size,1);
 });
 await test('month transition keeps exact original mutation in memory without retargeting selected entry/date',async()=>{
  const {h,run}=await start('PUT');h.state.write=async()=>({ok:false});await run();const old=retry(h);h.button('nextMonth')();h.render();await flush();await old();assert.equal(h.writeRequests.length,1);assert.ok(retry(h));h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);assert.equal(h.writeRequests[1].headers['X-Calendar-Write-Recovery'],'retained-only-v1');
 });
 for(const stage of ['fetch','json'])await test(stage+' timeout closes local wait, preserves identity and ignores delayed original output',async()=>{
  const {h,run}=await start('DELETE');let release;const held=new Promise(r=>release=r);h.state.write=stage==='fetch'?()=>held:async()=>({ok:true,json:()=>held});const pending=run();await flush();h.advance(30000);await pending;assert.ok(retry(h));assert.equal(h.timers.size,0);h.state.write=async()=>({ok:false});await retry(h)();assert.equal(h.writeRequests.length,2);const r=await ack(h)(h.writeRequests[0].url,h.writeRequests[0]);release(stage==='fetch'?r:await r.json());await flush();assert.ok(retry(h));assert.equal(h.listRequests.length,1);assert.equal(h.writeRequests[0].headers['Idempotency-Key'],h.writeRequests[1].headers['Idempotency-Key']);
 });
 await test('rapid retry and captured discard cannot replace an in-flight original mutation',async()=>{
  const {h,run}=await start('PUT');h.state.write=async()=>({ok:false});await run();const action=retry(h),discard=h.button('discardUnconfirmedWrite');let release;h.state.write=()=>new Promise(r=>release=r);const pending=action();await action();discard();assert.equal(h.writeRequests.length,2);release({ok:false});await pending;assert.ok(retry(h));
 });
 await test('captured retry/discard cannot retarget a later explicitly selected mutation',async()=>{
  const {h,run}=await start('PUT');h.state.write=async()=>({ok:false});await run();const old=retry(h),discard=h.button('discardUnconfirmedWrite');discard();h.field('title','Different explicit edit');await run();const next=h.writeRequests[1];await old();discard();assert.equal(h.writeRequests.length,2);assert.ok(retry(h));h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[2].headers['Idempotency-Key'],next.headers['Idempotency-Key']);assert.equal(h.writeRequests[2].body,next.body);
 });
 for(const method of ['PUT','DELETE'])await test(method+' malformed or mismatched original acknowledgement cannot confirm mutation',async()=>{
  for(const changed of [{originalMutation:false},{id:'wrong-id'}, {entry:{id:'wrong'}}]){const {h,run}=await start(method);h.state.write=async(url,init)=>{const good=await ack(h)(url,init);return {ok:true,json:async()=>({...await good.json(),...(method==='DELETE'&&changed.entry?{ok:false}:method==='PUT'&&changed.id?{entry:{...(await good.json()).entry,id:changed.id}}:changed)})};};await run();assert.ok(retry(h));assert.equal(h.listRequests.length,1);}
 });
 await test('storage denial retains exact pending change in memory and warns about reload',async()=>{
  const {h,run}=await start('PUT');h.state.storageDenied=true;h.state.write=async()=>({ok:false});await run();assert.match(h.text(),/recargar puede perderla/);h.state.write=ack(h);await retry(h)();assert.equal(h.writeRequests[0].body,h.writeRequests[1].body);assert.equal(h.storage.size,0);
 });
 await test('strict selector rejects bad key, altered method/id, expected authority and oversized body',async()=>{
  const {h,run}=await start('PUT');h.state.write=async()=>({ok:false});await run();const [slot,raw]=[...h.storage][0],value=JSON.parse(raw);for(const v of [{...value,key:'bad key'},{...value,method:'POST'},{...value,id:'another'},{...value,authority:true},{...value,body:'x'.repeat(65537)},{...value,body:JSON.stringify({...JSON.parse(value.body),expected:{...JSON.parse(value.body).expected,authority:true}})}]){const other=await setup(new Map([[slot,JSON.stringify(v)]]));assert.equal(retry(other.h),undefined);assert.equal(other.h.writeRequests.length,0);}
 });
 await test('confirmation preserves a later selector stored in the same tab',async()=>{
  const {h,run}=await start('DELETE');h.state.write=async()=>({ok:false});await run();const [slot,raw]=[...h.storage][0],later=JSON.stringify({...JSON.parse(raw),key:'other-original'});h.storage.set(slot,later);h.state.write=ack(h);await retry(h)();assert.equal(h.storage.get(slot),later);
 });
 await test('unmount abort keeps original selector for explicit reload query without dispatching captured handlers',async()=>{
  const {h,run}=await start('DELETE');h.state.write=()=>new Promise(()=>{});const pending=run();h.unmount();await pending;assert.equal(h.writeRequests[0].signal.aborted,true);const restored=await setup(h.storage);assert.equal(restored.h.writeRequests.length,0);assert.ok(retry(restored.h));
 });
 console.log(JSON.stringify({scope:'actual calendar page; synthetic hooks and HTTP',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
