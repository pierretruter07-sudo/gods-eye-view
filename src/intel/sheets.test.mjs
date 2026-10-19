import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockCsv,
  cameraHealthRows,
  exposureEstimate,
  linkedObjects,
  objectIdentity,
  objectLineage,
  objectProperties,
  objectTimeline,
  orbitElements,
  overviewSheet,
  portCalls,
  trackHistory,
} from './sheets.js';
import { sheetDrawer } from './markup.js';
import { toIntelObject } from './objects.js';

const now = Date.parse('2026-10-19T06:00:00Z');
const jet = toIntelObject('flights', {
  icao24: '7c6b2d',
  callsign: 'QFA12',
  lat: -33.9,
  lon: 151.2,
  altitudeM: 11_000,
  speedMps: 240,
  heading: 90,
  operator: 'Qantas',
  routeOrigin: 'YSSY',
  routeDestination: 'KLAX',
});
const ship = toIntelObject('ais-live-vessels', {
  mmsi: '503000001',
  name: 'TEST CARRIER',
  shipType: 'Cargo',
  destination: 'BRISBANE',
  lat: -27.3,
  lon: 153.4,
  speedKts: 14,
  courseDeg: 10,
});
const cam = { kind: 'camera', key: 'camera:c1', id: 'c1', name: 'Harbour Bridge', provider: 'Transport for NSW', lat: -33.85, lon: 151.21 };

test('an object opens with a typed identity, a stable id and a lineage from its feed', () => {
  const id = objectIdentity(jet);
  assert.equal(id.type, 'Aircraft');
  assert.equal(id.keyLabel, 'ICAO 24');
  assert.equal(id.keyValue, '7c6b2d');
  assert.equal(id.rid, objectIdentity({ ...jet }).rid, 'stable per object');
  assert.match(id.rid, /^ri\.gev\.main\.object\.[0-9a-f]{8}$/);
  const lineage = objectLineage(jet);
  assert.equal(lineage[0].feed, true);
  assert.match(lineage[0].label, /ADS-B/);
  assert.equal(lineage.at(-1).feed, false, 'enrichment is flagged');
  // A staged demo object has no feed anywhere in its lineage.
  assert.ok(objectLineage({ ...jet, simulated: true }).every((s) => !s.feed));
});

test('properties keep feed values as feed and flag platform fields as simulated', () => {
  const rows = objectProperties(jet, now);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by.Callsign.value, 'QFA12');
  assert.equal(by.Callsign.sim, false);
  assert.equal(by.Altitude.value, '36,089 ft');
  assert.equal(by.Route.value, 'YSSY → KLAX');
  assert.equal(by.Classification.sim, true);
  assert.equal(by['Object owner'].sim, true);
  assert.match(by['Object owner'].value, /generic/);
  assert.deepEqual(objectProperties(jet, now), rows, 'deterministic');
});

test('linked objects are feed labels or openable nearby assets, never people', () => {
  const links = linkedObjects(jet, [{ object: ship, km: 120.4 }]);
  assert.deepEqual(
    links.map((l) => [l.rel, l.name]),
    [
      ['Operated by', 'Qantas'],
      ['Departed', 'YSSY'],
      ['Bound for', 'KLAX'],
      ['Nearby', 'TEST CARRIER'],
    ],
  );
  assert.equal(links[3].key, ship.key, 'nearby links open the object');
  assert.equal(links[3].detail, '120 km');
  assert.ok(links.every((l) => !/crew|captain|pilot|passenger|owner/i.test(`${l.rel} ${l.type}`)));
});

test('the timeline is newest first, with simulated events flagged', () => {
  const ev = objectTimeline(jet, { now });
  assert.ok(ev.length >= 3);
  for (let i = 1; i < ev.length; i += 1) assert.ok(ev[i - 1].t >= ev[i].t);
  assert.equal(ev[0].text, 'Position report received');
  assert.equal(ev[0].sim, false);
  assert.ok(ev.filter((e) => /plan filed|sector/i.test(e.text)).every((e) => e.sim));
});

test('track history: observed positions are feed; the reconstructed path is simulated', () => {
  const observations = [
    { t: now - 120_000, lat: -33.9, lon: 151.1, altitudeM: 10_900 },
    { t: now - 30_000, lat: -33.9, lon: 151.15, altitudeM: 11_000 },
  ];
  const table = trackHistory(jet, { now, observations });
  const feed = table.rows.filter((r) => !r.sim);
  const sim = table.rows.filter((r) => r.sim);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].cells[2], '151.1500', 'newest observation first');
  assert.equal(sim.length, 6);
  // Heading 090: reconstructed points lie to the west of the oldest fix.
  assert.ok(Number(sim[0].cells[2]) < 151.1);
  assert.match(blockCsv({ type: 'table', ...table }).split('\n')[1], /,FEED$/);
});

test('port calls, exposure and orbit elements are deterministic and honest about sources', () => {
  assert.deepEqual(portCalls(ship, now), portCalls(ship, now));
  assert.equal(portCalls(ship, now).rows.length, 5);
  const quake = { kind: 'earthquake', key: 'earthquake:us1', magnitude: 6.2, depthKm: 15, lat: 1, lon: 2 };
  const ex = exposureEstimate(quake);
  assert.equal(ex.rows.length, 3);
  assert.match(ex.rows[0][0], /Strong/);
  // ISS-like mean elements: 51.64° inclination, 15.5 rev/day.
  const satrec = {
    inclo: (51.64 * Math.PI) / 180,
    ecco: 0.0005,
    nodeo: 1,
    argpo: 2,
    mo: 3,
    no: (15.5 * 2 * Math.PI) / 1440,
    epochyr: 26,
    epochdays: 292.25,
  };
  const el = Object.fromEntries(orbitElements(satrec).map((r) => [r.label, r.value]));
  assert.equal(el.Inclination, '51.64°');
  assert.equal(el['Mean motion'], '15.5000 rev/day');
  assert.equal(el.Period, '92.9 min');
  const perigee = Number(el.Perigee.replace(/[^0-9]/g, ''));
  assert.ok(perigee > 380 && perigee < 440, `perigee ${perigee}`);
  assert.equal(el.Epoch, '19 Oct 06:00 UTC');
  assert.equal(orbitElements(null), null);
});

test('camera health comes from the relay log; unpolled cameras say so', () => {
  const cams = [cam, { ...cam, id: 'c2', key: 'camera:c2' }, { ...cam, id: 'x', provider: 'TfL' }];
  const rows = Object.fromEntries(
    cameraHealthRows(cam, [{ id: 'c2', status: 'ok' }], cams).map((r) => [r.label, r.value]),
  );
  assert.equal(rows['This camera'], 'Not polled yet');
  assert.equal(rows['Cameras in network'], '2');
  assert.equal(rows['Serving stills'], '1');
});

test('the drawer shows identity, lineage, tabs and escapes feed strings', () => {
  const evil = { ...jet, callsign: '<img src=x onerror=alert(1)>' };
  const html = sheetDrawer({
    identity: objectIdentity(evil),
    lineage: objectLineage(evil),
    tabs: [
      { id: 'overview', label: 'Object' },
      { id: 'track', label: 'Track history' },
    ],
    active: 'overview',
    sheet: overviewSheet(evil, { now, nearby: [] }),
  });
  assert.ok(!html.includes('<img src=x'), 'feed text is escaped');
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-res="untab:track"/);
  assert.ok(!html.includes('data-res="untab:overview"'), 'the object tab stays');
  assert.match(html, /Data lineage/);
  assert.match(html, /gev-sheet__tag--sim/);
  assert.match(html, /Copy CSV/);
});

test('an airport surface vehicle is typed as one, with no flight events', () => {
  const truck = toIntelObject('flights', { icao24: 'veh1', callsign: 'FIRE2', lat: -33.94, lon: 151.17, onGround: true, emitterCategory: 16 });
  assert.equal(objectIdentity(truck).type, 'Surface vehicle');
  const ev = objectTimeline(truck, { now });
  assert.ok(!ev.some((e) => /flight plan|ATC|Departed/i.test(e.text)));
});
