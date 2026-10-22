import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GOOGLE_PER_MIN,
  clientKey,
  makeOptInRateLimiter,
} from '../../server/providers/common/rate-limit.js';
import {
  MAX_TEXT_QUERY_CHARS,
  PLACES_FETCH_TIMEOUT_MS,
} from '../../server/providers/places/google.js';
import {
  OPENSKY_FIRST_ANSWER_BUDGET_MS,
  OPENSKY_FETCH_TIMEOUT_MS,
  OPENSKY_TOKEN_TIMEOUT_MS,
  describeFetchError,
} from '../../server/providers/aircraft/opensky.js';

test('the Google Places limiter is on by default and only env can disable it', () => {
  const byDefault = makeOptInRateLimiter(undefined);
  assert.equal(typeof byDefault, 'function');
  let allowed = 0;
  for (let i = 0; i < DEFAULT_GOOGLE_PER_MIN + 5; i++)
    if (byDefault('client-a')) allowed++;
  assert.equal(allowed, DEFAULT_GOOGLE_PER_MIN);
  assert.equal(makeOptInRateLimiter('0'), null);
  assert.equal(makeOptInRateLimiter('off'), null);
  const custom = makeOptInRateLimiter('2');
  assert.equal(custom('b'), true);
  assert.equal(custom('b'), true);
  assert.equal(custom('b'), false);
  // Garbage keeps the default rather than opening the proxy.
  assert.equal(typeof makeOptInRateLimiter('lots'), 'function');
});

test('rate-limit keys use the forwarded address only when TRUST_PROXY=1', () => {
  const req = {
    socket: { remoteAddress: '10.0.0.2' },
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
  };
  assert.equal(clientKey(req, {}), '10.0.0.2');
  assert.equal(clientKey(req, { TRUST_PROXY: '1' }), '203.0.113.9');
  assert.equal(
    clientKey(
      { socket: { remoteAddress: '10.0.0.2' }, headers: {} },
      { TRUST_PROXY: '1' },
    ),
    '10.0.0.2',
  );
});

test('cost-bearing fetches are bounded', () => {
  assert.equal(MAX_TEXT_QUERY_CHARS, 120);
  assert.ok(PLACES_FETCH_TIMEOUT_MS <= 10_000);
  assert.ok(OPENSKY_TOKEN_TIMEOUT_MS < OPENSKY_FETCH_TIMEOUT_MS);
  assert.ok(OPENSKY_FIRST_ANSWER_BUDGET_MS < 5000);
});

test('transport failures are logged with their cause code', () => {
  const error = new TypeError('fetch failed');
  error.cause = Object.assign(new Error('connect timeout'), {
    code: 'UND_ERR_CONNECT_TIMEOUT',
    name: 'ConnectTimeoutError',
  });
  assert.equal(
    describeFetchError(error),
    'fetch failed · TypeError · UND_ERR_CONNECT_TIMEOUT',
  );
});
