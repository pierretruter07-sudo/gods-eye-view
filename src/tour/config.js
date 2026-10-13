/**
 * Director (tour mode) settings. Every tunable number lives here.
 * Distances in metres, angles in degrees, times in seconds.
 */
export const TOUR_TIMING = Object.freeze({
  flyInS: 5,
  /** How long the camera circles each stop before moving on. */
  orbitS: 20,
  /** Orbit speed. 3°/s is half the app's default 6°/s. */
  orbitDegPerS: 3,
  /** Pause after the voice finishes before leaving a stop early is allowed. */
  minHoldS: 8,
});

/** How close the camera sits for each kind of event. */
export const EVENT_CAMERA = Object.freeze({
  aircraft: Object.freeze({ rangeM: 70_000, pitchDeg: -35 }),
  earthquake: Object.freeze({ rangeM: 350_000, pitchDeg: -50 }),
});

export const EVENT_RULES = Object.freeze({
  /** Squawk codes worth flying to, most serious first. */
  squawks: Object.freeze({
    7500: Object.freeze({ rank: 0, label: 'unlawful interference' }),
    7700: Object.freeze({ rank: 1, label: 'general emergency' }),
    7600: Object.freeze({ rank: 2, label: 'radio failure' }),
  }),
  quakeMinMagnitude: 4.5,
  quakeMaxAgeH: 6,
  /** Radius used for "aircraft near this stop" counts. */
  nearbyRadiusKm: 100,
});

/** Layers the Director switches on when it starts. */
export const TOUR_LAYERS = Object.freeze(['flights', 'earthquakes']);

/** Fixed stops visited, in order, whenever there is no event to show. */
export const TOUR_STOPS = Object.freeze([
  {
    id: 'globe',
    label: 'Planet overview',
    lat: -10,
    lon: 140,
    rangeM: 18_000_000,
    pitchDeg: -90,
  },
  {
    id: 'egll',
    label: 'London Heathrow',
    lat: 51.47,
    lon: -0.4543,
    rangeM: 40_000,
    pitchDeg: -35,
  },
  {
    id: 'kjfk',
    label: 'New York JFK',
    lat: 40.6413,
    lon: -73.7781,
    rangeM: 40_000,
    pitchDeg: -35,
  },
  {
    id: 'omdb',
    label: 'Dubai International',
    lat: 25.2532,
    lon: 55.3657,
    rangeM: 40_000,
    pitchDeg: -35,
  },
  {
    id: 'rjtt',
    label: 'Tokyo Haneda',
    lat: 35.5494,
    lon: 139.7798,
    rangeM: 40_000,
    pitchDeg: -35,
  },
  {
    id: 'yssy',
    label: 'Sydney',
    lat: -33.9399,
    lon: 151.1753,
    rangeM: 40_000,
    pitchDeg: -35,
  },
].map((stop) => Object.freeze(stop)));
