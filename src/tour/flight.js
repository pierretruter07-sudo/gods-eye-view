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
import { TOUR_TIMING } from './config.js';

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
