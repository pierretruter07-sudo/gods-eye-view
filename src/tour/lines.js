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
  const parts = [`${who} is squawking ${spellCode(f.squawk)}, ${f.meaning}.`];
  if (f.onGround) parts.push('It is on the ground.');
  else if (f.altitudeM != null)
    parts.push(
      `Altitude ${round(f.altitudeM * FT_PER_M, 100).toLocaleString('en-US')} feet.`,
    );
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
  if (f.depthKm != null)
    parts.push(`Depth ${Math.round(f.depthKm)} kilometres.`);
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

export function baseLine(base, airborne, radiusKm) {
  const name = base.region ? `${base.label}, ${base.region}` : base.label;
  return airborne > 0
    ? `Military airfield: ${name}. ${airborne} aircraft airborne within ${radiusKm} kilometres.`
    : `Military airfield: ${name}.`;
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

/**
 * AIS destinations are free text typed by the crew; skip placeholders such
 * as "0", "-" or "N/A" rather than reading them out.
 */
export function plausibleDestination(text) {
  const t = String(text ?? '').trim();
  if ((t.match(/[a-z]/gi) || []).length < 3) return false;
  return !/^(n\/?a|none|null|unknown|tba|tbd)$/i.test(t);
}

export function vesselLine(vessel) {
  const kind = vessel.shipType ? titleCase(vessel.shipType) : 'Vessel';
  const parts = [`${kind}${vessel.name ? ` ${titleCase(vessel.name)}` : ''}`];
  if (vessel.speedKts != null)
    parts.push(`making ${Math.round(vessel.speedKts)} knots`);
  if (plausibleDestination(vessel.destination))
    parts.push(`bound for ${titleCase(vessel.destination)}`);
  return `${parts.join(', ')}.`;
}

export function militaryLine(aircraft, { typeName = null } = {}) {
  const id = aircraft.callsign
    ? `callsign ${aircraft.callsign}`
    : 'without a public callsign';
  const parts = [
    `${typeName ? `A ${typeName}` : 'A military aircraft'}, ${id}`,
  ];
  if (!typeName && aircraft.aircraftClass)
    parts.push(`type ${aircraft.aircraftClass}`);
  if (aircraft.operator) parts.push(`operated by ${aircraft.operator}`);
  if (Number.isFinite(aircraft.altitudeM) && !aircraft.onGround)
    parts.push(
      `at ${round(aircraft.altitudeM * 3.28084, 100).toLocaleString('en-US')} feet`,
    );
  if (aircraft.originCountry)
    parts.push(`registered to ${aircraft.originCountry}`);
  return `${parts.join(', ')}.`;
}

/** What a satellite group is, in a few spoken words. */
const SATELLITE_ROLES = Object.freeze({
  geo: 'in geostationary orbit, holding still over the equator',
  'gps-ops': 'part of the GPS navigation constellation',
  galileo: "part of Europe's Galileo navigation system",
  glonass: "part of Russia's GLONASS navigation system",
  stations: 'a crewed space station',
});

export function satelliteLine(sat) {
  const name = sat.isIss
    ? 'The International Space Station'
    : titleCase(sat.name || 'A satellite');
  const parts = [name];
  const role = SATELLITE_ROLES[sat.group];
  if (role && !sat.isIss) parts.push(role);
  if (sat.altitudeM != null)
    parts.push(
      `${round(sat.altitudeM / 1000, 10).toLocaleString('en-US')} kilometres up`,
    );
  if (sat.speedMps != null)
    parts.push(
      `travelling at ${round(sat.speedMps * 3.6, 100).toLocaleString('en-US')} kilometres per hour`,
    );
  return `${parts.join(', ')}.`;
}

// ── Opening descent ─────────────────────────────────────────────────────

const feet = (m) => round(m * FT_PER_M, 100).toLocaleString('en-US');

export function geoBeltLine(count) {
  return `The geostationary belt, 35,786 kilometres above the equator. ${count.toLocaleString('en-US')} satellites tracked here.`;
}

function aircraftWho(a, fallback) {
  if (a.callsign) return `Flight ${a.callsign}`;
  return fallback;
}

export function cruiseLine(a) {
  const parts = [
    `${aircraftWho(a, 'An airliner')} at ${feet(a.altitudeM)} feet`,
  ];
  if (a.speedMps != null)
    parts.push(`ground speed ${Math.round(a.speedMps * KT_PER_MPS)} knots`);
  if (a.operator) parts.push(`operator ${a.operator}`);
  return `${parts.join(', ')}.`;
}

export function lowLevelLine(a, { helicopter }) {
  const kind = helicopter ? 'A helicopter' : 'A light aircraft';
  const parts = [`${kind} at ${feet(a.altitudeM)} feet`];
  if (a.callsign) parts.push(`callsign ${a.callsign}`);
  if (a.speedMps != null)
    parts.push(`${Math.round(a.speedMps * KT_PER_MPS)} knots`);
  return `${parts.join(', ')}.`;
}

export function groundLine(a, { vehicle }) {
  if (vehicle) {
    const role = vehicle === 'emergency' ? 'emergency' : 'service';
    const parts = [`An airport ${role} vehicle broadcasting its position`];
    if (a.callsign) parts.push(`callsign ${a.callsign}`);
    return `${parts.join(', ')}.`;
  }
  const parts = [`${aircraftWho(a, 'An aircraft')} taxiing`];
  if (a.speedMps != null)
    parts.push(`at ${Math.round(a.speedMps * KT_PER_MPS)} knots`);
  return `${parts.join(' ')}.`;
}

export function streetLine(camera, { first }) {
  const name = camera.name || 'A street camera';
  if (!first) return `${name}.`;
  if (camera.feedType === 'hls')
    return `Street level. ${name}, live video from ${camera.provider || 'a public camera network'}.`;
  return camera.provider
    ? `Street level. ${name}, a live ${camera.provider} camera.`
    : `Street level. ${name}, a live public camera.`;
}
