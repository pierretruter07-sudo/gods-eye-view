import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_TIMING } from './config.js';
import { flightSeconds, spinsGlobe } from './flight.js';
import { STOP_CAMERA } from './config.js';

test('longer camera jumps take longer, up to the longest flight time', () => {
  assert.equal(flightSeconds(50_000), TOUR_TIMING.flyInS);
  assert.equal(flightSeconds(1_500_000), TOUR_TIMING.flyInS);
  const mid = flightSeconds(10_000_000);
  assert.ok(mid > TOUR_TIMING.flyInS && mid < TOUR_TIMING.flyLongS);
  assert.equal(flightSeconds(50_000_000), TOUR_TIMING.flyLongS, 'street to GEO');
  assert.equal(flightSeconds(400_000_000), TOUR_TIMING.flyLongS);
  assert.equal(flightSeconds(NaN), TOUR_TIMING.flyInS);
});

test('a high-orbit satellite is orbited, never globe-spun (no jump to the ground on arrival)', () => {
  const geo = { heightM: 35_786_000, ...STOP_CAMERA.geoSatellite };
  const nav = { heightM: 20_200_000, ...STOP_CAMERA.meoSatellite };
  assert.equal(spinsGlobe(geo), false);
  assert.equal(spinsGlobe(nav), false);
  // The whole-planet view and the GEO belt look at the ground: they spin.
  assert.equal(spinsGlobe({ heightM: 0, rangeM: 95_000_000 }), true);
  assert.equal(spinsGlobe({ heightM: 0, rangeM: 12_000 }), false, 'close views orbit');
});
