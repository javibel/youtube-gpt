'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./storyboard-client-retry.test.cjs');
const results=[];
const ok=()=>({ok:true,status:200,json:async()=>({id:'synthetic-preview'})});
const key=r=>r.headers['Idempotency-Key'];
async function test(name,fn){await fn();results.push({name,status:'PASS'});}
(async()=>{
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
 console.log(JSON.stringify({scope:'actual component with synthetic recorder and upload acknowledgements; no browser codec acceptance',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
