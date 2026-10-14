import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, START_LEVEL, nextQuality, qualityLevels } from './qualityPolicy.js';
import { countStatesNear, shouldRefreshFlights, statesNear, PREFETCH_MAX_AGE_MS } from './flightPrefetchPolicy.js';

test('quality ladder holds native resolution and never drops below CSS pixels', () => {
  const l = qualityLevels(1.5);
  assert.deepEqual(l.slice(0, 3).map((x) => x.ratio), [1.5, 1.5, 1.5]);
  assert.deepEqual(l.map((x) => x.msaa).slice(0, 3), [4, 2, 1]);
  assert.ok(l.every((x) => x.ratio >= 1));
  assert.equal(qualityLevels(3)[0].ratio, QUALITY.maxRatio);
  assert.equal(qualityLevels(1).length, 3);
  // Tile detail stays at Cesium's default until the last rungs.
  assert.deepEqual(l.map((x) => x.sse), [16, 16, 16, 20, 24]);
  assert.equal(qualityLevels(1).at(-1).sse, 24);
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

test('the model warm list matches the shipped glTF files exactly', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const listed = [...source.matchAll(/'\/models\/([a-z0-9]+\.glb)'/g)].map((m) => m[1]).sort();
  const shipped = readdirSync(new URL('../../public/models/', import.meta.url)).filter((f) => f.endsWith('.glb')).sort();
  assert.deepEqual(listed, shipped);
});

test('staged aircraft are counted near the destination only', () => {
  // OpenSky state vectors: [icao24, callsign, country, t, t, lon, lat, ...]
  const bne = { lat: -27.384, lon: 153.117 };
  const states = [
    ['a', 'QFA1', 'AU', 0, 0, 153.12, -27.39],
    ['b', 'VOZ2', 'AU', 0, 0, 153.3, -27.2], // ~27 km
    ['c', 'JST3', 'AU', 0, 0, 151.18, -33.94], // Sydney
    ['d', null, 'AU', 0, 0, null, null],
  ];
  assert.equal(countStatesNear(states, bne.lat, bne.lon, 50), 2);
  assert.equal(countStatesNear(states, bne.lat, bne.lon, 5), 1);
  assert.equal(countStatesNear(null, 0, 0, 50), 0);
  const [qfa] = statesNear(
    [['7c1', 'QFA1  ', 'AU', 0, 0, 153.12, -27.39, 300, false, 70, 190, -4, null, 320]],
    bne.lat,
    bne.lon,
    50,
  );
  assert.deepEqual(qfa, {
    icao24: '7c1',
    callsign: 'QFA1',
    lat: -27.39,
    lon: 153.12,
    altitudeM: 320,
    onGround: false,
    speedMps: 70,
    headingDeg: 190,
    verticalRateMps: -4,
  });
});
