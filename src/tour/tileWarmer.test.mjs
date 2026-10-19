import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WARM_AFTER_ARRIVAL_MS,
  createTileWarmer,
  sceneTilesets,
  warmable,
} from './tileWarmer.js';

const Cesium = {
  Cartesian3: { fromDegrees: (lon, lat, h) => ({ lon, lat, h }) },
  HeadingPitchRange: function (heading, pitch, range) {
    Object.assign(this, { heading, pitch, range });
  },
  Math: { toRadians: (d) => (d * Math.PI) / 180 },
  Matrix4: { IDENTITY: 'I' },
};

function fakeViewer() {
  const pc = {
    frustum: { aspectRatio: 1, computeCullingVolume: () => 'volume' },
    lookAt(target, hpr) {
      this.aimed = { target, hpr };
    },
    lookAtTransform() {},
  };
  const viewer = {
    camera: { heading: 0.5, frustum: { aspectRatio: 1.8 } },
    scene: { preloadFlightCamera: pc, preloadFlightCullingVolume: undefined },
  };
  return { viewer, pc };
}

const city = { lat: 51.5, lon: -0.12, heightM: 20, rangeM: 900, pitchDeg: -30 };

test('only city-scale views with coordinates are warmed', () => {
  assert.equal(warmable(city), true);
  assert.equal(warmable({ ...city, rangeM: 20_000_000 }), false);
  assert.equal(warmable({ lat: 1 }), false);
  assert.equal(warmable(null), false);
});

test('warming aims Cesium’s preload camera at the next stop and opens its pass', () => {
  const { viewer, pc } = fakeViewer();
  const w = createTileWarmer({ viewer, Cesium, tilesets: () => [] });
  assert.equal(w.warm(city, 'camera:x'), true);
  assert.deepEqual(pc.aimed.target, { lon: -0.12, lat: 51.5, h: 20 });
  assert.equal(pc.aimed.hpr.range, 900);
  assert.equal(pc.aimed.hpr.heading, 0.5);
  assert.equal(pc.frustum.aspectRatio, 1.8);
  assert.equal(viewer.scene.preloadFlightCullingVolume, 'volume');
  assert.equal(viewer.camera.canPreloadFlight(), true);
  w.stop();
  assert.equal(
    Object.prototype.hasOwnProperty.call(viewer.camera, 'canPreloadFlight'),
    false,
    'the real flight check is restored on departure',
  );
});

test('switched off, nothing is warmed', () => {
  const { viewer } = fakeViewer();
  const w = createTileWarmer({ viewer, Cesium, enabled: false });
  assert.equal(w.warm(city, 'a'), false);
  assert.equal('canPreloadFlight' in viewer.camera, false);
});

test('after arrival it waits for this stop’s tiles, then warms the next; the log records it', async () => {
  const { viewer } = fakeViewer();
  const tiles = { tilesLoaded: false };
  let t = 0;
  const w = createTileWarmer({
    viewer,
    Cesium,
    now: () => t,
    tilesets: () => [tiles],
  });
  w.arrived('aircraft:a', () => ({ view: city, label: 'camera:b' }));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.isWarming(), false, 'tiles here are still loading');
  tiles.tilesLoaded = true;
  t = 1200;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.isWarming(), true);
  w.stop();
  w.arrived('camera:b', () => null);
  const log = w.log();
  assert.deepEqual(log[0], {
    stop: 'aircraft:a',
    warmed: false,
    readyOnArrival: false,
    loadedAfterMs: 1200,
  });
  assert.equal(log[1].warmed, true);
  assert.equal(log[1].readyOnArrival, true);
  w.stop();
});

test('if this stop’s tiles are slow, the next is warmed anyway after a few seconds', async () => {
  const { viewer } = fakeViewer();
  let t = 0;
  const w = createTileWarmer({
    viewer,
    Cesium,
    now: () => t,
    tilesets: () => [{ tilesLoaded: false }],
  });
  w.arrived('a', () => ({ view: city, label: 'b' }));
  t = WARM_AFTER_ARRIVAL_MS;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(w.isWarming(), true);
  w.stop();
});

test('scene tilesets are found among the primitives', () => {
  const g = { tilesLoaded: true, show: true };
  const list = [{ other: 1 }, g, { tilesLoaded: false, show: false }];
  const viewer = {
    scene: { primitives: { length: list.length, get: (i) => list[i] } },
  };
  assert.deepEqual(sceneTilesets(viewer), [g]);
});

test('if the queued stop changes during the dwell, warming follows it', async () => {
  const { viewer, pc } = fakeViewer();
  let queued = { view: city, label: 'airport:empty' };
  const w = createTileWarmer({
    viewer,
    Cesium,
    tilesets: () => [{ tilesLoaded: true }],
  });
  w.arrived('a', () => queued);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pc.aimed.target.lat, 51.5);
  queued = { view: { ...city, lat: -27.6 }, label: 'base:yamb' };
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(pc.aimed.target.lat, -27.6);
  w.stop();
  w.arrived('base:yamb', () => null);
  assert.equal(w.log().at(-1).warmed, true);
  w.stop();
});
