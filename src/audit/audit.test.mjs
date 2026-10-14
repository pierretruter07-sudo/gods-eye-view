import test from 'node:test';
import assert from 'node:assert/strict';
import data from './data/assessment.json' with { type: 'json' };
import ledger from '../../docs/evidence/ledger.json' with { type: 'json' };
import {
  FADED,
  LAYERS,
  RINGS,
  headline,
  isBlocking,
  layout,
  linkedIds,
  mustFix,
  nodeOpacity,
  rollup,
} from './model.js';
import { PLAIN, cardFor } from './plain.js';
import {
  auditPose,
  basisForLongitude,
  ease,
  localToEcef,
  overlayCamera,
} from './cameraMath.js';
import { readinessJourney, ledgerProgress } from './evidenceModel.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the audit snapshot rolls up to the ledger baseline readiness and verdicts', () => {
  const opts = { swal: data.swal, asvsLevel: data.asvsLevel };
  const saf = rollup(data.items, 'saf', opts);
  const sec = rollup(data.items, 'sec', opts);
  const base = ledger.audits[0];
  assert.ok(near(saf.readiness, base.safety.readiness, 1e-4));
  assert.ok(near(sec.readiness, base.security.readiness, 1e-4));
  assert.equal(saf.verdict, base.safety.verdict);
  assert.equal(sec.verdict, base.security.verdict);
  assert.equal(saf.open, base.safety.open);
  assert.equal(sec.open, base.security.open);
  assert.equal(saf.blocking + sec.blocking, 20);
});

test('every must-fix item has a plain-English card, and no card is stale', () => {
  const ids = mustFix(data.items).map((i) => i.id);
  assert.equal(ids.length, 20);
  for (const id of ids) assert.ok(PLAIN[id], `missing plain card for ${id}`);
  for (const id of Object.keys(PLAIN))
    assert.ok(ids.includes(id), `stale plain card ${id}`);
  const v8 = data.items.find((i) => i.id === 'V8.2.1');
  assert.equal(cardFor(v8).title, 'Anyone with the link can use everything');
  const other = data.items.find((i) => i.id === 'V1.2.1');
  assert.match(cardFor(other).title, /^Output encoding/);
});

test('every item sits once on its ring, with the must-fix pins raised', () => {
  const { nodes, groups } = layout(data.items);
  assert.equal(nodes.length, data.items.length);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  for (const n of nodes) {
    const r = Math.hypot(n.base[0], n.base[2]);
    assert.ok(near(r, RINGS[n.lens].radius, 1e-9));
    assert.equal(n.position[1] > n.base[1], n.blocking);
  }
  assert.equal(groups.filter((g) => g.lens === 'saf').length, 22);
  assert.equal(groups.filter((g) => g.lens === 'sec').length, 17);
  const anchor = nodes.find((n) => n.id === 'V8.2.1');
  assert.ok(near(anchor.angle, RINGS.sec.start, 1e-9));
});

test('layers start dark: only must-fix items show at full strength', () => {
  const layers = Object.fromEntries(LAYERS.map((l) => [l.id, l.on]));
  const { nodes } = layout(data.items);
  for (const n of nodes) {
    const o = nodeOpacity(n, layers);
    if (n.kind === 'mustfix') assert.equal(o, 1);
    else assert.ok(o <= FADED, `${n.id} too bright on first load`);
  }
  const passing = nodes.find((n) => n.kind === 'passing');
  assert.equal(nodeOpacity(passing, { ...layers, passing: true }), 1);
  assert.equal(nodeOpacity(passing, layers, { selected: passing.id }), 1);
});

test('linked items come from the shared evidence themes', () => {
  assert.deepEqual([...linkedIds(data.themes, 'V8.2.1')].sort(), [
    '3.1.2',
    '4.4.2',
    'V13.1.1',
    'V3.4.3',
  ]);
  assert.equal(linkedIds(data.themes, 'V1.3.2').size, 0);
});

test('the headline states how many items block a claim', () => {
  const saf = rollup(data.items, 'saf');
  const sec = rollup(data.items, 'sec');
  assert.equal(
    headline(saf, sec),
    'Not cleared yet: 20 items block a safe-and-secure claim',
  );
  assert.equal(isBlocking({ lens: 'sec', status: 'N' }), true);
  assert.equal(isBlocking({ lens: 'saf', status: 'P', sev: 'S3' }), false);
});

test('orbit-local axes are right-handed and fixed to the Earth', () => {
  const b = basisForLongitude(0.7);
  const cross = [
    b.x[1] * b.y[2] - b.x[2] * b.y[1],
    b.x[2] * b.y[0] - b.x[0] * b.y[2],
    b.x[0] * b.y[1] - b.x[1] * b.y[0],
  ];
  cross.forEach((c, i) => assert.ok(near(c, b.z[i])));
  assert.deepEqual(localToEcef([0, 1, 0], b), [0, 0, 1]);
});

test('the audit pose looks down on the orbit from above the ring plane', () => {
  const fovy = (40 * Math.PI) / 180;
  const pose = auditPose(1.2, fovy, { radiusM: 1 });
  const d = Math.hypot(...pose.destination);
  assert.ok(d > 12 && d < 30, `distance ${d}`);
  const elevation = Math.asin(pose.destination[2] / d);
  assert.ok(elevation > 0.45 && elevation < 0.75, `elevation ${elevation}`);
  assert.ok(near(Math.hypot(...pose.direction), 1));
  const dotDU = pose.direction.reduce((s, v, i) => s + v * pose.up[i], 0);
  assert.ok(near(dotDU, 0));
});

test('the overlay camera copies Cesium’s camera in Earth radii', () => {
  const cam = overlayCamera(
    {
      position: [6378137 * 20, 0, 0],
      direction: [-1, 0, 0],
      up: [0, 0, 1],
      fovy: Math.PI / 4,
      aspect: 1.6,
    },
    { radiusM: 6378137 },
  );
  assert.deepEqual(cam.position, [20, 0, 0]);
  assert.deepEqual(cam.target, [19, 0, 0]);
  assert.ok(near(cam.fovDeg, 45));
  assert.ok(cam.near > 0 && cam.far > 40);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
});

test('the evidence view reads the ledger top down: progress and journey', () => {
  const p = ledgerProgress(ledger, data.items);
  assert.equal(p.total, 103);
  assert.equal(p.blockTotal, 20);
  assert.ok(p.closed >= 0 && p.closed <= p.total);
  const j = readinessJourney(ledger);
  assert.equal(j.points[0].label, 'Baseline');
  assert.equal(j.points[0].kind, 'actual');
  assert.equal(j.points.length, 5);
});
