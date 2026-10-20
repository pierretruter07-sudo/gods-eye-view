/** Pure rules for when a camera stop should trigger an immediate flight refresh. */

/** Above this camera height the regional flight view is not useful. */
export const PREFETCH_MAX_HEIGHT_M = 1_500_000;
/** Refresh when the view centre moved at least this far since the last one. */
export const PREFETCH_MIN_MOVE_KM = 40;
/** …or when the last refresh is older than this. */
export const PREFETCH_MAX_AGE_MS = 25_000;

function km(a, b) {
  const dLat = (b.lat - a.lat) * 111.32;
  const dLon =
    (b.lon - a.lon) *
    111.32 *
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export function shouldRefreshFlights({ last, here, heightM, now }) {
  if (!here || !(heightM <= PREFETCH_MAX_HEIGHT_M)) return false;
  if (!last) return true;
  return (
    km(last, here) >= PREFETCH_MIN_MOVE_KM ||
    now - last.at >= PREFETCH_MAX_AGE_MS
  );
}

/** A worldwide snapshot younger than this answers a stop from memory. */
export const WORLDWIDE_FRESH_MS = 60_000;

/**
 * Whether the flights layer already holds a fresh WORLDWIDE snapshot, so a
 * Director stop can be answered from memory instead of downloading and
 * parsing the whole world again (audit, 21 Oct: 2–3 full downloads per
 * stop). A regional fallback snapshot does not count: it only covers
 * where it was asked for.
 * @param {{coverage?: string, lastUpdate?: number|null, stale?: boolean}|null} stats
 */
export function worldwideFresh(stats, now, maxAgeMs = WORLDWIDE_FRESH_MS) {
  return Boolean(
    stats &&
    /worldwide/i.test(stats.coverage || '') &&
    !stats.stale &&
    Number.isFinite(stats.lastUpdate) &&
    now - stats.lastUpdate < maxAgeMs,
  );
}

/** Analyst records within `radiusKm` of a point, in the staging shape. */
export function recordsNear(records, lat, lon, radiusKm) {
  const out = [];
  for (const r of records || []) {
    if (!Number.isFinite(r?.lat) || !Number.isFinite(r?.lon)) continue;
    if (km({ lat, lon }, r) > radiusKm) continue;
    out.push({
      icao24: r.icao24 ?? null,
      callsign: r.callsign ?? null,
      lat: r.lat,
      lon: r.lon,
      altitudeM: r.altitudeM ?? 0,
      onGround: r.onGround === true,
      speedMps: r.speedMps ?? null,
      headingDeg: r.heading ?? null,
      verticalRateMps: r.verticalRateMps ?? null,
      category: r.emitterCategory ?? null,
    });
  }
  return out;
}

/**
 * Aircraft records from an OpenSky-style `states` array within `radiusKm`
 * of a point. State vectors: [icao24, callsign, country, time, contact,
 * lon, lat, baroAlt, onGround, velocity, track, verticalRate, sensors,
 * geoAlt, …]. Records use the analyst field names the overlays read.
 */
export function statesNear(states, lat, lon, radiusKm) {
  if (!Array.isArray(states)) return [];
  const out = [];
  for (const s of states) {
    if (!Array.isArray(s)) continue;
    const sLon = s[5];
    const sLat = s[6];
    if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) continue;
    if (km({ lat, lon }, { lat: sLat, lon: sLon }) > radiusKm) continue;
    const num = (v) => (Number.isFinite(v) ? v : null);
    out.push({
      icao24: s[0] || null,
      callsign: typeof s[1] === 'string' ? s[1].trim() || null : null,
      lat: sLat,
      lon: sLon,
      altitudeM: num(s[13]) ?? num(s[7]) ?? 0,
      onGround: s[8] === true,
      speedMps: num(s[9]),
      headingDeg: num(s[10]),
      verticalRateMps: num(s[11]),
      // OpenSky extended category (8 rotorcraft, 16/17 surface vehicles).
      category: num(s[17]),
    });
  }
  return out;
}

/** How many aircraft of a `states` array are within `radiusKm`. */
export function countStatesNear(states, lat, lon, radiusKm) {
  return statesNear(states, lat, lon, radiusKm).length;
}
