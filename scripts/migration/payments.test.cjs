'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const repo = path.resolve(__dirname, '../..');
const root = path.dirname(repo);
const config = JSON.parse(fs.readFileSync(path.join(root, 'migration-config.json'), 'utf8'));
const context = {root, operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent']};
const originalLoad = Module._load;
const originalFetch = global.fetch;
let externalAttempts = 0;
Module._load = function(name, ...args) {
  if (['stripe','http','https','net','tls','child_process','node:http','node:https','node:net','node:tls','node:child_process'].includes(name)) { externalAttempts++; throw Error('External dependency forbidden'); }
  return originalLoad.call(this, name, ...args);
};
global.fetch = () => { externalAttempts++; throw Error('Network forbidden'); };
const runtime = require('./payment-fixtures.cjs');
// Execute the actual TS entry in memory, without Next startup or generated files.
const entryPath = path.join(repo, 'lib/stripe.ts');
const compiled = ts.transpileModule(fs.readFileSync(entryPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const entry = new Module(entryPath, module);
entry.filename = entryPath;
entry.paths = Module._nodeModulePaths(path.dirname(entryPath));
entry._compile(compiled, entryPath);
const { stripe, createBillingPortalUrl } = entry.exports;
const results = [];
async function test(name, fn) { runtime.reset(); await fn(); results.push({name,result:'PASS'}); }
function configure(paymentFixtures=[]) { runtime.configureOffline({config, context, paymentFixtures}); }
(async () => { try {
  await test('actual Stripe entry imports without SDK or credentials', () => assert.equal(externalAttempts, 0));
  await test('unconfigured payment is blocked', () => assert.rejects(stripe.customers.create({}), /ISOLATION_BLOCKED/));
  await test('unknown payment is blocked', () => { configure(); return assert.rejects(stripe.subscriptions.cancel('synthetic'), /no explicit fixture/); });
  await test('payment arguments must match exactly', () => { configure([{operation:'customers.create',args:[{email:'synthetic@example.invalid'}],result:{id:'synthetic'}}]); return assert.rejects(stripe.customers.create({email:'other@example.invalid'}), /no explicit fixture/); });
  await test('explicit checkout returns only synthetic redirect', async () => { configure([{operation:'checkout.sessions.create',args:[{}],result:{id:'synthetic',url:'https://example.invalid/checkout'}}]); assert.equal((await stripe.checkout.sessions.create({})).url,'https://example.invalid/checkout'); });
  await test('checkout cannot redirect to real Stripe', () => { configure([{operation:'checkout.sessions.create',args:[{}],result:{url:'https://checkout.stripe.com/test'}}]); return assert.rejects(stripe.checkout.sessions.create({}), /example.invalid/); });
  await test('actual billing portal helper uses fixture', async () => { configure([{operation:'billingPortal.sessions.create',args:[{customer:'synthetic',return_url:'https://example.invalid/profile'}],result:{url:'https://example.invalid/portal'}}]); assert.equal(await createBillingPortalUrl('synthetic','https://example.invalid/profile'),'https://example.invalid/portal'); });
  await test('returned data cannot mutate fixtures', async () => { configure([{operation:'customers.retrieve',args:['synthetic'],result:{id:'synthetic'}}]); (await stripe.customers.retrieve('synthetic')).id='changed'; assert.equal((await stripe.customers.retrieve('synthetic')).id,'synthetic'); });
  await test('invalid reconfiguration clears previous context', async () => { configure(); assert.throws(() => runtime.configureOffline({config:{...config,mode:'production'},context}), /ISOLATION_BLOCKED/); await assert.rejects(stripe.customers.list({}), /not been configured/); });
  await test('webhooks cannot accept fabricated signatures', () => { configure(); assert.throws(() => stripe.webhooks.constructEvent('{}','fake','fake'), /webhook ingestion is disabled/); });
  await test('no external payment effects attempted', () => assert.equal(externalAttempts,0));
} finally { runtime.reset(); Module._load=originalLoad; global.fetch=originalFetch; }
console.log(JSON.stringify(results,null,2));
})().catch(error => { console.error(error); process.exitCode=1; });
