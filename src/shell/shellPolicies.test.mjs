import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, START_LEVEL, nextQuality, qualityLevels } from './qualityPolicy.js';
import { shouldRefreshFlights, PREFETCH_MAX_AGE_MS } from './flightPrefetchPolicy.js';

test('quality ladder holds native resolution and never drops below CSS pixels', () => {
  const l = qualityLevels(1.5);
  assert.deepEqual(l.slice(0, 3).map((x) => x.ratio), [1.5, 1.5, 1.5]);
  assert.deepEqual(l.map((x) => x.msaa).slice(0, 3), [4, 2, 1]);
  assert.ok(l.every((x) => x.ratio >= 1));
  assert.equal(qualityLevels(3)[0].ratio, QUALITY.maxRatio);
  assert.equal(qualityLevels(1).length, 3);
});

test('one slow window does not drop quality; sustained slowness does; recovery needs headroom', () => {
  const n = qualityLevels(1.5).length;
  let s = { level: START_LEVEL, good: 0, bad: 0 };
  s = nextQuality(s, 30, n);
  assert.equal(s.level, START_LEVEL);
  s = nextQuality(s, 30, n);
  assert.equal(s.level, START_LEVEL + 1);
  for (let i = 0; i < QUALITY.goodWindowsToRaise; i += 1) s = nextQuality(s, 60, n);
  assert.equal(s.level, START_LEVEL);
  let worst = { level: n - 1, good: 0, bad: 5 };
  assert.equal(nextQuality(worst, 5, n).level, n - 1);
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
