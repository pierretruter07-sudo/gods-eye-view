/**
 * @file The Director's spoken script for the opening descent (Pierre, 20
 * Oct): as it steps from orbit to the street and over to the night side, it
 * says what each level shows, where the data comes from, which values are
 * live and which are simulated, and what the platform does with them.
 *
 * Pure: every number comes from the stop's live record; the script adds
 * only plain facts about the platform. No step is named by number.
 * @module tour/introScript
 */
import { groundLine, lowLevelLine, vesselLine } from './lines.js';

const FT_PER_M = 3.28084;
const KT_PER_MPS = 1.943844;
const round = (value, step) => Math.round(value / step) * step;
const num = (n) => n.toLocaleString('en-US');
const feet = (m) => num(round(m * FT_PER_M, 100));

/** A line without its final full stop, to continue a sentence. */
const clause = (line) => line.replace(/\.\s*$/, '');

/** "a live Transport for NSW camera" / "live video from …". */
function cameraPhrase(camera) {
  const provider = camera.provider || 'a public camera network';
  if (camera.feedType === 'hls') return `streaming live video from ${provider}`;
  if (camera.feedType === 'mp4' || camera.feedType === 'webm')
    return `a ${provider} camera that publishes short video clips`;
  return camera.provider
    ? `a live ${camera.provider} camera, refreshed every ten seconds`
    : 'a live public camera, refreshed every ten seconds';
}

/** Local clock words for a solar hour. */
export function clockWords(hour) {
  const total = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const SCRIPT = {
  geo: (stop) =>
    `Welcome to God's Eye View. We start at the very top: the geostationary belt, 35,786 kilometres above the equator, where ${num(stop.count)} satellites hold their place over the Earth. Every satellite you see is tracked live from public orbital data.`,

  iss: (stop) => {
    const s = stop.satellite;
    const facts = [`${num(round(s.altitudeM / 1000, 10))} kilometres up`];
    if (Number.isFinite(s.speedMps))
      facts.push(
        `travelling at ${num(round(s.speedMps * 3.6, 100))} kilometres per hour`,
      );
    return `One level down, in low Earth orbit: the International Space Station, ${facts.join(', ')}. Select any satellite to see its orbit, its coverage on the ground and when it next passes overhead.`;
  },

  cruise: (stop) => {
    const a = stop.aircraft;
    const who = a.callsign ? `flight ${a.callsign}` : 'an airliner';
    const facts = [`${who} at ${feet(a.altitudeM)} feet`];
    if (Number.isFinite(a.speedMps))
      facts.push(`${Math.round(a.speedMps * KT_PER_MPS)} knots`);
    return `Another level down, into the airspace: ${facts.join(', ')}. Aircraft broadcast their own position over ADS-B. The cards around it show those live values, marked feed, and anything we estimate, such as fuel or ownership, marked simulated.`;
  },

  low: (stop) =>
    `Lower still. ${clause(lowLevelLine(stop.aircraft, { helicopter: stop.helicopter !== false }))}. The Director watches every aircraft for emergency codes, and once this introduction ends, a real emergency jumps straight to the front of the tour.`,

  ship: (stop) =>
    `Down to sea level. ${clause(vesselLine(stop.vessel))}. Ships report their identity, course and speed over AIS, the way aircraft use ADS-B.`,

  ground: (stop) =>
    `Now on the ground. ${clause(groundLine(stop.aircraft, { vehicle: stop.vehicle ?? 'service' }))}. Ground vehicles, ships, aircraft and satellites all sit together in one live picture.`,

  street: (stop) => {
    const sq = stop.square;
    if (sq?.length >= 4) {
      const live = sq.every((c) => c.feedType === 'hls');
      const place = stop.camera.city ? ` in ${stop.camera.city}` : '';
      const who = stop.camera.provider ? `, from ${stop.camera.provider}` : '';
      return live
        ? `And finally, street level${place}: four live video cameras at once${who}, playing as it happens. From orbit to the street, all from public data.`
        : `And finally, street level${place}: four live public cameras at once${who}. From orbit to the street, all from public data.`;
    }
    return `And finally, street level: ${stop.camera.name || 'a street camera'}, ${cameraPhrase(stop.camera)}. From orbit to the street, all from public data.`;
  },

  nightCity: (stop, { hour }) =>
    `Now the other half of the planet: the night side, where it's around ${clockWords(hour)} in ${stop.region.label}. The city lights come from NASA's night-time satellite imagery, and the line between day and night follows the real sun.`,

  nightStreet: (stop, { city }) =>
    `And down into ${city || 'the city'} at night: ${stop.camera.name || 'a street camera'}, ${cameraPhrase(stop.camera)}. After dark the view switches to night vision, and the badge on screen always tells you which view mode you're in. From here, the Director tours the planet on its own.`,
};

/**
 * The scripted line for a descent stop, or null when the step has no script
 * (the stop then keeps its plain line).
 * @param {object} stop a descent stop
 * @param {{hour?: number, city?: string}} [ctx]
 */
export function introLine(stop, ctx = {}) {
  const write = SCRIPT[stop?.descent];
  if (!write) return null;
  try {
    return write(stop, ctx);
  } catch {
    return null;
  }
}

/** The steps the script covers (for tests and documentation). */
export const SCRIPTED_STEPS = Object.freeze(Object.keys(SCRIPT));
