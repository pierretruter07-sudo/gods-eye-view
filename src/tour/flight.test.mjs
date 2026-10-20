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

test('the hop is one continuous move: it starts and ends exactly on the two framings and zooms evenly', async () => {
  const { hopRig } = await import('./flight.js');
  const { TOUR_HOP } = await import('./config.js');
  const from = { lat: -27.6, lon: 152.7, heightM: 30, rangeM: 4_200, pitchDeg: -42, headingDeg: 350 };
  const to = { lat: 51.5, lon: -0.1, heightM: 11_000, rangeM: 24_500, pitchDeg: -42, headingDeg: 0 };
  const a = hopRig(from, to, 0);
  assert.ok(Math.abs(a.rangeM - from.rangeM) < 1e-6 && Math.abs(a.lat - from.lat) < 1e-9);
  assert.equal(a.pitchDeg, -42);
  const z = hopRig(from, to, 1);
  assert.ok(Math.abs(z.rangeM - to.rangeM) < 1e-6 && Math.abs(z.lon - to.lon) < 1e-6);
  assert.ok(Math.abs(z.heightM - to.heightM) < 1e-6);
  const total = TOUR_HOP.outS + TOUR_HOP.holdS + TOUR_HOP.inS;
  const mid = hopRig(from, to, (TOUR_HOP.outS + TOUR_HOP.holdS / 2) / total);
  assert.equal(mid.rangeM, TOUR_HOP.rangeM, 'the whole planet at the middle');
  assert.equal(mid.pitchDeg, -90);
  // No jumps: small steps in time are small steps on screen.
  let prev = a;
  for (let i = 1; i <= 400; i += 1) {
    const r = hopRig(from, to, i / 400);
    assert.ok(Math.abs(Math.log(r.rangeM / prev.rangeM)) < 0.12, `range step at ${i}`);
    assert.ok(Math.abs(r.pitchDeg - prev.pitchDeg) < 1.5, `pitch step at ${i}`);
    const dh = Math.abs(((r.headingDeg - prev.headingDeg + 540) % 360) - 180);
    assert.ok(dh < 1.5, `heading step at ${i}`);
    prev = r;
  }
});
