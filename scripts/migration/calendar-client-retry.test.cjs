'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const { createRetryOperation } = require('../../lib/ai/retry-operation.cjs');
const source = fs.readFileSync(path.join(__dirname, '../../app/calendar/page.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
 module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
// Render the actual component with deterministic hook state and bounded synthetic HTTP.
function harness() {
 const cells = [], effects = [], requests = []; let index = 0, dirty = false, number = 0;
 const state = { user: 'fixture-one', lang: 'es', send: async () => ({ suggestions: [] }) };
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
   if (url.startsWith('/api/calendar?')) return { ok: true, json: async () => ({ entries: [] }) };
   assert.equal(url, '/api/calendar/suggest'); assert.equal(init.method, 'POST');
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
 const handler = () => nodes(render()).find(n => n.type === 'button' && n.props.onClick?.name === 'fetchSuggestions').props.onClick;
 const click = () => handler()();
 const text = value => Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
 return { state, requests, click, handler, render, alert: () => nodes(render()).find(n => n.props?.role === 'alert'), text: () => text(render()) };
}
const suggestion = { title: 'Synthetic topic', date: '2026-10-08', hour: 0, reason: 'Synthetic reason', description: 'Synthetic outline' };
const success = async () => ({ ok: true, json: async () => ({ suggestions: [suggestion] }) });
const key = request => request.headers['Idempotency-Key'];
const results = [];
async function test(name, run) { await run(); results.push({ name, status: 'PASS' }); }
(async () => {
 await test('lost HTTP response retains identity and exposes a retry instead of an empty result', async () => {
  const h = harness(); h.state.send = async () => { throw Error('Response lost'); }; await h.click();
  assert.ok(h.alert()); assert.match(h.text(), /Reintentar sugerencias/); assert.doesNotMatch(h.text(), /No hay sugerencias disponibles/);
  h.state.send = success; await h.click(); assert.equal(key(h.requests[0]), key(h.requests[1]));
  assert.equal(h.requests[0].body, h.requests[1].body); assert.equal(h.requests[0].body, '{"lang":"es"}');
  assert.equal(h.alert(), undefined); assert.match(h.text(), /Synthetic topic/);
  await h.click(); assert.notEqual(key(h.requests[1]), key(h.requests[2]));
 });
 for (const [name, response] of [
  ['failed HTTP', { ok: false }], ['malformed JSON', { ok: true, json: async () => { throw Error('Broken JSON'); } }],
  ['missing suggestions', { ok: true, json: async () => ({}) }],
  ['invalid suggestion fields', { ok: true, json: async () => ({ suggestions: [{ ...suggestion, hour: 24 }] }) }],
 ]) await test(name + ' keeps the same retry identity', async () => {
  const h = harness(); h.state.send = async () => response; await h.click(); assert.ok(h.alert());
  h.state.send = success; await h.click(); assert.equal(key(h.requests[0]), key(h.requests[1]));
 });
 await test('rapid duplicate clicks share one request', async () => {
  const h = harness(); let release; h.state.send = () => new Promise(resolve => { release = resolve; });
  const action = h.handler(); const first = action(); const second = action();
  await Promise.resolve(); assert.equal(h.requests.length, 1); release(await success()); await Promise.all([first, second]);
  assert.match(h.text(), /Synthetic topic/);
 });
 await test('language change creates a new identity and ignores the old delayed result', async () => {
  const h = harness(); let release; h.state.send = () => new Promise(resolve => { release = resolve; });
  const old = h.click(); await Promise.resolve(); h.state.lang = 'en'; h.render(); h.state.send = success;
  await h.click(); release({ ok: true, json: async () => ({ suggestions: [{ ...suggestion, title: 'Old Spanish result' }] }) }); await old;
  assert.notEqual(key(h.requests[0]), key(h.requests[1])); assert.equal(h.requests[1].body, '{"lang":"en"}');
  assert.doesNotMatch(h.text(), /Old Spanish result/); assert.match(h.text(), /Synthetic topic/);
 });
 await test('account change discards pending identity and late suggestions', async () => {
  const h = harness(); let release; h.state.send = () => new Promise(resolve => { release = resolve; });
  const old = h.click(); await Promise.resolve(); h.state.user = 'fixture-two'; h.render(); h.state.send = success;
  await h.click(); release({ ok: true, json: async () => ({ suggestions: [{ ...suggestion, title: 'Other account result' }] }) }); await old;
  assert.notEqual(key(h.requests[0]), key(h.requests[1])); assert.doesNotMatch(h.text(), /Other account result/);
 });
 await test('valid empty result finishes the interaction without a failure alert', async () => {
  const h = harness(); h.state.send = async () => ({ ok: true, json: async () => ({ suggestions: [] }) });
  await h.click(); await h.click(); assert.equal(h.alert(), undefined); assert.notEqual(key(h.requests[0]), key(h.requests[1]));
 });
 console.log(JSON.stringify({ scope: 'actual calendar component, synthetic hooks/HTTP; no network, models or calendar writes', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
