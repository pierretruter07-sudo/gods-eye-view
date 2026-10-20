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

test('between normal stops the camera zooms out to the whole planet, pauses, and zooms in: about 10 s', async () => {
  const { planHop, midpoint } = await import('./flight.js');
  const { TOUR_HOP } = await import('./config.js');
  const brisbane = { lat: -27.4, lon: 153.0, heightM: 4_000 };
  const london = { lat: 51.5, lon: -0.1, heightM: 0, rangeM: 24_500, pitchDeg: -42 };
  const plan = planHop(brisbane, london);
  assert.ok(plan.via, 'goes via the planet view');
  assert.equal(plan.via.rangeM, TOUR_HOP.rangeM);
  assert.equal(plan.via.pitchDeg, -90);
  const total = plan.outS + plan.holdS + plan.inS;
  assert.ok(total >= 9 && total <= 15, `about 10 s (${total})`);
  const mid = midpoint(brisbane, london);
  assert.equal(plan.via.lat, mid.lat);
  // Already high enough to see the planet, or heading to a planet-scale
  // view: one direct flight.
  assert.equal(planHop({ ...brisbane, heightM: 40_000_000 }, london).via, null);
  assert.equal(planHop(brisbane, { lat: 0, lon: 0, heightM: 0, rangeM: 95_000_000 }).via, null);
  // The midpoint of two points on the equator 90 degrees apart.
  const m = midpoint({ lat: 0, lon: 0 }, { lat: 0, lon: 90 });
  assert.ok(Math.abs(m.lat) < 1e-9 && Math.abs(m.lon - 45) < 1e-9);
});

test('normal stops are framed 65% closer than before', async () => {
  const { STOP_CAMERA } = await import('./config.js');
  assert.equal(STOP_CAMERA.aircraft.rangeM, 24_500); // was 70,000 m
  assert.equal(STOP_CAMERA.vessel.rangeM, 3_200); // was 9,000 m
  assert.equal(STOP_CAMERA.military.rangeM, 15_700); // was 45,000 m
});
