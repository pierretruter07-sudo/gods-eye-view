import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaceHud, runwayIntoWind } from './place.js';
import { AIRPORT_PROFILES } from '../airports/profiles.js';

const ybbn = AIRPORT_PROFILES.ybbn;
const place = {
  kind: 'airport',
  id: 'ybbn',
  label: 'Brisbane Airport',
  icao: 'YBBN',
  lat: ybbn.lat,
  lon: ybbn.lon,
  profile: ybbn,
  timeZone: 'Australia/Brisbane',
};
const now = Date.UTC(2026, 9, 15, 0, 0);
const metar = {
  station: 'YBBN',
  observedAt: now - 12 * 60_000,
  tempC: 24,
  dewpointC: 14,
  windDirDeg: 190,
  windKt: 12,
  gustKt: 22,
  visibility: '6+',
  qnhHpa: 1016,
  category: 'VFR',
  clouds: [{ cover: 'FEW', baseFt: 3500 }],
};
const flights = [
  {
    icao24: 'a',
    callsign: 'QFA501',
    lat: -27.39,
    lon: 153.12,
    onGround: true,
    speedMps: 0,
    altitudeM: 4,
  },
  {
    icao24: 'b',
    callsign: 'QFA22',
    lat: -27.45,
    lon: 153.1,
    altitudeM: 600,
    verticalRateMps: -4,
    speedMps: 80,
  },
  {
    icao24: 'c',
    callsign: 'VOZ9',
    lat: -27.3,
    lon: 153.15,
    altitudeM: 900,
    verticalRateMps: 6,
    speedMps: 90,
  },
  {
    icao24: 'd',
    callsign: 'UAE7',
    lat: -33.9,
    lon: 151.2,
    altitudeM: 9000,
    squawk: '7700',
  },
];

test('an airport stop shows live traffic, weather, incidents and surroundings', () => {
  const h = buildPlaceHud(place, {
    now,
    flights,
    military: [{ lat: -27.6, lon: 153.0 }],
    vessels: [{ lat: -27.37, lon: 153.17, speedKts: 9 }],
    quakes: [
      { lat: -28.5, lon: 153.6, magnitude: 4.6, timeMs: now - 3 * 3600_000 },
    ],
    fires: [{ lat: -27.5, lon: 152.9, acqTime: now - 2 * 3600_000 }],
    storms: [],
    satellites: [{ lat: -27.0, lon: 153.0, altitudeM: 420_000 }],
    metar,
  });
  assert.equal(h.kind, 'airport');
  assert.equal(h.cards.length, 4);
  const get = (c, label) =>
    h.cards.find((x) => x.id === c).rows.find((r) => r.label === label)?.value;
  assert.equal(get('traffic', 'Aircraft within 50 km'), '3');
  assert.equal(get('traffic', 'On ground · arriving · departing'), '1 · 1 · 1');
  assert.equal(get('traffic', 'Busiest operators'), 'QFA 2 · VOZ 1');
  assert.equal(
    get('traffic', 'Emergency squawks (300 km)'),
    'None',
    'Sydney is outside 300 km',
  );
  assert.equal(get('weather', 'Wind'), '190° 12 kt gusting 22');
  assert.equal(get('weather', 'Visibility'), '10 km or more');
  assert.match(
    get('weather', 'Runway into wind'),
    /^19R \/ 19L \(wind 190°\)$/,
  );
  assert.equal(get('weather', 'Observed'), '12 min ago');
  assert.match(
    get('incidents', 'Earthquakes (1,000 km)'),
    /^M4\.6 · \d+ km (S|SE) · 3 h ago$/,
  );
  assert.match(
    get('incidents', 'Fire hotspots (100 km)'),
    /^1 · newest 2 h ago$/,
  );
  assert.equal(
    get('incidents', 'Tropical cyclones (1,500 km)'),
    'None in NHC advisories',
  );
  assert.equal(get('around', 'Ships within 50 km'), '1 (1 under way)');
  assert.equal(get('around', 'Satellites overhead now'), '1 in view');
  assert.match(get('around', 'Local time'), /AEST/);
  // Nothing on a place card is simulated.
  for (const c of h.cards) {
    assert.equal(c.source, 'feed');
    for (const r of c.rows) assert.equal(r.sim, false);
  }
  assert.match(h.status, /3 aircraft within 50 km · 24°C · wind 12 kt/);
});

test('missing feeds say so instead of inventing figures', () => {
  const h = buildPlaceHud(place, {
    now,
    metar: null,
    layersOn: { flights: false, vessels: false },
  });
  const rows = Object.fromEntries(
    h.cards.flatMap((c) => c.rows.map((r) => [r.label, r.value])),
  );
  assert.equal(rows['Aircraft within 50 km'], 'Flights layer off');
  assert.equal(rows.METAR, 'No current report for YBBN');
  assert.equal(rows['Ships within 50 km'], 'Ships layer off');
  assert.equal(rows['Earthquakes (1,000 km)'], 'None in the current USGS feed');
});

test('the runway into wind follows the reported wind; calm uses the preference', () => {
  assert.match(
    runwayIntoWind(ybbn, { windDirDeg: 10, windKt: 15 }),
    /^01L \/ 01R/,
  );
  assert.equal(
    runwayIntoWind(ybbn, { windDirDeg: 10, windKt: 2 }),
    '19 (calm-wind preference)',
  );
  assert.equal(runwayIntoWind(null, metar), null);
});
