/**
 * @file Pure orbital geometry for the Director's space stops: coverage
 * footprints, rings on the sphere, and a fallback orbit ring when no orbit
 * elements are loaded. Spherical Earth (mean radius); angles in degrees at
 * the edges, radians inside.
 * @module tour/spaceGeometry
 */

/** Mean Earth radius (km). */
export const EARTH_RADIUS_KM = 6371;
/** Geostationary altitude above the equator (km). */
export const GEO_ALTITUDE_KM = 35_786;
/** Elevation above the horizon that counts as usable coverage (deg). */
export const FOOTPRINT_MIN_ELEVATION_DEG = 10;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Earth central angle (radians) from the sub-satellite point to the edge of
 * coverage: the ground the satellite sees at or above `minElevDeg`.
 * λ = acos(R·cos ε / (R + h)) − ε (standard coverage geometry).
 * @param {number} altKm satellite altitude
 * @param {number} [minElevDeg]
 */
export function coverageAngle(altKm, minElevDeg = 0) {
  if (!(altKm > 0)) return 0;
  const e = minElevDeg * RAD;
  const ratio = (EARTH_RADIUS_KM * Math.cos(e)) / (EARTH_RADIUS_KM + altKm);
  return Math.max(0, Math.acos(Math.min(1, ratio)) - e);
}

/** Coverage radius along the ground (km). */
export function coverageRadiusKm(altKm, minElevDeg = 0) {
  return coverageAngle(altKm, minElevDeg) * EARTH_RADIUS_KM;
}

const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Points on the small circle at central angle `angle` (radians) around a
 * centre, as {lat, lon} degrees. Closed (last point repeats the first).
 */
export function circleAround(latDeg, lonDeg, angle, n = 96) {
  const p1 = latDeg * RAD;
  const l1 = lonDeg * RAD;
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const b = (i / n) * 2 * Math.PI;
    const p2 = Math.asin(
      Math.sin(p1) * Math.cos(angle) +
        Math.cos(p1) * Math.sin(angle) * Math.cos(b),
    );
    const l2 =
      l1 +
      Math.atan2(
        Math.sin(b) * Math.sin(angle) * Math.cos(p1),
        Math.cos(angle) - Math.sin(p1) * Math.sin(p2),
      );
    out.push({ lat: p2 * DEG, lon: wrapLon(l2 * DEG) });
  }
  return out;
}

/** The geostationary belt: the equator at GEO altitude, closed. */
export function geoBelt(n = 180) {
  return Array.from({ length: n + 1 }, (_, i) => ({
    lat: 0,
    lon: wrapLon(-180 + (i / n) * 360),
    altKm: GEO_ALTITUDE_KM,
  }));
}

/** Typical inclinations (deg) when no orbit elements are loaded. */
const FALLBACK_INCLINATION = Object.freeze({
  stations: 51.64,
  'gps-ops': 55,
  galileo: 56,
  glonass: 64.8,
  geo: 0,
});

/**
 * A circular orbit ring through the satellite's current position, from an
 * assumed inclination (used only when its orbit elements are not loaded).
 * @param {{lat: number, lon: number, altitudeM: number, group?: string,
 *   isIss?: boolean}} sat
 * @returns {Array<{lat: number, lon: number, altKm: number}>}
 */
export function fallbackRing(sat, n = 180) {
  const altKm = sat.altitudeM / 1000;
  let inc = sat.isIss
    ? 51.64
    : (FALLBACK_INCLINATION[sat.group] ?? (altKm > 30_000 ? 0 : 53));
  if (inc < 1) return geoBelt(n).map((p) => ({ ...p, altKm }));
  inc = Math.max(inc, Math.abs(sat.lat) + 0.01);
  const i = inc * RAD;
  // Argument of latitude now (ascending pass assumed) and the node.
  const u0 = Math.asin(
    Math.max(-1, Math.min(1, Math.sin(sat.lat * RAD) / Math.sin(i))),
  );
  const node =
    sat.lon * RAD - Math.atan2(Math.cos(i) * Math.sin(u0), Math.cos(u0));
  const out = [];
  for (let k = 0; k <= n; k += 1) {
    const u = u0 + (k / n) * 2 * Math.PI;
    out.push({
      lat: Math.asin(Math.sin(i) * Math.sin(u)) * DEG,
      lon: wrapLon(
        (node + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u))) * DEG,
      ),
      altKm,
    });
  }
  return out;
}

/** Great-circle distance (km) between two {lat, lon} points. */
export function distanceKm(a, b) {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dl = (b.lon - a.lon) * RAD;
  const c =
    Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) * EARTH_RADIUS_KM;
}
