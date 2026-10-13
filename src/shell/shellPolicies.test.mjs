import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, initialRatio, nextQuality } from './qualityPolicy.js';
import { shouldRefreshFlights, PREFETCH_MAX_AGE_MS } from './flightPrefetchPolicy.js';

test('quality starts crisp but never supersamples past the cap', () => {
  assert.equal(initialRatio(1), 1);
  assert.equal(initialRatio(1.25), 1.25);
  assert.equal(initialRatio(3), QUALITY.maxRatio);
});

test('quality steps down on low fps and recovers only after sustained headroom', () => {
  let s = { ratio: 1.5, good: 0, ceiling: 1.5 };
  s = nextQuality(s, 30);
  assert.equal(s.ratio, 1.35);
  for (let i = 0; i < QUALITY.goodWindowsToRaise - 1; i += 1) s = nextQuality(s, 60);
  assert.equal(s.ratio, 1.35);
  s = nextQuality(s, 60);
  assert.equal(s.ratio, 1.5);
  const low = { ratio: QUALITY.minRatio, good: 0, ceiling: 1.5 };
  assert.equal(nextQuality(low, 10).ratio, QUALITY.minRatio);
});

test('flight refresh on arrival: new place, stale data, not from space', () => {
  const here = { lat: 51.47, lon: -0.45 };
  assert.equal(shouldRefreshFlights({ last: null, here, heightM: 20_000, now: 0 }), true);
  assert.equal(shouldRefreshFlights({ last: null, here, heightM: 20_000_000, now: 0 }), false);
  const last = { lat: 51.47, lon: -0.45, at: 0 };
  assert.equal(shouldRefreshFlights({ last, here, heightM: 20_000, now: 1000 }), false);
  assert.equal(shouldRefreshFlights({ last, here, heightM: 20_000, now: PREFETCH_MAX_AGE_MS }), true);
  assert.equal(shouldRefreshFlights({ last, here: { lat: 40.64, lon: -73.78 }, heightM: 20_000, now: 1000 }), true);
});
