'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const { createRetryOperation } = require('../../lib/ai/retry-operation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../app/predictor/page.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
 module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
// Render the actual component with deterministic hook state and bounded synthetic HTTP.
let harnessId=0;
function harness(options={}) {
 const storage=options.storage??new Map(),instance=++harnessId;
 const cells = [], effects = [], requests = [],timers=new Map(); let index = 0, dirty = false, number = 0,clock=0,timerId=0;
 const state = { user: 'fixture-one',email:'fixture-one@example.invalid',status:'authenticated', lang: 'es',storageReadFails:false,storageWriteFails:false,storageRemoveFails:false, send: async () => success(),...options.state };
 const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
 const hooks = {
  useState(initial) { const i = index++; if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial };
   return [cells[i].value, value => { const next = typeof value === 'function' ? value(cells[i].value) : value;
    if (!Object.is(next, cells[i].value)) { cells[i].value = next; dirty = true; } }]; },
  useRef(value) { const i = index++; return cells[i] ??= { current: value }; },
  useMemo(make, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) cells[i] = { value: make(), deps }; return cells[i].value; },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(fn, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) { const old=cells[i];cells[i] = { deps };const cell=cells[i];effects.push(()=>{old?.cleanup?.();cell.cleanup=fn();}); } },
 };
 const jsx = (type, props) => ({ type, props });
 const entry = { exports: {} };
 const mocks = {
  react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  'next-auth/react': { useSession: () => ({ data: { user: { id: state.user,email:state.email } }, status:state.status }) },
  '@/components/LangProvider': { useLang: () => state.lang },
  '@/components/DashboardShell': { default: 'shell' }, '@/components/ToolLoginGate': { default: 'login' },
  '@/lib/ai/retry-operation.cjs': { createRetryOperation },
 };
 vm.runInNewContext(compiled, { module: entry, exports: entry.exports,
  require(name) { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
  crypto: { randomUUID: () => `predictor-fixture-${instance}-${++number}` },
  sessionStorage:{getItem:slot=>{if(state.storageReadFails)throw Error('Read blocked');return storage.get(slot)??null;},setItem:(slot,value)=>{if(state.storageWriteFails)throw Error('Write blocked');storage.set(slot,value);},removeItem:slot=>{if(state.storageRemoveFails)throw Error('Remove blocked');storage.delete(slot);}},
  fetch: async (url, init) => {
   assert.equal(url, '/api/predictor'); assert.equal(init.method, 'POST');
   requests.push({ ...init, owner: state.user });
   return state.send(init);
  }, Date, console,AbortController,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),
 });
 function render() { let tree; for (let n = 0; n < 10; n++) {
  index = 0; dirty = false; tree = entry.exports.default(); while (effects.length) effects.shift()();
  if (!dirty) return tree;
 } throw Error('Render did not settle'); }
 function nodes(tree) { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)]; }
 const handler = () => nodes(render()).find(n => n.type === 'button' && n.props.onClick?.name === 'predict').props.onClick;
 const click = () => handler()();
 const text = value => Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
 return { state, requests, click, handler, render,timers,storage,
  beforeEffects(){index=0;dirty=false;const tree=entry.exports.default(),all=nodes(tree);return{fields:all.filter(n=>n.type==='input'||n.type==='textarea').map(n=>n.props.value),text:text(tree),predict:all.find(n=>n.type==='button'&&n.props.onClick?.name==='predict')};},
  discard:()=>nodes(render()).find(n=>n.props.onClick?.name==='discardPrediction').props.onClick(),
  discardHandler:()=>nodes(render()).find(n=>n.props.onClick?.name==='discardPrediction').props.onClick,
  unmount:()=>cells.forEach(cell=>cell?.cleanup?.()),
  advance(ms){clock+=ms;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}},
  setField(name,value) { const field=nodes(render()).filter(n=>n.type==='input'||n.type==='textarea')[['title','description','tags'].indexOf(name)];assert.ok(field,name);field.props.onChange({target:{value}});render(); },
  alert: () => nodes(render()).find(n => n.props?.role === 'alert'), text: () => text(render()) };
}

const prediction = { estimatedViews:{low:50,mid:100,high:200},estimatedEngagement:4,titleScore:70,seoScore:65,viralPotential:'medium',strengths:['Synthetic strength'],weaknesses:['Synthetic weakness'],suggestion:'Synthetic advice' };
const baseline = { avgViews:100,medianViews:80,avgEngagement:4,topVideoViews:200,topVideoTitle:'Synthetic baseline',videoCount:3,subscribers:1000 };
const response = { prediction,baseline };
const success = async () => ({ok:true,json:async()=>structuredClone(response)});
const key = request => request.headers['Idempotency-Key'];
function create() { const h=harness();h.setField('title',' Synthetic title ');return h; }
const results=[];
async function test(name,run){await run();results.push({name,status:'PASS'});}
async function main(){
 for(const changed of [{user:'fixture-two'},{email:'another@example.invalid'},{lang:'en'}])await test('scope transition hides old draft/results before effects and blocks a pre-effect submission '+JSON.stringify(changed),async()=>{
  const h=create();h.setField('title','Private old account title');h.setField('description','Private old account draft');await h.click();assert.match(h.text(),/Synthetic advice/);
  Object.assign(h.state,changed);const frame=h.beforeEffects();assert.deepEqual(frame.fields,['','','']);assert.doesNotMatch(frame.text,/Synthetic advice/);
  assert.equal(frame.predict.props.disabled,true);const before=h.requests.length;await frame.predict.props.onClick();assert.equal(h.requests.length,before);h.render();h.unmount();
 });
 await test('reload restores only pending exact input and selection, without automatic HTTP or fresh admission',async()=>{
  const h=create();h.setField('description',' Original description ');h.setField('tags',' original, tags ');h.state.send=async()=>{throw Error('Lost');};await h.click();
  assert.equal(h.storage.size,1);h.unmount();const reload=harness({storage:h.storage});reload.render();assert.equal(reload.requests.length,0);assert.ok(reload.alert());
  await reload.click();assert.equal(key(reload.requests[0]),key(h.requests[0]));assert.equal(reload.requests[0].body,h.requests[0].body);assert.equal(reload.requests[0].headers['X-Predictor-Recovery'],'retained-only-v1');assert.equal(reload.storage.size,0);
 });
 await test('uncertain retry must be retained-only instead of admitting from the local key',async()=>{
  const h=create();h.state.send=async()=>{throw Error('Response lost');};await h.click();h.state.send=success;await h.click();
  assert.equal(h.requests[0].headers['X-Predictor-Recovery'],undefined);
  assert.equal(h.requests[1].headers['X-Predictor-Recovery'],'retained-only-v1');
 });
 await test('lost response retains key and body; success finishes interaction',async()=>{
  const h=create();h.setField('description',' Synthetic description ');h.setField('tags',' synthetic, fixture ');
  h.state.send=async()=>{throw Error('Response lost');};await h.click();assert.ok(h.alert());assert.match(h.text(),/Reintentar predicción/);
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));assert.equal(h.requests[0].body,h.requests[1].body);
  assert.deepEqual(JSON.parse(h.requests[1].body),{title:'Synthetic title',description:'Synthetic description',tags:'synthetic, fixture',lang:'es'});
  assert.equal(h.alert(),undefined);assert.match(h.text(),/Synthetic advice/);await h.click();assert.notEqual(key(h.requests[1]),key(h.requests[2]));
 });
 for(const [name,data] of [
  ['missing result',{}],['missing baseline',{prediction}],['invalid view range',{...response,prediction:{...prediction,estimatedViews:{low:300,mid:100,high:200}}}],
  ['invalid score',{...response,prediction:{...prediction,titleScore:101}}],['invalid lists',{...response,prediction:{...prediction,strengths:null}}],['invalid baseline',{...response,baseline:{...baseline,videoCount:0}}],
 ]) await test(name+' cannot finish the retry interaction',async()=>{
  const h=create();h.state.send=async()=>({ok:true,json:async()=>data});await h.click();assert.ok(h.alert());
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));assert.match(h.text(),/Synthetic advice/);
 });
 await test('malformed JSON retains key without leaking server messages',async()=>{
  const h=create();h.state.send=async()=>({ok:true,json:async()=>{throw Error('Private response details');}});await h.click();assert.ok(h.alert());assert.doesNotMatch(h.text(),/Private response details/);
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));
 });
 for(const [code,extra,message] of [['pro_required',{},/Plan Pro requerido/],['youtube_not_connected',{},/Conecta tu canal/],['not_enough_videos',{videoCount:2},/tienes 2/],['private-error',{},/No se pudo recuperar/]])await test('HTTP error '+code+' is explicit and retains key',async()=>{
  const h=create();h.state.send=async()=>({ok:false,json:async()=>({error:code,...extra})});await h.click();assert.ok(h.alert());assert.match(h.text(),message);assert.doesNotMatch(h.text(),/private-error/);
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));
 });
 await test('two clicks in one render share one request',async()=>{
  const h=create();let release;h.state.send=()=>new Promise(resolve=>{release=resolve;});const click=h.handler(),a=click(),b=click();await Promise.resolve();assert.equal(h.requests.length,1);release(await success());await Promise.all([a,b]);assert.match(h.text(),/Synthetic advice/);
 });
 for(const name of ['title','description','tags'])await test('changing '+name+' ignores old response and requires discard before a separate fresh identity',async()=>{
  const h=create();let release;h.state.send=()=>new Promise(resolve=>{release=resolve;});const old=h.click();await Promise.resolve();h.setField(name,'Changed '+name);release(await success());await old;
  assert.doesNotMatch(h.text(),/Synthetic advice/);h.state.send=success;await h.click();assert.equal(h.requests.length,1);
  h.discard();await h.click();assert.notEqual(key(h.requests[0]),key(h.requests[1]));
 });
 for(const property of ['user','lang'])await test('changing '+property+' rejects late response from previous interaction',async()=>{
  const h=create();let release;h.state.send=()=>new Promise(resolve=>{release=resolve;});const old=h.click();await Promise.resolve();h.state[property]=property==='user'?'fixture-two':'en';h.render();h.setField('title','New scope title');h.state.send=success;await h.click();
  release({ok:true,json:async()=>({...response,prediction:{...prediction,suggestion:'Old account or language advice'}})});await old;assert.notEqual(key(h.requests[0]),key(h.requests[1]));assert.doesNotMatch(h.text(),/Old account or language advice/);
 });
 for(const stage of ['fetch','json'])await test('90s deadline closes '+stage+' that ignores abort; retry remains retained-only and late result cannot overwrite',async()=>{
  const h=create();let release;
  h.state.send=()=>stage==='fetch'?new Promise(resolve=>{release=resolve;}):Promise.resolve({ok:true,json:()=>new Promise(resolve=>{release=resolve;})});
  const pending=h.click();await flush();h.advance(90000);await pending;
  assert.ok(h.alert());assert.match(h.text(),/90 segundos/);assert.equal(h.timers.size,0);assert.equal(h.requests[0].signal.aborted,true);
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));assert.equal(h.requests[1].headers['X-Predictor-Recovery'],'retained-only-v1');
  release(stage==='fetch'?{ok:true,json:async()=>({...response,prediction:{...prediction,suggestion:'Obsolete late result'}})}:{...response,prediction:{...prediction,suggestion:'Obsolete late result'}});
  await flush();assert.match(h.text(),/Synthetic advice/);assert.doesNotMatch(h.text(),/Obsolete late result/);
 });
 for(const property of ['email','status'])await test('changing '+property+' closes old waiting scope and blocks its captured handler',async()=>{
  const h=create();h.state.send=()=>new Promise(()=>{});const old=h.handler(),pending=old();await flush();h.state[property]=property==='email'?'another@example.invalid':'unauthenticated';h.render();await pending;
  assert.equal(h.requests[0].signal.aborted,true);assert.equal(h.timers.size,0);await old();assert.equal(h.requests.length,1);assert.equal(h.alert(),undefined);
 });
 await test('captured handler cannot submit older fields under current draft',async()=>{
  const h=create(),old=h.handler();h.setField('title','New draft');await old();assert.equal(h.requests.length,0);await h.click();assert.equal(h.requests.length,1);
 });
 await test('captured successful handler cannot start another generation after confirmation',async()=>{
  const h=create(),old=h.handler();await old();await old();assert.equal(h.requests.length,1);await h.click();assert.equal(h.requests.length,2);
 });
 await test('captured discard cannot erase a newer uncertain interaction',async()=>{
  const h=create();h.state.send=async()=>{throw Error('Unconfirmed');};await h.click();const old=h.discardHandler();old();await h.click();const latest=key(h.requests[1]);old();
  h.state.send=success;await h.click();assert.equal(key(h.requests[2]),latest);assert.equal(h.requests[2].headers['X-Predictor-Recovery'],'retained-only-v1');
 });
 await test('discard is explicit, cannot interrupt a flight and makes a separate fresh identity after failure',async()=>{
  const h=create();h.state.send=async()=>{throw Error('Unconfirmed');};await h.click();const discard=h.discardHandler();
  h.state.send=()=>new Promise(()=>{});const pending=h.click();await flush();discard();h.advance(90000);await pending;
  h.discard();assert.equal(h.alert(),undefined);h.state.send=success;await h.click();assert.notEqual(key(h.requests[0]),key(h.requests[2]));assert.equal(h.requests[2].headers['X-Predictor-Recovery'],undefined);
 });
 await test('unmount ends local wait even when transport ignores abort; late handler cannot dispatch',async()=>{
  const h=create();h.state.send=()=>new Promise(()=>{});const old=h.handler(),pending=old();await flush();h.unmount();await pending;assert.equal(h.timers.size,0);await old();assert.equal(h.requests.length,1);
 });
 for(const changed of [{user:'fixture-two'},{email:'another@example.invalid'},{lang:'en'},{status:'unauthenticated'},{status:'loading'}])await test('pending reload is isolated from scope '+JSON.stringify(changed),async()=>{
  const original=create();original.state.send=async()=>{throw Error('Lost');};await original.click();original.unmount();
  const next=harness({storage:original.storage,state:changed});next.render();assert.equal(next.requests.length,0);assert.equal(next.alert(),undefined);assert.doesNotMatch(next.text(),/Synthetic title/);assert.equal(next.storage.size,1);
  if(!changed.status){next.setField('title','Explicit new scope input');await next.click();assert.equal(next.requests[0].headers['X-Predictor-Recovery'],undefined);assert.notEqual(key(next.requests[0]),key(original.requests[0]));assert.equal(next.storage.size,1);}
 });
 await test('scope transition clears unsent fields rather than displaying or submitting old-account drafts',async()=>{
  const h=create();h.setField('description','Old private draft');const old=h.handler();h.state.email='another@example.invalid';h.render();await old();await h.click();assert.equal(h.requests.length,0);assert.doesNotMatch(h.text(),/Old private draft/);
 });
 await test('malformed, oversized or noncanonical stored selectors never restore fields or dispatch HTTP',async()=>{
  const slot='ytv:predictor:pending:v1:'+JSON.stringify(['fixture-one','fixture-one@example.invalid','es']);
  const body=JSON.stringify({title:'Synthetic',description:'',tags:'',lang:'es'}),valid={version:1,key:'synthetic-key',body};
  for(const raw of ['broken','null','[]','x'.repeat(32769),JSON.stringify({...valid,version:2}),JSON.stringify({...valid,key:'invalid key'}),JSON.stringify({...valid,authority:true}),JSON.stringify({...valid,body:JSON.stringify({title:'Synthetic',description:'',tags:'',lang:'en'})}),JSON.stringify({...valid,body:JSON.stringify({title:' Synthetic ',description:'',tags:'',lang:'es'})}),JSON.stringify({...valid,body:JSON.stringify({title:7,description:'',tags:'',lang:'es'})})]){
   const h=harness({storage:new Map([[slot,raw]])});h.render();assert.equal(h.alert(),undefined);assert.equal(h.requests.length,0);await h.click();assert.equal(h.requests.length,0);
  }
 });
 await test('forged valid selector is only an explicit retained lookup, never admission',async()=>{
  const slot='ytv:predictor:pending:v1:'+JSON.stringify(['fixture-one','fixture-one@example.invalid','es']);
  const body=JSON.stringify({title:'Synthetic',description:'',tags:'',lang:'es'}),h=harness({storage:new Map([[slot,JSON.stringify({version:1,key:'forged-selector',body})]])});
  h.render();assert.equal(h.requests.length,0);h.state.send=async()=>({ok:false,json:async()=>({error:'prediction_unconfirmed'})});await h.click();assert.equal(h.requests[0].headers['X-Predictor-Recovery'],'retained-only-v1');assert.equal(key(h.requests[0]),'forged-selector');assert.ok(h.alert());assert.equal(h.storage.size,1);
 });
 for(const problem of ['storageReadFails','storageWriteFails'])await test(problem+' keeps exact in-memory retry and warns about reload',async()=>{
  const h=create();h.state[problem]=true;h.state.send=async()=>{throw Error('Lost');};await h.click();assert.match(h.text(),/Tras recargar/);assert.equal(h.storage.size,problem==='storageWriteFails'?0:1);
  h.state.send=success;await h.click();assert.equal(key(h.requests[0]),key(h.requests[1]));assert.equal(h.requests[1].body,h.requests[0].body);assert.equal(h.requests[1].headers['X-Predictor-Recovery'],'retained-only-v1');
 });
 await test('oversized input retains complete memory request without truncating a stored selector',async()=>{
  const h=create();h.setField('description','x'.repeat(33000));h.state.send=async()=>{throw Error('Lost');};await h.click();assert.equal(h.storage.size,0);assert.match(h.text(),/Tras recargar/);
  h.state.send=success;await h.click();assert.equal(h.requests[1].body,h.requests[0].body);assert.equal(JSON.parse(h.requests[1].body).description.length,33000);
 });
 await test('discard clears only its exact stored selector; another pending selection is preserved',async()=>{
  const h=create();h.state.send=async()=>{throw Error('Lost');};await h.click();const [slot,raw]=[...h.storage][0],value=JSON.parse(raw);
  h.storage.set(slot,JSON.stringify({...value,key:'another-selection'}));h.discard();assert.equal(JSON.parse(h.storage.get(slot)).key,'another-selection');assert.match(h.text(),/reaparecer/);
 });
 await test('successful confirmation with storage removal blocked warns and never automatically resubmits on reload',async()=>{
  const h=create();h.state.storageRemoveFails=true;await h.click();assert.match(h.text(),/reaparecer/);assert.equal(h.storage.size,1);h.unmount();
  const reload=harness({storage:h.storage});reload.render();assert.equal(reload.requests.length,0);await reload.click();assert.equal(reload.requests[0].headers['X-Predictor-Recovery'],'retained-only-v1');assert.equal(reload.storage.size,0);
 });
 console.log(JSON.stringify({scope:'actual Predictor component; synthetic hooks and HTTP; no network or models',results},null,2));
}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
module.exports={harness,prediction,baseline,response,success};
if(require.main===module){const watchdog=setTimeout(()=>{console.error('FAIL: Predictor contracts did not finish');process.exit(1);},10000);main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));}
