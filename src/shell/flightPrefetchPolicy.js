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
    });
  }
  return out;
}

/** How many aircraft of a `states` array are within `radiusKm`. */
export function countStatesNear(states, lat, lon, radiusKm) {
  return statesNear(states, lat, lon, radiusKm).length;
}
