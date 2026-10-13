/**
 * Normalises analyst records from the live layers into intel objects, and
 * scores them into a triage queue. Every triage reason comes from a real feed
 * field (squawk, ICAO military block, AIS ship type, USGS magnitude) — the
 * queue never invents an alert. Pure module: no DOM, no Cesium.
 */

/** Live layers the intel layer reads, and the object kind each produces. */
export const INTEL_LAYERS = Object.freeze({
  flights: 'aircraft',
  military: 'aircraft',
  'ais-live-vessels': 'vessel',
  satellites: 'satellite',
  earthquakes: 'earthquake',
});

/** Turn one analyst record into an intel object, or null if unplaceable. */
export function toIntelObject(layerId, record) {
  const kind = INTEL_LAYERS[layerId];
  if (!kind || !record) return null;
  const lat = Number(record.lat);
  const lon = Number(record.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key =
    kind === 'aircraft'
      ? record.icao24
      : kind === 'vessel'
        ? record.mmsi
        : kind === 'satellite'
          ? record.noradId
          : record.id;
  return {
    ...record,
    kind,
    layerId,
    military: layerId === 'military' || record.military === true,
    simulated: record.simulated === true,
    key: `${kind}:${key ?? record.id}`,
    lat,
    lon,
    heightM:
      kind === 'satellite' || kind === 'aircraft'
        ? Number.isFinite(record.altitudeM)
          ? Math.max(0, record.altitudeM)
          : 0
        : 0,
  };
}

const SQUAWKS = Object.freeze({
  7500: { severity: 'critical', reason: 'Squawk 7500 · unlawful interference' },
  7600: { severity: 'high', reason: 'Squawk 7600 · radio failure' },
  7700: { severity: 'critical', reason: 'Squawk 7700 · general emergency' },
});
const STATE_SHIP = /military|law enforce|search and rescue|\bsar\b|naval|warship/i;

const RANK = { critical: 3, high: 2, watch: 1 };

/** Why an object deserves attention, from feed values only. Null if routine. */
export function triageReason(o) {
  if (o.kind === 'aircraft') {
    const sq = SQUAWKS[String(o.squawk || '').trim()];
    if (sq) return sq;
    if (o.military) return { severity: 'watch', reason: 'Military ICAO block' };
    return null;
  }
  if (o.kind === 'earthquake') {
    const m = Number(o.magnitude);
    if (!Number.isFinite(m) || m < 4.5) return null;
    return {
      severity: m >= 6 ? 'critical' : m >= 5.2 ? 'high' : 'watch',
      reason: `USGS M${m.toFixed(1)}${o.place ? ` · ${o.place}` : ''}`,
    };
  }
  if (o.kind === 'vessel') {
    if (STATE_SHIP.test(String(o.shipType || '')))
      return { severity: 'watch', reason: `AIS type · ${o.shipType}` };
    return null;
  }
  if (o.kind === 'satellite' && /\bISS\b|ZARYA/i.test(String(o.name || '')))
    return { severity: 'watch', reason: 'Crewed station overhead pass' };
  return null;
}

/**
 * Rank intel objects into a triage queue. Higher severity first; within a
 * severity, quakes by magnitude, then stable by key so the list doesn't jitter.
 */
export function buildTriage(objects, { limit = 12 } = {}) {
  const items = [];
  for (const o of objects) {
    const why = triageReason(o);
    if (why) items.push({ ...why, object: o });
  }
  items.sort(
    (a, b) =>
      RANK[b.severity] - RANK[a.severity] ||
      (Number(b.object.magnitude) || 0) - (Number(a.object.magnitude) || 0) ||
      String(a.object.key).localeCompare(String(b.object.key)),
  );
  return items.slice(0, limit);
}

/** Nearest projected point to (x,y) within maxPx, or null. */
export function nearestHit(points, x, y, maxPx = 22) {
  let best = null;
  let bestD = maxPx * maxPx;
  for (const p of points) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const R = 6_371_000;
function ecef(o) {
  const la = (o.lat * Math.PI) / 180;
  const lo = (o.lon * Math.PI) / 180;
  const r = R + (o.heightM || 0);
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
}
/** Straight-line distance in km between two intel objects (altitude-aware). */
export function distanceKm(a, b) {
  const p = ecef(a);
  const q = ecef(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / 1000;
}

/** Search radius per kind: satellites look much wider than surface contacts. */
export const NEARBY_KM = Object.freeze({ aircraft: 150, vessel: 100, satellite: 1500, earthquake: 300 });

/** Real contacts near `o`, nearest first. Geometry only — no inference. */
export function nearbyObjects(objects, o, { limit = 5, radiusKm = NEARBY_KM[o.kind] || 150 } = {}) {
  const out = [];
  for (const x of objects) {
    if (x.key === o.key) continue;
    const d = distanceKm(o, x);
    if (d <= radiusKm) out.push({ object: x, km: d });
  }
  out.sort((a, b) => a.km - b.km);
  return { radiusKm, total: out.length, items: out.slice(0, limit) };
}

/** Objects inside a circular area of interest (surface distance). */
export function insideArea(objects, area) {
  const centre = { lat: area.lat, lon: area.lon, heightM: 0 };
  return objects.filter((x) => distanceKm(centre, { ...x, heightM: 0 }) <= area.radiusKm);
}
