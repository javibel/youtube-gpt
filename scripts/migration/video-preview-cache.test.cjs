'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../lib/videoPreviewDB.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const a={userId:'account-a',email:'a@example.invalid'},b={userId:'account-b',email:'b@example.invalid'};
const row=(id='shared',title='Synthetic preview')=>({id,blob:new Blob(['x'.repeat(2500)],{type:'video/webm'}),title,format:'4x3',createdAt:'2026-10-09T00:00:00.000Z'});
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function harness(){
 const stores=new Map([['previews',new Map([['legacy',row('legacy','Unowned legacy')]])]]),indices=new Map(),timers=new Map(),opens=[],reads=[];let clock=0,timerId=0,version=1,closes=0,aborts=0,transactions=0;
 const state={holdOpen:false,blocked:false,holdRequest:false,holdCommit:false,abortAfterRequest:false,openThrows:false,badRows:null};let heldRequest=null,heldCommit=null;
 function connection(){const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name,options){assert.deepEqual(Array.from(options.keyPath),['scope','id']);stores.set(name,new Map());return {createIndex(name,key){assert.equal(key,'scope');indices.set(name,key);}};},
  close(){closes++;},
  transaction(name,mode){transactions++;assert.equal(name,'scopedPreviews');const pending=new Map(stores.get(name));let aborted=false;const tx={
   abort(){if(aborted)return;aborted=true;aborts++;queueMicrotask(()=>tx.onabort?.());},
   objectStore(storeName){assert.equal(storeName,name);const request=(op)=>{
    const req={};const complete=()=>{if(aborted)return;try{req.result=op();req.onsuccess?.();}catch{req.onerror?.();return;}
     if(state.abortAfterRequest){tx.abort();return;}const commit=()=>{if(aborted)return;if(mode==='readwrite')stores.set(name,pending);tx.oncomplete?.();};
     if(state.holdCommit)heldCommit=commit;else queueMicrotask(commit);
    };if(state.holdRequest)heldRequest=complete;else queueMicrotask(complete);return req;
   };return {
    get(key){return request(()=>pending.get(JSON.stringify(key)));},
    put(value){assert.equal(mode,'readwrite');return request(()=>{pending.set(JSON.stringify([value.scope,value.id]),value);return [value.scope,value.id];});},
    delete(key){assert.equal(mode,'readwrite');return request(()=>{pending.delete(JSON.stringify(key));return undefined;});},
    index(name){assert.equal(name,'scope');assert(indices.has(name));return {getAll(scope){reads.push(scope);return request(()=>state.badRows??[...pending.values()].filter(r=>r.scope===scope));}};},
   };},
  };return tx;},
 };return db;}
 const indexedDB={open(name,requestedVersion){if(state.openThrows)throw Error('Private open error');assert.equal(name,'ytubviral_previews');assert.equal(requestedVersion,2);const req={result:connection(),transaction:{abort(){aborts++;}}};opens.push(req);if(state.blocked)queueMicrotask(()=>req.onblocked?.());else if(!state.holdOpen)queueMicrotask(()=>finishOpen(req));return req;}};
 function finishOpen(req=opens.at(-1)){if(version<2){req.onupgradeneeded?.();version=2;}req.onsuccess?.();}
 const entry={exports:{}};class ClockDate extends Date{static now(){return clock;}}
 vm.runInNewContext(compiled,{module:entry,exports:entry.exports,Blob,Date:ClockDate,indexedDB,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}});
 return {api:entry.exports,state,stores,opens,reads,timers,finishOpen,advance(ms){clock+=ms;for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}},finishRequest(){heldRequest?.();},finishCommit(){heldCommit?.();},stats:()=>({closes,aborts,transactions})};
}
const results=[];async function test(name,fn){await fn();results.push({name,status:'PASS'});}
if(require.main===module){const guard=setTimeout(()=>{console.error('FAIL: cache contract did not reach terminal report');process.exitCode=1;},15000);
(async()=>{
 await test('two accounts persist same script identity without overwrite and read only own rows',async()=>{const h=harness();await h.api.savePreview(row('shared','A'),a);await h.api.savePreview(row('shared','B'),b);assert.equal((await h.api.loadPreviews(a))[0].title,'A');assert.equal((await h.api.loadPreviews(b))[0].title,'B');assert.equal(h.stores.get('scopedPreviews').size,2);assert.equal(h.timers.size,0);});
 await test('supported recorder codec MIME remains an exact cached binary type',async()=>{const h=harness(),value={...row(),blob:new Blob(['x'.repeat(2500)],{type:'video/webm;codecs=vp9'})};await h.api.savePreview(value,a);assert.equal((await h.api.loadPreviews(a))[0].blob.type,'video/webm;codecs=vp9');});
 await test('email change selects another partition even for same user id',async()=>{const h=harness();await h.api.savePreview(row(),a);assert.equal((await h.api.loadPreviews({...a,email:'changed@example.invalid'})).length,0);assert.equal(h.reads.at(-1),JSON.stringify([a.userId,'changed@example.invalid']));});
 await test('delete selects exact own scope/id and preserves other account and script',async()=>{const h=harness();await h.api.savePreview(row(),a);await h.api.savePreview(row(),b);await h.api.savePreview(row('second'),a);await h.api.deletePreview('shared',a);assert.equal((await h.api.loadPreviews(a))[0].id,'second');assert.equal((await h.api.loadPreviews(b))[0].id,'shared');});
 await test('legacy unowned store is preserved but never read or adopted',async()=>{const h=harness(),legacy=h.stores.get('previews').get('legacy');assert.equal((await h.api.loadPreviews(a)).length,0);assert.equal(h.stores.get('previews').get('legacy'),legacy);await h.api.savePreview(row(),a);assert.equal(h.stores.get('previews').size,1);});
 for(const owner of [undefined,{}, {...a,userId:''},{...a,email:' '},{...a,userId:'x'.repeat(257)},{...a,email:'x'.repeat(321)}])await test('invalid/missing scope rejects before IndexedDB '+results.length,async()=>{const h=harness();await assert.rejects(h.api.savePreview(row(),owner),/scope/);await assert.rejects(h.api.loadPreviews(owner),/scope/);await assert.rejects(h.api.deletePreview('shared',owner),/scope/);assert.equal(h.opens.length,0);});
 await test('already aborted scope never opens storage',async()=>{const h=harness(),c=new AbortController();c.abort();await assert.rejects(h.api.loadPreviews(a,c.signal),/wait ended/);assert.equal(h.opens.length,0);});
 await test('blocked upgrade fails without retry; later connection closes without data transaction',async()=>{const h=harness();h.state.blocked=true;await assert.rejects(h.api.loadPreviews(a),/blocked/);h.finishOpen();assert.equal(h.stats().transactions,0);assert.equal(h.stats().closes,1);assert.equal(h.timers.size,0);});
 await test('open timeout rejects at30s and late open never accesses or writes data',async()=>{const h=harness();h.state.holdOpen=true;const p=h.api.savePreview(row(),a);const rejected=assert.rejects(p,/wait ended/);await flush();h.advance(30000);await rejected;h.finishOpen();assert.equal(h.stats().transactions,0);assert.equal(h.stats().closes,1);assert.equal(h.stores.has('scopedPreviews'),false);});
 await test('scope abort during open closes later connection without dispatching transaction',async()=>{const h=harness();h.state.holdOpen=true;const c=new AbortController(),p=h.api.loadPreviews(a,c.signal),rejected=assert.rejects(p,/wait ended/);c.abort();await rejected;h.finishOpen();assert.equal(h.stats().transactions,0);assert.equal(h.timers.size,0);});
 await test('request success followed by transaction abort cannot acknowledge a saved local copy',async()=>{const h=harness();h.state.abortAfterRequest=true;await assert.rejects(h.api.savePreview(row(),a),/aborted/);assert.equal(h.stores.get('scopedPreviews').size,0);assert.equal(h.timers.size,0);assert.equal(h.stats().closes,1);});
 await test('read result waits for committed transaction; abort after request never confirms rows',async()=>{const h=harness();await h.api.savePreview(row(),a);h.state.abortAfterRequest=true;await assert.rejects(h.api.loadPreviews(a),/aborted/);});
 await test('held commit timeout aborts local transaction and late completion cannot persist or acknowledge',async()=>{const h=harness();h.state.holdCommit=true;const p=h.api.savePreview(row(),a),rejected=assert.rejects(p,/wait ended/);await flush();h.advance(30000);await rejected;h.finishCommit();assert.equal(h.stores.get('scopedPreviews').size,0);assert.equal(h.stats().aborts,1);assert.equal(h.stats().closes,1);assert.equal(h.timers.size,0);});
 await test('scope abort during transaction prevents late request/commit and clears resources',async()=>{const h=harness();h.state.holdRequest=true;const c=new AbortController(),p=h.api.savePreview(row(),a,c.signal),rejected=assert.rejects(p,/wait ended/);await flush();c.abort();await rejected;h.finishRequest();h.finishCommit();assert.equal(h.stores.get('scopedPreviews').size,0);assert.equal(h.timers.size,0);});
 await test('open and transaction share a single30s deadline',async()=>{const h=harness();h.state.holdOpen=true;h.state.holdCommit=true;const p=h.api.savePreview(row(),a),rejected=assert.rejects(p,/wait ended/);await flush();h.advance(20000);h.finishOpen();await flush();h.advance(10000);await rejected;assert.equal(h.stats().aborts,1);});
 await test('malformed local row is unavailable rather than an empty confirmed list',async()=>{const h=harness();await h.api.savePreview(row(),a);h.state.badRows=[{...row(),scope:JSON.stringify([b.userId,b.email])}];await assert.rejects(h.api.loadPreviews(a),/record unavailable/);});
 await test('duplicate or forged-authority cache rows are rejected without confirming them',async()=>{const h=harness();await h.api.savePreview(row(),a);const stored=[...h.stores.get('scopedPreviews').values()][0];h.state.badRows=[stored,stored];await assert.rejects(h.api.loadPreviews(a),/record unavailable/);h.state.badRows=[{...stored,confirmed:true}];await assert.rejects(h.api.loadPreviews(a),/record unavailable/);});
 await test('invalid capture/date or oversize id rejected before opening storage',async()=>{const h=harness();for(const value of [{...row(),createdAt:'invalid'},{...row(),blob:new Blob(['x'])},{...row(),id:'x'.repeat(257)}])await assert.rejects(h.api.savePreview(value,a),/input unavailable/);assert.equal(h.opens.length,0);});

 await test('exact scoped lookup preserves upload selector and binary without granting confirmation',async()=>{const h=harness(),value={...row(),uploadSelection:{version:1,key:'original-key',script:'Synthetic script',lang:'es'}};await h.api.savePreview(value,a);const found=await h.api.loadPreview('shared',a);assert.equal(found.uploadSelection.key,'original-key');assert.equal(found.uploadSelection.script,'Synthetic script');assert.equal(found.blob,value.blob);assert.equal(await h.api.loadPreview('shared',b),null);assert.equal(await h.api.loadPreview('missing',a),null);});
 await test('scoped rows without upload selector remain readable but never acquire one',async()=>{const h=harness();await h.api.savePreview(row(),a);assert.equal((await h.api.loadPreview('shared',a)).uploadSelection,undefined);assert.equal(h.stores.get('previews').size,1);});
 await test('invalid/oversize upload selection or forged extra authority rejected before storage',async()=>{const h=harness(),selected={version:1,key:'original',script:'Synthetic script',lang:'es'};for(const selector of [{...selected,key:'bad key'},{...selected,script:'x'.repeat(64001)},{...selected,version:2},{...selected,lang:'fr'},{...selected,confirmed:true}])await assert.rejects(h.api.savePreview({...row(),uploadSelection:selector},a),/input unavailable/);assert.equal(h.opens.length,0);});
 console.log(JSON.stringify({scope:'actual cache module with synthetic IndexedDB transaction events; no real browser durability or operational provenance acceptance',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(guard));}
module.exports={harness};
