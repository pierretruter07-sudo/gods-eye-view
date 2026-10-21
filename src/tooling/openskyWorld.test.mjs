import test from 'node:test';
import assert from 'node:assert/strict';
import { openSkyProxy } from '../../server/providers/aircraft/opensky.js';

function mount() {
  let handler = null;
  openSkyProxy().configureServer({
    middlewares: { use: (path, fn) => path === '/api/opensky' && (handler = fn) },
  });
  return handler;
}
function call(handler) {
  return new Promise((resolve) => {
    const res = {
      status: 0,
      headers: {},
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers || {};
      },
      setHeader() {},
      end(body) {
        this.body = body;
        resolve(this);
      },
    };
    handler({ url: '/api/opensky', headers: {} }, res);
  });
}

test('OpenSky: concurrent misses share one world call; a later 5xx serves the last good snapshot', async (t) => {
  process.env.OPENSKY_AUTH_MODE = 'anon';
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const nowS = () => Math.floor(clock / 1000);
  let calls = 0;
  let status = 200;
  let release;
  const gate = new Promise((r) => (release = r));
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (!String(url).includes('opensky-network.org/api/states/all'))
      return new Response('{}', { status: 404 });
    calls += 1;
    await gate;
    return new Response(
      status === 200 ? JSON.stringify({ time: nowS(), states: [['abc123']] }) : 'upstream down',
      { status, headers: { 'x-rate-limit-remaining': '3000' } },
    );
  });
  const handler = mount();
  const pending = [call(handler), call(handler), call(handler)];
  release();
  const first = await Promise.all(pending);
  assert.equal(calls, 1, 'one upstream call for three concurrent requests');
  assert.deepEqual(first.map((r) => r.status), [200, 200, 200]);

  // Past the cache: upstream now fails with 503.
  clock += 10 * 60_000;
  status = 503;
  const stale = await call(handler);
  assert.equal(stale.status, 200, 'the client gets the last good snapshot, not the 503');
  assert.match(stale.body, /abc123/);
  // And the proxy backs off instead of calling again straight away.
  await call(handler);
  assert.equal(calls, 2);
});

test('OpenSky: the worldwide snapshot gets time to arrive, and a timeout retries soon', async () => {
  const {
    OPENSKY_FETCH_TIMEOUT_MS,
    OPENSKY_NETWORK_ERROR_COOLDOWN_MS,
    OPENSKY_TIMEOUT_COOLDOWN_MS,
    openskyFailureCooldownMs,
  } = await import('../../server/providers/aircraft/opensky.js');
  assert.ok(OPENSKY_FETCH_TIMEOUT_MS >= 15_000, 'a 2–4 MB snapshot from a cold server');
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  assert.equal(openskyFailureCooldownMs(timeout), OPENSKY_TIMEOUT_COOLDOWN_MS);
  assert.ok(OPENSKY_TIMEOUT_COOLDOWN_MS <= 60_000);
  const dns = Object.assign(new TypeError('fetch failed'), { cause: { name: 'Error', code: 'ENOTFOUND' } });
  assert.equal(openskyFailureCooldownMs(dns), OPENSKY_NETWORK_ERROR_COOLDOWN_MS);
});
