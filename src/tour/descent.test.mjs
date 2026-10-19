import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESCENT_STEPS,
  DESCENT_WAIT,
  createDescentPlanner,
  pickDescentRegion,
  solarHour,
} from './descent.js';
import { DESCENT_REGIONS } from './config.js';

const sydney = DESCENT_REGIONS.find((r) => r.id === 'sydney');
const at = (iso) => Date.parse(iso);

const geoSat = (n) => ({
  noradId: `9${n}`,
  name: `GEO ${n}`,
  group: 'geo',
  lat: 0,
  lon: 150 + n,
  altitudeM: 35_786_000,
});
const iss = {
  noradId: '25544',
  name: 'ISS (ZARYA)',
  group: 'stations',
  lat: -20,
  lon: 140,
  altitudeM: 418_000,
  speedMps: 7660,
};
const jet = (id, lat, lon, altitudeM, extra = {}) => ({
  icao24: id,
  callsign: id.toUpperCase(),
  lat,
  lon,
  altitudeM,
  onGround: false,
  speedMps: 240,
  aircraftClass: 'airliner',
  ...extra,
});
const heli = jet('heli1', -33.9, 151.1, 450, {
  aircraftClass: 'helicopter',
  speedMps: 50,
});
const fireTruck = {
  icao24: 'veh1',
  callsign: 'FIRE2',
  lat: -33.94,
  lon: 151.17,
  onGround: true,
  speedMps: 6,
  category: 16,
};
const camera = (id, lat, lon) => ({
  id,
  name: `Camera ${id}`,
  provider: 'Transport for NSW',
  lat,
  lon,
});

const ferry = { mmsi: '503000001', name: 'HARBOUR FERRY', shipType: 'Passenger', lat: -33.86, lon: 151.23, speedKts: 11 };
const moored = { mmsi: '503000002', name: 'MOORED', shipType: 'Cargo', lat: -33.87, lon: 151.21, speedKts: 0 };
const fullData = () => ({
  satellites: [geoSat(1), geoSat(2), geoSat(3), iss],
  vessels: [moored, ferry, { ...ferry, mmsi: 'far', lat: 1, lon: 104 }],
  flights: [
    jet('far1', 10, 100, 11_900), // in band but far away
    jet('qfa1', -34.5, 150.5, 11_600), // in band, nearest Sydney
    jet('low1', -33.8, 151.0, 3_000), // below the band
    heli,
    fireTruck,
  ],
  cameras: [
    camera('c1', -33.87, 151.21),
    camera('c2', -33.88, 151.2),
    camera('c3', -33.86, 151.22),
    camera('far', -37.8, 144.9),
  ],
});

test('the descent region is the one nearest early afternoon, solar time', () => {
  assert.equal(Math.round(solarHour(0, at('2026-10-19T12:00:00Z'))), 12);
  assert.equal(pickDescentRegion(at('2026-10-19T02:00:00Z')).id, 'sydney');
  assert.equal(pickDescentRegion(at('2026-10-19T12:30:00Z')).id, 'london');
  assert.equal(pickDescentRegion(at('2026-10-19T18:00:00Z')).id, 'toronto');
});

test('the descent steps down from GEO to street level, then ends', () => {
  const planner = createDescentPlanner({ region: sydney });
  const data = fullData();
  const stops = [];
  for (let stop = planner.next(data); stop; stop = planner.next(data))
    stops.push(stop);
  assert.deepEqual(
    stops.map((s) => s.descent),
    ['geo', 'satellite', 'cruise', 'low', 'ship', 'ground', 'street', 'nearby', 'nearby'],
  );
  assert.equal(stops.length, DESCENT_STEPS.length);
  assert.ok(planner.isDone());
  // Each step is lower than the one before it.
  const heights = stops.slice(0, 7).map((s) => s.view.heightM + s.view.rangeM);
  for (let i = 1; i < heights.length; i += 1)
    assert.ok(heights[i] < heights[i - 1], `step ${i} should be lower`);
  const [geo, sat, cruise, low, ship, ground, street, n1, n2] = stops;
  assert.equal(ship.vessel.mmsi, '503000001', 'nearest ship under way, not the moored one');
  assert.equal(ship.kind, 'vessel');
  assert.match(ship.line, /^Passenger Harbour Ferry, making 11 knots\./);
  assert.equal(geo.count, 3);
  assert.match(geo.line, /3 satellites tracked/);
  assert.equal(sat.satellite.isIss, true);
  assert.equal(cruise.aircraft.icao24, 'qfa1', 'nearest in-band airliner');
  assert.match(cruise.line, /^Flight QFA1 at 38,100 feet/);
  assert.equal(low.aircraft.icao24, 'heli1');
  assert.match(low.line, /^A helicopter at 1,500 feet/);
  assert.equal(ground.aircraft.icao24, 'veh1');
  assert.match(ground.line, /^An airport emergency vehicle/);
  assert.equal(street.camera.id, 'c1');
  assert.match(street.line, /^Street level\. Camera c1, a live Transport for NSW camera\./);
  assert.ok(street.view.orbitDegPerS > 0, 'street level turns faster');
  assert.deepEqual(
    [n1.camera.id, n2.camera.id].sort(),
    ['c2', 'c3'],
    'nearby cameras, never the far one or a repeat',
  );
  assert.equal(planner.next(data), null);
});

test('fallbacks: a light aircraft for the helicopter, a taxiing aircraft for the vehicle', () => {
  const planner = createDescentPlanner({ region: sydney });
  const data = fullData();
  data.flights = [
    jet('qfa1', -34.5, 150.5, 11_600),
    jet('vh1', -33.7, 151.3, 900, { aircraftClass: 'light', speedMps: 55 }),
    jet('taxi1', -33.95, 151.18, 0, { onGround: true, speedMps: 7 }),
    jet('parked', -33.94, 151.17, 0, { onGround: true, speedMps: 0 }),
  ];
  const stops = [];
  for (let stop = planner.next(data); stop; stop = planner.next(data))
    stops.push(stop);
  const by = Object.fromEntries(stops.map((s) => [s.descent, s]));
  assert.equal(by.low.aircraft.icao24, 'vh1');
  assert.match(by.low.line, /^A light aircraft at 3,000 feet/);
  assert.equal(by.ground.aircraft.icao24, 'taxi1');
  assert.match(by.ground.line, /^Flight TAXI1 taxiing at 14 knots\./);
});

test('a step with nothing live is skipped, never faked', () => {
  const planner = createDescentPlanner({ region: sydney });
  const data = fullData();
  data.flights = [jet('low1', -33.8, 151.0, 3_000)];
  const steps = [];
  for (let stop = planner.next(data); stop; stop = planner.next(data))
    steps.push(stop.descent);
  assert.deepEqual(steps, ['geo', 'satellite', 'ship', 'street', 'nearby', 'nearby']);
});

test('a step waits while its source is still loading, and can be skipped', () => {
  const planner = createDescentPlanner({ region: sydney });
  assert.equal(planner.next({ satellites: [] }), DESCENT_WAIT);
  assert.equal(planner.peekStep(), 'geo');
  planner.skip();
  assert.equal(planner.peekStep(), 'iss');
  assert.equal(planner.next({ satellites: [iss] }).descent, 'satellite');
  // The region's staged aircraft count as loaded data.
  const stop = planner.next({ flights: [], staged: [jet('s1', -34, 151, 12_000)] });
  assert.equal(stop.descent, 'cruise');
  assert.equal(stop.aircraft.icao24, 's1');
});
