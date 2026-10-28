import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBE_PREFETCH,
  createGlobePrefetcher,
  imageryLevelFor,
  prefetchRings,
} from './globePrefetch.js';

test('closer views need finer imagery; the level falls by one per doubling', () => {
  const near = imageryLevelFor(1500, 49);
  assert.ok(near >= 14 && near <= 18, String(near));
  assert.equal(imageryLevelFor(3000, 49), near - 1);
  assert.ok(imageryLevelFor(380, 41) > near);
});

test('each view is covered in rings, nearest and finest first, all the way round', () => {
  const rings = prefetchRings({ lat: 49.3, lon: -123.1, rangeM: 1500 });
  assert.equal(rings.length, GLOBE_PREFETCH.rings.length);
  for (let i = 1; i < rings.length; i += 1) {
    assert.ok(rings[i].level < rings[i - 1].level, 'coarser further out');
    assert.ok(rings[i].north - rings[i].south > rings[i - 1].north - rings[i - 1].south);
  }
  const r0 = rings[0];
  assert.ok(r0.west < -123.1 && r0.east > -123.1 && r0.south < 49.3 && r0.north > 49.3);
  assert.deepEqual(prefetchRings({ lat: 0, lon: 0, rangeM: 20_000_000 }), []);
  assert.deepEqual(prefetchRings(null), []);
});

function fakeViewer() {
  const asked = [];
  const scheme = {
    positionToTileXY: (c, level) => ({
      x: Math.floor(((c.lon + 180) / 360) * 2 ** level),
      y: Math.floor(((90 - c.lat) / 180) * 2 ** level),
    }),
    getNumberOfXTilesAtLevel: (level) => 2 ** level,
  };
  const imagery = {
    tilingScheme: scheme,
    maximumLevel: 19,
    requestImage: (x, y, l) => {
      asked.push(`i${l}/${x}/${y}`);
      return Promise.resolve({});
    },
  };
  const terrain = {
    tilingScheme: scheme,
    getTileDataAvailable: () => true,
    requestTileGeometry: (x, y, l) => {
      asked.push(`t${l}/${x}/${y}`);
      return Promise.resolve({});
    },
  };
  return {
    asked,
    viewer: {
      imageryLayers: { get: () => ({ imageryProvider: imagery }) },
      terrainProvider: terrain,
    },
  };
}
const Cesium = {
  Cartographic: { fromDegrees: (lon, lat) => ({ lon, lat }) },
};

test('the tiles for the stops ahead are downloaded once, without a camera', async () => {
  const { viewer, asked } = fakeViewer();
  const p = createGlobePrefetcher({ viewer, Cesium });
  const n = p.prefetch([{ lat: 51.18, lon: -115.57, rangeM: 1500 }]);
  assert.ok(n > 20 && n <= GLOBE_PREFETCH.maxTilesPerStop, String(n));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(asked.length, n, 'every tile asked for');
  assert.ok(asked.some((k) => k.startsWith('i')) && asked.some((k) => k.startsWith('t')));
  // The same stop again: nothing new to fetch.
  assert.equal(p.prefetch([{ lat: 51.18, lon: -115.57, rangeM: 1500 }]), 0);
  assert.equal(p.stats().done, n);
});
