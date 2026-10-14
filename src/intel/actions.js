import { rng, seedFrom } from './enrichment.js';
import { distanceKm } from './objects.js';
import { propagate } from 'satellite.js';
import { findNextSatellitePass } from '../data/satellitePass.js';

/**
 * Analyst actions that produce a result panel. Real where the data exists:
 *  - satellite passes over a point, downlink windows over real ground
 *    stations and pass predictions use the loaded CelesTrak orbits and the
 *    app's own look-angle maths (src/data/satellitePass.js);
 *  - conjunction screening propagates the loaded catalog (screening only);
 *  - archive imagery is the actual Esri World Imagery tile of the spot;
 *  - infrastructure checks list real contacts and mapped installations.
 * Documents with no public source (manifests, filed flight plans) and any
 * "send" are simulated and labelled so.
 *
 * Results are plain data blocks rendered by markup.js:
 *   { title, sources:[{label, feed}], blocks:[…], send? }
 * Pure helpers are exported for tests; orbit maths loads lazily (browser).
 */

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
const FT = 3.28084;
const KT = 1.943844;

/** Real, publicly known satellite ground stations. */
export const GROUND_STATIONS = Object.freeze([
  { name: 'Svalbard (SvalSat)', lat: 78.23, lon: 15.39 },
  { name: 'Kiruna', lat: 67.86, lon: 20.96 },
  { name: 'Fairbanks', lat: 64.86, lon: -147.85 },
  { name: 'Wallops', lat: 37.94, lon: -75.46 },
  { name: 'Maspalomas', lat: 27.76, lon: -15.63 },
  { name: 'Hartebeesthoek', lat: -25.89, lon: 27.69 },
  { name: 'Alice Springs', lat: -23.76, lon: 133.88 },
  { name: 'Canberra (Tidbinbilla)', lat: -35.4, lon: 148.98 },
]);

/** Cities used for "Predict passes". */
export const PASS_CITIES = Object.freeze([
  { name: 'Canberra', lat: -35.28, lon: 149.13 },
  { name: 'Washington DC', lat: 38.9, lon: -77.04 },
  { name: 'London', lat: 51.5, lon: -0.13 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
]);

// ── Pure helpers ────────────────────────────────────────────────────────

/** Web-mercator tile coordinates (fractional) for a point at zoom z. */
export function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const la = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n,
  };
}

/** A 2×2 Esri imagery mosaic centred on the point, plus the marker offset. */
export function imageryMosaic(lat, lon, z) {
  const { x, y } = tileXY(lat, lon, z);
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const tiles = [];
  for (const dy of [0, 1]) for (const dx of [0, 1]) tiles.push(`${ESRI}/tile/${z}/${y0 + dy}/${x0 + dx}`);
  return { tiles, markX: (x - x0) / 2, markY: (y - y0) / 2, zoom: z };
}

const two = (n) => String(n).padStart(2, '0');
export function clock(ms) {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}
export function inMinutes(ms, now) {
  const m = Math.round((ms - now) / 60000);
  return m <= 0 ? 'now' : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${two(m % 60)} min`;
}

const fmt = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');

export function atcMessage(o) {
  const fl = Number.isFinite(o.altitudeM) ? `FL${Math.round((o.altitudeM * FT) / 100)}` : 'level unknown';
  const spd = Number.isFinite(o.speedMps) ? `${Math.round(o.speedMps * KT)} knots` : 'speed unknown';
  const hdg = Number.isFinite(o.heading) ? `heading ${Math.round(o.heading)}` : '';
  return `${o.callsign || o.icao24}, position ${fmt(o.lat)} ${fmt(o.lon)}, ${fl}, ${spd}${hdg ? `, ${hdg}` : ''}${o.squawk ? `, squawking ${o.squawk}` : ''}. Say intentions and souls on board.`;
}
export function portMessage(o) {
  const spd = Number.isFinite(o.speedKts) ? `${o.speedKts.toFixed(1)} kn` : 'speed unknown';
  const crs = Number.isFinite(o.courseDeg) ? `, course ${Math.round(o.courseDeg)}°` : '';
  return `Vessel ${o.name || 'unnamed'} (MMSI ${o.mmsi || 'unknown'}) at ${fmt(o.lat, 3)}, ${fmt(o.lon, 3)}, ${spd}${crs}${o.destination ? `, declared destination ${o.destination}` : ''}. Request advance notice of arrival, crew list and cargo declaration.`;
}
export function responderMessage(o, counts) {
  const t = Number.isFinite(o.timeMs) ? new Date(o.timeMs).toUTCString().slice(17, 22) + ' UTC' : 'time unknown';
  return `USGS M${fmt(o.magnitude, 1)}${o.place ? ` — ${o.place}` : ''}, depth ${Number.isFinite(o.depthKm) ? Math.round(o.depthKm) : '?'} km, ${t}. ${counts.aircraft} aircraft and ${counts.vessels} vessels currently within 300 km. Request situation report and infrastructure status.`;
}

export function simulatedManifest(o) {
  const rand = rng(seedFrom(`manifest:${o.key}`));
  const lines = [
    ['General containers', 'Dry', 400 + Math.floor(rand() * 1600)],
    ['Refrigerated', 'Reefer', 60 + Math.floor(rand() * 300)],
    ['Machinery & vehicles', 'Break-bulk', 20 + Math.floor(rand() * 120)],
    ['Dangerous goods', `Class ${[3, 8, 9][Math.floor(rand() * 3)]}`, Math.floor(rand() * 40)],
    ['Empty returns', 'Empty', 100 + Math.floor(rand() * 500)],
  ];
  const total = lines.reduce((a, l) => a + l[2], 0);
  return { head: ['Category', 'Type', 'TEU'], rows: [...lines.map((l) => [l[0], l[1], String(l[2])]), ['Total', '', String(total)]] };
}

export function simulatedFlightPlan(o) {
  const rand = rng(seedFrom(`fpl:${o.key}`));
  const cruise = Number.isFinite(o.altitudeM) ? Math.round((o.altitudeM * FT) / 1000) * 10 + 10 * Math.floor(rand() * 3) : 350;
  return [
    { label: 'Callsign', value: o.callsign || o.icao24 },
    { label: 'Operator', value: o.operator || 'Not in feed' },
    { label: 'Route', value: o.routeOrigin || o.routeDestination ? `${o.routeOrigin || '?'} → ${o.routeDestination || '?'}` : 'Not in feed' },
    { label: 'Current level', value: Number.isFinite(o.altitudeM) ? `FL${Math.round((o.altitudeM * FT) / 100)}` : '—' },
    { label: 'Filed cruise level', value: `FL${cruise}`, sim: true },
    { label: 'Filed TAS', value: `${420 + Math.floor(rand() * 80)} kt`, sim: true },
    { label: 'Alternate', value: '[ALTN]', sim: true },
    { label: 'Endurance on board', value: `${(4 + rand() * 6).toFixed(1)} h`, sim: true },
  ];
}

/** Closest approaches between one orbit and a catalog, from sampled positions. */
export function screenConjunctions(target, others, { propagateEci, fromMs, minutes = 60, stepSec = 30, top = 4 }) {
  const best = new Map();
  for (let t = 0; t <= minutes * 60; t += stepSec) {
    const when = new Date(fromMs + t * 1000);
    const a = propagateEci(target.satrec, when);
    if (!a) continue;
    for (const s of others) {
      if (s.noradId === target.noradId) continue;
      const b = propagateEci(s.satrec, when);
      if (!b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const prev = best.get(s.noradId);
      if (!prev || d < prev.km) best.set(s.noradId, { name: s.name, km: d, atMs: when.getTime() });
    }
  }
  return [...best.values()].sort((x, y) => x.km - y.km).slice(0, top);
}

// ── Runners (browser) ───────────────────────────────────────────────────

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Next passes overhead of a point by LEO satellites in the loaded catalog. */
async function passesOver(lat, lon, satrecs, now, { minElevDeg = 30, hours = 3, limit = 5 } = {}) {
  const leo = satrecs.filter((s) => s.group === 'stations' || s.group === 'visual');
  const hits = [];
  for (let i = 0; i < leo.length; i += 1) {
    const s = leo[i];
    const pass = findNextSatellitePass({ satrec: s.satrec, latDeg: lat, lonDeg: lon, fromMs: now, minElevDeg, horizonHours: hours, coarseStepSec: 30 });
    if (pass) hits.push({ name: s.name, ...pass });
    if (i % 12 === 11) await tick();
  }
  hits.sort((a, b) => a.riseMs - b.riseMs);
  return hits.slice(0, limit);
}

function imageryBlock(o) {
  const z = o.kind === 'vessel' ? 15 : o.kind === 'earthquake' ? 10 : 12;
  return { type: 'imagery', ...imageryMosaic(o.lat, o.lon, z), caption: `Archive imagery of this position (Esri World Imagery, zoom ${z}). Not live.` };
}

async function imageryTasking(o, ctx) {
  const passes = await passesOver(o.lat, o.lon, ctx.satrecs(), ctx.now);
  return {
    title: 'Imagery tasking',
    sources: [{ label: 'CelesTrak orbits', feed: true }, { label: 'Esri archive imagery', feed: true }],
    blocks: [
      imageryBlock(o),
      passes.length
        ? { type: 'table', title: 'Next overhead passes (≥30° elevation, real orbits)', head: ['Satellite', 'Rises', 'Max elev.'], rows: passes.map((p) => [p.name, `${clock(p.riseMs)} · ${inMinutes(p.riseMs, ctx.now)}`, `${Math.round(p.maxElevDeg)}°`]) }
        : { type: 'note', text: 'No high pass by the loaded low-orbit catalog in the next 3 hours. Switch on Satellites for orbit data.' },
      { type: 'note', text: 'Pass times are computed from public orbit data. Which of these carry imaging sensors is not assessed.' },
    ],
    send: { label: 'Submit tasking request', toast: 'Tasking request queued (simulated).' },
  };
}

function counts(o, objects, km) {
  const near = objects.filter((x) => x.key !== o.key && distanceKm({ ...o, heightM: 0 }, { ...x, heightM: 0 }) <= km);
  return { aircraft: near.filter((x) => x.kind === 'aircraft').length, vessels: near.filter((x) => x.kind === 'vessel').length };
}

export const ACTIONS = {
  aircraft: {
    flightplan: (o) => ({
      title: 'Flight plan',
      sources: [{ label: 'ADS-B feed', feed: true }, { label: 'Filed plan', feed: false }],
      blocks: [{ type: 'rows', rows: simulatedFlightPlan(o) }, { type: 'note', text: 'Filed-plan fields are illustrative; no public flight-plan feed is connected.' }],
    }),
    atc: (o) => ({
      title: 'Contact ATC sector',
      sources: [{ label: 'ADS-B feed', feed: true }, { label: 'Transmission', feed: false }],
      blocks: [{ type: 'message', label: 'Drafted from live values', text: atcMessage(o) }],
      send: { label: 'Send to sector', toast: 'Message sent to sector controller (simulated).' },
    }),
    imagery: imageryTasking,
  },
  vessel: {
    manifest: (o) => ({
      title: 'Cargo manifest',
      sources: [{ label: 'Manifest', feed: false }],
      blocks: [{ type: 'table', title: `${o.name || 'Vessel'} — declared cargo`, ...simulatedManifest(o) }, { type: 'note', text: 'Illustrative manifest; no customs or carrier feed is connected.' }],
    }),
    port: (o) => ({
      title: 'Notify port authority',
      sources: [{ label: 'AIS feed', feed: true }, { label: 'Transmission', feed: false }],
      blocks: [{ type: 'message', label: 'Drafted from live values', text: portMessage(o) }],
      send: { label: 'Send notice', toast: 'Notice sent to port authority (simulated).' },
    }),
    imagery: imageryTasking,
  },
  satellite: {
    passes: async (o, ctx) => {
      const sat = ctx.satrecs().find((s) => s.noradId === String(o.noradId));
      if (!sat) return { title: 'Predict passes', sources: [], blocks: [{ type: 'note', text: 'Orbit data for this object is not loaded.' }] };
      const rows = [];
      for (const c of PASS_CITIES) {
        const p = findNextSatellitePass({ satrec: sat.satrec, latDeg: c.lat, lonDeg: c.lon, fromMs: ctx.now, minElevDeg: 10, horizonHours: 24, coarseStepSec: 30 });
        rows.push([c.name, p ? `${clock(p.riseMs)} · ${inMinutes(p.riseMs, ctx.now)}` : 'None in 24 h', p ? `${Math.round(p.maxElevDeg)}°` : '—', p ? (p.visible ? 'Yes' : 'No') : '—']);
        await tick();
      }
      return {
        title: 'Predicted passes',
        sources: [{ label: 'CelesTrak orbits', feed: true }],
        blocks: [{ type: 'table', title: `${o.name} — next pass ≥10° elevation`, head: ['Over', 'Rises', 'Max elev.', 'Naked-eye'], rows }],
      };
    },
    conjunction: async (o, ctx) => {
      const all = ctx.satrecs();
      const target = all.find((s) => s.noradId === String(o.noradId));
      if (!target) return { title: 'Conjunction check', sources: [], blocks: [{ type: 'note', text: 'Orbit data for this object is not loaded.' }] };
      const propagateEci = (satrec, when) => {
        try {
          const p = propagate(satrec, when)?.position;
          return p && typeof p !== 'boolean' ? p : null;
        } catch {
          return null;
        }
      };
      await tick();
      const hits = screenConjunctions(target, all, { propagateEci, fromMs: ctx.now, minutes: 60, stepSec: 30 });
      return {
        title: 'Conjunction screen',
        sources: [{ label: 'CelesTrak orbits', feed: true }],
        blocks: [
          { type: 'table', title: `Closest approaches to ${o.name}, next 60 min`, head: ['Object', 'Closest', 'At'], rows: hits.map((h) => [h.name, `${h.km < 10 ? h.km.toFixed(1) : Math.round(h.km).toLocaleString('en-US')} km`, clock(h.atMs)]) },
          { type: 'note', text: `Screened against ${all.length.toLocaleString('en-US')} loaded objects at 30 s steps. A screening aid, not an operational conjunction assessment.` },
        ],
      };
    },
    downlink: async (o, ctx) => {
      const sat = ctx.satrecs().find((s) => s.noradId === String(o.noradId));
      if (!sat) return { title: 'Downlink windows', sources: [], blocks: [{ type: 'note', text: 'Orbit data for this object is not loaded.' }] };
      const rows = [];
      for (const g of GROUND_STATIONS) {
        const p = findNextSatellitePass({ satrec: sat.satrec, latDeg: g.lat, lonDeg: g.lon, fromMs: ctx.now, minElevDeg: 5, horizonHours: 12, coarseStepSec: 30 });
        if (p) rows.push({ g, p });
        await tick();
      }
      rows.sort((a, b) => a.p.riseMs - b.p.riseMs);
      return {
        title: 'Downlink windows',
        sources: [{ label: 'CelesTrak orbits', feed: true }],
        blocks: [{ type: 'table', title: `${o.name} — ground-station contacts ≥5°`, head: ['Station', 'Opens', 'Duration'], rows: rows.slice(0, 5).map(({ g, p }) => [g.name, `${clock(p.riseMs)} · ${inMinutes(p.riseMs, ctx.now)}`, `${Math.max(1, Math.round((p.setMs - p.riseMs) / 60000))} min`]) }],
        send: { label: 'Book window', toast: 'Downlink window booked (simulated).' },
      };
    },
  },
  earthquake: {
    responders: (o, ctx) => ({
      title: 'Alert responders',
      sources: [{ label: 'USGS feed', feed: true }, { label: 'Transmission', feed: false }],
      blocks: [{ type: 'message', label: 'Drafted from live values', text: responderMessage(o, counts(o, ctx.objects, 300)) }],
      send: { label: 'Send alert', toast: 'Alert sent to regional responders (simulated).' },
    }),
    infra: (o, ctx) => {
      const sites = (ctx.installations() || [])
        .map((r) => ({ name: r.id || r.name || 'Installation', km: distanceKm({ lat: o.lat, lon: o.lon }, { lat: r.lat, lon: r.lon }) }))
        .filter((s) => Number.isFinite(s.km) && s.km <= 300)
        .sort((a, b) => a.km - b.km)
        .slice(0, 6);
      const c = counts(o, ctx.objects, 300);
      return {
        title: 'Infrastructure check',
        sources: [{ label: 'Live feeds', feed: true }, { label: 'OpenStreetMap', feed: true }],
        blocks: [
          { type: 'rows', rows: [{ label: 'Aircraft within 300 km', value: String(c.aircraft) }, { label: 'Vessels within 300 km', value: String(c.vessels) }] },
          sites.length
            ? { type: 'table', title: 'Mapped installations within 300 km', head: ['Site', 'Distance'], rows: sites.map((s) => [s.name, `${Math.round(s.km)} km`]) }
            : { type: 'note', text: 'No mapped installations within 300 km (switch on Military installations to include them).' },
        ],
      };
    },
    imagery: imageryTasking,
  },
};

/** Run an action for the focused object. Always resolves to a result. */
export async function runAction(id, o, ctx) {
  const fn = ACTIONS[o.kind]?.[id];
  if (!fn) return { title: 'Unavailable', sources: [], blocks: [{ type: 'note', text: 'This action is not available for this object.' }] };
  try {
    return await fn(o, ctx);
  } catch (error) {
    console.warn('[intel] action failed', id, error);
    return { title: 'Could not complete', sources: [], blocks: [{ type: 'note', text: 'The analysis could not be completed. Try again in a moment.' }] };
  }
}
