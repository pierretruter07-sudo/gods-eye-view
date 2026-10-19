/**
 * @file Analyst sheets: the object views behind the intel action buttons.
 *
 * Each focused asset opens as an object in a side drawer, the way a data
 * platform presents an entity: a typed identity, a lineage strip showing
 * where the data came from, a property table, linked objects and a
 * timeline, plus one tab per action pressed. Values from a live feed (or
 * computed from one) are FEED; everything else is SIM, deterministic per
 * object so a sheet reads the same each time it is opened.
 *
 * Rules kept here: no person is ever named or profiled (no crew, passenger
 * or owner names); ownership stays generic; simulated values are always
 * flagged. Pure: no DOM, no Cesium, no network.
 * @module intel/sheets
 */
import { rng, seedFrom } from './enrichment.js';
import { distanceKm } from './objects.js';

const FT = 3.28084;
const KT = 1.943844;
const MU_KM3_S2 = 398600.4418;
const R_EARTH_KM = 6378.137;
const MIN = 60_000;

const two = (n) => String(n).padStart(2, '0');
/** "14:05 UTC" */
export function utcClock(ms) {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
}
/** "19 Oct 14:05 UTC" */
export function utcDate(ms) {
  const d = new Date(ms);
  const mon = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mon} ${utcClock(ms)}`;
}

const finite = Number.isFinite;
const prop = (label, value, sim = false) =>
  value == null || value === '' ? null : { label, value: String(value), sim };

const TYPE_NAMES = Object.freeze({
  aircraft: 'Aircraft',
  vessel: 'Vessel',
  satellite: 'Satellite',
  earthquake: 'Seismic event',
  camera: 'Street camera',
});

/** ADS-B airport surface vehicle (emitter category C1/C2). */
const isSurfaceVehicle = (o) =>
  [16, 17].includes(o?.emitterCategory ?? o?.category);

/** Primary key and display type for an object. */
export function objectIdentity(o) {
  const type = isSurfaceVehicle(o)
    ? 'Surface vehicle'
    : TYPE_NAMES[o.kind] || 'Object';
  const key =
    o.kind === 'aircraft'
      ? { label: 'ICAO 24', value: o.icao24 }
      : o.kind === 'vessel'
        ? { label: 'MMSI', value: o.mmsi }
        : o.kind === 'satellite'
          ? { label: 'NORAD', value: o.noradId }
          : o.kind === 'earthquake'
            ? { label: 'USGS ID', value: o.id }
            : { label: 'Camera ID', value: o.id };
  const value = key.value ?? o.id ?? o.key;
  // A stable resource id, in the style of an object store (illustrative).
  const rid = `ri.gev.main.object.${seedFrom(`${o.kind}:${value}`).toString(16).padStart(8, '0')}`;
  return {
    type,
    title: o.callsign || o.name || o.title || o.place || String(value || type),
    keyLabel: key.label,
    keyValue: String(value ?? '—'),
    rid,
  };
}

/** Where this object's data comes from, as a pipeline (feed → object). */
export function objectLineage(o) {
  const source = {
    aircraft: 'ADS-B (OpenSky / adsb.lol)',
    vessel: 'AIS (AISStream)',
    satellite: 'CelesTrak orbit data',
    earthquake: 'USGS earthquake feed',
    camera: o.provider || 'Public traffic camera network',
  }[o.kind];
  const steps = [];
  if (o.simulated) steps.push({ label: 'Staged demo event', feed: false });
  else if (source) steps.push({ label: source, feed: true });
  steps.push({ label: 'Normalise & classify', feed: !o.simulated });
  steps.push({
    label: `${isSurfaceVehicle(o) ? 'Surface vehicle' : TYPE_NAMES[o.kind] || 'Object'} object`,
    feed: !o.simulated,
  });
  steps.push({ label: 'Enrichment (illustrative)', feed: false });
  return steps;
}

// ── Properties ──────────────────────────────────────────────────────────

function kindProperties(o) {
  switch (o.kind) {
    case 'aircraft':
      return [
        prop('Callsign', o.callsign),
        prop('Registration', o.registration),
        prop('Type', o.typeName || o.typeCode),
        prop('Operator', o.operator),
        prop('Origin country', o.originCountry),
        prop(
          'Altitude',
          finite(o.altitudeM)
            ? `${Math.round(o.altitudeM * FT).toLocaleString('en-US')} ft`
            : null,
        ),
        prop(
          'Ground speed',
          finite(o.speedMps) ? `${Math.round(o.speedMps * KT)} kt` : null,
        ),
        prop('Track', finite(o.heading) ? `${Math.round(o.heading)}°` : null),
        prop('Squawk', o.squawk),
        prop(
          'Route',
          o.routeOrigin || o.routeDestination
            ? `${o.routeOrigin || '?'} → ${o.routeDestination || '?'}`
            : null,
        ),
      ];
    case 'vessel':
      return [
        prop('Name', o.name),
        prop('Ship type', o.shipType),
        prop('Destination', o.destination),
        prop(
          'Speed',
          finite(o.speedKts) ? `${o.speedKts.toFixed(1)} kn` : null,
        ),
        prop(
          'Course',
          finite(o.courseDeg) ? `${Math.round(o.courseDeg)}°` : null,
        ),
      ];
    case 'satellite':
      return [
        prop('Name', o.name),
        prop('Group', o.group),
        prop(
          'Altitude',
          finite(o.altitudeM)
            ? `${Math.round(o.altitudeM / 1000).toLocaleString('en-US')} km`
            : null,
        ),
        prop(
          'Speed',
          finite(o.speedMps)
            ? `${Math.round(o.speedMps * 3.6).toLocaleString('en-US')} km/h`
            : null,
        ),
      ];
    case 'earthquake':
      return [
        prop(
          'Magnitude',
          finite(o.magnitude) ? `M${o.magnitude.toFixed(1)}` : null,
        ),
        prop('Place', o.place),
        prop('Depth', finite(o.depthKm) ? `${Math.round(o.depthKm)} km` : null),
        prop('Origin time', finite(o.timeMs) ? utcDate(o.timeMs) : null),
      ];
    case 'camera':
      return [
        prop('Location', o.name),
        prop('Area', o.city),
        prop('Network', o.provider),
        prop('Licence', o.license),
        prop('Feed', o.feedType === 'image' ? 'Still image' : o.feedType),
      ];
    default:
      return [];
  }
}

/** The property table: feed fields, then the platform's own (SIM) fields. */
export function objectProperties(o, now = Date.now()) {
  const rand = rng(seedFrom(`props:${o.key}`));
  const sim = o.simulated === true;
  const feedRows = kindProperties(o)
    .filter(Boolean)
    .map((r) => ({ ...r, sim: sim || r.sim }));
  const position = prop(
    'Position',
    finite(o.lat) && finite(o.lon)
      ? `${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}`
      : null,
    sim,
  );
  return [
    ...feedRows,
    position,
    prop('Observed', utcClock(now), sim),
    prop(
      'Data confidence',
      `${Math.round(82 + rand() * 16)}% (source agreement)`,
      true,
    ),
    prop('Classification', 'UNCLASSIFIED // DEMONSTRATION', true),
    prop('Object owner', 'Watch floor (generic)', true),
  ].filter(Boolean);
}

// ── Linked objects ──────────────────────────────────────────────────────

/**
 * Objects linked to this one. Nearby assets carry their key so the drawer
 * can open them; other links are labels (feed values, never a person).
 * @param {object} o
 * @param {Array<{object: object, km: number}>} nearby
 */
export function linkedObjects(o, nearby = []) {
  const links = [];
  const label = (rel, name, extra = {}) =>
    name
      ? links.push({ rel, name: String(name), key: null, feed: true, ...extra })
      : null;
  if (o.kind === 'aircraft') {
    label('Operated by', o.operator, { type: 'Organisation' });
    label('Departed', o.routeOrigin, { type: 'Airport' });
    label('Bound for', o.routeDestination, { type: 'Airport' });
  }
  if (o.kind === 'vessel')
    label('Declared destination', o.destination, { type: 'Port' });
  if (o.kind === 'satellite')
    label('Constellation', o.group, { type: 'Group' });
  if (o.kind === 'camera')
    label('Network', o.provider, { type: 'Organisation' });
  for (const n of nearby.slice(0, 6)) {
    const x = n.object;
    const surface = isSurfaceVehicle(x);
    links.push({
      rel: 'Nearby',
      type: surface ? 'Surface vehicle' : TYPE_NAMES[x.kind] || 'Object',
      name: x.callsign || x.name || x.title || x.place || x.key,
      detail: `${n.km < 10 ? n.km.toFixed(1) : Math.round(n.km)} km`,
      key: x.key,
      feed: !x.simulated,
    });
  }
  return links;
}

// ── Timeline ────────────────────────────────────────────────────────────

/**
 * Recent events for the object, newest first. Feed events carry real
 * times; simulated ones are flagged.
 * @param {object} o
 * @param {{now?: number, observations?: Array<{t:number}>, satrec?: object}} [ctx]
 */
export function objectTimeline(
  o,
  { now = Date.now(), observations = [], satrec = null } = {},
) {
  const rand = rng(seedFrom(`timeline:${o.key}`));
  const ev = [];
  const add = (t, text, sim = false) => ev.push({ t, text, sim });
  const ago = (minLo, minHi) => now - (minLo + rand() * (minHi - minLo)) * MIN;
  const sim = o.simulated === true;
  if (o.kind === 'aircraft' && isSurfaceVehicle(o)) {
    add(now, 'Position report received', sim);
  } else if (o.kind === 'aircraft') {
    add(now, 'Position report received', sim);
    if (['7500', '7600', '7700'].includes(String(o.squawk || '')))
      add(now, `Squawking ${o.squawk}`, sim);
    add(ago(8, 25), 'Entered current ATC sector', true);
    if (o.routeOrigin) add(ago(60, 240), `Departed ${o.routeOrigin}`, true);
    add(ago(240, 420), 'Flight plan filed and accepted', true);
  } else if (o.kind === 'vessel') {
    add(now, 'AIS position report', sim);
    if (o.destination)
      add(ago(120, 900), `Voyage data: destination ${o.destination}`, true);
    add(ago(1440, 4320), 'Departed last port of call', true);
    add(ago(4320, 7200), 'Port-state inspection: no deficiencies', true);
  } else if (o.kind === 'satellite') {
    add(now, 'Position propagated from orbit data', sim);
    const epoch = satrecEpochMs(satrec);
    if (epoch) add(epoch, 'Orbit elements epoch (CelesTrak)', false);
    add(ago(20, 90), 'Last ground-station contact', true);
  } else if (o.kind === 'earthquake') {
    if (finite(o.timeMs))
      add(
        o.timeMs,
        `M${(o.magnitude ?? 0).toFixed(1)} origin time (USGS)`,
        sim,
      );
    const t0 = finite(o.timeMs) ? o.timeMs : now;
    add(t0 + (6 + rand() * 6) * MIN, 'ShakeMap generated', true);
    add(t0 + (25 + rand() * 20) * MIN, 'Aftershock forecast issued', true);
  } else if (o.kind === 'camera') {
    add(now, 'Live still refreshed', false);
    add(ago(30, 180), 'Network catalogue refreshed', true);
  }
  for (const obs of observations.slice(-5))
    if (finite(obs.t) && obs.t < now - 5_000)
      add(obs.t, 'Position observed this session', sim);
  return ev.filter((e) => e.t <= now + 60 * MIN).sort((a, b) => b.t - a.t);
}

/** Overview sheet: properties, linked objects and timeline. */
export function overviewSheet(o, ctx = {}) {
  const now = ctx.now ?? Date.now();
  return {
    id: 'overview',
    title: 'Object',
    sources: objectLineage(o).filter((s, i) => i === 0),
    blocks: [
      { type: 'props', title: 'Properties', rows: objectProperties(o, now) },
      {
        type: 'links',
        title: 'Linked objects',
        links: linkedObjects(o, ctx.nearby || []),
      },
      {
        type: 'timeline',
        title: 'Timeline',
        events: objectTimeline(o, { ...ctx, now }).map((e) => ({
          when: utcClock(e.t),
          text: e.text,
          sim: e.sim,
        })),
      },
    ],
  };
}

// ── Action sheets (new) ─────────────────────────────────────────────────

/**
 * Track history: positions observed this session (FEED) and, before them,
 * a path reconstructed by dead reckoning from the current track and speed
 * (SIM, 5-minute steps). Never presented as recorded positions.
 */
export function trackHistory(o, { now = Date.now(), observations = [] } = {}) {
  const rows = [];
  const kmPerMin = finite(o.speedMps)
    ? (o.speedMps * 60) / 1000
    : finite(o.speedKts)
      ? (o.speedKts * 1.852) / 60
      : null;
  const heading = finite(o.heading)
    ? o.heading
    : finite(o.courseDeg)
      ? o.courseDeg
      : null;
  const level = (m) =>
    finite(m) ? `${Math.round(m * FT).toLocaleString('en-US')} ft` : '—';
  const isAir = o.kind === 'aircraft';
  const observed = observations.filter((p) => finite(p.lat) && finite(p.lon));
  for (const p of [...observed].reverse())
    rows.push({
      cells: [
        utcClock(p.t),
        p.lat.toFixed(4),
        p.lon.toFixed(4),
        isAir ? level(p.altitudeM) : '—',
      ],
      sim: false,
    });
  if (!observed.length && finite(o.lat))
    rows.push({
      cells: [
        utcClock(now),
        o.lat.toFixed(4),
        o.lon.toFixed(4),
        isAir ? level(o.altitudeM) : '—',
      ],
      sim: false,
    });
  const oldest = observed[0] || { t: now, lat: o.lat, lon: o.lon };
  if (kmPerMin && heading != null && !o.onGround) {
    const back = ((heading + 180) * Math.PI) / 180;
    for (let step = 1; step <= 6; step += 1) {
      const km = kmPerMin * 5 * step;
      const lat = oldest.lat + (km / 111.32) * Math.cos(back);
      const lon =
        oldest.lon +
        (km /
          (111.32 * Math.max(0.1, Math.cos((oldest.lat * Math.PI) / 180)))) *
          Math.sin(back);
      rows.push({
        cells: [
          utcClock(oldest.t - step * 5 * MIN),
          lat.toFixed(4),
          lon.toFixed(4),
          isAir ? level(o.altitudeM) : '—',
        ],
        sim: true,
      });
    }
  }
  return {
    head: ['Time', 'Lat', 'Lon', isAir ? 'Level' : '—'],
    rows,
  };
}

const PORTS = Object.freeze([
  'Singapore',
  'Rotterdam',
  'Shanghai',
  'Port Klang',
  'Busan',
  'Antwerp',
  'Jebel Ali',
  'Hamburg',
  'Los Angeles',
  'Brisbane',
  'Melbourne',
  'Colombo',
]);

/** Illustrative port-call history (SIM; no carrier or port feed connected). */
export function portCalls(o, now = Date.now()) {
  const rand = rng(seedFrom(`ports:${o.key}`));
  const rows = [];
  let t = now - (1 + rand() * 3) * 1440 * MIN;
  const used = new Set();
  for (let i = 0; i < 5; i += 1) {
    let port = PORTS[Math.floor(rand() * PORTS.length)];
    while (used.has(port)) port = PORTS[Math.floor(rand() * PORTS.length)];
    used.add(port);
    const stayH = 8 + Math.floor(rand() * 40);
    rows.push([
      port,
      utcDate(t - stayH * 60 * MIN).replace(/ \d\d:\d\d UTC$/, ''),
      `${stayH} h`,
    ]);
    t -= (3 + rand() * 9) * 1440 * MIN;
  }
  return { head: ['Port', 'Arrived', 'Alongside'], rows };
}

/** Epoch of a satellite.js satrec, or null. */
export function satrecEpochMs(satrec) {
  if (!satrec || !finite(satrec.epochyr) || !finite(satrec.epochdays))
    return null;
  const year =
    satrec.epochyr < 57 ? 2000 + satrec.epochyr : 1900 + satrec.epochyr;
  return Date.UTC(year, 0, 1) + (satrec.epochdays - 1) * 86_400_000;
}

/** Classical orbit elements from a satellite.js satrec (all computed: FEED). */
export function orbitElements(satrec) {
  if (!satrec || !finite(satrec.no)) return null;
  const deg = (r) => `${((r * 180) / Math.PI).toFixed(2)}°`;
  const nRadS = satrec.no / 60; // no is rad/min
  const aKm = Math.cbrt(MU_KM3_S2 / (nRadS * nRadS));
  const e = satrec.ecco;
  const epoch = satrecEpochMs(satrec);
  return [
    { label: 'Inclination', value: deg(satrec.inclo) },
    { label: 'Eccentricity', value: e.toFixed(5) },
    { label: 'RAAN', value: deg(satrec.nodeo) },
    { label: 'Argument of perigee', value: deg(satrec.argpo) },
    { label: 'Mean anomaly', value: deg(satrec.mo) },
    {
      label: 'Mean motion',
      value: `${((satrec.no * 1440) / (2 * Math.PI)).toFixed(4)} rev/day`,
    },
    { label: 'Period', value: `${((2 * Math.PI) / satrec.no).toFixed(1)} min` },
    {
      label: 'Perigee',
      value: `${Math.round(aKm * (1 - e) - R_EARTH_KM).toLocaleString('en-US')} km`,
    },
    {
      label: 'Apogee',
      value: `${Math.round(aKm * (1 + e) - R_EARTH_KM).toLocaleString('en-US')} km`,
    },
    epoch ? { label: 'Epoch', value: utcDate(epoch) } : null,
  ].filter(Boolean);
}

/**
 * Shaking exposure by distance band. Radii come from a simple attenuation
 * rule of thumb on the feed magnitude and depth (a model estimate); the
 * population figures are illustrative (no population layer is connected).
 */
export function exposureEstimate(o) {
  const rand = rng(seedFrom(`exposure:${o.key}`));
  const m = finite(o.magnitude) ? o.magnitude : 5;
  const depth = finite(o.depthKm) ? o.depthKm : 10;
  const strongKm = Math.max(
    5,
    Math.round(10 ** (0.5 * m - 1.6) * (depth < 70 ? 1 : 0.6)),
  );
  const bands = [
    ['Strong (MMI VI+)', strongKm],
    ['Moderate (MMI IV–V)', strongKm * 3],
    ['Light (MMI II–III)', strongKm * 8],
  ];
  return {
    head: ['Shaking', 'Within', 'People (est.)'],
    rows: bands.map(([label, km], i) => [
      label,
      `${km.toLocaleString('en-US')} km`,
      `~${Math.round((2 + rand() * 30) * (i + 1) ** 2 * 1000).toLocaleString('en-US')}`,
    ]),
  };
}

/**
 * Health of this camera and its network, from the relay's own health log
 * (FEED). Cameras that have not been asked for a frame yet are "not polled".
 * @param {object} o - the camera object
 * @param {Array<object>} health - /api/cctv/health entries
 * @param {Array<object>} cameras - loaded camera objects (for the network)
 */
export function cameraHealthRows(o, health = [], cameras = []) {
  const byId = new Map(health.map((h) => [h.id, h]));
  const mine = byId.get(o.id);
  const network = cameras.filter((c) => c.provider === o.provider);
  const counts = { ok: 0, fallback: 0, error: 0, unknown: 0 };
  for (const c of network) {
    const s = String(byId.get(c.id)?.status || '').toLowerCase();
    if (!s) continue;
    if (s === 'ok' || s === 'live' || s === 'online') counts.ok += 1;
    else if (s.includes('fallback') || s.includes('placeholder'))
      counts.fallback += 1;
    else if (s.includes('error') || s.includes('fail') || s.includes('offline'))
      counts.error += 1;
    else counts.unknown += 1;
  }
  const polled = counts.ok + counts.fallback + counts.error + counts.unknown;
  return [
    { label: 'This camera', value: mine ? mine.status : 'Not polled yet' },
    mine?.message ? { label: 'Last message', value: mine.message } : null,
    mine?.updatedAt
      ? { label: 'Checked', value: utcClock(mine.updatedAt) }
      : null,
    { label: 'Cameras in network', value: String(network.length) },
    { label: 'Polled this session', value: String(polled) },
    { label: 'Serving stills', value: String(counts.ok) },
    { label: 'Placeholder / fallback', value: String(counts.fallback) },
    { label: 'Failing', value: String(counts.error) },
  ].filter(Boolean);
}

/** Incidents near a point: flagged objects within radiusKm (FEED). */
export function nearbyIncidents(o, flagged = [], radiusKm = 50) {
  return flagged
    .map((f) => ({
      ...f,
      km: distanceKm({ ...o, heightM: 0 }, { ...f.object, heightM: 0 }),
    }))
    .filter((f) => f.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8);
}

// ── CSV ─────────────────────────────────────────────────────────────────

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A table or rows block as CSV text, with a FEED/SIM column. */
export function blockCsv(block) {
  if (block.type === 'table') {
    const lines = [block.head.map(csvCell).join(',')];
    for (const r of block.rows) {
      const cells = Array.isArray(r) ? r : r.cells;
      const tag = Array.isArray(r) ? '' : r.sim ? 'SIM' : 'FEED';
      lines.push([...cells, ...(tag ? [tag] : [])].map(csvCell).join(','));
    }
    return lines.join('\n');
  }
  if (block.type === 'rows' || block.type === 'props') {
    return [
      'Field,Value,Source',
      ...block.rows.map((r) =>
        [r.label, r.value, r.sim ? 'SIM' : 'FEED'].map(csvCell).join(','),
      ),
    ].join('\n');
  }
  return '';
}
