import { EVENT_RULES } from './config.js';

/**
 * Turn live analyst records into ranked Director events.
 * Pure: no Cesium, no DOM, no clock except the `now` passed in.
 *
 * Event shape:
 *   { key, kind: 'aircraft'|'earthquake', lat, lon, title, facts, simulated }
 * `facts` holds only values read from the feed record, never invented ones.
 */

const KIND_ORDER = { aircraft: 0, earthquake: 1 };

/** Aircraft whose transponder shows an emergency code. */
export function aircraftEvents(flights, rules = EVENT_RULES) {
  const events = [];
  for (const f of flights || []) {
    const rule = rules.squawks[f?.squawk];
    if (!rule || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    events.push({
      key: `aircraft:${f.icao24}:${f.squawk}`,
      kind: 'aircraft',
      rank: rule.rank,
      lat: f.lat,
      lon: f.lon,
      title: `Squawk ${f.squawk}: ${rule.label}`,
      facts: {
        callsign: f.callsign || null,
        icao24: f.icao24 || null,
        squawk: f.squawk,
        meaning: rule.label,
        altitudeM: Number.isFinite(f.altitudeM) ? f.altitudeM : null,
        speedMps: Number.isFinite(f.speedMps) ? f.speedMps : null,
        heading: Number.isFinite(f.heading) ? f.heading : null,
        onGround: f.onGround === true,
        operator: f.operator || null,
        originCountry: f.originCountry || null,
      },
      simulated: f.simulated === true,
    });
  }
  return events;
}

/** Earthquakes above the size threshold within the recent window. */
export function quakeEvents(quakes, now, rules = EVENT_RULES) {
  const maxAgeMs = rules.quakeMaxAgeH * 3_600_000;
  const events = [];
  for (const q of quakes || []) {
    if (!Number.isFinite(q?.magnitude) || q.magnitude < rules.quakeMinMagnitude)
      continue;
    if (!Number.isFinite(q.timeMs) || now - q.timeMs > maxAgeMs) continue;
    if (!Number.isFinite(q.lat) || !Number.isFinite(q.lon)) continue;
    events.push({
      key: `earthquake:${q.id}`,
      kind: 'earthquake',
      rank: 0,
      lat: q.lat,
      lon: q.lon,
      title: `Magnitude ${q.magnitude.toFixed(1)} earthquake`,
      facts: {
        magnitude: q.magnitude,
        place: q.place || null,
        depthKm: Number.isFinite(q.depthKm) ? q.depthKm : null,
        timeMs: q.timeMs,
      },
      simulated: q.simulated === true,
    });
  }
  return events;
}

/**
 * All current events, most important first, minus any already shown.
 * Order: aircraft before quakes; squawk 7500 > 7700 > 7600;
 * quakes by size then most recent.
 */
export function rankEvents({ flights, quakes, now, seen = new Set() }) {
  const events = [
    ...aircraftEvents(flights),
    ...quakeEvents(quakes, now),
  ].filter((e) => !seen.has(e.key));
  return events.sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (a.kind === 'aircraft') return a.rank - b.rank;
    if (b.facts.magnitude !== a.facts.magnitude)
      return b.facts.magnitude - a.facts.magnitude;
    return b.facts.timeMs - a.facts.timeMs;
  });
}

/** Rough great-circle distance in km (good enough for "nearby" counts). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Count airborne aircraft within `radiusKm` of a point. */
export function countNearby(flights, lat, lon, radiusKm) {
  let n = 0;
  for (const f of flights || []) {
    if (f?.onGround || !Number.isFinite(f?.lat) || !Number.isFinite(f?.lon))
      continue;
    if (distanceKm(lat, lon, f.lat, f.lon) <= radiusKm) n += 1;
  }
  return n;
}
