import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRBORNE_MARGIN_M,
  GROUND_LIFT_M,
  SEA_LIFT_M,
  SURFACE_REFRESH_MS,
  SURFACE_RETRY_MAX_MS,
  SURFACE_SAMPLES_PER_S,
  createSurfaceSampler,
  onCanvas,
  subjectHeightM,
  subjectRule,
  surfaceCellKey,
  surfaceRetryMs,
  toOverlayPoint,
} from './subjectSurface.js';

test('each kind of asset follows its height rule', () => {
  assert.equal(subjectRule({ kind: 'satellite' }), 'orbit');
  assert.equal(subjectRule({ kind: 'vessel' }), 'sea');
  assert.equal(subjectRule({ kind: 'aircraft' }), 'airborne');
  assert.equal(subjectRule({ kind: 'aircraft', onGround: true }), 'ground');
  for (const kind of ['camera', 'place', 'earthquake', 'airport'])
    assert.equal(subjectRule({ kind }), 'ground', kind);
  assert.equal(subjectRule(null), 'ground');
});

test('ships ride the geoid, never the ground under them, and never 0 m where the geoid is above the ellipsoid', () => {
  // North Sea: geoid ~ +45 m. At 0 m ellipsoid a ship would sit 45 m under the sea.
  assert.equal(subjectHeightM('sea', { geoidN: 45 }), 45 + SEA_LIFT_M);
  // A bridge or quay sampled above the ship is ignored.
  assert.equal(
    subjectHeightM('sea', { geoidN: -30, surfaceM: 20 }),
    -30 + SEA_LIFT_M,
  );
  // Before the geoid grid loads: the lift above 0 m, not under it.
  assert.equal(subjectHeightM('sea', {}), SEA_LIFT_M);
});

test('ground assets sit on the sampled surface, else at mean sea level, never at 0 m ellipsoid', () => {
  // Denver airport: tiles at ~1,640 m ellipsoidal.
  assert.equal(
    subjectHeightM('ground', { rawM: 0, geoidN: -17, surfaceM: 1640 }),
    1640 + GROUND_LIFT_M,
  );
  // No sample yet: the orthometric hint lifted by the geoid.
  assert.equal(subjectHeightM('ground', { rawM: 52, geoidN: 46 }), 98);
  // A negative hint never pushes the asset under sea level.
  assert.equal(subjectHeightM('ground', { rawM: -10, geoidN: 46 }), 46);
});

test('airborne aircraft are lifted by the geoid and never drawn below the surface plus a margin', () => {
  // Barometric 3,000 m over London (geoid +46 m).
  assert.equal(
    subjectHeightM('airborne', { rawM: 3000, geoidN: 46, surfaceM: 60 }),
    3046,
  );
  // Baro reading under an elevated field: floored above the surface.
  assert.equal(
    subjectHeightM('airborne', { rawM: 137, geoidN: -26, surfaceM: 160 }),
    160 + AIRBORNE_MARGIN_M,
  );
  // Nothing sampled: the feed value, geoid corrected.
  assert.equal(subjectHeightM('airborne', { rawM: 500, geoidN: -26 }), 474);
  // Satellites keep their feed height.
  assert.equal(
    subjectHeightM('orbit', { rawM: 420_000, surfaceM: 9999 }),
    420_000,
  );
});

test('window coordinates map into the overlay through the canvas offset and CSS scale only', () => {
  const client = { width: 1200, height: 800 };
  // Full-screen canvas, overlay at the origin: unchanged. Cesium has already
  // divided out devicePixelRatio and resolutionScale, so a 2x screen with a
  // 2400x1600 drawing buffer still maps 1:1 in CSS pixels.
  assert.deepEqual(
    toOverlayPoint(
      { x: 600, y: 400 },
      { left: 0, top: 0, width: 1200, height: 800 },
      client,
    ),
    { x: 600, y: 400 },
  );
  // Canvas offset 60 px down the page, overlay at the origin.
  assert.deepEqual(
    toOverlayPoint(
      { x: 10, y: 20 },
      { left: 0, top: 60, width: 1200, height: 800 },
      client,
      { left: 0, top: 0 },
    ),
    { x: 10, y: 80 },
  );
  // Canvas scaled by CSS to half size; overlay itself offset.
  assert.deepEqual(
    toOverlayPoint(
      { x: 600, y: 400 },
      { left: 100, top: 50, width: 600, height: 400 },
      client,
      { left: 20, top: 10 },
    ),
    { x: 380, y: 240 },
  );
  assert.equal(toOverlayPoint(undefined, { left: 0, top: 0 }, client), null);
  assert.equal(
    toOverlayPoint({ x: NaN, y: 1 }, { left: 0, top: 0 }, client),
    null,
  );
});

test('a point off the canvas has no leader end', () => {
  const client = { width: 1200, height: 800 };
  assert.equal(onCanvas({ x: 600, y: 400 }, client), true);
  assert.equal(onCanvas({ x: -5, y: 400 }, client), false);
  assert.equal(onCanvas({ x: 600, y: 801 }, client), false);
  assert.equal(onCanvas(undefined, client), false);
  assert.equal(onCanvas({ x: 1, y: 1 }, { width: 0, height: 0 }), false);
});

/** A scene double whose height samples resolve when the test says so. */
function fakeScene({ globeShow = false, globeHeight = undefined } = {}) {
  const calls = [];
  const scene = {
    sampleHeightSupported: true,
    globe: { show: globeShow, getHeight: () => globeHeight },
    sampleHeightMostDetailed(positions, exclude) {
      let resolve;
      const promise = new Promise((r) => {
        resolve = r;
      });
      calls.push({ positions, exclude, resolve });
      return promise;
    },
  };
  return { scene, calls };
}
const FakeCesium = {
  Cartographic: { fromDegrees: (lon, lat) => ({ lon, lat, height: 0 }) },
};
const settle = () => new Promise((r) => setImmediate(r));

test('the surface sampler caches per cell and regime, retries misses with backoff and keeps to its budget', async () => {
  let t = 0;
  let samples = 0;
  const { scene, calls } = fakeScene();
  const marker = {};
  const sampler = createSurfaceSampler({
    Cesium: FakeCesium,
    scene,
    exclude: () => [marker],
    onSample: () => (samples += 1),
    now: () => t,
  });
  // First read: unknown, one sample started, own entities excluded.
  assert.equal(sampler.heightAt(39.8617, -104.6731), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].exclude, [marker]);
  // Reads while pending (and anywhere in the same ~11 m cell) start no more.
  sampler.heightAt(39.86172, -104.67308);
  assert.equal(calls.length, 1);
  calls[0].positions[0].height = 1640;
  calls[0].resolve(calls[0].positions);
  await settle();
  assert.equal(samples, 1);
  assert.equal(sampler.heightAt(39.8617, -104.6731), 1640);
  assert.equal(calls.length, 1, 'cached: no new sample');
  // Refreshed after SURFACE_REFRESH_MS, still answering meanwhile.
  t += SURFACE_REFRESH_MS;
  assert.equal(sampler.heightAt(39.8617, -104.6731), 1640);
  assert.equal(calls.length, 2);

  // A miss (tiles not there) retries with backoff, never every frame.
  t += 5000;
  sampler.heightAt(10, 10);
  const miss = calls.at(-1);
  miss.resolve([{ height: undefined }]);
  await settle();
  const before = calls.length;
  t += surfaceRetryMs(1) - 1;
  sampler.heightAt(10, 10);
  assert.equal(calls.length, before, 'no retry inside the backoff');
  t += 1;
  sampler.heightAt(10, 10);
  assert.equal(calls.length, before + 1, 'retried after the backoff');
  assert.equal(surfaceRetryMs(99), SURFACE_RETRY_MAX_MS);

  // A fast sweep over many cells starts at most the per-second budget.
  t += 10_000;
  const sweepStart = calls.length;
  for (let i = 0; i < 50; i += 1) sampler.heightAt(20 + i * 0.01, 20);
  assert.equal(calls.length - sweepStart, SURFACE_SAMPLES_PER_S);
  // sample: false never starts one.
  t += 10_000;
  const quiet = calls.length;
  sampler.heightAt(30, 30, { sample: false });
  assert.equal(calls.length, quiet);
  sampler.destroy();
});

test('a stack switch never reuses a surface measured on the other one, and the globe answers meanwhile', () => {
  assert.notEqual(
    surfaceCellKey(1, 2, 'tiles'),
    surfaceCellKey(1, 2, 'globe'),
  );
  assert.equal(
    surfaceCellKey(51.50071, -0.12462, 'tiles'),
    surfaceCellKey(51.50069, -0.12458, 'tiles'),
  );
  const { scene, calls } = fakeScene({ globeShow: true, globeHeight: 75 });
  const sampler = createSurfaceSampler({
    Cesium: FakeCesium,
    scene,
    now: () => 0,
  });
  // Globe stack: its loaded terrain answers while the precise sample runs.
  assert.equal(sampler.heightAt(51.5, -0.12), 75);
  assert.equal(calls.length, 1);
  // Unsupported sampling (no depth texture): globe only, no throw.
  const bare = createSurfaceSampler({
    Cesium: FakeCesium,
    scene: { sampleHeightSupported: false, globe: { show: false } },
    now: () => 0,
  });
  assert.equal(bare.heightAt(51.5, -0.12), null);
});
