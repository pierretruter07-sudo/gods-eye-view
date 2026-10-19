/**
 * @file Which sensor look the Director uses at a stop. Pure: no Cesium, no
 * DOM. The look itself (shaders, tag) is in sensorLook.js.
 * @module tour/sensors
 */
import { isStateVessel } from '../data/stateVessel.js';
import { DIRECTOR_SENSORS } from './config.js';

const RAD = Math.PI / 180;

/**
 * Sun elevation above the horizon, in degrees, at a place and time
 * (low-precision solar position, good to about a degree).
 * @param {Date|number} when
 * @param {number} latDeg
 * @param {number} lonDeg
 */
export function solarElevationDeg(when, latDeg, lonDeg) {
  const ms = when instanceof Date ? when.getTime() : Number(when);
  const d = ms / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstDeg = (18.697374558 + 24.06570982441908 * d) * 15;
  const ha = (gmstDeg + lonDeg) * RAD - ra;
  const lat = latDeg * RAD;
  const s =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/**
 * The sensor look for a Director stop.
 * @param {object} stop a planner or descent stop
 * @param {Date|number} [now]
 * @param {typeof DIRECTOR_SENSORS} [rules]
 * @returns {'flir'|'nvg'|null}
 */
export function sensorFor(stop, now = Date.now(), rules = DIRECTOR_SENSORS) {
  const view = stop?.view;
  if (!view || !Number.isFinite(view.lat) || !Number.isFinite(view.lon))
    return null;
  if (rules.noneKinds.includes(stop.kind)) return null;
  if (stop.descent && rules.noneDescentSteps.includes(stop.descent))
    return null;
  if (stop.stop?.id === 'globe') return null;
  if (!Number.isFinite(view.rangeM) || view.rangeM > rules.maxRangeM)
    return null;
  if (rules.flirKinds.includes(stop.kind)) return 'flir';
  if (stop.kind === 'vessel' && stop.vessel && isStateVessel(stop.vessel))
    return 'flir';
  if (solarElevationDeg(now, view.lat, view.lon) < rules.nightBelowDeg)
    return 'nvg';
  return null;
}

/** The tag shown under the asset title. */
export const SENSOR_LABELS = Object.freeze({
  flir: 'SENSOR · FLIR',
  nvg: 'SENSOR · NVG',
});
