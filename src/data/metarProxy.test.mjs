import test from 'node:test';
import assert from 'node:assert/strict';
import { metarProxy, parseMetar } from '../../server/providers/metar.js';

const SAMPLE = {
  icaoId: 'YBBN',
  name: 'Brisbane Intl, QL, AU',
  obsTime: 1_760_490_000,
  temp: 24,
  dewp: 14,
  wdir: 190,
  wspd: 12,
  wgst: 22,
  visib: '6+',
  altim: 1016,
  fltCat: 'VFR',
  clouds: [{ cover: 'FEW', base: 3500 }],
  rawOb: 'METAR YBBN 150100Z 19012G22KT 9999 FEW035 24/14 Q1016',
};

test('a METAR is reduced to validated display fields', () => {
  const m = parseMetar(SAMPLE);
  assert.equal(m.station, 'YBBN');
  assert.equal(m.windDirDeg, 190);
  assert.equal(m.gustKt, 22);
  assert.equal(m.visibility, '6+');
  assert.equal(m.category, 'VFR');
  assert.deepEqual(m.clouds, [{ cover: 'FEW', baseFt: 3500 }]);
  assert.equal(m.observedAt, 1_760_490_000_000);
  assert.equal(parseMetar({ icaoId: '<b>' }), null);
  assert.equal(parseMetar({ ...SAMPLE, wdir: 'VRB' }).windDirDeg, 'VRB');
  assert.equal(parseMetar({ ...SAMPLE, temp: 400 }).tempC, null);
});

function call(plugin, url) {
  let handler;
  plugin.configurePreviewServer({
    middlewares: { use: (_p, h) => (handler = h) },
  });
  return new Promise((resolve) => {
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(body) {
        resolve({ status: this.status, body: JSON.parse(body) });
      },
    };
    handler({ method: 'GET', url }, res);
  });
}

test('stations are validated, cached for ten minutes and served stale on failure', async () => {
  let calls = 0;
  let fail = false;
  let t = 0;
  const plugin = metarProxy({
    now: () => t,
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(url, /ids=YBBN&format=json$/);
      if (fail) return { ok: false, body: { cancel: async () => {} } };
      return new Response(JSON.stringify([SAMPLE]), { status: 200 });
    },
  });
  assert.equal((await call(plugin, '/?ids=ybbn;drop')).status, 400);
  const a = await call(plugin, '/?ids=YBBN');
  assert.equal(a.status, 200);
  assert.equal(a.body.reports[0].station, 'YBBN');
  assert.equal(a.body.reports[0].stale, false);
  t = 5 * 60_000;
  await call(plugin, '/?ids=YBBN');
  assert.equal(calls, 1, 'served from cache');
  fail = true;
  t = 30 * 60_000;
  const c = await call(plugin, '/?ids=YBBN');
  assert.equal(calls, 2);
  assert.equal(c.body.reports[0].stale, true, 'last good report, marked stale');
});
