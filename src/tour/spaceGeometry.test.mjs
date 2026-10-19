import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_KM,
  circleAround,
  coverageAngle,
  coverageRadiusKm,
  distanceKm,
  fallbackRing,
  geoBelt,
} from './spaceGeometry.js';

const deg = (rad) => (rad * 180) / Math.PI;

test('coverage footprints follow standard geometry (ISS about 2,200 km to the horizon; GEO about 81°)', () => {
  // ISS at ~420 km: horizon radius ~2,250 km; at 10° elevation ~1,400 km.
  const issHorizon = coverageRadiusKm(420, 0);
  assert.ok(issHorizon > 2150 && issHorizon < 2350, `${issHorizon}`);
  const iss10 = coverageRadiusKm(420, 10);
  assert.ok(iss10 > 1250 && iss10 < 1500, `${iss10}`);
  assert.ok(iss10 < issHorizon);
  // GEO: Earth central angle 81.3° to the horizon, ~71.4° at 10° elevation.
  assert.ok(Math.abs(deg(coverageAngle(35_786, 0)) - 81.3) < 0.2);
  assert.ok(Math.abs(deg(coverageAngle(35_786, 10)) - 71.4) < 0.3);
  assert.equal(coverageAngle(0, 0), 0);
});

test('the footprint edge is a closed circle at the coverage radius', () => {
  const angle = coverageAngle(420, 10);
  const ring = circleAround(-33.9, 151.2, angle, 64);
  assert.equal(ring.length, 65);
  assert.deepEqual(
    [ring[0].lat.toFixed(6), ring[0].lon.toFixed(6)],
    [ring[64].lat.toFixed(6), ring[64].lon.toFixed(6)],
  );
  for (const p of ring)
    assert.ok(
      Math.abs(distanceKm({ lat: -33.9, lon: 151.2 }, p) - angle * EARTH_RADIUS_KM) < 1,
    );
});

test('the GEO belt sits on the equator at 35,786 km; a fallback orbit ring passes through the satellite', () => {
  const belt = geoBelt(36);
  assert.ok(belt.every((p) => p.lat === 0 && p.altKm === 35_786));
  const iss = { lat: 40, lon: -75, altitudeM: 420_000, isIss: true };
  const ring = fallbackRing(iss, 180);
  assert.ok(distanceKm(ring[0], iss) < 1, 'starts at the satellite');
  const maxLat = Math.max(...ring.map((p) => Math.abs(p.lat)));
  assert.ok(Math.abs(maxLat - 51.64) < 0.5, 'reaches the ISS inclination');
  assert.ok(ring.every((p) => p.altKm === 420));
});
