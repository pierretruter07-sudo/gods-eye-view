import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_TIMING } from './config.js';
import { flightSeconds, smoothToward, spinsGlobe } from './flight.js';
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

test('the camera eases onto a moving subject without lag building up, and jumps to a new one', () => {
  const at = { x: 0, y: 0, z: 0 };
  // A subject moving 250 m/s, followed at 60 frames a second for 20 s.
  let aim = { ...at };
  let subject = { ...at };
  for (let i = 0; i < 1200; i += 1) {
    subject = { x: subject.x + 250 / 60, y: 0, z: 0 };
    aim = smoothToward(aim, subject, 1 / 60, { tauS: TOUR_TIMING.followTauS });
  }
  const lagM = subject.x - aim.x;
  assert.ok(lagM > 0 && lagM < 250 * TOUR_TIMING.followTauS * 1.1, `lag ${lagM} m`);
  // Frame rate does not change where it ends up.
  const a = smoothToward(at, { x: 1000, y: 0, z: 0 }, 1, { tauS: 0.6 });
  let b = { ...at };
  for (let i = 0; i < 4; i += 1) b = smoothToward(b, { x: 1000, y: 0, z: 0 }, 0.25, { tauS: 0.6 });
  assert.ok(Math.abs(a.x - b.x) < 1e-6);
  // Far away (another subject): taken at once.
  assert.deepEqual(smoothToward(at, { x: 90_000, y: 0, z: 0 }, 1 / 60), { x: 90_000, y: 0, z: 0 });
});

test('satellite stops keep the whole Earth in frame below a high satellite', () => {
  const R = 6371;
  // Angle of the Earth's centre from the view axis and its angular radius,
  // for a camera rangeKm behind the satellite at the stop's pitch.
  const earthInView = (altKm, { rangeM, pitchDeg }) => {
    const p = (pitchDeg * Math.PI) / 180;
    const range = rangeM / 1000;
    const v = [Math.cos(p), Math.sin(p)];
    const toEarth = [range * v[0], -(R + altKm) + range * v[1]];
    const dist = Math.hypot(...toEarth);
    const off = Math.acos((toEarth[0] * v[0] + toEarth[1] * v[1]) / dist);
    return ((off + Math.asin(R / dist)) * 180) / Math.PI;
  };
  // Half the vertical field of view on a wide (2:1) screen is about 16 deg.
  assert.ok(earthInView(35_786, STOP_CAMERA.geoSatellite) < 16);
  assert.ok(earthInView(20_200, STOP_CAMERA.meoSatellite) < 16.5);
});
