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
  // The same quake is not repeated straight away: the defence rotation moves
  // on (military slots with nothing airborne are skipped).
  const kinds = [1, 2, 3, 4].map(() => planner.next(data, t0 + min).kind);
  assert.deepEqual(kinds, ['airport', 'base', 'vessel', 'airport']);
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
  const later =
    t0 + (Math.max(TOUR_TIMING.revisitAfterMin, TOUR_TIMING.alertGapMin) + 1) * min;
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

test('naval / state vessels are preferred, even when slow', () => {
  const planner = createPlanner({ rotation: ['vessel'] });
  const cargo = { mmsi: '1', name: 'BULK ONE', lat: 1, lon: 1, speedKts: 14, shipType: 'Cargo' };
  const navy = { mmsi: '2', name: 'PATROL', lat: 2, lon: 2, speedKts: 3, shipType: 'Military ops' };
  const stop = planner.next({ flights: [], quakes: [], vessels: [cargo, navy], satellites: [] }, t0);
  assert.equal(stop.vessel.mmsi, '2');
});

test('military aircraft get their own stop, from feed values', () => {
  const planner = createPlanner({ rotation: ['military'] });
  const m = { icao24: 'ae1234', callsign: 'RCH123', aircraftClass: 'C17', lat: 10, lon: 20, altitudeM: 9144, onGround: false };
  const stop = planner.next({ flights: [], quakes: [], vessels: [], satellites: [], military: [m] }, t0);
  assert.equal(stop.kind, 'military');
  assert.match(stop.line, /RCH123/);
  assert.match(stop.line, /30,000 feet/);
});

test('at most one alert every ten minutes; later alerts wait their turn', () => {
  const planner = createPlanner({ rotation: ['city'] });
  const q1 = quake('q1', 5.0, 5);
  const q2 = quake('q2', 6.0, 4);
  const data = { flights: [], quakes: [q1, q2], vessels: [], satellites: [] };
  const first = planner.next(data, t0);
  assert.equal(first.kind, 'event');
  // Another fresh quake inside the gap neither interrupts nor jumps in.
  assert.equal(planner.hasFresh(data, t0 + 5 * min), false);
  assert.equal(planner.next(data, t0 + 5 * min).kind, 'city');
  const gap = TOUR_TIMING.alertGapMin * min;
  assert.equal(planner.hasFresh(data, t0 + gap), true);
  const second = planner.next(data, t0 + gap);
  assert.equal(second.kind, 'event');
  assert.notEqual(second.event.key, first.event.key);
});

test('military stops favour named types like a Black Hawk, and do not repeat', () => {
  const planner = createPlanner({ rotation: ['military'] });
  const plain = { icao24: 'ae0001', callsign: 'XYZ1', lat: 1, lon: 1, altitudeM: 3000, onGround: false };
  const hawk = { icao24: 'ae0002', callsign: 'DUSTY21', typeCode: 'H60', operator: 'US Army', lat: 2, lon: 2, altitudeM: 300, onGround: false };
  const data = { flights: [], quakes: [], vessels: [], satellites: [], military: [plain, hawk] };
  const first = planner.next(data, t0);
  assert.equal(first.aircraft.icao24, 'ae0002');
  assert.match(first.line, /^A Black Hawk helicopter, callsign DUSTY21, operated by US Army, at 1,000 feet/);
  // Shown recently: the next military stop is a different aircraft.
  assert.equal(planner.next(data, t0 + min).aircraft.icao24, 'ae0001');
});

test('military airfields are stops with live traffic counts', () => {
  const planner = createPlanner({ rotation: ['base'] });
  const near = { icao24: 'x', lat: -27.65, lon: 152.7, onGround: false };
  const stop = planner.next({ flights: [near], quakes: [], vessels: [], satellites: [], military: [] }, t0);
  assert.equal(stop.kind, 'base');
  assert.equal(stop.base.id, 'yamb');
  assert.equal(stop.line, 'Military airfield: RAAF Base Amberley, Queensland. 1 aircraft airborne within 50 kilometres.');
});

test('military stops fall back to military airframes in the flights feed', () => {
  const planner = createPlanner({ rotation: ['military'] });
  const civil = { icao24: 'c1', callsign: 'QFA1', lat: 1, lon: 1, altitudeM: 10000, onGround: false };
  const mil = { icao24: 'ae9', callsign: 'RCH9', military: true, typeCode: 'C17', lat: 2, lon: 2, altitudeM: 9000, onGround: false };
  const stop = planner.next({ flights: [civil, mil], quakes: [], vessels: [], satellites: [], military: [] }, t0);
  assert.equal(stop.kind, 'military');
  assert.equal(stop.aircraft.icao24, 'ae9');
  assert.match(stop.line, /^A C-17 Globemaster III, callsign RCH9/);
});

test('placeholder AIS destinations are not read out', () => {
  const planner = createPlanner({ rotation: ['vessel'] });
  const v = { mmsi: '9', name: 'BROLTUS', shipType: 'Cargo', lat: 1, lon: 1, speedKts: 12, destination: '0' };
  assert.equal(planner.next({ flights: [], quakes: [], vessels: [v], satellites: [] }, t0).line, 'Cargo Broltus, making 12 knots.');
});
