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
  homeRig,
  rigPose,
  rigFromPosition,
  interpolateRig,
} from './cameraMath.js';
import { readinessJourney, ledgerProgress } from './evidenceModel.js';
import { IMPACT_AREAS, IMPACT_ITEMS, PARTS, impactFor } from './impact.js';
import {
  stopStory,
  findingStatesAt,
  itemsAt,
  latestMeasured,
  timelineStops,
} from './progress.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the audit snapshot rolls up to the ledger baseline readiness and verdicts', () => {
  const opts = { swal: data.swal, asvsLevel: data.asvsLevel };
  const atBase = itemsAt(ledger, data.items, 0);
  const saf = rollup(atBase, 'saf', opts);
  const sec = rollup(atBase, 'sec', opts);
  const base = ledger.audits[0];
  assert.ok(near(saf.readiness, base.safety.readiness, 1e-4));
  assert.ok(near(sec.readiness, base.security.readiness, 1e-4));
  assert.equal(saf.verdict, base.safety.verdict);
  assert.equal(sec.verdict, base.security.verdict);
  assert.equal(saf.open, base.safety.open);
  assert.equal(sec.open, base.security.open);
  assert.equal(saf.blocking + sec.blocking, 20);
  // The shipped snapshot is the latest measured audit.
  const last = ledger.audits[ledger.audits.length - 1];
  assert.ok(
    near(
      rollup(data.items, 'saf', opts).readiness,
      last.safety.readiness,
      1e-4,
    ),
  );
  assert.ok(
    near(
      rollup(data.items, 'sec', opts).readiness,
      last.security.readiness,
      1e-4,
    ),
  );
});

test('every must-fix item has a plain-English card, and no card is stale', () => {
  const ids = mustFix(itemsAt(ledger, data.items, 0)).map((i) => i.id);
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

test('the tour camera rig reproduces the home framing and keeps its target in view', () => {
  const fovy = (40 * Math.PI) / 180;
  const lon = 0.9;
  const home = homeRig(fovy);
  const a = rigPose(home, lon, { radiusM: 1 });
  const b = auditPose(lon, fovy, { radiusM: 1 });
  a.position.forEach((x, i) => assert.ok(near(x, b.destination[i], 1e-9)));
  a.direction.forEach((x, i) => assert.ok(near(x, b.direction[i], 1e-9)));
  const back = rigFromPosition(a.position, lon, home.target, { radiusM: 1 });
  assert.ok(near(back.dist, home.dist, 1e-9) && near(back.el, home.el, 1e-9));
  const close = { target: [3, 0.4, 1], az: 2.9, el: 0.4, dist: 3 };
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const r = interpolateRig(home, close, t, { lift: 0.2 });
    const p = rigPose(r, lon, { radiusM: 1 });
    const tgt = rigPose({ ...r, dist: 0 }, lon, { radiusM: 1 }).position;
    const to = tgt.map((x, i) => x - p.position[i]);
    const len = Math.hypot(...to);
    const cos = to.reduce((s, x, i) => s + (x / len) * p.direction[i], 0);
    assert.ok(cos > 0.999999, `target off-axis at t=${t}`);
  }
  const mid = interpolateRig(home, close, 0.5);
  assert.ok(Math.abs(mid.az - (home.az + (2.9 - home.az) / 2)) < 1e-9);
});

test('projected stops reproduce the plan’s readiness journey, wave by wave', () => {
  const opts = { swal: data.swal, asvsLevel: data.asvsLevel };
  const stops = timelineStops(ledger);
  assert.equal(stops.length, ledger.waves.length + 2);
  assert.equal(stops.at(-1).label, 'Sign-off');
  assert.equal(stops[0].kind, 'measured');
  ledger.projections.journey.forEach((j, w) => {
    const at = itemsAt(ledger, data.items, w);
    const saf = rollup(at, 'saf', opts);
    const sec = rollup(at, 'sec', opts);
    assert.ok(
      near(saf.readiness, j.safety, 1e-3),
      `safety at stop ${w}: ${saf.readiness} vs ${j.safety}`,
    );
    assert.ok(
      near(sec.readiness, j.security, 1e-3),
      `security at stop ${w}: ${sec.readiness} vs ${j.security}`,
    );
    if (w) assert.equal(stops[w].kind, 'projected');
  });
  // Sign-off: the end state with the customer and an independent reviewer.
  const full = ledger.projections.scenarios.find((x) => x.id === 'B');
  const end = itemsAt(ledger, data.items, stops.length - 1);
  const endSaf = rollup(end, 'saf', opts);
  const endSec = rollup(end, 'sec', opts);
  assert.ok(near(endSaf.readiness, full.safety, 1e-3));
  assert.ok(near(endSec.readiness, full.security, 1e-3));
  assert.equal(endSaf.verdict, 'SWAL 3 claim supported');
  assert.equal(endSec.verdict, 'ASVS L2 met');
  // Projected fixes are marked; nothing is marked at the baseline.
  assert.ok(
    [...findingStatesAt(ledger, 0).values()].every((s) => !s.projected),
  );
  assert.ok([...findingStatesAt(ledger, 1).values()].some((s) => s.projected));
});

test('a recorded re-audit becomes a measured stop and later stops build on it', () => {
  const opts = { swal: data.swal, asvsLevel: data.asvsLevel };
  // A test ledger only: close every Wave 1 finding except one in audit A1.
  const demo = structuredClone(ledger);
  const w1 = demo.findings.filter((f) => f.wave === 1);
  const keep = w1[0];
  for (const f of w1.slice(1)) {
    f.history.push({
      date: '2026-10-20',
      event: 'rerated',
      audit: 'A1',
      from: f.baseline.status,
      status: 'C',
      severity: null,
      ref: 'test',
    });
  }
  demo.audits.push({
    id: 'A1',
    wave: 1,
    label: 'Wave 1 re-audit',
    date: '2026-10-20',
    commit: 'test',
    safety: {},
    security: {},
  });
  const stops = timelineStops(demo);
  assert.equal(stops[1].kind, 'measured');
  assert.equal(latestMeasured(stops).index, 1);
  const at0 = itemsAt(demo, data.items, 0);
  const at1 = itemsAt(demo, data.items, 1);
  const at2 = itemsAt(demo, data.items, 2);
  const byId = (list, id) => list.find((i) => i.id === id);
  const closed = w1[1].id;
  assert.equal(byId(at0, closed).status, w1[1].baseline.status);
  assert.equal(byId(at1, closed).status, 'C');
  assert.equal(byId(at1, closed).fixed, true);
  assert.equal(byId(at1, closed).projected, false);
  // The finding left open is measured open at stop 1, projected closed only later.
  assert.equal(byId(at1, keep.id).status, keep.baseline.status);
  assert.equal(byId(at2, keep.id).projected, true);
  assert.ok(
    rollup(at1, 'sec', opts).readiness > rollup(at0, 'sec', opts).readiness,
  );
  // The real ledger is untouched.
  assert.equal(ledger.audits.length, 1);
});

test('every item says how it affects God’s Eye View; must-fix items in their own words', () => {
  const base = itemsAt(ledger, data.items, 0);
  const must = mustFix(base).map((i) => i.id);
  assert.deepEqual([...IMPACT_ITEMS].sort(), [...must].sort());
  for (const g of new Set(data.items.map((i) => i.group)))
    assert.ok(IMPACT_AREAS.includes(g), `no impact statement for ${g}`);
  for (const item of base) {
    const imp = impactFor(item);
    assert.ok(imp.text.length > 20, `${item.id} has no impact text`);
    for (const p of imp.parts)
      assert.ok(PARTS[p], `${item.id}: unknown part ${p}`);
    if (item.status === 'P' || item.status === 'N')
      assert.equal(imp.tone, 'risk');
  }
  const v8 = impactFor(base.find((i) => i.id === 'V8.2.1'));
  assert.match(v8.text, /AIS and OpenSky/);
  assert.ok(v8.parts.includes('maps'));
  const fixed = impactFor({
    ...base.find((i) => i.id === 'V8.2.1'),
    status: 'C',
  });
  assert.equal(fixed.tone, 'covered');
});

test('the narrated playback explains each stop: what it fixes, what it closes, what it unlocks', () => {
  const stops = timelineStops(ledger);
  const mustIds = new Set(
    mustFix(itemsAt(ledger, data.items, 0)).map((i) => i.id),
  );
  let before = null;
  let closedTotal = 0;
  for (const s of stops) {
    const after = itemsAt(ledger, data.items, s.index);
    const st = stopStory(ledger, s.index, before, after, mustIds);
    assert.ok(st.fixes.length > 30, `stop ${s.index}: no explanation`);
    assert.ok(st.unlocks.length > 20, `stop ${s.index}: no unlock`);
    if (s.index === 0) assert.equal(st.closed, 0);
    else assert.ok(st.closed > 0, `stop ${s.index} closes nothing`);
    closedTotal += st.mustClosed.length;
    before = after;
  }
  assert.equal(closedTotal, mustIds.size, 'every must-fix closes at some stop');
});
