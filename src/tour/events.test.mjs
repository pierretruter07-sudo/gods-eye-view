import test from 'node:test';
import assert from 'node:assert/strict';
import { countNearby, rankEvents } from './events.js';
import { eventLine, stopLine } from './lines.js';
import { cleanSquawk } from '../sources/live/aircraft.js';

const now = Date.parse('2026-10-13T00:00:00Z');
const plane = (icao24, squawk, extra = {}) => ({
  icao24,
  callsign: icao24.toUpperCase(),
  squawk,
  lat: -27,
  lon: 153,
  altitudeM: 3000,
  speedMps: 100,
  onGround: false,
  ...extra,
});
const quake = (id, magnitude, ageMin, extra = {}) => ({
  id,
  magnitude,
  timeMs: now - ageMin * 60_000,
  lat: 10,
  lon: 20,
  depthKm: 12,
  place: 'Somewhere',
  ...extra,
});

test('squawk codes are four octal digits or null', () => {
  assert.equal(cleanSquawk('7700'), '7700');
  assert.equal(cleanSquawk(' 7600 '), '7600');
  assert.equal(cleanSquawk('7800'), null);
  assert.equal(cleanSquawk('770'), null);
  assert.equal(cleanSquawk(7700), null);
  assert.equal(cleanSquawk(null), null);
});

test('emergency aircraft rank 7500, 7700, 7600 and ignore ordinary codes', () => {
  const events = rankEvents({
    flights: [plane('a', '7600'), plane('b', '1200'), plane('c', '7700'), plane('d', '7500')],
    quakes: [],
    now,
  });
  assert.deepEqual(
    events.map((e) => e.facts.squawk),
    ['7500', '7700', '7600'],
  );
});

test('aircraft come before quakes; quakes rank by size then recency', () => {
  const events = rankEvents({
    flights: [plane('a', '7700')],
    quakes: [quake('q1', 5.0, 30), quake('q2', 6.2, 200), quake('q3', 5.0, 5)],
    now,
  });
  assert.deepEqual(
    events.map((e) => e.key),
    ['aircraft:a:7700', 'earthquake:q2', 'earthquake:q3', 'earthquake:q1'],
  );
});

test('small, old and positionless quakes are ignored', () => {
  const events = rankEvents({
    flights: [plane('x', '7700', { lat: null })],
    quakes: [
      quake('small', 4.4, 10),
      quake('old', 7.0, 6 * 60 + 1),
      quake('nopos', 6.0, 10, { lat: null }),
    ],
    now,
  });
  assert.equal(events.length, 0);
});

test('events already shown are not repeated', () => {
  const seen = new Set(['aircraft:a:7700']);
  const events = rankEvents({ flights: [plane('a', '7700')], quakes: [], now, seen });
  assert.equal(events.length, 0);
});

test('spoken lines use only feed values and flag simulated events', () => {
  const [real] = rankEvents({ flights: [plane('qfa1', '7700')], quakes: [], now });
  const line = eventLine(real, now);
  assert.match(line, /^Alert\. Flight QFA1 is squawking seven seven zero zero, general emergency\./);
  assert.match(line, /Altitude 9,800 feet\. Ground speed 194 knots\./);

  const [sim] = rankEvents({
    flights: [plane('sim1', '7700', { simulated: true, callsign: null, altitudeM: null, speedMps: null })],
    quakes: [],
    now,
  });
  assert.equal(
    eventLine(sim, now),
    'Simulated event. An aircraft is squawking seven seven zero zero, general emergency.',
  );

  const [q] = rankEvents({ flights: [], quakes: [quake('q', 6.04, 30)], now });
  assert.equal(
    eventLine(q, now),
    'Alert. A magnitude 6.0 earthquake, Somewhere, 30 minutes ago. Depth 12 kilometres.',
  );
});

test('nearby counts skip grounded and far-away aircraft', () => {
  const flights = [
    plane('near', null, { lat: -27.1, lon: 153.1 }),
    plane('ground', null, { onGround: true }),
    plane('far', null, { lat: 0, lon: 0 }),
  ];
  assert.equal(countNearby(flights, -27, 153, 100), 1);
  assert.equal(
    stopLine({ id: 'ybbn', label: 'Brisbane' }, 1, 100),
    'Brisbane. 1 aircraft airborne within 100 kilometres.',
  );
});
