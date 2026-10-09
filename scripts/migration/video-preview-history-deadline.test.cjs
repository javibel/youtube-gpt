'use strict';
const assert=require('node:assert/strict');
const {harness,sample,reply}=require('./video-preview-history.test.cjs');
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
const binary=()=>({ok:true,status:200,blob:async()=>new Blob(['x'.repeat(2500)],{type:'video/webm'})});
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 await test('hung list GET ends its local wait at30s and explicit retry issues one new read',async()=>{
  const h=harness();try{
   h.state.send=()=>new Promise(()=>{});let finished=false;const waiting=h.ready().then(()=>finished=true);
   assert.equal(h.requests.length,1);assert.equal(h.view().previewListLoading,true);h.advance(30_000);await flush();
   assert.equal(finished,true,'History spinner remains pending beyond its deadline');await waiting;
   assert.equal(h.requests[0].init.signal.aborted,true);assert.equal(h.view().previewListLoading,false);assert.equal(h.view().previewListError,true);assert.equal(h.view().previewsLoaded,false);assert.equal(h.requests.length,1);
   h.state.send=null;await h.view().loadDbPreviews();assert.equal(h.requests.length,2);assert.equal(h.view().dbPreviews[0].id,sample.id);assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 await test('list JSON shares the original30s deadline and late data cannot replace an explicit retry',async()=>{
  const h=harness();try{
   await h.ready();let header,body,parsed=0;h.state.send=()=>new Promise(resolve=>header=resolve);let finished=false;
   const waiting=h.view().refreshDbPreviews().then(()=>finished=true);h.advance(19_000);
   header({ok:true,json:()=>{parsed++;return new Promise(resolve=>body=resolve);}});await flush();assert.equal(parsed,1);
   h.advance(11_000);await flush();assert.equal(finished,true,'JSON can hold the history wait forever');await waiting;
   assert.equal(h.view().dbPreviews[0].id,sample.id);assert.equal(h.view().previewListError,true);assert.equal(h.requests[1].init.signal.aborted,true);
   h.state.send=async()=>reply({previews:[{...sample,id:'newer'}]});await h.view().loadDbPreviews();body({previews:[{...sample,id:'late'}]});await flush();assert.equal(h.view().dbPreviews[0].id,'newer');assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 for(const action of ['play','download'])for(const stage of ['headers','blob'])await test(action+' '+stage+' wait ends at30s without URLs/download; late body is inert',async()=>{
  const h=harness();try{
   await h.ready();let late,read=0;h.state.send=stage==='headers'?()=>new Promise(resolve=>late=resolve):async()=>({ok:true,blob:()=>{read++;return new Promise(resolve=>late=resolve);}});
   let finished=false;const waiting=h.view()[action==='play'?'handleSelectPreview':'handleDownloadPreview'](sample).then(()=>finished=true);
   await flush();h.advance(30_000);await flush();assert.equal(finished,true,'Binary action lock remains held beyond its deadline');await waiting;
   assert.equal(h.requests.at(-1).init.signal.aborted,true);assert.equal(h.view().loadingPreviewId,null);assert.ok(h.view().previewError);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
   if(stage==='headers')late({ok:true,blob:async()=>{read++;return new Blob(['x'.repeat(2500)],{type:'video/webm'});}});else late(new Blob(['x'.repeat(2500)],{type:'video/webm'}));
   await flush();assert.equal(read,stage==='headers'?0:1);assert.equal(h.urls.length,0);
   h.state.send=async()=>binary();await h.view()[action==='play'?'handleSelectPreview':'handleDownloadPreview'](sample);assert.equal(h.urls.length,1);assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 await test('DELETE timeout preserves row/uncertainty; late204 is ignored and explicit same-id404 confirms absence',async()=>{
  const h=harness();try{
   await h.ready();let late;h.state.send=()=>new Promise(resolve=>late=resolve);let finished=false;
   const waiting=h.view().handleDeletePreview(sample.id).then(()=>finished=true);h.advance(30_000);await flush();
   assert.equal(finished,true,'Uncertain delete keeps every history action locked');await waiting;
   assert.equal(h.view().dbPreviews.length,1);assert.ok(h.view().previewError);assert.equal(h.view().loadingPreviewId,null);assert.equal(h.requests.at(-1).init.signal.aborted,true);
   late(reply(null,204));await flush();assert.equal(h.view().dbPreviews.length,1);assert.equal(h.requests.filter(r=>r.init.method==='DELETE').length,1);
   h.state.send=async url=>url==='/api/video-previews'?reply({previews:[]}):reply(null,404);await h.view().handleDeletePreview(sample.id);
   assert.equal(h.view().dbPreviews.length,0);assert.equal(h.view().previewError,null);const deletes=h.requests.filter(r=>r.init.method==='DELETE');assert.equal(deletes.length,2);assert.equal(deletes[0].url,deletes[1].url);await flush();assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 await test('confirmed delete releases the action lock while its separate list refresh is still pending',async()=>{
  const h=harness();try{
   await h.ready();h.state.send=async(url,init)=>init.method==='DELETE'?reply(null,204):url==='/api/video-previews'?new Promise(()=>{}):binary();
   await h.view().handleDeletePreview(sample.id);assert.equal(h.view().dbPreviews.length,0);assert.equal(h.view().loadingPreviewId,null);assert.equal(h.view().previewListLoading,true);
   await h.view().handleDownloadPreview({...sample,id:'remaining'});assert.equal(h.downloads.length,1);h.advance(30_000);await flush();assert.equal(h.view().previewListError,true);assert.equal(h.view().dbPreviews.length,0);assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 for(const transition of ['account','auth','unmount'])for(const action of ['list','download','delete'])await test(transition+' cancels hung '+action+' wait without late effects or a held action lock',async()=>{
  const h=harness();try{
   await h.ready();h.state.send=()=>new Promise(()=>{});let finished=false;
   const waiting=(action==='list'?h.view().refreshDbPreviews():action==='download'?h.view().handleDownloadPreview(sample):h.view().handleDeletePreview(sample.id)).then(()=>finished=true);
   const original=h.requests.at(-1);if(transition==='unmount')h.unmount();else {h.state[transition==='account'?'user':'auth']=transition==='account'?'fixture-two':'unauthenticated';h.view();}
   await flush();assert.equal(finished,true,'Retired account operation still waits for its network callback');await waiting;assert.equal(original.init.signal.aborted,true);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
  }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
 });
 await test('refresh cancels older hung list immediately and never parses its late response',async()=>{
  const h=harness();try{
   await h.ready();let late,parsed=0,finished=false;h.state.send=()=>new Promise(resolve=>late=resolve);
   const old=h.view().refreshDbPreviews().then(()=>finished=true),original=h.requests.at(-1);
   h.state.send=async()=>reply({previews:[{...sample,id:'newer'}]});await h.view().refreshDbPreviews();await flush();
   assert.equal(finished,true,'Superseded list wait remains pending');await old;assert.equal(original.init.signal.aborted,true);
   late({ok:true,json:async()=>{parsed++;return {previews:[sample]};}});await flush();assert.equal(parsed,0);assert.equal(h.view().dbPreviews[0].id,'newer');assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 await test('closing play cancels its hung blob but closing player during download does not cancel that download',async()=>{
  const h=harness();try{
   await h.ready();let late;h.state.send=async()=>({ok:true,blob:()=>new Promise(resolve=>late=resolve)});let finished=false;
   const playing=h.view().handleSelectPreview(sample).then(()=>finished=true);await flush();const original=h.requests.at(-1);h.view().closePlayingPreview();await flush();
   assert.equal(finished,true,'Closed player still waits on its binary');await playing;assert.equal(original.init.signal.aborted,true);assert.equal(h.urls.length,0);
   const downloading=h.view().handleDownloadPreview(sample);await flush();const downloadRequest=h.requests.at(-1);h.view().closePlayingPreview();assert.equal(downloadRequest.init.signal.aborted,false);
   late(new Blob(['x'.repeat(2500)],{type:'video/webm'}));await downloading;assert.equal(h.downloads.length,1);assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 await test('Strict Mode cleanup/setup preserves one initial read and retires its timer after completion',async()=>{
  const h=harness();try{
   let release;h.state.send=()=>new Promise(resolve=>release=resolve);h.strictEffects();const waiting=h.view().loadDbPreviews();await flush();assert.equal(h.requests.length,1);
   assert.equal(h.requests[0].init.signal?.aborted,false);release(reply({previews:[sample]}));await waiting;assert.equal(h.view().dbPreviews.length,1);assert.equal(h.timers.size,0);
  }finally{h.unmount();await flush();}
 });
 console.log(JSON.stringify({scope:'Actual video-history controller with deterministic HTTP/blob/DOM/timers; no native codec, operational auth or server cancellation acceptance',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
