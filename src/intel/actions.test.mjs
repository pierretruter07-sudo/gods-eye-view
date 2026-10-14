import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tileXY,
  imageryMosaic,
  atcMessage,
  portMessage,
  responderMessage,
  simulatedManifest,
  simulatedFlightPlan,
  screenConjunctions,
  runAction,
  ACTIONS,
} from './actions.js';
import { HUD_ACTIONS } from './hud.js';
import { toIntelObject } from './objects.js';
import { resultPanel } from './markup.js';

test('tile maths matches the web-mercator reference', () => {
  const t = tileXY(0, 0, 1);
  assert.equal(t.x, 1);
  assert.ok(Math.abs(t.y - 1) < 1e-9);
  const m = imageryMosaic(-27.38, 153.12, 15);
  assert.equal(m.tiles.length, 4);
  assert.match(m.tiles[0], /World_Imagery\/MapServer\/tile\/15\/\d+\/\d+$/);
  assert.ok(m.markX >= 0.25 && m.markX <= 0.75 && m.markY >= 0.25 && m.markY <= 0.75);
});

test('drafted messages carry live values only', () => {
  const plane = toIntelObject('flights', { icao24: 'abc', callsign: 'QFA1', lat: -27.4, lon: 153.1, altitudeM: 10668, speedMps: 240, heading: 90, squawk: '7700' });
  assert.match(atcMessage(plane), /^QFA1, position -27\.40 153\.10, FL350, 467 knots, heading 90, squawking 7700/);
  const ship = toIntelObject('ais-live-vessels', { mmsi: '123', name: 'TEST', lat: 1, lon: 104, speedKts: 11.3, courseDeg: 49, destination: 'SINGAPORE' });
  assert.match(portMessage(ship), /MMSI 123.*11\.3 kn, course 49°, declared destination SINGAPORE/);
  const q = toIntelObject('earthquakes', { id: 'q', magnitude: 6.1, depthKm: 10, lat: 0, lon: 0, place: 'Offshore', timeMs: Date.UTC(2026, 9, 14, 8, 5) });
  assert.match(responderMessage(q, { aircraft: 3, vessels: 5 }), /M6\.1 — Offshore, depth 10 km, 08:05 UTC\. 3 aircraft and 5 vessels/);
});

test('simulated documents are deterministic and flagged', () => {
  const ship = toIntelObject('ais-live-vessels', { mmsi: '1', lat: 0, lon: 0 });
  assert.deepEqual(simulatedManifest(ship), simulatedManifest(ship));
  const plane = toIntelObject('flights', { icao24: 'a', lat: 0, lon: 0, altitudeM: 10000 });
  const fpl = simulatedFlightPlan(plane);
  assert.equal(fpl.find((r) => r.label === 'Callsign').sim, undefined);
  assert.equal(fpl.find((r) => r.label === 'Filed cruise level').sim, true);
});

test('conjunction screen finds the closest sampled approach', () => {
  const target = { noradId: '1', name: 'T', satrec: 0 };
  const near = { noradId: '2', name: 'NEAR', satrec: 10 };
  const far = { noradId: '3', name: 'FAR', satrec: 1000 };
  const propagateEci = (satrec) => ({ x: satrec, y: 0, z: 0 });
  const hits = screenConjunctions(target, [target, near, far], { propagateEci, fromMs: 0, minutes: 1, stepSec: 30 });
  assert.deepEqual(hits.map((h) => [h.name, h.km]), [['NEAR', 10], ['FAR', 1000]]);
});

test('every HUD action has a runner, and results render', async () => {
  for (const [kind, list] of Object.entries(HUD_ACTIONS))
    for (const a of list) assert.equal(typeof ACTIONS[kind][a.id], 'function', `${kind}.${a.id}`);
  const ship = toIntelObject('ais-live-vessels', { mmsi: '1', name: 'X', lat: 0, lon: 0 });
  const r = await runAction('manifest', ship, { objects: [], now: 0, satrecs: () => [], installations: () => [] });
  const html = resultPanel(r);
  assert.match(html, /Cargo manifest/);
  assert.match(html, /SIM/);
  assert.match(resultPanel(r, { busy: true }), /Computing from live data/);
});
