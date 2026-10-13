/**
 * Spoken lines for each Director stop, built only from feed values.
 * A missing value is left out of the sentence, never guessed.
 */

const FT_PER_M = 3.28084;
const KT_PER_MPS = 1.943844;

const round = (value, step) => Math.round(value / step) * step;

function minutesAgo(timeMs, now) {
  const mins = Math.max(0, Math.round((now - timeMs) / 60_000));
  if (mins < 2) return 'in the last few minutes';
  if (mins < 90) return `${mins} minutes ago`;
  return `about ${Math.round(mins / 60)} hours ago`;
}

/** Spell a squawk digit by digit so voices read "seven seven zero zero". */
function spellCode(code) {
  const names = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  return [...String(code)].map((d) => names[Number(d)] ?? d).join(' ');
}

export function aircraftLine(event) {
  const f = event.facts;
  const who = f.callsign ? `Flight ${f.callsign}` : 'An aircraft';
  const parts = [
    `${who} is squawking ${spellCode(f.squawk)}, ${f.meaning}.`,
  ];
  if (f.onGround) parts.push('It is on the ground.');
  else if (f.altitudeM != null)
    parts.push(`Altitude ${round(f.altitudeM * FT_PER_M, 100).toLocaleString('en-US')} feet.`);
  if (f.speedMps != null && !f.onGround)
    parts.push(`Ground speed ${Math.round(f.speedMps * KT_PER_MPS)} knots.`);
  if (f.operator) parts.push(`Operator ${f.operator}.`);
  return parts.join(' ');
}

export function quakeLine(event, now) {
  const f = event.facts;
  const parts = [
    `A magnitude ${f.magnitude.toFixed(1)} earthquake${f.place ? `, ${f.place}` : ''}, ${minutesAgo(f.timeMs, now)}.`,
  ];
  if (f.depthKm != null) parts.push(`Depth ${Math.round(f.depthKm)} kilometres.`);
  return parts.join(' ');
}

export function stopLine(stop, nearbyCount, radiusKm) {
  if (stop.id === 'globe')
    return nearbyCount > 0
      ? `Live view of the planet. ${nearbyCount.toLocaleString('en-US')} aircraft are being tracked right now.`
      : 'Live view of the planet.';
  if (nearbyCount > 0)
    return `${stop.label}. ${nearbyCount} aircraft airborne within ${radiusKm} kilometres.`;
  return `${stop.label}.`;
}

/**
 * Full spoken line for an event. Simulated events say so first; an incident
 * being shown again is introduced as recent rather than as a new alert.
 */
export function eventLine(event, now = Date.now(), { recent = false } = {}) {
  const body =
    event.kind === 'aircraft' ? aircraftLine(event) : quakeLine(event, now);
  if (event.simulated) return `Simulated event. ${body}`;
  return recent ? `Recent event. ${body}` : `Alert. ${body}`;
}

export function airportLine(airport, airborne, radiusKm) {
  return airborne > 0
    ? `${airport.label}. ${airborne} aircraft airborne within ${radiusKm} kilometres.`
    : `${airport.label}.`;
}

function titleCase(text) {
  return String(text)
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function vesselLine(vessel) {
  const kind = vessel.shipType ? titleCase(vessel.shipType) : 'Vessel';
  const parts = [`${kind}${vessel.name ? ` ${titleCase(vessel.name)}` : ''}`];
  if (vessel.speedKts != null) parts.push(`making ${Math.round(vessel.speedKts)} knots`);
  if (vessel.destination) parts.push(`bound for ${titleCase(vessel.destination)}`);
  return `${parts.join(', ')}.`;
}

export function militaryLine(aircraft) {
  const id = aircraft.callsign ? `callsign ${aircraft.callsign}` : 'without a public callsign';
  const parts = [`A military aircraft, ${id}`];
  if (aircraft.aircraftClass) parts.push(`type ${aircraft.aircraftClass}`);
  if (Number.isFinite(aircraft.altitudeM) && !aircraft.onGround)
    parts.push(`at ${round(aircraft.altitudeM * 3.28084, 100).toLocaleString('en-US')} feet`);
  if (aircraft.originCountry) parts.push(`registered to ${aircraft.originCountry}`);
  return `${parts.join(', ')}.`;
}

export function satelliteLine(sat) {
  const name = sat.isIss ? 'The International Space Station' : titleCase(sat.name || 'A satellite');
  const parts = [name];
  if (sat.altitudeM != null) parts.push(`${round(sat.altitudeM / 1000, 10).toLocaleString('en-US')} kilometres up`);
  if (sat.speedMps != null) parts.push(`travelling at ${round(sat.speedMps * 3.6, 100).toLocaleString('en-US')} kilometres per hour`);
  return `${parts.join(', ')}.`;
}
