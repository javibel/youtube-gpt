'use strict';
const genuine=new WeakSet(),key=Symbol.for('ytubviral.migration.fixture-lifecycle.v1');
const guarded=()=>process.env.YTV_MIGRATION_WEB_TEST==='1'&&globalThis.__ytvRuntimeGuard===true;
// Own live promises/resources only. The receipt describes process drainage;
// it never releases, retries or recovers a business admission or reservation.
function createFixtureLifecycle({beforeDrain=()=>{},afterDrain=()=>{}}={}){
 if(typeof beforeDrain!=='function'||typeof afterDrain!=='function')throw Error('Fixture close callbacks required');
 let stopping=false,terminal;const work=new Set(),originals=new Set(),resources=new Map(),faults=[];
 const counts={workSettled:0,originalsSettled:0,rejectedWork:0,rejectedOriginals:0};
 const check=()=>{if(stopping)throw Error('Fixture is stopping; no new work');};
 function observe(set,promise,settled,rejected){set.add(promise);promise.then(()=>{set.delete(promise);counts[settled]++;},()=>{set.delete(promise);counts[settled]++;counts[rejected]++;});return promise;}
 function closeResource(resource){
  const owned=resources.get(resource);if(!owned)throw Error('Original fixture resource required');
  return owned.closed??=Promise.resolve().then(owned.close);
 }
 const lifecycle=Object.freeze({check,
  runWork(start){check();return observe(work,Promise.resolve().then(start),'workSettled','rejectedWork');},
  runOriginal(start){check();try{const run=start(),original=Object.getOwnPropertyDescriptor(run,'original')?.value;
   if(!(original instanceof Promise))throw Error('Original fixture promise required');
   observe(originals,original,'originalsSettled','rejectedOriginals');return run;
  }catch(error){faults.push('original-registration');throw error;}
  },
  openResource(open){check();const pending=Promise.resolve().then(open).then(resource=>{
   const close=Object.getOwnPropertyDescriptor(resource,'close')?.value;
   if(!resource||typeof close!=='function'||resources.has(resource))throw Error('Original fixture close capability required');
   resources.set(resource,{close:()=>close.call(resource),closed:undefined});return resource;
  }).catch(error=>{faults.push('resource-registration');throw error;});return observe(work,pending,'workSettled','rejectedWork');},
  closeResource,
  stop(){if(terminal)return terminal;stopping=true;terminal=Promise.resolve().then(async()=>{
   const errors=[];try{await beforeDrain();}catch{errors.push('listener');}
   // No new work is admitted after the synchronous stop latch. An opening
   // resource already captured above may finish and register while we drain.
   await Promise.allSettled([...work]);await Promise.allSettled([...originals]);
   try{await afterDrain();}catch{errors.push('application');}
   const closed=await Promise.allSettled([...resources.keys()].map(closeResource));
   if(closed.some(r=>r.status==='rejected'))errors.push('resource');
   errors.push(...faults);
   return Object.freeze({status:errors.length?'failed':'drained',...counts,resourcesClosed:closed.filter(r=>r.status==='fulfilled').length,errors:Object.freeze(errors),businessRecovery:false});
  });return terminal;},
 });genuine.add(lifecycle);return lifecycle;
}
function installFixtureLifecycle(lifecycle){
 if(!guarded()||!genuine.has(lifecycle)||globalThis[key])throw Error('Guarded original fixture lifecycle required');
 Object.defineProperty(globalThis,key,{value:lifecycle,writable:false,configurable:false});
}
function getFixtureLifecycle(){if(!guarded()||!globalThis[key])throw Error('Fixture lifecycle is not installed');return globalThis[key];}
module.exports={createFixtureLifecycle,installFixtureLifecycle,getFixtureLifecycle};
