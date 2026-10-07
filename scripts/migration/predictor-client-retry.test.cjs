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
function harness() {
 const cells = [], effects = [], requests = []; let index = 0, dirty = false, number = 0;
 const state = { user: 'fixture-one', lang: 'es', send: async () => success() };
 const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
 const hooks = {
  useState(initial) { const i = index++; if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial };
   return [cells[i].value, value => { const next = typeof value === 'function' ? value(cells[i].value) : value;
    if (!Object.is(next, cells[i].value)) { cells[i].value = next; dirty = true; } }]; },
  useRef(value) { const i = index++; return cells[i] ??= { current: value }; },
  useMemo(make, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) cells[i] = { value: make(), deps }; return cells[i].value; },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(fn, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) { cells[i] = { deps }; effects.push(fn); } },
 };
 const jsx = (type, props) => ({ type, props });
 const entry = { exports: {} };
 const mocks = {
  react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  'next-auth/react': { useSession: () => ({ data: { user: { id: state.user } }, status: 'authenticated' }) },
  '@/components/LangProvider': { useLang: () => state.lang },
  '@/components/DashboardShell': { default: 'shell' }, '@/components/ToolLoginGate': { default: 'login' },
  '@/lib/ai/retry-operation.cjs': { createRetryOperation },
 };
 vm.runInNewContext(compiled, { module: entry, exports: entry.exports,
  require(name) { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
  crypto: { randomUUID: () => `calendar-fixture-${++number}` },
  fetch: async (url, init) => {
   assert.equal(url, '/api/predictor'); assert.equal(init.method, 'POST');
   requests.push({ ...init, owner: state.user });
   return state.send(init);
  }, Date, console,
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
 return { state, requests, click, handler, render,
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
(async()=>{
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
 for(const name of ['title','description','tags'])await test('changing '+name+' ignores old response and starts another identity',async()=>{
  const h=create();let release;h.state.send=()=>new Promise(resolve=>{release=resolve;});const old=h.click();await Promise.resolve();h.setField(name,'Changed '+name);release(await success());await old;
  assert.doesNotMatch(h.text(),/Synthetic advice/);h.state.send=success;await h.click();assert.notEqual(key(h.requests[0]),key(h.requests[1]));
 });
 for(const property of ['user','lang'])await test('changing '+property+' rejects late response from previous interaction',async()=>{
  const h=create();let release;h.state.send=()=>new Promise(resolve=>{release=resolve;});const old=h.click();await Promise.resolve();h.state[property]=property==='user'?'fixture-two':'en';h.render();h.state.send=success;await h.click();
  release({ok:true,json:async()=>({...response,prediction:{...prediction,suggestion:'Old account or language advice'}})});await old;assert.notEqual(key(h.requests[0]),key(h.requests[1]));assert.doesNotMatch(h.text(),/Old account or language advice/);
 });
 console.log(JSON.stringify({scope:'actual Predictor component; synthetic hooks and HTTP; no network or models',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
