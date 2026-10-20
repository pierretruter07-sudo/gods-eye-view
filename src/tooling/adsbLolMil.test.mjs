import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADSBLOL_MIL,
  createAdsbLolMilHandler,
} from '../../server/providers/aircraft/adsb-lol.js';

function fakeRes() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}
const ok = (body) => ({
  ok: true,
  status: 200,
  text: async () => body,
  headers: { get: () => null },
});
const fail = (status, retryAfter = null) => ({
  ok: false,
  status,
  text: async () => '{"error":"x"}',
  headers: { get: (h) => (h === 'retry-after' ? retryAfter : null) },
  body: { cancel: async () => {} },
});

async function call(handler) {
  const res = fakeRes();
  await handler({}, res);
  return res;
}

test('military relay: cached for 30 s, so the 15 s client poll is served from memory', async () => {
  let t = 0;
  let calls = 0;
  const h = createAdsbLolMilHandler({
    diskFile: null,
    now: () => t,
    fetchImpl: async () => (calls++, ok('{"ac":[1]}')),
  });
  assert.equal((await call(h)).headers['X-ADS-B-Cache'], 'MISS');
  t = 15_000;
  assert.equal((await call(h)).headers['X-ADS-B-Cache'], 'HIT');
  t = ADSBLOL_MIL.cacheMs + 1;
  await call(h);
  assert.equal(calls, 2);
});

test('military relay: concurrent requests share one upstream call', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const h = createAdsbLolMilHandler({
    diskFile: null,
    fetchImpl: async () => {
      calls++;
      await gate;
      return ok('{"ac":[]}');
    },
  });
  const all = Promise.all([call(h), call(h), call(h)]);
  release();
  const res = await all;
  assert.equal(calls, 1);
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200]);
  assert.ok(res.some((r) => r.headers['X-ADS-B-Cache'] === 'INFLIGHT'));
});

test('military relay: a 429, a timeout or a network error serves stale and backs off', async () => {
  let t = 0;
  let calls = 0;
  let next = ok('{"ac":["good"]}');
  const h = createAdsbLolMilHandler({
    diskFile: null,
    now: () => t,
    fetchImpl: async () => {
      calls++;
      if (next instanceof Error) throw next;
      return next;
    },
  });
  await call(h);
  t = ADSBLOL_MIL.cacheMs + 1;
  next = fail(429, '40');
  const limited = await call(h);
  assert.equal(limited.status, 200);
  assert.equal(limited.headers['X-ADS-B-Cache'], 'STALE');
  assert.equal(limited.body, '{"ac":["good"]}');
  t += 20_000; // still inside the 40 s Retry-After
  await call(h);
  assert.equal(calls, 2, 'no upstream call during the cooldown');
  t += 25_000;
  next = new Error('ECONNRESET');
  const broken = await call(h);
  assert.equal(broken.headers['X-ADS-B-Cache'], 'STALE');
  t += 5_000;
  await call(h);
  assert.equal(calls, 3, 'a network error starts a cooldown too');
});

test('military relay: contacts older than 10 minutes are never served as current', async () => {
  let t = 0;
  let next = ok('{"ac":["old"]}');
  const h = createAdsbLolMilHandler({ diskFile: null, now: () => t, fetchImpl: async () => next });
  await call(h);
  next = fail(503);
  t = ADSBLOL_MIL.maxStaleMs + 1;
  const res = await call(h);
  assert.equal(res.status, 503);
  assert.equal(res.headers['X-ADS-B-Cache'], 'NONE');
  assert.ok(Number(res.headers['Retry-After']) > 0);
});

test('military relay: a non-retryable status is relayed without a cooldown', async () => {
  let calls = 0;
  const h = createAdsbLolMilHandler({ diskFile: null, fetchImpl: async () => (calls++, fail(403)) });
  assert.equal((await call(h)).status, 403);
  await call(h);
  assert.equal(calls, 2);
});
