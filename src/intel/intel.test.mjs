import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDossier } from './enrichment.js';
import { toIntelObject, buildTriage, triageReason, nearestHit } from './objects.js';

const plane = toIntelObject('flights', {
  icao24: 'abc123', callsign: 'TST101', lat: 51.5, lon: -0.1, altitudeM: 10000,
  speedMps: 230, heading: 90, squawk: '7700', operator: 'Test Air', routeOrigin: 'LHR',
});

test('dossier is deterministic per object', () => {
  assert.deepEqual(buildDossier(plane), buildDossier(plane));
});

test('feed and simulated content are kept apart', () => {
  const d = buildDossier(plane);
  assert.equal(d.source, 'ADS-B / OpenSky');
  assert.ok(d.feed.some((f) => f.label === 'Squawk' && f.value === '7700'));
  for (const link of d.links) assert.ok(['feed', 'sim'].includes(link.source));
  assert.equal(d.links.find((l) => l.rel === 'Operated by').source, 'feed');
  assert.ok(d.analysis.length > 0 && d.pol.length > 0);
});

test('missing operator becomes a simulated link, never a feed one', () => {
  const d = buildDossier(toIntelObject('flights', { icao24: 'x', lat: 0, lon: 0 }));
  assert.equal(d.links.find((l) => l.rel === 'Operated by').source, 'sim');
});

test('unplaceable records are dropped', () => {
  assert.equal(toIntelObject('flights', { icao24: 'x' }), null);
  assert.equal(toIntelObject('unknown-layer', { lat: 0, lon: 0 }), null);
});

test('triage is driven by feed fields only', () => {
  assert.equal(triageReason(plane).severity, 'critical');
  const routine = toIntelObject('flights', { icao24: 'y', lat: 0, lon: 0, squawk: '1200' });
  assert.equal(triageReason(routine), null);
  const mil = toIntelObject('military', { icao24: 'ae0001', lat: 0, lon: 0 });
  assert.equal(triageReason(mil).severity, 'watch');
  const quake = toIntelObject('earthquakes', { id: 'q', lat: 1, lon: 1, magnitude: 6.3 });
  const items = buildTriage([mil, quake, routine, plane]);
  assert.deepEqual(items.map((i) => i.severity), ['critical', 'critical', 'watch']);
  assert.equal(items[0].object.kind, 'earthquake');
});

test('nearestHit picks the closest point within radius', () => {
  const pts = [{ x: 0, y: 0, id: 'a' }, { x: 10, y: 0, id: 'b' }];
  assert.equal(nearestHit(pts, 8, 0).id, 'b');
  assert.equal(nearestHit(pts, 100, 100), null);
});

import { nearbyObjects, distanceKm, insideArea } from './objects.js';
import { composeBrief } from './enrichment.js';

test('nearby uses real geometry and excludes self', () => {
  const a = toIntelObject('flights', { icao24: 'a', lat: 0, lon: 0, altitudeM: 0 });
  const b = toIntelObject('flights', { icao24: 'b', lat: 0, lon: 0.5, altitudeM: 0 });
  const c = toIntelObject('flights', { icao24: 'c', lat: 10, lon: 10, altitudeM: 0 });
  assert.ok(Math.abs(distanceKm(a, b) - 55.6) < 1);
  const n = nearbyObjects([a, b, c], a);
  assert.equal(n.total, 1);
  assert.equal(n.items[0].object.key, b.key);
  assert.equal(insideArea([a, b, c], { lat: 0, lon: 0, radiusKm: 100 }).length, 2);
});

test('brief states feed facts and labels the simulated part', () => {
  const text = composeBrief(buildDossier(plane), { total: 2, radiusKm: 150 });
  assert.match(text, /From ADS-B \/ OpenSky:/);
  assert.match(text, /squawk 7700/);
  assert.match(text, /2 other contacts within 150/);
  assert.match(text, /Simulated assessment:/);
});
