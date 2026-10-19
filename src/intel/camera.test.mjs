import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCameraHud,
  cameraFacing,
  compassPoint,
  CAMERA_FRAME_REFRESH_MS,
} from './camera.js';
import { buildPlaceHud } from './place.js';
import { toIntelObject, INTEL_LAYERS } from './objects.js';
import { enabledLivePacks } from '../../server/providers/cctv/catalog.js';

const record = {
  id: 'nsw-1',
  name: 'M1 Pacific Motorway at Berowra',
  city: 'Sydney',
  provider: 'Live Traffic NSW',
  license: 'CC BY 4.0',
  credit: '',
  feedType: 'image',
  lat: -33.62,
  lon: 151.15,
  headingDeg: 182,
  headingConfidence: 'low',
};

test('a street camera opens as an all-feed card set with its live still', () => {
  const o = toIntelObject('cctv', record);
  assert.equal(INTEL_LAYERS.cctv, 'camera');
  assert.equal(o.kind, 'camera');
  const nearby = [
    { object: { kind: 'aircraft' }, km: 3 },
    { object: { kind: 'camera' }, km: 1 },
  ];
  const hud = buildCameraHud(o, {
    frameUrl: '/api/cctv/frame/nsw-1?ts=1',
    refreshedAt: Date.UTC(2026, 9, 19, 4, 0, 0),
    nearby,
    radiusKm: 50,
  });
  assert.equal(hud.kind, 'camera');
  assert.equal(hud.cards.length, 4);
  for (const c of hud.cards) {
    assert.equal(c.source, 'feed', `${c.id} must be feed`);
    for (const r of c.rows) assert.equal(r.sim, false, `${c.id}/${r.label}`);
  }
  assert.equal(hud.cards[0].frame.url, '/api/cctv/frame/nsw-1?ts=1');
  const around = Object.fromEntries(
    hud.cards[3].rows.map((r) => [r.label, r.value]),
  );
  assert.equal(around['Aircraft within 50 km'], '1');
  assert.equal(around['Other cameras within 50 km'], '1');
  assert.match(hud.source, /Live Traffic NSW/);
  assert.equal(CAMERA_FRAME_REFRESH_MS, 10_000);
});

test('a camera facing is shown only when the source published it with confidence', () => {
  assert.equal(cameraFacing(record), 'Not published');
  assert.equal(
    cameraFacing({ ...record, headingConfidence: 'high' }),
    'S (182°)',
  );
  assert.equal(compassPoint(44), 'NE');
  assert.equal(compassPoint('x'), null);
});

test('a Director place card shows the nearest camera still when one is within reach', () => {
  const place = { id: 'yssy', name: 'Sydney', lat: -33.94, lon: 151.18 };
  const ctx = {
    camera: { record, km: 0.4, frameUrl: '/api/cctv/frame/nsw-1?ts=2' },
  };
  const hud = buildPlaceHud(place, ctx);
  const around = hud.cards.find((c) => c.id === 'around');
  assert.equal(around.frame.url, '/api/cctv/frame/nsw-1?ts=2');
  assert.ok(
    around.rows.some(
      (r) => r.label === 'Street camera' && /<1 km/.test(r.value),
    ),
  );
  const without = buildPlaceHud(place, {}).cards.find((c) => c.id === 'around');
  assert.equal(without.frame, undefined);
});

test('open-licence camera networks are on by default; courtesy-only ones are off', () => {
  const keys = Object.keys(process.env).filter((k) => k.startsWith('CCTV_'));
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  try {
    assert.deepEqual(enabledLivePacks(), [
      'nsw',
      'tfl',
      'fintraffic',
      'drivebc',
      'calgary',
      'ontario',
    ]);
    process.env.CCTV_TXDOT_ENABLED = '1';
    process.env.CCTV_NSW_ENABLED = '0';
    const on = enabledLivePacks();
    assert.ok(on.includes('txdot'));
    assert.ok(!on.includes('nsw'));
    assert.ok(!on.includes('deldot'));
  } finally {
    for (const k of Object.keys(process.env))
      if (k.startsWith('CCTV_')) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
