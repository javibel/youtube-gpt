'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./storyboard-client-retry.test.cjs');
const results=[];
const ok=()=>({ok:true,status:200,json:async()=>({id:'synthetic-preview'})});
const key=r=>r.headers['Idempotency-Key'];
async function test(name,fn){await fn();results.push({name,status:'PASS'});}
(async()=>{

 const flushCache=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
 await test('stalled local cache ends its wait at30s and cannot prevent one account upload; late cache rejection never changes confirmation',async()=>{
  const h=harness();let reject;const started=new Promise(resolve=>{h.state.save=()=>{resolve();return new Promise((_,r)=>{reject=r;});};});await h.click();const finished=h.finish();await started;
  assert.equal(h.uploads.length,0);h.advance(29999);await flushCache();assert.equal(h.uploads.length,0);h.advance(1);await flushCache();assert.equal(h.uploads.length,1,'local cache must not block account save beyond30s');await finished;
  assert.match(h.text(),/Guardado en tu cuenta/);assert.match(h.text(),/copia local/);assert.deepEqual(h.callbacks,['generated','saved']);reject(Error('late cache error'));await flushCache();assert.match(h.text(),/Guardado en tu cuenta/);assert.equal(h.alert(),undefined);assert.equal(h.uploads.length,1);assert.equal(h.timers.size,0);h.unmount();
 });
 for(const action of ['account','email','close','unmount'])await test(action+' closes a stalled local cache wait without any old account upload or late save effect',async()=>{
  const h=harness();let release;const started=new Promise(resolve=>{h.state.save=()=>{resolve();return new Promise(r=>{release=r;});};});await h.click();const finished=h.finish();await started;
  if(action==='account'){h.state.user='fixture-two';h.render();}else if(action==='email'){h.state.email='changed@example.invalid';h.render();}else if(action==='close')h.close();else h.unmount();
  let settled=false;finished.then(()=>{settled=true;});await flushCache();assert.equal(settled,true,'leaving the scope must settle the local wait');assert.equal(h.uploads.length,0);assert.equal(h.timers.size,0);release();await flushCache();assert.equal(h.uploads.length,0);assert.equal(h.callbacks.includes('saved'),false);h.unmount();
 });
 await test('successful local cache alone never confirms an uncertain account upload',async()=>{const h=harness();h.state.upload=async()=>{throw Error('lost account acknowledgement');};await h.click();await h.finish();assert.ok(h.alert());assert.deepEqual(h.callbacks,['generated']);assert.match(h.text(),/Descargar/);assert.doesNotMatch(h.text(),/Guardado en tu cuenta/);h.unmount();});

 const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
 for(const mode of ['fetch','json'])await test(mode+' that ignores abort ends local save wait at90s; late result cannot confirm and retry only reads original',async()=>{
  const h=harness();let release,started;const reached=new Promise(r=>{started=r;});
  h.state.upload=async()=>{if(mode==='fetch'){started();return new Promise(r=>{release=r;});}return {ok:true,status:200,json:()=>{started();return new Promise(r=>{release=r;});}};};
  await h.click();const finished=h.finish();await reached;assert.match(h.text(),/Guardando/);h.advance(89999);await flush();assert.equal(h.alert(),undefined);h.advance(1);await flush();assert.ok(h.alert(),'local wait must finish even when upload transport ignores abort');await finished;
  assert.match(h.text(),/Descargar/);assert.deepEqual(h.callbacks,['generated']);const retry=h.saveHandler();h.state.upload=async()=>ok();await Promise.all([retry(),retry()]);
  assert.equal(h.uploads.length,2);assert.equal(h.uploads[0].headers['X-Video-Preview-Recovery'],undefined);assert.equal(h.uploads[1].headers['X-Video-Preview-Recovery'],'retained-only-v1');assert.equal(key(h.uploads[0]),key(h.uploads[1]));assert.equal(await h.uploads[0].body.get('video').text(),await h.uploads[1].body.get('video').text());assert.equal(h.uploads[0].body.get('title'),h.uploads[1].body.get('title'));
  release(mode==='fetch'?ok():{id:'late-preview'});await flush();assert.deepEqual(h.callbacks,['generated','saved']);assert.equal(h.requests.length,1);assert.equal(h.recorders.length,1);assert.equal(h.daily(),1);assert.equal(h.timers.size,0);h.unmount();
 });

 for(const action of ['account','email','close','unmount'])await test(action+' ends the original ignored-abort save wait without awaiting a remote acknowledgement',async()=>{
  const h=harness();let release,started;const reached=new Promise(r=>{started=r;});h.state.upload=()=>{started();return new Promise(r=>{release=r;});};await h.click();const finished=h.finish();await reached;
  if(action==='account'){h.state.user='fixture-two';h.render();}else if(action==='email'){h.state.email='changed@example.invalid';h.render();}else if(action==='close')h.close();else h.unmount();
  let settled=false;finished.then(()=>{settled=true;});await flush();assert.equal(settled,true);assert.equal(h.uploads[0].signal.aborted,true);assert.equal(h.timers.size,0);assert.deepEqual(h.callbacks,action==='close'?['generated','close']:['generated']);release(ok());await finished;await flush();assert.equal(h.callbacks.includes('saved'),false);h.unmount();
 });
 await test('missing original on retry preserves download and never automatically submits a fresh upload',async()=>{
  const h=harness();h.state.upload=async()=>{throw Error('not dispatched');};await h.click();await h.finish();h.state.upload=async()=>({ok:false,status:503,json:async()=>({error:'Original preview unavailable'})});await h.retrySave();assert.ok(h.alert());assert.match(h.text(),/Descargar/);assert.equal(h.uploads[1].headers['X-Video-Preview-Recovery'],'retained-only-v1');assert.equal(h.uploads.length,2);assert.deepEqual(h.callbacks,['generated']);assert.equal(h.recorders.length,1);h.unmount();
 });
 for(const mode of ['lost response',401,409,413,422,503,'missing id','empty id','invalid JSON'])await test(String(mode)+' exposes save retry and preserves the downloadable recording',async()=>{
  const h=harness();h.state.upload=async()=>{if(mode==='lost response')throw Error('private transport');return {ok:typeof mode!=='number',status:typeof mode==='number'?mode:200,json:async()=>{if(mode==='invalid JSON')throw Error('private JSON');return mode==='empty id'?{id:''}:{};}};};
  await h.click();await h.finish();assert.ok(h.alert());assert.match(h.text(),/Descargar/);assert.match(h.text(),/Reintentar guardado/);assert.doesNotMatch(h.text(),/private/);assert.deepEqual(h.callbacks,['generated']);
  h.state.upload=async()=>ok();await h.retrySave();assert.equal(key(h.uploads[0]),key(h.uploads[1]));assert.equal(await h.uploads[0].body.get('video').text(),await h.uploads[1].body.get('video').text());assert.equal(h.uploads[0].body.get('title'),h.uploads[1].body.get('title'));assert.equal(h.requests.length,1);assert.equal(h.recorders.length,1);assert.equal(h.daily(),1);assert.equal(h.localSaves.length,1);assert.deepEqual(h.callbacks,['generated','saved']);assert.match(h.text(),/Guardado en tu cuenta/);assert.equal(h.alert(),undefined);h.unmount();
 });
 await test('rapid retries coalesce while download remains available and Regenerate cannot discard an active upload',async()=>{
  const h=harness();h.state.upload=async()=>{throw Error('lost');};await h.click();await h.finish();let release;h.state.upload=()=>new Promise(resolve=>{release=resolve;});const action=h.saveHandler(),first=action(),second=action();h.reset();assert.match(h.text(),/Guardando/);assert.match(h.text(),/Descargar/);
  assert.equal(h.uploads.length,2);release(ok());await Promise.all([first,second]);assert.equal(h.uploads.length,2);assert.deepEqual(h.callbacks,['generated','saved']);h.unmount();
 });
 for(const action of ['account','close','unmount'])await test(action+' change suppresses a late upload acknowledgement',async()=>{
  const h=harness();let release;const started=new Promise(resolve=>{h.state.upload=()=>{resolve();return new Promise(r=>{release=r;});};});await h.click();const finished=h.finish();await started;
  if(action==='account'){h.state.user='fixture-two';h.render();}else if(action==='close')h.close();else h.unmount();release(ok());await finished;assert.equal(h.callbacks.includes('saved'),false);assert.equal(h.uploads.length,1);
 });
 await test('local cache failure does not hide a confirmed account save',async()=>{const h=harness();h.state.save=async()=>{throw Error('cache unavailable');};await h.click();await h.finish();assert.deepEqual(h.callbacks,['generated','saved']);assert.match(h.text(),/Guardado en tu cuenta/);h.unmount();});
 await test('Regenerate has a new upload identity while reusing adaptation',async()=>{const h=harness();await h.click();await h.finish();h.reset();await h.click();await h.finish();assert.notEqual(key(h.uploads[0]),key(h.uploads[1]));assert.equal(h.requests.length,1);assert.equal(h.daily(),2);h.unmount();});
 await test('consumer callback failure does not invalidate a confirmed server save',async()=>{const h=harness({onSaved:()=>{throw Error('consumer callback');}});await h.click();await assert.rejects(h.finish(),/consumer callback/);assert.match(h.text(),/Guardado en tu cuenta/);assert.equal(h.alert(),undefined);assert.equal(h.timers.size,0);h.unmount();});
 console.log(JSON.stringify({scope:'actual component with synthetic recorder and upload acknowledgements; no browser codec acceptance',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
