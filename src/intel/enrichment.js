/**
 * Builds a Palantir-style dossier model for a live object. Real feed values
 * are passed through with their source; everything inferred is deterministic,
 * seeded from the object id, and clearly flagged simulated. Objects are
 * vehicles, assets and natural events only — never real named individuals.
 *
 * Pure module: no DOM, no network, no Cesium.
 */

const FT = 3.28084;
const KT = 1.943844;

export function seedFrom(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const n0 = (v) => (Number.isFinite(v) ? v : null);
const txt = (v) => {
  const t = String(v ?? '').trim();
  return t || null;
};

/** A feed field is real and carries a source; a sim field is flagged. */
const feed = (label, value) =>
  value == null || value === '' ? null : { label, value: String(value) };

function patternOfLife(rand, kind) {
  const windows = ['2 h ago', '6 h ago', '14 h ago', 'yesterday', '2 days ago'];
  const verbs = {
    aircraft: [
      'tracked near a major hub',
      'held a racetrack pattern',
      'transited the corridor',
      'departed under a flight plan',
    ],
    vessel: [
      'loitered off the coast',
      'made way at cruise speed',
      'approached a port approach lane',
      'held station',
    ],
    satellite: [
      'passed over the region',
      'completed an orbit',
      'entered sunlight',
      'crossed the equator',
    ],
  };
  // Seeded shuffle so each line appears once.
  const list = [...(verbs[kind] || verbs.aircraft)];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const count = Math.min(list.length, 3 + Math.floor(rand() * 2));
  return list.slice(0, count).map((text, i) => ({ t: windows[i], text }));
}

export function buildDossier(object) {
  const rand = rng(
    seedFrom(object.id || object.callsign || object.name || object.kind),
  );
  const d = buildFor(object, rand);
  // A staged demo event is not feed data: say so on the dossier itself.
  if (object.simulated) {
    d.demo = true;
    d.source = 'Staged demo event';
    for (const l of d.links) l.source = 'sim';
  }
  return d;
}

function buildFor(object, rand) {
  const kind = object.kind;
  if (kind === 'aircraft') return aircraftDossier(object, rand);
  if (kind === 'vessel') return vesselDossier(object, rand);
  if (kind === 'satellite') return satelliteDossier(object, rand);
  if (kind === 'earthquake') return quakeDossier(object, rand);
  return {
    kind,
    title: object.id || 'Object',
    source: 'FEED',
    feed: [],
    analysis: [],
    links: [],
    pol: [],
  };
}

function aircraftDossier(o, rand) {
  const alt = n0(o.altitudeM);
  const spd = n0(o.speedMps);
  const roles = [
    'Commercial transport',
    'Charter / business',
    'State / government',
    'Cargo / logistics',
    'General aviation',
  ];
  const role = o.military
    ? 'Military'
    : o.operator
      ? 'Commercial transport'
      : pick(rand, roles);
  return {
    kind: 'aircraft',
    title: txt(o.callsign) || txt(o.icao24) || 'Aircraft',
    subtitle: txt(o.aircraftClass) || txt(o.operator) || 'Airborne contact',
    source: 'ADS-B / OpenSky',
    feed: [
      feed('Callsign', txt(o.callsign)),
      feed('ICAO 24', txt(o.icao24)),
      feed('Type class', txt(o.aircraftClass)),
      feed(
        'Altitude',
        alt == null
          ? o.onGround
            ? 'On ground'
            : null
          : `${Math.round(alt * FT).toLocaleString('en-US')} ft`,
      ),
      feed('Ground speed', spd == null ? null : `${Math.round(spd * KT)} kt`),
      feed('Heading', o.heading == null ? null : `${Math.round(o.heading)}°`),
      feed('Squawk', txt(o.squawk)),
      feed('Origin country', txt(o.originCountry)),
      feed('Operator', txt(o.operator)),
    ].filter(Boolean),
    links: [
      o.operator
        ? { rel: 'Operated by', name: o.operator, kind: 'org', source: 'feed' }
        : {
            rel: 'Operated by',
            name: 'Unassessed carrier',
            kind: 'org',
            source: 'sim',
          },
      o.routeOrigin
        ? { rel: 'From', name: o.routeOrigin, kind: 'facility', source: 'feed' }
        : null,
      o.routeDestination
        ? {
            rel: 'To',
            name: o.routeDestination,
            kind: 'facility',
            source: 'feed',
          }
        : null,
    ].filter(Boolean),
    analysis: [
      { label: 'Assessed role', value: role },
      {
        label: 'Activity (24 h)',
        value: `${2 + Math.floor(rand() * 6)} tracked legs`,
      },
      { label: 'Watchlist', value: rand() < 0.15 ? 'Review' : 'None' },
    ],
    pol: patternOfLife(rand, 'aircraft'),
  };
}

function vesselDossier(o, rand) {
  const classes = [
    'Container',
    'Bulk carrier',
    'Tanker',
    'Ro-Ro',
    'General cargo',
    'Offshore support',
  ];
  return {
    kind: 'vessel',
    title: txt(o.name) || txt(o.mmsi) || 'Vessel',
    subtitle: txt(o.shipType) || 'Surface contact',
    source: 'AIS',
    feed: [
      feed('Name', txt(o.name)),
      feed('MMSI', txt(o.mmsi)),
      feed('Type', txt(o.shipType)),
      feed(
        'Speed',
        n0(o.speedKts) == null ? null : `${Math.round(o.speedKts)} kt`,
      ),
      feed(
        'Course',
        n0(o.courseDeg) == null ? null : `${Math.round(o.courseDeg)}°`,
      ),
      feed('Destination', txt(o.destination)),
    ].filter(Boolean),
    links: [
      o.destination
        ? {
            rel: 'Bound for',
            name: o.destination,
            kind: 'facility',
            source: 'feed',
          }
        : null,
      {
        rel: 'Assessed operator',
        name: 'Commercial line',
        kind: 'org',
        source: 'sim',
      },
    ].filter(Boolean),
    analysis: [
      { label: 'Assessed cargo', value: pick(rand, classes) },
      {
        label: 'Last port call',
        value: `${1 + Math.floor(rand() * 9)} days ago`,
      },
      { label: 'Watchlist', value: rand() < 0.12 ? 'Review' : 'None' },
    ],
    pol: patternOfLife(rand, 'vessel'),
  };
}

function satelliteDossier(o, rand) {
  const missions = [
    'Communications',
    'Earth observation',
    'Navigation',
    'Weather',
    'Technology demo',
  ];
  const altKm = n0(o.altitudeM) == null ? null : Math.round(o.altitudeM / 1000);
  return {
    kind: 'satellite',
    title: txt(o.name) || (o.noradId ? `SAT ${o.noradId}` : 'Satellite'),
    subtitle: txt(o.satelliteClass) || txt(o.group) || 'Orbital object',
    source: 'CelesTrak TLE',
    feed: [
      feed('Name', txt(o.name)),
      feed('NORAD ID', txt(o.noradId)),
      feed('Class', txt(o.satelliteClass)),
      feed(
        'Altitude',
        altKm == null ? null : `${altKm.toLocaleString('en-US')} km`,
      ),
      feed(
        'Speed',
        n0(o.speedMps) == null
          ? null
          : `${Math.round(o.speedMps * 3.6).toLocaleString('en-US')} km/h`,
      ),
    ].filter(Boolean),
    links: [
      o.group
        ? {
            rel: 'Constellation',
            name: String(o.group),
            kind: 'org',
            source: 'feed',
          }
        : null,
      {
        rel: 'Assessed operator',
        name: 'State / commercial',
        kind: 'org',
        source: 'sim',
      },
    ].filter(Boolean),
    analysis: [
      {
        label: 'Assessed mission',
        value: /station/i.test(String(o.satelliteClass || o.group || ''))
          ? 'Crewed station / resupply'
          : pick(rand, missions),
      },
      { label: 'Next pass', value: `${5 + Math.floor(rand() * 80)} min` },
      { label: 'Status', value: 'Active' },
    ],
    pol: patternOfLife(rand, 'satellite'),
  };
}

function quakeDossier(o, rand) {
  const mag = n0(o.magnitude);
  return {
    kind: 'earthquake',
    title: mag == null ? 'Earthquake' : `M${mag.toFixed(1)} earthquake`,
    subtitle: txt(o.place) || 'Seismic event',
    source: 'USGS',
    feed: [
      feed('Magnitude', mag == null ? null : mag.toFixed(1)),
      feed(
        'Depth',
        n0(o.depthKm) == null ? null : `${Math.round(o.depthKm)} km`,
      ),
      feed('Where', txt(o.place)),
      feed(
        'Time',
        n0(o.timeMs) == null
          ? null
          : new Date(o.timeMs).toUTCString().slice(5, 22) + ' UTC',
      ),
    ].filter(Boolean),
    links: [
      o.place
        ? { rel: 'Near', name: o.place, kind: 'facility', source: 'feed' }
        : null,
    ].filter(Boolean),
    analysis: [
      {
        label: 'Assessed impact',
        value: mag >= 6 ? 'Significant' : mag >= 5 ? 'Moderate' : 'Minor',
      },
      { label: 'Aftershock risk', value: mag >= 5.5 ? 'Elevated' : 'Low' },
    ],
    pol: [],
  };
}

/**
 * A spoken/copyable analyst brief. Feed facts come first; simulated content
 * is introduced as such so a listener can always tell the two apart.
 */
export function composeBrief(d, nearby = null) {
  const facts = d.feed
    .filter((f) => !/^(Name|ICAO 24|NORAD ID|MMSI)$/.test(f.label))
    .slice(0, 5)
    .map((f) => `${f.label.toLowerCase()} ${f.value}`)
    .join(', ');
  const parts = [`${d.title}. ${d.subtitle || ''}.`];
  if (facts) parts.push(`From ${d.source}: ${facts}.`);
  if (nearby && nearby.total)
    parts.push(
      `${nearby.total} other contact${nearby.total === 1 ? '' : 's'} within ${nearby.radiusKm} kilometres.`,
    );
  if (d.analysis.length)
    parts.push(
      `Simulated assessment: ${d.analysis.map((a) => `${a.label.toLowerCase()} ${a.value}`).join(', ')}.`,
    );
  return parts.join(' ').replace(/\s+\./g, '.').replace(/\.\./g, '.');
}
