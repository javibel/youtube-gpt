'use strict';
const { isDeepStrictEqual } = require('node:util');
let fixtures = null;
const fail = reason => { throw new Error('ISOLATION_BLOCKED: ' + reason); };
// Only the test driver installs fixtures, after validating its local configuration.
// No test filesystem/configuration reader is reachable from application imports.
function installFixtures(paymentFixtures) {
  fixtures = null;
  if (!Array.isArray(paymentFixtures)) fail('payment fixtures must be an array');
  fixtures = structuredClone(paymentFixtures);
}
function invoke(operation, args) {
  if (!fixtures) fail('payment runtime has not been configured');
  const fixture = fixtures.find(item => item.operation === operation && isDeepStrictEqual(item.args, args));
  if (!fixture) fail('payment operation has no explicit fixture');
  if (fixture.error) throw new Error(fixture.error);
  const result = structuredClone(fixture.result);
  // A simulated checkout or portal must never redirect to a real service.
  if (['checkout.sessions.create', 'billingPortal.sessions.create'].includes(operation)) {
    if (!result?.url || new URL(result.url).hostname !== 'example.invalid') fail('payment redirect must use example.invalid');
  }
  return result;
}
const method = operation => async (...args) => invoke(operation, args);
const stripe = Object.freeze({
  customers: Object.freeze({ create: method('customers.create'), retrieve: method('customers.retrieve'), list: method('customers.list') }),
  subscriptions: Object.freeze({ retrieve: method('subscriptions.retrieve'), list: method('subscriptions.list'), update: method('subscriptions.update'), cancel: method('subscriptions.cancel') }),
  checkout: Object.freeze({ sessions: Object.freeze({ create: method('checkout.sessions.create') }) }),
  billingPortal: Object.freeze({ sessions: Object.freeze({ create: method('billingPortal.sessions.create') }) }),
  invoices: Object.freeze({ list: method('invoices.list') }),
  // No fabricated signature verification: webhook ingestion stays closed.
  webhooks: Object.freeze({ constructEvent() { fail('webhook ingestion is disabled in offline migration'); } }),
});
module.exports = { stripe, installFixtures, reset() { fixtures = null; } };
