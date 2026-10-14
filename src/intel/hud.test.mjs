import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHud, MAX_CARDS, orbitalPeriodMin, footprintKm, orbitClass } from './hud.js';
import { toIntelObject } from './objects.js';

const plane = toIntelObject('flights', { icao24: 'abc', callsign: 'QFA1', lat: 0, lon: 0, altitudeM: 10668, speedMps: 240, heading: 90, verticalRateMps: 0, operator: 'Qantas', routeOrigin: 'BNE', routeDestination: 'LAX' });
const ship = toIntelObject('ais-live-vessels', { mmsi: '1', name: 'TEST', lat: 0, lon: 0, speedKts: 11, courseDeg: 49, destination: 'SINGAPORE' });
const iss = toIntelObject('satellites', { noradId: '25544', name: 'ISS (ZARYA)', group: 'stations', lat: 0, lon: 0, altitudeM: 420000, speedMps: 7660 });
const quake = toIntelObject('earthquakes', { id: 'q', magnitude: 6.4, depthKm: 20, lat: 0, lon: 0, place: 'Offshore', timeMs: Date.UTC(2026, 9, 14, 8, 0) });

test('every kind gets at most four cards, deterministic', () => {
  for (const o of [plane, ship, iss, quake]) {
    const h = buildHud(o, []);
    assert.ok(h.cards.length > 0 && h.cards.length <= MAX_CARDS, o.kind);
    assert.deepEqual(buildHud(o, []), h);
    assert.ok(h.actions.length >= 1);
  }
});

test('feed values stay feed; illustrative rows are flagged', () => {
  const h = buildHud(plane, []);
  const flight = h.cards.find((c) => c.id === 'flight');
  assert.equal(flight.source, 'feed');
  assert.equal(flight.rows.find((r) => r.label === 'Phase').value, 'Cruise');
  assert.deepEqual(flight.route, { from: 'BNE', to: 'LAX', progress: null });
  const op = h.cards.find((c) => c.id === 'operator');
  assert.equal(op.source, 'mixed');
  assert.equal(op.rows.find((r) => r.label === 'Operator').sim, false);
  assert.equal(op.rows.find((r) => r.label === 'Owner / lessor').sim, true);
});

test('ownership is generic, never an invented company', () => {
  const own = buildHud(ship, []).cards.find((c) => c.id === 'ownership');
  assert.equal(own.source, 'sim');
  assert.deepEqual(own.rows.map((r) => r.value).slice(0, 3), ['Holding group', 'Single-ship company', 'Liner operator']);
});

test('orbit numbers are real physics', () => {
  assert.ok(Math.abs(orbitalPeriodMin(420) - 92.8) < 0.5);
  assert.ok(Math.abs(orbitalPeriodMin(35786) - 1436) < 2);
  assert.ok(Math.abs(footprintKm(420) - 2263) < 30);
  assert.equal(orbitClass(420), 'LEO');
  const orbit = buildHud(iss, []).cards.find((c) => c.id === 'orbit');
  assert.equal(orbit.source, 'feed');
});

test('staged demo objects are entirely simulated', () => {
  const demo = toIntelObject('flights', { icao24: 'd', lat: 0, lon: 0, squawk: '7700', simulated: true });
  const h = buildHud(demo, []);
  assert.ok(h.demo);
  assert.ok(h.cards.every((c) => c.source === 'sim' && c.rows.every((r) => r.sim)));
});
