'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { load } = require('./route-harness.cjs');
const { deferred, flush } = require('./chat-widget-harness.cjs');
const { create, ready, analyze, defaults, writes, track, channelId } = require('./competitor-analysis-track.test.cjs');

module.exports = async (prisma, results) => {
  const users = [], harnesses = [];
  const newOwner = async () => { const u = await prisma.user.create({ data: { email: 'analysis-track-' + randomUUID() + '@example.invalid' } }); users.push(u.id); return u; };
  const plans = load('lib/plans.ts', { '@/lib/prisma': { prisma } });
  const google = async url => {
    assert(url.startsWith('https://www.googleapis.com/youtube/v3/channels?'));
    return { ok: true, status: 200, json: async () => ({ items: [{ id: new URL(url).searchParams.get('id'), snippet: { title: 'Native analysis addition', thumbnails: { default: { url: null } } }, statistics: { subscriberCount: '12', viewCount: '100', videoCount: '2' } }] }) };
  };
  const routeFor = (owner, db = prisma) => {
    const helper = load('lib/competitor-creation.ts', { 'node:crypto': require('node:crypto'), '@/lib/prisma': { prisma: db }, '@/lib/plans': plans }, { fetch: google });
    return load('app/api/youtube/competitors/route.ts', { 'next/server': { NextResponse: Response }, '@/auth': { auth: async () => ({ user: { id: owner.id } }) }, '@/lib/prisma': { prisma }, '@/lib/competitor-creation': helper, '@/lib/competitor-deletion': {} }, { process: { env: { YOUTUBE_API_KEY: 'synthetic' } } });
  };
  const page = (owner, storage) => { const h = create(storage ? { storage } : undefined); h.state.user = owner.id; h.state.email = owner.email; harnesses.push(h); return h; };
  const rows = owner => prisma.trackedCompetitor.findMany({ where: { userId: owner.id }, include: { snapshots: true }, orderBy: { id: 'asc' } });
  const attempts = owner => prisma.competitorCreationAttempt.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  const bind = (h, native, transform = async response => response) => {
    const owned = []; owned.reads = [];
    h.state.send = r => {
      if (r.url !== '/api/youtube/competitors') return defaults(r);
      const p = (async () => {
        const response = r.init.method === 'POST'
          ? await native.POST(new Request('https://example.invalid/api/youtube/competitors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r.body) }))
          : await routeFor({ id: r.owner }).GET();
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return r.init.method === 'POST' ? transform(response, r) : response;
      })();
      owned.push(p); if (r.init.method !== 'POST') owned.reads.push(p); return p;
    };
    return owned;
  };
  const settle = async (h, owned) => { await ready(h); await Promise.all(owned.reads); await ready(h); };
  const select = async (h, owned, id = channelId) => { await analyze(h, id); await settle(h, owned); };
  try {
    const neighbor = await newOwner();
    const foreign = await prisma.trackedCompetitor.create({ data: { userId: neighbor.id, channelId: 'UC_neighbor_' + randomUUID(), channelName: 'Unrelated native neighbor' } });
    await prisma.competitorSnapshot.create({ data: { competitorId: foreign.id, subscribers: 1, totalViews: 10n, videoCount: 1 } });
    const beforeForeign = await rows(neighbor);
    for (const held of ['headers', 'JSON']) {
      const owner = await newOwner(), h = page(owner), gate = deferred(), entered = deferred(); let body;
      const owned = bind(h, routeFor(owner), async response => {
        body = await response.json(); assert.equal(response.status, 200); entered.resolve();
        if (held === 'headers') { await gate.promise; return { ok: true, status: 200, json: async () => body }; }
        return { ok: true, status: 200, json: () => gate.promise.then(() => body) };
      });
      await select(h, owned); const cb = track(h).props.onClick; cb(); cb(); await entered.promise; await ready(h);
      assert.equal(writes(h).length, 1); assert.equal(writes(h)[0].body.url, channelId);
      const before = await attempts(owner), beforeRows = await rows(owner);
      assert.equal(before[0].state, 'complete'); assert.equal(beforeRows.length, 1); assert.equal(beforeRows[0].snapshots.length, 1);
      h.advance(40000); h.unmount(); await settle(h, owned); h.strictEffects(); await settle(h, owned); h.advance(20000); await settle(h, owned);
      assert.match(h.text(), /alta anterior no está confirmada/);
      await select(h, owned); assert(track(h).props.disabled); assert(!h.text().includes('Siguiendo')); cb(); await settle(h, owned);
      assert.equal(writes(h).length, 1); assert.deepEqual(await attempts(owner), before); assert.deepEqual(await rows(owner), beforeRows);
      gate.resolve(); await Promise.all(owned); await settle(h, owned);
      assert.match(h.text(), /Siguiendo/); assert.equal(body.competitor.addedAt, beforeRows[0].addedAt.toISOString());
      assert.equal(body.competitor.snapshots[0].recordedAt, beforeRows[0].snapshots[0].recordedAt.toISOString());
      assert.equal(h.storage.size, 0); assert.equal(h.timers.size, 0); h.unmount();
      results.push('Analysis tracking native ' + held + ': actual page/hook/POST/helper/plans/PostgreSQL; one admission/snapshot, shared60s/remount/Strict setup, GET cannot acknowledge, original dates alone confirm');
    }
    for (const phase of [1, 2]) {
      const owner = await newOwner(), h = page(owner); let n = 0;
      const native = routeFor(owner, { $transaction: async (fn, opts) => { const result = await prisma.$transaction(fn, opts); if (++n === phase) throw Error('Native original transaction acknowledgement lost'); return result; } });
      const owned = bind(h, native); await select(h, owned); const cb = track(h).props.onClick; cb(); await flush(); await Promise.all(owned); await settle(h, owned);
      assert.match(h.text(), /alta no está confirmada/); const before = await attempts(owner), beforeRows = await rows(owner);
      assert.equal(before[0].state, phase === 1 ? 'pending' : 'complete'); assert.equal(beforeRows.length, phase === 1 ? 0 : 1);
      h.unmount(); await select(h, owned); cb(); track(h).props.onClick(); await settle(h, owned);
      assert(track(h).props.disabled); assert(!h.text().includes('Siguiendo')); assert.equal(writes(h).length, 1);
      assert.deepEqual(await attempts(owner), before); assert.deepEqual(await rows(owner), beforeRows); h.unmount();
      results.push('Analysis tracking native lost transaction' + phase + ' acknowledgement: ' + before[0].state + ' admission retained; GET business row cannot recover, release or acknowledge the original POST');
    }
    {
      const owner = await newOwner(), h = page(owner), gate = deferred(), entered = deferred();
      const owned = bind(h, routeFor(owner), async response => { const body = await response.json(); entered.resolve(); await gate.promise; return { ok: true, status: 200, json: async () => body }; });
      await select(h, owned); const cb = track(h).props.onClick; cb(); await entered.promise; const before = await rows(owner);
      h.state.user = neighbor.id; h.state.email = neighbor.email; h.view(true); cb(); await settle(h, owned);
      gate.resolve(); await Promise.all(owned); await settle(h, owned); assert(!h.text().includes('Original analysis ' + owner.id));
      h.state.user = owner.id; h.state.email = owner.email; await settle(h, owned); assert.match(h.text(), /seguimiento anterior está confirmado/);
      await select(h, owned); assert.match(h.text(), /Siguiendo/); assert.equal(writes(h).length, 1); assert.deepEqual(await rows(owner), before); h.unmount();
      results.push('Analysis tracking native account switch: old original commits only captured account; render-before-effects retires old handler/result; return observes actual retained acknowledgement');
    }
    {
      const owner = await newOwner(), prior = await prisma.trackedCompetitor.create({ data: { userId: owner.id, channelId: 'UC_prior_' + randomUUID(), channelName: 'Existing Free slot' } }), h = page(owner), owned = bind(h, routeFor(owner));
      await select(h, owned); track(h).props.onClick(); await flush(); await Promise.all(owned); await settle(h, owned);
      assert.match(h.text(), /máximo de competidores/); assert(!track(h).props.disabled); assert.equal((await attempts(owner)).length, 0); assert.equal(h.storage.size, 0);
      await prisma.trackedCompetitor.delete({ where: { id: prior.id } }); const cb = track(h).props.onClick; cb(); cb(); await flush(); await Promise.all(owned); await settle(h, owned);
      assert.equal(writes(h).length, 2); assert.equal((await attempts(owner)).length, 1); assert.equal((await rows(owner))[0].snapshots.length, 1); assert.match(h.text(), /Siguiendo/); h.unmount();
      results.push('Analysis tracking native Free quota: actual pre-effect rejection creates no admission; only explicit new request after synthetic slot change is confirmed by its original POST');
    }
    {
      const owner = await newOwner(), h = page(owner), native = routeFor(owner), gate = deferred(), entered = deferred();
      const owned = bind(h, native, async response => { const body = await response.json(); entered.resolve(); await gate.promise; return { ok: true, status: 200, json: async () => body }; });
      await select(h, owned); track(h).props.onClick(); await entered.promise; const before = await attempts(owner), beforeRows = await rows(owner);
      for (const key of h.storage.keys()) h.storage.set(key, JSON.stringify({ ok: true, userId: owner.id, competitor: { id: beforeRows[0].id }, hash: 'local', pid: 1, time: 'future' }));
      h.unmount(); const fresh = page(owner, h.storage), freshOwned = bind(fresh, native); await select(fresh, freshOwned);
      fresh.advance(86400000); await settle(fresh, freshOwned); assert(track(fresh).props.disabled); assert(!fresh.text().includes('Siguiendo'));
      track(fresh).props.onClick(); await settle(fresh, freshOwned); assert.equal(writes(fresh).length, 0); assert.deepEqual(await attempts(owner), before); assert.deepEqual(await rows(owner), beforeRows);
      fresh.unmount(); gate.resolve(); await Promise.all(owned); h.unmount();
      results.push('Analysis tracking native module loss: serialized JSON/hash/PID/time plus actual GET row cannot reconstruct producer, renew authority or dispatch another POST');
    }
    assert.deepEqual(await rows(neighbor), beforeForeign); assert.equal((await attempts(neighbor)).length, 0);
    results.push('Analysis tracking native preservation: unrelated account/competitor/snapshot unchanged and no extra admission');
  } finally { for (const h of harnesses) h.unmount(); await prisma.user.deleteMany({ where: { id: { in: users } } }); }
};
