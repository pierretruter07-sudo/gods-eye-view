import { calmWindHeadingDeg } from './profiles.js';

/**
 * Flight-phase heuristic, ported from SilentWing's derivePhase and adapted to
 * God's Eye View's metric analyst records. ADS-B carries no phase field, so
 * phase is inferred from altitude above the field, speed, vertical rate and
 * track relative to the active runway.
 *
 * Phases: parked, taxi, takeoff, departure, climb, approach, landing, cruise.
 */

const M_TO_FT = 3.28084;
const MPS_TO_KT = 1.943844;
const MPS_TO_FPM = 196.850394;

const PARKED_KT = 2;
const CLIMB_FPM = 200; // clearly climbing above this vertical rate
const DESCEND_FPM = -200;

/** Smallest angle between two headings, 0–180°. */
export function headingDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * @param {object} aircraft - Analyst record: { altitudeM, speedMps, heading,
 *   verticalRateMps, onGround }.
 * @param {object} profile - Airport profile (for field elevation and runways).
 * @returns {{phase:string, label:string, arriving:boolean|null}}
 */
export function derivePhase(aircraft, profile) {
  const aglFt = ((aircraft.altitudeM ?? 0) - (profile.elevationM ?? 0)) * M_TO_FT;
  const speedKt = (aircraft.speedMps ?? 0) * MPS_TO_KT;
  const rateFpm = aircraft.verticalRateMps == null ? null : aircraft.verticalRateMps * MPS_TO_FPM;

  if (aircraft.onGround || aglFt < 50) {
    if (speedKt < PARKED_KT) return label('parked', null);
    if (speedKt > 60) return label('takeoff', false);
    return label('taxi', null);
  }

  let climbing;
  if (rateFpm != null) {
    climbing = rateFpm > CLIMB_FPM ? true : rateFpm < DESCEND_FPM ? false : null;
  } else {
    climbing = null;
  }
  // No clear vertical rate near the ground: use track vs the active runway.
  if (climbing == null && aglFt < 1500 && speedKt >= 80) {
    const landingHdg = calmWindHeadingDeg(profile);
    if (landingHdg != null && aircraft.heading != null) {
      const departHdg = (landingHdg + 180) % 360;
      const toDepart = headingDiff(aircraft.heading, departHdg);
      const toLand = headingDiff(aircraft.heading, landingHdg);
      climbing = toDepart < 45 && toDepart < toLand;
    }
  }
  if (climbing == null) climbing = false; // arrivals dominate terminal snapshots

  if (aglFt < 1500) return climbing ? label('takeoff', false) : label('landing', true);
  if (aglFt < 10000) return climbing ? label('departure', false) : label('approach', true);
  return label('cruise', null);
}

const LABELS = {
  parked: 'Parked',
  taxi: 'Taxiing',
  takeoff: 'Take-off',
  departure: 'Departing',
  climb: 'Climbing',
  approach: 'On approach',
  landing: 'Landing',
  cruise: 'Cruise',
};

function label(phase, arriving) {
  return { phase, label: LABELS[phase], arriving };
}

/** Phase display colour (kept in one place so the renderer stays thin). */
export const PHASE_COLOR = Object.freeze({
  parked: '#98989d',
  taxi: '#ffd60a',
  takeoff: '#ff6b35',
  departure: '#ff9f0a',
  climb: '#ff9f0a',
  approach: '#30d158',
  landing: '#34c759',
  cruise: '#64d2ff',
});
