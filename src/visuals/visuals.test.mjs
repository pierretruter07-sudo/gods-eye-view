import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_NIGHT,
  nightFade,
  subsolarPoint,
  sunDirectionEcef,
} from './dayNight.js';
import {
  createTrailStore,
  pickTrails,
  trailRadiusKm,
  TRAIL_RULES,
} from './trails.js';
import {
  circleDegrees,
  ringFrame,
  ringRadiusKm,
  QUAKE_RINGS,
} from './quakeRings.js';
import { visualFlags } from './flags.js';

test('the day/night line follows the real Sun', () => {
  // March equinox 2026 (20 Mar): Sun over the equator.
  const eq = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0)));
  assert.ok(Math.abs(eq.lat) < 0.6, `equinox declination ${eq.lat}`);
  // Noon UTC: overhead near Greenwich (within the equation of time).
  assert.ok(Math.abs(eq.lon) < 3, `noon longitude ${eq.lon}`);
  // June solstice: over the Tropic of Cancer; 18:00 UTC is 90° W.
  const jun = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 18, 0)));
  assert.ok(Math.abs(jun.lat - 23.44) < 0.3, `solstice declination ${jun.lat}`);
  assert.ok(Math.abs(jun.lon + 90) < 3, `18:00 UTC longitude ${jun.lon}`);
  const v = sunDirectionEcef(new Date());
  assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
});

test('day/night shows at planet and regional scale only, never at city or street level', () => {
  assert.equal(nightFade(500), 0);
  assert.equal(nightFade(50_000), 0);
  assert.equal(nightFade(DAY_NIGHT.fadeStartM), 0);
  assert.equal(nightFade(DAY_NIGHT.fadeFullM), 1);
  assert.equal(nightFade(20_000_000), 1);
  const mid = nightFade((DAY_NIGHT.fadeStartM + DAY_NIGHT.fadeFullM) / 2);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(nightFade(NaN), 0);
  assert.ok(DAY_NIGHT.liftM > 8_849, 'the shell clears the highest mountain');
});

test('trails use only observed fixes, fade with age and drop when old', () => {
  const store = createTrailStore();
  const t0 = 1_000_000;
  const fix = (dt, lat) => ({ t: t0 + dt, lat, lon: 1, altM: 10_000 });
  assert.equal(store.observe('aircraft:a', 'aircraft', fix(0, 1)), true);
  // A repeat of the same reported position adds nothing.
  assert.equal(store.observe('aircraft:a', 'aircraft', fix(5000, 1)), false);
  store.observe('aircraft:a', 'aircraft', fix(60_000, 1.1));
  store.observe('aircraft:a', 'aircraft', fix(120_000, 1.2));
  const pts = store.points('aircraft:a', t0 + 120_000);
  assert.deepEqual(
    pts.map((p) => p.lat),
    [1, 1.1, 1.2],
    'oldest first, nothing beyond the newest fix',
  );
  assert.ok(pts[0].alpha < pts[1].alpha && pts[1].alpha < pts[2].alpha);
  assert.equal(pts[2].alpha, 0.9);
  // Past the age limit the oldest fixes leave, then the asset is forgotten.
  const later = t0 + TRAIL_RULES.maxAgeMs.aircraft + 61_000;
  assert.deepEqual(
    store.points('aircraft:a', later).map((p) => p.lat),
    [1.2],
  );
  store.prune(t0 + 120_000 + TRAIL_RULES.maxAgeMs.aircraft + 1);
  assert.equal(store.size(), 0);
  // Ships keep a longer tail.
  assert.ok(TRAIL_RULES.maxAgeMs.vessel > TRAIL_RULES.maxAgeMs.aircraft);
});

test('tails are drawn for the focused asset and the nearest ones only, capped', () => {
  const center = { lat: 0, lon: 0 };
  const candidates = [
    { key: 'far', lat: 10, lon: 10 },
    { key: 'near2', lat: 0.2, lon: 0 },
    { key: 'near1', lat: 0.1, lon: 0 },
    { key: 'focus', lat: 30, lon: 30 },
  ];
  assert.deepEqual(
    pickTrails(candidates, center, { radiusKm: 100, max: 2, focusKey: 'focus' }),
    ['focus', 'near1'],
  );
  assert.deepEqual(pickTrails(candidates, center, { radiusKm: 100, max: 5 }), [
    'near1',
    'near2',
  ]);
  assert.equal(trailRadiusKm(10_000), 25);
  assert.equal(trailRadiusKm(100_000), 150);
  assert.equal(trailRadiusKm(5_000_000), 1500);
  assert.ok(TRAIL_RULES.maxTrails <= 50);
});

test('quake rings grow with magnitude, pulse a few times, then settle', () => {
  assert.equal(ringRadiusKm(5), 30);
  assert.equal(ringRadiusKm(6), 60);
  assert.equal(ringRadiusKm(7), 120);
  assert.equal(ringRadiusKm(9.5), 400, 'capped');
  assert.equal(ringRadiusKm(3), 15, 'floor');
  const start = ringFrame(0);
  assert.equal(start.settled, false);
  assert.equal(start.rings.length, QUAKE_RINGS.rings);
  const mid = ringFrame(2);
  assert.ok(mid.rings[0].scale > 0.5 && mid.rings[0].alpha > 0);
  assert.equal(mid.rings[2].scale, 0, 'later rings start staggered');
  const cycle =
    QUAKE_RINGS.growS + QUAKE_RINGS.staggerS * (QUAKE_RINGS.rings - 1);
  const end = ringFrame(cycle * QUAKE_RINGS.pulses + 1);
  assert.equal(end.settled, true);
  assert.deepEqual(end.rings, [{ scale: 1, alpha: QUAKE_RINGS.settledAlpha }]);
  assert.ok(cycle * QUAKE_RINGS.pulses >= 45, 'still pulsing through a whole stop');
  // The ring is a true circle on the globe: every point is the radius away.
  const RAD = Math.PI / 180;
  for (const p of circleDegrees(35, 139, 60, 24)) {
    const h =
      Math.sin(((p.lat - 35) * RAD) / 2) ** 2 +
      Math.cos(35 * RAD) *
        Math.cos(p.lat * RAD) *
        Math.sin(((p.lon - 139) * RAD) / 2) ** 2;
    const d = 2 * 6371 * Math.asin(Math.sqrt(h));
    assert.ok(Math.abs(d - 60) < 0.01, `point ${d} km`);
  }
});

test('each world visual can be switched off from the URL', () => {
  assert.deepEqual(visualFlags(''), {
    dayNight: true,
    trails: true,
    quakeRings: true,
  });
  assert.deepEqual(visualFlags('?daynight=0&trails=0'), {
    dayNight: false,
    trails: false,
    quakeRings: true,
  });
  assert.equal(visualFlags('?nointro&quakerings=0').quakeRings, false);
});
