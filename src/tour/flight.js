/**
 * @file Director camera flight rules. Pure: no Cesium.
 *
 * - Flight time grows with distance, so a jump between the street and
 *   geostationary orbit eases over several seconds instead of snapping.
 * - The globe spin (the Earth rolling under a planet-scale view) is only for
 *   views centred on the ground. A view centred on a satellite in high orbit
 *   orbits the satellite instead. Spinning it would re-aim the camera at the
 *   ground, a jump of tens of thousands of kilometres on the first frame
 *   (Pierre, 20 Oct: "snaps out", "snaps in").
 * @module tour/flight
 */
import { TOUR_HOP, TOUR_TIMING } from './config.js';
import { distanceKm } from './events.js';

/** Flight seconds for a camera move of `distanceM` metres. */
export function flightSeconds(distanceM, timing = TOUR_TIMING) {
  const base = timing.flyInS;
  const longest = timing.flyLongS ?? base;
  if (!Number.isFinite(distanceM) || distanceM <= 2_000_000) return base;
  // Log scale: 2,000 km takes the base time, 50,000 km or more the longest.
  const t = Math.log10(distanceM / 2_000_000) / Math.log10(25);
  return base + (longest - base) * Math.min(1, Math.max(0, t));
}

/** Whether a stop's view rolls the globe (true) or orbits its target. */
export function spinsGlobe(view, timing = TOUR_TIMING) {
  return (
    Number.isFinite(view?.rangeM) &&
    view.rangeM >= timing.globeSpinMinRangeM &&
    !(view.heightM > timing.globeSpinMaxTargetM)
  );
}

const RAD = Math.PI / 180;

/** Great-circle midpoint of two points (degrees). */
export function midpoint(a, b) {
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const bx = Math.cos(la2) * Math.cos(dLon);
  const by = Math.cos(la2) * Math.sin(dLon);
  const lat = Math.atan2(
    Math.sin(la1) + Math.sin(la2),
    Math.sqrt((Math.cos(la1) + bx) ** 2 + by ** 2),
  );
  const lon = a.lon * RAD + Math.atan2(by, Math.cos(la1) + bx);
  return {
    lat: lat / RAD,
    lon: ((((lon / RAD + 540) % 360) + 360) % 360) - 180,
  };
}

/**
 * How the Director travels between two normal stops (Pierre, 20 Oct): out
 * until the whole planet is in view, a short pause turning the globe, then
 * in to the next subject, about 10 s in all. A camera already high enough
 * to see the planet, a planet-scale destination, or a stop closer than
 * `hop.directBelowKm`, flies straight there.
 * @param {{lat: number, lon: number, heightM: number}} from camera position
 * @param {{lat: number, lon: number, heightM?: number, rangeM: number}} to
 * @returns {{via: object|null, outS: number, holdS: number, inS: number}}
 */
export function planHop(from, to, hop = TOUR_HOP, timing = TOUR_TIMING) {
  const direct = { via: null, outS: 0, holdS: 0, inS: hop.directS };
  if (!hop.enabled) return { ...direct, inS: null };
  const planetTarget =
    Number.isFinite(to?.rangeM) && to.rangeM >= timing.globeSpinMinRangeM;
  if (
    planetTarget ||
    !Number.isFinite(from?.lat) ||
    !Number.isFinite(from?.lon) ||
    from.heightM >= hop.minCameraM ||
    // Nearby stops glide straight across; no zoom out to the planet.
    (Number.isFinite(to?.lat) &&
      Number.isFinite(to?.lon) &&
      distanceKm(from.lat, from.lon, to.lat, to.lon) < (hop.directBelowKm ?? 0))
  )
    return direct;
  const mid = midpoint(from, to);
  return {
    via: {
      lat: mid.lat,
      lon: mid.lon,
      heightM: 0,
      rangeM: hop.rangeM,
      pitchDeg: -90,
    },
    outS: hop.outS,
    holdS: hop.holdS,
    inS: hop.inS,
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/** Smooth start and finish (smootherstep). */
export const ease = (x) => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** A point on the great circle from a to b, fraction f (degrees). */
export function slerpLatLon(a, b, f) {
  const toV = (p) => [
    Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD),
    Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD),
    Math.sin(p.lat * RAD),
  ];
  const va = toV(a);
  const vb = toV(b);
  const dot = Math.min(
    1,
    Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]),
  );
  const w = Math.acos(dot);
  if (w < 1e-9) return { lat: a.lat, lon: a.lon };
  const sa = Math.sin((1 - f) * w) / Math.sin(w);
  const sb = Math.sin(f * w) / Math.sin(w);
  const v = va.map((x, i) => sa * x + sb * vb[i]);
  return {
    lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD,
    lon: Math.atan2(v[1], v[0]) / RAD,
  };
}

/**
 * The camera rig part-way through a planet hop, u from 0 to 1: the look-at
 * point glides along the great circle the whole time while the range
 * climbs to the planet view (log scale, so the zoom speed looks even),
 * holds there through the middle, and comes back down to the next subject.
 * @param {{lat, lon, heightM, rangeM, pitchDeg, headingDeg}} from
 * @param {{lat, lon, heightM, rangeM, pitchDeg, headingDeg}} to
 */
export function hopRig(from, to, u, hop = TOUR_HOP) {
  const total = hop.outS + hop.holdS + hop.inS;
  const outEnd = hop.outS / total;
  const inStart = (hop.outS + hop.holdS) / total;
  const where = slerpLatLon(from, to, ease(u));
  const lerp = (a, b, f) => a + (b - a) * f;
  const logLerp = (a, b, f) => Math.exp(lerp(Math.log(a), Math.log(b), f));
  let rangeM;
  let pitchDeg;
  let heightM;
  let headingDeg;
  if (u <= outEnd) {
    const f = ease(u / outEnd);
    rangeM = logLerp(from.rangeM, hop.rangeM, f);
    pitchDeg = lerp(from.pitchDeg, -90, f);
    heightM = lerp(from.heightM || 0, 0, f);
    headingDeg =
      (from.headingDeg || 0) + wrap180(0 - (from.headingDeg || 0)) * f;
  } else if (u < inStart) {
    rangeM = hop.rangeM;
    pitchDeg = -90;
    heightM = 0;
    headingDeg = 0;
  } else {
    const f = ease((u - inStart) / (1 - inStart));
    rangeM = logLerp(hop.rangeM, to.rangeM, f);
    pitchDeg = lerp(-90, to.pitchDeg, f);
    heightM = lerp(0, to.heightM || 0, f);
    headingDeg = wrap180(to.headingDeg || 0) * f;
  }
  return {
    lat: where.lat,
    lon: where.lon,
    heightM,
    rangeM,
    pitchDeg,
    headingDeg,
  };
}

/**
 * The range during the held arrival: creeping in from the approach range
 * while the final view's tiles load (`waitedS` into the hold), then gliding
 * to the final range (`glideU` 0-1 once the tiles are in).
 * @param {number} approachM range the hop came down to
 * @param {number} finalM the stop's own range
 * @param {{waitedS?: number, glideU?: number|null, from?: number}} t
 */
export function arrivalRangeM(
  approachM,
  finalM,
  { waitedS = 0, glideU = null, from = null } = {},
  hop = TOUR_HOP,
) {
  const crept = approachM * (1 - hop.holdCreep * (1 - Math.exp(-waitedS / 3)));
  if (glideU == null) return Math.max(finalM, crept);
  const start = from ?? crept;
  const f = ease(glideU);
  return Math.exp(Math.log(start) + (Math.log(finalM) - Math.log(start)) * f);
}

/**
 * One frame of easing a point toward a moving target (exponential, frame-
 * rate independent): after `tauS` seconds about 63% of the gap is closed.
 * Points are {x, y, z} (Earth-fixed metres); the result is written to `out`.
 * A gap larger than `snapM` (a different subject, a feed jump) is taken at
 * once rather than drifted across.
 */
export function smoothToward(
  current,
  target,
  dtS,
  { tauS = 0.6, snapM = 50_000 } = {},
  out = { x: 0, y: 0, z: 0 },
) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const gap = Math.hypot(dx, dy, dz);
  const f =
    gap > snapM || !(tauS > 0) ? 1 : 1 - Math.exp(-Math.max(0, dtS) / tauS);
  out.x = current.x + dx * f;
  out.y = current.y + dy * f;
  out.z = current.z + dz * f;
  return out;
}

/**
 * Where a moving subject will be after `seconds`, carried along its course
 * at its speed (flat-earth step, fine over the few km of a hop).
 * @param {{lat: number, lon: number, heightM?: number}} at
 * @param {number} headingDeg course, degrees from north
 * @param {number} speedMps
 * @param {number} seconds
 */
export function leadPosition(at, headingDeg, speedMps, seconds) {
  if (
    !Number.isFinite(headingDeg) ||
    !Number.isFinite(speedMps) ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    return { ...at };
  const d = speedMps * seconds;
  const R = 6_371_000;
  const north = d * Math.cos(headingDeg * RAD);
  const east = d * Math.sin(headingDeg * RAD);
  return {
    ...at,
    lat: at.lat + north / R / RAD,
    lon: at.lon + east / (R * Math.max(0.01, Math.cos(at.lat * RAD))) / RAD,
  };
}

/**
 * The heading (degrees) the camera will have on arriving at a stop:
 * planet hops come in north-up (hopRig ends at heading 0), as do
 * planet-scale views; a direct flight keeps the camera's own heading
 * (null).
 * @param {{via: object|null}} plan from planHop
 * @param {{heightM?: number, rangeM: number}} view
 * @param {{descent?: boolean, hasLastView?: boolean}} [how]
 */
export function arrivalHeadingDeg(
  plan,
  view,
  { descent = false, hasLastView = true } = {},
) {
  if (!descent && plan?.via && hasLastView) return 0;
  return spinsGlobe(view) ? 0 : null;
}
