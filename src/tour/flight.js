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
 * to see the planet, or a planet-scale destination, flies straight there.
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
    from.heightM >= hop.minCameraM
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
