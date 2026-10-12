'use strict';
const origin = 'http://127.0.0.1:4300';
const alias = 'http://localhost:4300';

function fixtureAuthRedirect(input) {
  if (input.baseUrl !== origin && input.baseUrl !== alias)
    throw Error('ISOLATION_BLOCKED: unexpected fixture auth origin');
  if (typeof input.url !== 'string') return origin;
  let target;
  try { target = new URL(input.url, input.baseUrl); }
  catch { return origin; }
  if ((target.origin !== origin && target.origin !== alias) || target.username || target.password)
    return origin;
  target.hostname = '127.0.0.1';
  return target.href;
}

module.exports = { fixtureAuthRedirect };
