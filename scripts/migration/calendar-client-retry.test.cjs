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
function harness(storage = new Map()) {
 const cells = [], effects = [], requests = [], listRequests = [], writeRequests = [], timers = new Map(); let index = 0, dirty = false, number = 0, timerId = 0;
 const state = { user: 'fixture-one', email: 'fixture@example.invalid', auth: 'authenticated', lang: 'es', send: async () => ({ suggestions: [] }), list: async () => ({ ok: true, json: async () => ({ entries: [] }) }) };
 const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
 const hooks = {
  useState(initial) { const i = index++; if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial };
   return [cells[i].value, value => { const next = typeof value === 'function' ? value(cells[i].value) : value;
    if (!Object.is(next, cells[i].value)) { cells[i].value = next; dirty = true; } }]; },
  useRef(value) { const i = index++; return cells[i] ??= { current: value }; },
  useMemo(make, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) cells[i] = { value: make(), deps }; return cells[i].value; },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
  useEffect(fn, deps) { const i = index++; if (!cells[i] || changed(cells[i].deps, deps)) {
   const previous = cells[i]; cells[i] = { deps };
   effects.push(() => { previous?.cleanup?.(); cells[i].cleanup = fn(); }); } },
 };
 const jsx = (type, props) => ({ type, props });
 const entry = { exports: {} };
 const mocks = {
  react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  'next-auth/react': { useSession: () => ({ data: state.user ? { user: { id: state.user, email: state.email } } : null, status: state.auth }) },
  '@/components/LangProvider': { useLang: () => state.lang },
  '@/components/DashboardShell': { default: 'shell' }, '@/components/ToolLoginGate': { default: 'login' },
  '@/lib/ai/retry-operation.cjs': { createRetryOperation },
 };
 vm.runInNewContext(compiled, { module: entry, exports: entry.exports,
  require(name) { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
  sessionStorage: { getItem: k => { if (state.storageDenied) throw Error('Storage denied'); return storage.get(k) ?? null; },
   setItem: (k, v) => { if (state.storageDenied) throw Error('Storage denied'); storage.set(k, v); }, removeItem: k => storage.delete(k) },
  crypto: { randomUUID: () => state.key ?? `calendar-fixture-${++number}` },
  fetch: async (url, init) => {
   if (url.startsWith('/api/calendar?') && (!init?.method || init.method === 'GET')) { listRequests.push({ url, ...init, owner: state.user }); return state.list(url, init); }
   if (url === '/api/calendar' || url.startsWith('/api/calendar?id=')) { writeRequests.push({ url, ...init, owner: state.user }); return state.write(url, init); }
   assert.equal(url, '/api/calendar/suggest'); assert.equal(init.method, 'POST');
   requests.push({ ...init, owner: state.user });
   return state.send(init);
  }, Date, console, AbortController,
  setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
  clearTimeout: id => timers.delete(id),
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
 const discardHandler = () => nodes(render()).find(n => n.props.onClick?.name === 'discardSuggestions')?.props.onClick;
 const discard = () => discardHandler()?.();
 return { state, requests, listRequests, writeRequests, storage, timers, nodes: () => nodes(render()), button: name => nodes(render()).find(n => n.props.onClick?.name === name)?.props.onClick,
  open: () => nodes(render()).find(n => n.type === 'div' && n.props.className?.includes('min-h-[100px]') && n.props.onClick).props.onClick(),
  field: (name, value) => nodes(render()).find(n => name === 'title' ? n.type === 'input' && n.props.maxLength === 200
   : name === 'date' ? n.type === 'input' && n.props.type === 'date' : name === 'status' ? n.type === 'select' : n.type === 'textarea').props.onChange({ target: { value } }),
  edit: title => nodes(render()).find(n => n.props.title === title && n.props.onClick).props.onClick({ stopPropagation() {} }),
  advance: ms => { for (const [id, timer] of [...timers]) if (timer.ms <= ms) { timers.delete(id); timer.fn(); } },
  click, handler, discard, discardHandler, render, unmount: () => cells.forEach(cell => cell?.cleanup?.()),
  alert: () => nodes(render()).find(n => n.props?.role === 'alert'), text: () => text(render()) };
}
const suggestion = { title: 'Synthetic topic', date: '2026-10-08', hour: 0, reason: 'Synthetic reason', description: 'Synthetic outline' };
const success = async () => ({ ok: true, json: async () => ({ suggestions: [suggestion] }) });
const key = request => request.headers['Idempotency-Key'];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const writeSuccess = h => async (_url, init) => ({ ok: true, json: async () => init.method === 'DELETE' ? { ok: true }
 : { entry: { ...JSON.parse(init.body), id: JSON.parse(init.body).id || 'synthetic-created', userId: h.state.user, color: null,
  description: JSON.parse(init.body).description?.trim() || null } } });
async function draft(h, title = 'Synthetic draft') { h.render(); await flush(); h.open(); h.field('title', title); }
const results = [];
async function test(name, run) { await run(); results.push({ name, status: 'PASS' }); }
if (require.main === module) (async () => {
 await test('lost HTTP response retains identity and exposes a retry instead of an empty result', async () => {
  const h = harness(); h.state.send = async () => { throw Error('Response lost'); }; await h.click();
  assert.ok(h.alert()); assert.match(h.text(), /Reintentar sugerencias/); assert.doesNotMatch(h.text(), /No hay sugerencias disponibles/);
  h.state.send = success; await h.click(); assert.equal(key(h.requests[0]), key(h.requests[1]));
  assert.equal(h.requests[0].body, h.requests[1].body); assert.equal(h.requests[0].body, '{"lang":"es"}');
  assert.equal(h.requests[0].headers['X-Calendar-Recovery'], undefined);
  assert.equal(h.requests[1].headers['X-Calendar-Recovery'], 'retained-only-v1');
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
 await test('missing retained result stays blocked until explicit discard starts a new operation', async () => {
  const h = harness(); h.state.send = async () => ({ ok: false, status: 503 });
  await h.click(); await h.click(); await h.click();
  assert.equal(new Set(h.requests.map(key)).size, 1);
  assert.equal(h.requests[2].headers['X-Calendar-Recovery'], 'retained-only-v1');
  assert.match(h.text(), /no cancela.*créditos/);
  const before = h.requests.length; h.discard(); assert.equal(h.requests.length, before);
  h.state.send = success; await h.click(); assert.notEqual(key(h.requests[2]), key(h.requests[3]));
  assert.equal(h.requests[3].headers['X-Calendar-Recovery'], undefined);
 });
 await test('discard captured before retry cannot replace an operation while its HTTP is pending', async () => {
  const h = harness(); h.state.send = async () => ({ ok: false }); await h.click();
  let release; h.state.send = () => new Promise(resolve => { release = resolve; });
  const retry = h.handler(), discard = h.discardHandler(); const pending = retry(); discard();
  await Promise.resolve(); assert.equal(h.requests.length, 2); release({ ok: false }); await pending;
  h.state.send = success; await h.click(); assert.equal(key(h.requests[0]), key(h.requests[2]));
 });
 for (const [name, change] of [['email', h => { h.state.email = 'other@example.invalid'; }],
  ['logout', h => { h.state.auth = 'unauthenticated'; h.state.user = null; }],
  ['loading authentication', h => { h.state.auth = 'loading'; }]]) await test(name + ' ignores stale handler and delayed result', async () => {
  const h = harness(); let release; h.state.send = () => new Promise(resolve => { release = resolve; });
  const oldHandler = h.handler(); const old = oldHandler(); await Promise.resolve(); change(h); h.render();
  await oldHandler(); assert.equal(h.requests.length, 1);
  release(await success()); await old; assert.doesNotMatch(h.text(), /Synthetic topic/);
 });
 await test('unmounted account scope rejects captured handlers without another HTTP', async () => {
  const h = harness(); const action = h.handler(); h.unmount(); await action(); assert.equal(h.requests.length, 0);
 });
 await test('context conflict remains explicit and never starts a fresh retry automatically', async () => {
  const h = harness(); h.state.send = async () => ({ ok: false, status: 409 }); await h.click(); await h.click();
  assert.ok(h.alert()); assert.equal(key(h.requests[0]), key(h.requests[1]));
  assert.equal(h.requests[1].headers['X-Calendar-Recovery'], 'retained-only-v1');
 });
 for (const stage of ['fetch', 'json']) await test(stage + ' ignoring abort stops local wait at90s and retains original retry identity', async () => {
  const h = harness(); let release;
  const held = new Promise(resolve => { release = resolve; });
  h.state.send = stage === 'fetch' ? () => held : async () => ({ ok: true, json: () => held });
  const first = h.click(); await flush(); h.advance(90000); await flush();
  assert.ok(h.alert(), 'UI must finish even when transport ignores AbortSignal');
  assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.timers.size, 0); await first;
  h.state.send = success; await h.click(); assert.equal(key(h.requests[0]), key(h.requests[1]));
  assert.equal(h.requests[1].headers['X-Calendar-Recovery'], 'retained-only-v1');
  assert.equal(h.alert(), undefined); assert.match(h.text(), /Synthetic topic/);
  const old = { suggestions: [{ ...suggestion, title: 'Stale timed out result' }] };
  release(stage === 'fetch' ? { ok: true, json: async () => old } : old); await flush();
  assert.doesNotMatch(h.text(), /Stale timed out result/); assert.equal(h.requests.length, 2);
 });
 await test('account cleanup before transport microtask does not send the old request', async () => {
  const h = harness(); const first = h.click(); h.state.user = 'fixture-two'; h.render(); await first;
  assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0);
 });
 await test('account change closes a never-resolving original wait without affecting the new request', async () => {
  const h = harness(); h.state.send = () => new Promise(() => {}); const first = h.click(); await flush();
  h.state.user = 'fixture-two'; h.render(); await flush();
  assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.timers.size, 0); await first;
  h.state.send = success; await h.click(); assert.notEqual(key(h.requests[0]), key(h.requests[1]));
  assert.equal(h.requests[1].headers['X-Calendar-Recovery'], undefined); assert.match(h.text(), /Synthetic topic/);
 });
 await test('unmount closes a never-resolving original wait and clears its deadline', async () => {
  const h = harness(); h.state.send = () => new Promise(() => {}); const first = h.click(); await flush();
  h.unmount(); await flush(); assert.equal(h.requests[0].signal.aborted, true); assert.equal(h.timers.size, 0); await first;
 });
 await test('successful and failed HTTP clear their owned deadlines', async () => {
  const h = harness(); h.state.send = success; await h.click(); assert.equal(h.timers.size, 0);
  h.state.send = async () => ({ ok: false }); await h.click(); assert.equal(h.timers.size, 0);
 });
 await test('reload restores a pending request without HTTP; explicit retry only reads its original identity', async () => {
  const first = harness(); first.state.key = 'calendar-original-reload'; first.state.send = async () => { throw Error('Lost response'); };
  await first.click(); first.unmount(); const next = harness(first.storage); next.render(); await flush();
  assert.ok(next.alert(), 'Reload must show the retained unconfirmed request'); assert.equal(next.requests.length, 0);
  next.state.send = success; await next.click(); assert.equal(key(next.requests[0]), key(first.requests[0]));
  assert.equal(next.requests[0].body, first.requests[0].body);
  assert.equal(next.requests[0].headers['X-Calendar-Recovery'], 'retained-only-v1'); assert.equal(next.storage.size, 0);
 });
 for (const [label, change] of [['account', h => { h.state.user = 'other'; }], ['email', h => { h.state.email = 'other@example.invalid'; }],
  ['language', h => { h.state.lang = 'en'; }], ['authentication', h => { h.state.auth = 'loading'; }]])
  await test(label + ' cannot restore another scope from the same storage', async () => {
   const first = harness(); first.state.send = async () => ({ ok: false }); await first.click();
   const next = harness(first.storage); change(next); next.render(); assert.equal(next.alert(), undefined); assert.equal(next.requests.length, 0);
  });
 await test('malformed, oversized and extra-field records never become retries', async () => {
  const slot = 'ytv:calendar:pending:v1:' + JSON.stringify(['fixture-one', 'fixture@example.invalid', 'es']);
  for (const record of ['{', 'x'.repeat(513), JSON.stringify({ version: 1, key: 'fabricated', lang: 'es', confirmed: true }),
   JSON.stringify({ version: 1, key: '../invalid', lang: 'es' })]) {
   const h = harness(new Map([[slot, record]])); h.render(); assert.equal(h.alert(), undefined); assert.equal(h.requests.length, 0);
  }
 });
 await test('denied storage keeps exact in-memory retry and warns about reload loss', async () => {
  const h = harness(); h.state.storageDenied = true; h.state.send = async () => ({ ok: false }); await h.click();
  assert.match(h.text(), /solo se conserva en memoria/); h.state.send = success; await h.click();
  assert.equal(key(h.requests[0]), key(h.requests[1])); assert.equal(h.requests[1].headers['X-Calendar-Recovery'], 'retained-only-v1');
  assert.doesNotMatch(h.text(), /solo se conserva en memoria/);
 });
 await test('restored missing receipt never switches to fresh admission; explicit discard clears its own selection', async () => {
  const h = harness(); h.state.send = async () => ({ ok: false }); await h.click(); const old = key(h.requests[0]);
  const next = harness(h.storage); next.state.key = 'calendar-new-after-discard'; next.state.send = async () => ({ ok: false, status: 409 });
  await next.click(); await next.click(); assert.equal(next.requests.every(r => key(r) === old && r.headers['X-Calendar-Recovery'] === 'retained-only-v1'), true);
  const before = next.requests.length; next.discard(); assert.equal(next.requests.length, before); assert.equal(next.storage.size, 0);
  next.state.send = success; await next.click(); assert.notEqual(key(next.requests[2]), old); assert.equal(next.requests[2].headers['X-Calendar-Recovery'], undefined);
 });
 await test('late confirmation does not erase a newer saved selection', async () => {
  const first = harness(); first.state.key = 'calendar-old-pending'; let release;
  first.state.send = () => new Promise(resolve => { release = resolve; }); const pending = first.click(); await flush();
  const slot = [...first.storage.keys()][0]; first.storage.set(slot, JSON.stringify({ version: 1, key: 'calendar-new-pending', lang: 'es' }));
  release(await success()); await pending; assert.equal(JSON.parse(first.storage.get(slot)).key, 'calendar-new-pending');
 });
 await test('late entries from a previous account never become the current calendar', async () => {
  const h = harness(); let release; h.state.list = () => new Promise(resolve => { release = resolve; }); h.render(); await flush();
  const old = h.listRequests[0]; h.state.user = 'other'; h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); h.render(); await flush();
  release({ ok: true, json: async () => ({ entries: [{ id: 'private-old', title: 'Private old account title', date: new URL('https://example.invalid' + old.url).searchParams.get('from'), description: null, status: 'idea', color: null }] }) });
  await flush(); assert.doesNotMatch(h.text(), /Private old account title/); assert.equal(h.listRequests.length, 2);
 });
 for (const [label, change] of [['email', h => { h.state.email = 'another@example.invalid'; }], ['language', h => { h.state.lang = 'en'; }],
  ['logout', h => { h.state.auth = 'unauthenticated'; }], ['authentication loading', h => { h.state.auth = 'loading'; }]])
  await test('calendar ' + label + ' closes the old read even when fetch ignores abort', async () => {
   const h = harness(); let release; h.state.list = () => new Promise(resolve => { release = resolve; }); h.render(); await flush();
   const old = h.listRequests[0]; change(h); h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); h.render(); await flush();
   assert.equal(old.signal.aborted, true); release({ ok: true, json: async () => ({ entries: [] }) }); await flush();
   assert.equal(h.timers.size, 0); assert.equal(h.listRequests.length, h.state.auth === 'authenticated' ? 2 : 1);
  });
 await test('new month read wins over a late failed read of the previous month', async () => {
  const h = harness(); let release; h.state.list = () => new Promise(resolve => { release = resolve; }); h.render(); await flush();
  const old = h.listRequests[0]; h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); h.button('nextMonth')(); h.render(); await flush();
  assert.equal(h.listRequests.length, 2); assert.notEqual(old.url, h.listRequests[1].url); assert.equal(old.signal.aborted, true);
  release({ ok: false }); await flush(); assert.equal(h.alert(), undefined);
 });
 for (const payload of [{}, { entries: {} }, { entries: [null] }, { entries: Array(201).fill(null) }])
  await test('invalid calendar response ' + JSON.stringify(payload).slice(0, 45) + ' exposes retry instead of an empty month', async () => {
   const h = harness(); h.state.list = async () => ({ ok: true, json: async () => payload }); h.render(); await flush();
   assert.ok(h.alert()); assert.match(h.text(), /Volver a consultar calendario/);
   const retry = h.nodes().find(n => n.type === 'button' && String(n.props.children).includes('Volver a consultar calendario')).props.onClick;
   h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); await retry(); await flush();
   assert.equal(h.alert(), undefined); assert.equal(h.listRequests.length, 2); assert.equal(h.listRequests[1].cache, 'no-store'); assert.equal(h.requests.length, 0);
  });
 await test('invalid entry fields, duplicate identities and entries outside the requested month are not displayed', async () => {
  for (const variant of ['status', 'description', 'duplicate', 'outside']) {
   const h = harness(); h.state.list = async url => { const date = new URL('https://example.invalid' + url).searchParams.get('from');
    const item = { id: 'entry', title: 'Unvalidated title', date, description: null, color: null, status: 'idea' };
    if (variant === 'status') item.status = 'invalid'; if (variant === 'description') item.description = 7;
    if (variant === 'outside') item.date = '1900-01-01';
    return { ok: true, json: async () => ({ entries: variant === 'duplicate' ? [item, item] : [item] }) }; };
   h.render(); await flush(); assert.ok(h.alert()); assert.doesNotMatch(h.text(), /Unvalidated title/);
  }
 });
 for (const stage of ['fetch', 'json']) await test('calendar ' + stage + ' ignoring abort finishes waiting at30s and can be read again', async () => {
  const h = harness(); let release; const held = new Promise(resolve => { release = resolve; });
  h.state.list = stage === 'fetch' ? () => held : async () => ({ ok: true, json: () => held }); h.render(); await flush();
  h.advance(30000); await flush(); assert.ok(h.alert()); assert.equal(h.listRequests[0].signal.aborted, true); assert.equal(h.timers.size, 0);
  const retry = h.nodes().find(n => n.type === 'button' && String(n.props.children).includes('Volver a consultar calendario')).props.onClick;
  h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); const first = retry(), duplicate = retry();
  await Promise.all([first, duplicate]); assert.equal(h.listRequests.length, 2); assert.equal(h.alert(), undefined);
  release(stage === 'fetch' ? { ok: false } : {}); await flush(); assert.equal(h.alert(), undefined);
 });
 await test('calendar unmount aborts and closes its original read without creating another request', async () => {
  const h = harness(); h.state.list = () => new Promise(() => {}); h.render(); await flush(); h.unmount(); await flush();
  assert.equal(h.listRequests[0].signal.aborted, true); assert.equal(h.timers.size, 0); assert.equal(h.listRequests.length, 1);
 });
 await test('captured calendar save cannot write its old draft under a changed account', async () => {
  const h = harness(); h.render(); await flush(); h.open(); h.field('title', 'Old account draft'); const save = h.button('saveEntry');
  h.state.user = 'another-account'; h.state.write = async () => ({ ok: true }); h.render(); await flush(); await save();
  assert.equal(h.writeRequests.length, 0, 'Old account handler must not issue a calendar write');
 });
 await test('only a matching create acknowledgement closes the draft and refreshes entries', async () => {
  const h = harness(); await draft(h); h.state.write = writeSuccess(h); await h.button('saveEntry')(); await flush();
  assert.equal(h.writeRequests.length, 1); assert.equal(h.writeRequests[0].method, 'POST'); assert.equal(h.button('saveEntry'), undefined);
  assert.equal(h.listRequests.length, 2); assert.equal(h.alert(), undefined);
 });
 for (const [label, response] of [['failed HTTP', { ok: false }], ['missing entry', { ok: true, json: async () => ({}) }],
  ['broken JSON', { ok: true, json: async () => { throw Error('Malformed'); } }]])
  await test(label + ' preserves the draft and requires an explicit new-operation decision', async () => {
   const h = harness(); await draft(h); h.state.write = async () => response; const save = h.button('saveEntry'); await save();
   assert.ok(h.alert()); assert.match(h.text(), /puede haberse aplicado/); assert.equal(h.nodes().find(n => n.type === 'input' && n.props.maxLength === 200).props.value, 'Synthetic draft');
   await save(); assert.equal(h.writeRequests.length, 1); assert.equal(h.listRequests.length, 1);
   h.button('discardUnconfirmedWrite')(); assert.equal(h.writeRequests.length, 1); h.state.write = writeSuccess(h); await h.button('saveEntry')();
   assert.equal(h.writeRequests.length, 2); assert.equal(h.alert(), undefined);
  });
 await test('wrong owner, identity or echoed fields cannot confirm create/update responses', async () => {
  for (const changed of [{ userId: 'another-user' }, { title: 'Wrong title' }, { date: '1900-01-01' }, { status: 'invalid' }]) {
   const h = harness(); await draft(h); h.state.write = async (url, init) => { const valid = await writeSuccess(h)(url, init); const data = await valid.json();
    return { ok: true, json: async () => ({ entry: { ...data.entry, ...changed } }) }; };
   await h.button('saveEntry')(); assert.ok(h.alert()); assert.ok(h.button('saveEntry')); assert.equal(h.listRequests.length, 1);
  }
 });
 await test('rapid duplicate save and captured close cannot replace an active draft or issue two writes', async () => {
  const h = harness(); await draft(h); let release; h.state.write = () => new Promise(resolve => { release = resolve; });
  const save = h.button('saveEntry'), close = h.button('closeModal'); const first = save(), second = save(); close(); h.field('title', 'Changed during flight');
  assert.equal(h.writeRequests.length, 1); assert.equal(JSON.parse(h.writeRequests[0].body).title, 'Synthetic draft');
  assert.equal(h.nodes().find(n => n.type === 'input' && n.props.maxLength === 200).props.value, 'Synthetic draft');
  release(await writeSuccess(h)(h.writeRequests[0].url, h.writeRequests[0])); await Promise.all([first, second]); assert.equal(h.alert(), undefined);
 });
 for (const [label, change] of [['account', h => { h.state.user = 'another-account'; }], ['email', h => { h.state.email = 'another@example.invalid'; }],
  ['language', h => { h.state.lang = 'en'; }], ['month', h => { h.button('nextMonth')(); }], ['logout', h => { h.state.auth = 'unauthenticated'; }]])
  await test('write ' + label + ' closes the old wait and rejects captured save/form handlers', async () => {
   const h = harness(); await draft(h, 'Old sensitive draft'); let release; h.state.write = () => new Promise(resolve => { release = resolve; });
   const save = h.button('saveEntry'), oldField = h.nodes().find(n => n.type === 'input' && n.props.maxLength === 200).props.onChange;
   const pending = save(); change(h); h.render(); await flush(); await pending; await save(); oldField({ target: { value: 'Late old draft' } });
   assert.equal(h.writeRequests.length, 1); assert.equal(h.writeRequests[0].signal.aborted, true); assert.doesNotMatch(h.text(), /Old sensitive draft|Late old draft/);
   release({ ok: true, json: async () => ({}) }); await flush(); assert.equal(h.alert(), undefined);
  });
 for (const stage of ['fetch', 'json']) await test('write ' + stage + ' ignoring abort stops at30s without replaying an uncertain write', async () => {
  const h = harness(); await draft(h); let release; const held = new Promise(resolve => { release = resolve; });
  h.state.write = stage === 'fetch' ? () => held : async () => ({ ok: true, json: () => held });
  const save = h.button('saveEntry'), pending = save(); await flush(); h.advance(30000); await flush(); await pending;
  assert.ok(h.alert()); assert.equal(h.timers.size, 0); await save(); assert.equal(h.writeRequests.length, 1);
  const old = { entry: {} }; release(stage === 'fetch' ? { ok: true, json: async () => old } : old); await flush(); assert.ok(h.alert());
 });
 await test('edit/delete confirmation and failed deletion preserve the selected entry', async () => {
  const h = harness(); const item = { id: 'entry', title: 'Owned entry', status: 'idea', description: null, color: null };
  h.state.list = async url => ({ ok: true, json: async () => ({ entries: [{ ...item, date: new URL('https://example.invalid' + url).searchParams.get('from') }] }) });
  h.render(); await flush(); h.edit(item.title); h.field('status', 'scheduled'); h.state.write = writeSuccess(h); await h.button('saveEntry')(); await flush();
  assert.equal(h.writeRequests[0].method, 'PUT'); assert.equal(JSON.parse(h.writeRequests[0].body).id, item.id);
  h.edit(item.title); h.state.write = async () => ({ ok: true, json: async () => ({}) }); await h.button('deleteEntry')();
  assert.ok(h.alert()); assert.ok(h.button('deleteEntry')); h.button('discardUnconfirmedWrite')(); h.state.write = writeSuccess(h); await h.button('deleteEntry')();
  assert.equal(h.writeRequests[2].method, 'DELETE'); assert.equal(h.writeRequests[2].url, '/api/calendar?id=entry'); assert.equal(h.button('deleteEntry'), undefined);
 });
 await test('adding a suggestion keeps it after an unconfirmed write and removes it only after exact confirmation', async () => {
  const h = harness(); h.state.send = success; await h.click(); const add = () => h.nodes().find(n => n.type === 'button' && n.props.children?.at?.(-1) === 'Añadir').props.onClick();
  h.state.write = async () => ({ ok: false }); await add(); assert.ok(h.alert()); assert.match(h.text(), /Synthetic topic/); await add(); assert.equal(h.writeRequests.length, 1);
  h.button('discardUnconfirmedWrite')(); h.state.write = writeSuccess(h); await add(); assert.doesNotMatch(h.text(), /Synthetic topic/); assert.equal(h.requests.length, 1);
 });
 await test('unmount closes its original active writer and never dispatches a captured second save', async () => {
  const h = harness(); await draft(h); h.state.write = () => new Promise(() => {}); const save = h.button('saveEntry'), pending = save();
  h.unmount(); await pending; await save(); assert.equal(h.writeRequests.length, 1); assert.equal(h.writeRequests[0].signal.aborted, true); assert.equal(h.timers.size, 0);
 });
 await test('confirmed or replaced modal invalidates captured save and field handlers without another write', async () => {
  const h = harness(); await draft(h, 'Original draft'); const save = h.button('saveEntry'), oldField = h.nodes().find(n => n.type === 'input' && n.props.maxLength === 200).props.onChange;
  h.state.write = writeSuccess(h); await save(); await save(); assert.equal(h.writeRequests.length, 1); await flush();
  h.open(); h.field('title', 'New draft'); oldField({ target: { value: 'Wrong old edit' } }); await save();
  assert.equal(h.writeRequests.length, 1); assert.equal(h.nodes().find(n => n.type === 'input' && n.props.maxLength === 200).props.value, 'New draft');
 });
 await test('confirmed suggestion addition invalidates its captured button without another calendar write', async () => {
  const h = harness(); h.state.send = success; await h.click(); const add = h.nodes().find(n => n.type === 'button' && n.props.children?.at?.(-1) === 'Añadir').props.onClick;
  h.state.write = writeSuccess(h); await add(); await add(); assert.equal(h.writeRequests.length, 1); assert.equal(h.requests.length, 1);
 });
 await test('confirmed write replaces an older active GET and its stale delivery cannot erase the refresh', async () => {
  const h = harness(); await draft(h); let oldRelease; h.state.list = () => new Promise(resolve => { oldRelease = resolve; });
  // A read retry is reached by a real failed list, while the pending draft stays open.
  h.state.write = async () => ({ ok: false }); await h.button('saveEntry')();
  const consult = h.nodes().find(n => n.type === 'button' && n.props.children === 'Consultar calendario').props.onClick;
  const oldRead = consult(); await flush(); const old = h.listRequests.at(-1);
  h.button('discardUnconfirmedWrite')(); h.state.list = async () => ({ ok: true, json: async () => ({ entries: [] }) }); h.state.write = writeSuccess(h);
  await h.button('saveEntry')(); await flush(); assert.equal(old.signal.aborted, true); await oldRead;
  oldRelease({ ok: false }); await flush(); assert.equal(h.alert(), undefined); assert.equal(h.listRequests.length, 3);
 });
 console.log(JSON.stringify({ scope: 'actual calendar component, synthetic hooks/HTTP; no network, models or operational calendar writes', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { harness, success, suggestion };
