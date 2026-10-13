import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner } from './planner.js';
import { TOUR_TIMING } from './config.js';

const t0 = Date.parse('2026-10-13T00:00:00Z');
const min = 60_000;
const quake = (id, magnitude, ageMin) => ({
  id,
  magnitude,
  timeMs: t0 - ageMin * min,
  lat: 8,
  lon: -83,
  depthKm: 10,
  place: 'Panama',
});
const emergency = { icao24: 'abc', callsign: 'QFA1', squawk: '7700', lat: -27, lon: 153, onGround: false };
const ship = { name: 'EVER TEST', shipType: 'Cargo', lat: 1, lon: 104, speedKts: 14, destination: 'SINGAPORE' };
const iss = { noradId: '25544', name: 'ISS (ZARYA)', group: 'stations', lat: 10, lon: 20, altitudeM: 418_000, speedMps: 7660 };

test('a new incident always comes first, then the rotation keeps moving', () => {
  const planner = createPlanner();
  const data = { flights: [], quakes: [quake('q1', 5.2, 20)], vessels: [ship], satellites: [iss] };
  const first = planner.next(data, t0);
  assert.equal(first.kind, 'event');
  assert.match(first.line, /^Alert\./);
  assert.equal(first.dwellS, TOUR_TIMING.eventDwellS);
  // The same quake is not repeated straight away: the rotation moves on.
  const kinds = [1, 2, 3, 4].map(() => planner.next(data, t0 + min).kind);
  assert.deepEqual(kinds, ['airport', 'vessel', 'satellite', 'city']);
});

test('an emergency squawk interrupts and jumps the queue', () => {
  const planner = createPlanner();
  const quiet = { flights: [], quakes: [], vessels: [], satellites: [] };
  planner.next(quiet, t0);
  assert.equal(planner.hasFresh(quiet, t0), false);
  const busy = { ...quiet, flights: [emergency] };
  assert.equal(planner.hasFresh(busy, t0), true);
  const stop = planner.next(busy, t0);
  assert.equal(stop.kind, 'event');
  assert.equal(stop.event.facts.squawk, '7700');
  assert.equal(planner.hasFresh(busy, t0), false);
});

test('recent incidents are revisited after the cooldown, introduced as recent', () => {
  const planner = createPlanner({ rotation: ['recent', 'city'] });
  const data = { flights: [], quakes: [quake('q1', 6.1, 30)], vessels: [], satellites: [] };
  assert.equal(planner.next(data, t0).kind, 'event');
  // Too soon to revisit: falls through to a wide view.
  assert.equal(planner.next(data, t0 + min).kind, 'city');
  const later = t0 + (TOUR_TIMING.revisitAfterMin + 1) * min;
  const again = planner.next(data, later);
  assert.equal(again.kind, 'event');
  assert.match(again.line, /^Recent event\. A magnitude 6\.1 earthquake, Panama/);
});

test('slots with nothing to show are skipped; ships must be moving', () => {
  const planner = createPlanner({ rotation: ['vessel', 'satellite'] });
  const parked = { ...ship, speedKts: 0.2 };
  const stop = planner.next({ flights: [], quakes: [], vessels: [parked], satellites: [iss] }, t0);
  assert.equal(stop.kind, 'satellite');
  assert.equal(stop.view.heightM, 418_000);
  assert.equal(
    stop.line,
    'The International Space Station, 420 kilometres up, travelling at 27,600 kilometres per hour.',
  );
});

test('vessel lines use feed values only', () => {
  const planner = createPlanner({ rotation: ['vessel'] });
  const stop = planner.next({ flights: [], quakes: [], vessels: [ship], satellites: [] }, t0);
  assert.equal(stop.line, 'Cargo Ever Test, making 14 knots, bound for Singapore.');
});
