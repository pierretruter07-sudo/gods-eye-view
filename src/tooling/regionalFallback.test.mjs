import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONAL_SOURCE_IDS,
  fetchRegionalPayload,
  resetRegionalCooldowns,
} from '../../server/providers/aircraft/opensky.js';

const HOST_OF = {
  'api.adsb.lol': 'adsb.lol',
  'api.airplanes.live': 'airplanes.live',
  'opendata.adsb.fi': 'adsb.fi',
};

function mockFetch(t, statusBySource) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (raw) => {
    const id = HOST_OF[new URL(raw).hostname];
    assert.ok(id, `unexpected upstream ${raw}`);
    calls.push(id);
    const status = statusBySource[id] ?? 200;
    return status === 200
      ? Response.json({ aircraft: [{ hex: id }] })
      : new Response('', { status, headers: { 'retry-after': '90' } });
  });
  t.mock.method(console, 'warn', () => {});
  return calls;
}

test('regional flights try adsb.lol, then airplanes.live, then adsb.fi', () => {
  assert.deepEqual(REGIONAL_SOURCE_IDS, ['adsb.lol', 'airplanes.live', 'adsb.fi']);
});

test('a rate-limited source is skipped and stays on cooldown for the next request', async (t) => {
  resetRegionalCooldowns();
  const calls = mockFetch(t, { 'adsb.lol': 429 });
  const first = await fetchRegionalPayload(-27.5, 153, undefined);
  assert.deepEqual(calls, ['adsb.lol', 'airplanes.live']);
  assert.deepEqual(first.ac, [{ hex: 'airplanes.live' }], 'aircraft[] is normalised to ac[]');
  assert.equal(first.source, 'airplanes.live', 'the source that answered is credited, not adsb.lol');
  calls.length = 0;
  await fetchRegionalPayload(-27.5, 153, undefined);
  assert.deepEqual(calls, ['airplanes.live'], 'cooled-down source is not retried');
});

test('when every source fails the last error is reported', async (t) => {
  resetRegionalCooldowns();
  mockFetch(t, { 'adsb.lol': 500, 'airplanes.live': 503, 'adsb.fi': 502 });
  await assert.rejects(fetchRegionalPayload(0, 0, undefined), /adsb\.fi upstream HTTP 502/);
  await assert.rejects(fetchRegionalPayload(0, 0, undefined), /cooling down/);
  resetRegionalCooldowns();
});
