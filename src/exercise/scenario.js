/**
 * Fictional exercise theatre. Everything here is invented: nations, borders,
 * cities, bases, forces and call signs. It is laid over empty real terrain
 * (the deep desert of the Empty Quarter, which holds no real facilities) and
 * never represents a real country, site or force. Live feeds are disconnected
 * while a scenario is active.
 *
 * This is scenery and game data for a training exercise, not targeting data:
 * no real coordinates of anything, no real platforms, no real weapons.
 */

export const SCENARIOS = Object.freeze({
  'grey-tide': {
    id: 'grey-tide',
    name: 'Operation Grey Tide',
    theatre: 'Kestran Federation',
    blurb: 'Coastal-desert theatre. Coalition tasking against a fictional forward airfield.',
    /** Camera home for the theatre overview. */
    overview: { lat: 20.5, lon: 49.0, rangeM: 900_000, pitchDeg: -55 },
    adversary: 'Kestran Federation',
    friendly: 'Meridian Coalition',
    /** Invented border ring (lon/lat pairs) — a soft blob, not any real border. */
    border: [
      [46.5, 23.5], [50.5, 24.0], [52.5, 21.5], [51.5, 18.5],
      [48.5, 17.5], [45.5, 19.5], [46.5, 23.5],
    ],
    target: {
      id: 'zarin-west',
      name: 'Zarin West Airfield',
      kind: 'airfield',
      lat: 20.6,
      lon: 49.4,
      note: 'Fictional forward airfield (simulated).',
    },
    friendlyBase: {
      id: 'fob-anvil',
      name: 'Coalition FOB Anvil',
      kind: 'base',
      lat: 18.2,
      lon: 46.8,
    },
    /** Abstract air-defence coverage: a game ring, not real SAM data. */
    threats: [
      { id: 'sam-north', name: 'Area air-defence (long-range)', lat: 21.1, lon: 49.9, radiusKm: 120, band: 'high' },
      { id: 'sam-point', name: 'Point defence (short-range)', lat: 20.6, lon: 49.4, radiusKm: 25, band: 'medium' },
    ],
  },
});

export const DEFAULT_SCENARIO = 'grey-tide';

export function getScenario(id = DEFAULT_SCENARIO) {
  return SCENARIOS[id] || SCENARIOS[DEFAULT_SCENARIO];
}
