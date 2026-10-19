/**
 * Director (tour mode) settings. Every tunable number lives here.
 * Distances in metres, angles in degrees, times in seconds.
 */
export const TOUR_TIMING = Object.freeze({
  flyInS: 4,
  /** Time spent at a new or recent incident (max). */
  eventDwellS: 15,
  /** Time spent at any other stop. */
  stopDwellS: 12,
  /** The whole-planet overview is kept brief and always rotating. */
  globeDwellS: 5,
  /** Orbit speed while dwelling. */
  orbitDegPerS: 3,
  /** Wide (planet-scale) views turn the globe instead, at this rate. */
  globeSpinDegPerS: 3,
  /** Views at least this far out count as planet-scale. */
  globeSpinMinRangeM: 5_000_000,
  /** How often to check for a brand-new incident while dwelling. */
  interruptCheckS: 2,
  /** An incident already shown may be revisited after this long. */
  revisitAfterMin: 6,
  /** Longest wait, when leaving, for the next stop's aircraft to load. */
  stageMaxWaitS: 6,
});

/** Camera framing per stop kind. Steep enough that the far field (coarse,
 * differently-coloured imagery tiles) stays out of frame and fewer tiles load. */
export const STOP_CAMERA = Object.freeze({
  aircraft: Object.freeze({ rangeM: 70_000, pitchDeg: -42 }),
  earthquake: Object.freeze({ rangeM: 350_000, pitchDeg: -50 }),
  airport: Object.freeze({ rangeM: 14_000, pitchDeg: -40 }),
  vessel: Object.freeze({ rangeM: 9_000, pitchDeg: -40 }),
  military: Object.freeze({ rangeM: 45_000, pitchDeg: -42 }),
  satellite: Object.freeze({ rangeM: 2_500_000, pitchDeg: -35 }),
});

export const EVENT_RULES = Object.freeze({
  /** Squawk codes worth flying to, most serious first. */
  squawks: Object.freeze({
    7500: Object.freeze({ rank: 0, label: 'unlawful interference' }),
    7700: Object.freeze({ rank: 1, label: 'general emergency' }),
    7600: Object.freeze({ rank: 2, label: 'radio failure' }),
  }),
  quakeMinMagnitude: 4.5,
  /** Quakes older than this are no longer shown. */
  quakeMaxAgeH: 3,
  /** Radius used for "aircraft near this stop" counts. */
  nearbyRadiusKm: 100,
  airportRadiusKm: 50,
  /** Ships slower than this are treated as parked. */
  vesselMinKts: 8,
  /** Naval / state vessels are shown even when slow. */
  stateVesselMinKts: 1,
});

/**
 * What to show between incidents, in order, repeating. A slot with nothing
 * available is skipped. New incidents always jump the queue.
 */
export const TOUR_ROTATION = Object.freeze([
  'recent',
  'airport',
  'military',
  'vessel',
  'satellite',
  'recent',
  'city',
]);

/**
 * Opening descent: on the first Director run after the dashboard opens, the
 * camera steps down from the geostationary belt to street level before the
 * normal rotation starts. Steps 3-7 stay over one region, chosen where it is
 * daytime so the camera stills are lit. Each region has a public traffic
 * camera network that is on by default (see server/providers/cctv/catalog.js).
 * groundM is the approximate city ground height, used only to aim the camera.
 */
export const DESCENT_REGIONS = Object.freeze(
  [
    {
      id: 'sydney',
      label: 'Sydney',
      lat: -33.8688,
      lon: 151.2093,
      groundM: 20,
    },
    { id: 'london', label: 'London', lat: 51.5074, lon: -0.1278, groundM: 20 },
    {
      id: 'helsinki',
      label: 'Helsinki',
      lat: 60.1699,
      lon: 24.9384,
      groundM: 20,
    },
    {
      id: 'vancouver',
      label: 'Vancouver',
      lat: 49.2827,
      lon: -123.1207,
      groundM: 10,
    },
    {
      id: 'calgary',
      label: 'Calgary',
      lat: 51.0447,
      lon: -114.0719,
      groundM: 1080,
    },
    {
      id: 'toronto',
      label: 'Toronto',
      lat: 43.6532,
      lon: -79.3832,
      groundM: 90,
    },
  ].map((r) => Object.freeze(r)),
);

export const DESCENT_RULES = Object.freeze({
  /** Cruise band for the "airliner near 40,000 ft" step (metres, barometric). */
  cruiseMinM: 10_668, // 35,000 ft
  cruiseMaxM: 13_106, // 43,000 ft
  /** Low-level step: helicopters at or below this height... */
  helicopterMaxM: 914, // 3,000 ft
  /** ...or, when none is airborne, a light aircraft at or below this. */
  lightMaxM: 1_524, // 5,000 ft
  /** Taxiing aircraft (ground-vehicle fallback): ground speed band, m/s. */
  taxiMinMps: 2.5, // ~5 kt
  taxiMaxMps: 15, // ~30 kt
  /** Geostationary altitude band used to count the belt (metres). */
  geoMinM: 34_000_000,
  geoMaxM: 37_500_000,
  /** Nearby cameras visited after the first street-level stop. */
  nearbyCameras: 2,
  nearbyCameraMaxKm: 8,
  /** Radius of the region's aircraft load at the start of the descent. */
  regionRadiusKm: 450,
  /** Longest wait for a step's data to arrive before the step is skipped. */
  stepMaxWaitS: 8,
});

/** Camera framing per descent step. */
export const DESCENT_CAMERA = Object.freeze({
  geo: Object.freeze({ rangeM: 95_000_000, pitchDeg: -90 }),
  cruise: Object.freeze({ rangeM: 25_000, pitchDeg: -30 }),
  low: Object.freeze({ rangeM: 3_000, pitchDeg: -25 }),
  ground: Object.freeze({ rangeM: 900, pitchDeg: -35 }),
  street: Object.freeze({ rangeM: 380, pitchDeg: -18, orbitDegPerS: 6 }),
});

export const DESCENT_DWELL_S = Object.freeze({
  geo: 9,
  satellite: 10,
  cruise: 10,
  low: 10,
  ground: 10,
  street: 20,
  nearby: 12,
});

/** Layers the Director switches on when it starts. */
export const TOUR_LAYERS = Object.freeze([
  'flights',
  'military',
  'earthquakes',
  'satellites',
  'ais-live-vessels',
]);

/** Airports with SilentWing close-ups (runway data from OurAirports). */
export const TOUR_AIRPORTS = Object.freeze(
  [
    {
      id: 'ybbn',
      label: 'Brisbane Airport',
      lat: -27.3842,
      lon: 153.117,
      timeZone: 'Australia/Brisbane',
    },
    {
      id: 'yssy',
      label: 'Sydney Airport',
      lat: -33.9461,
      lon: 151.177,
      timeZone: 'Australia/Sydney',
    },
    {
      id: 'ypad',
      label: 'Adelaide Airport',
      lat: -34.9475,
      lon: 138.5334,
      timeZone: 'Australia/Adelaide',
    },
  ].map((a) => Object.freeze(a)),
);

/** Wide views used when nothing else is available. */
export const TOUR_STOPS = Object.freeze(
  [
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
      timeZone: 'Europe/London',
      label: 'London Heathrow',
      lat: 51.47,
      lon: -0.4543,
      rangeM: 34_000,
      pitchDeg: -48,
    },
    {
      id: 'kjfk',
      timeZone: 'America/New_York',
      label: 'New York JFK',
      lat: 40.6413,
      lon: -73.7781,
      rangeM: 34_000,
      pitchDeg: -48,
    },
    {
      id: 'omdb',
      timeZone: 'Asia/Dubai',
      label: 'Dubai International',
      lat: 25.2532,
      lon: 55.3657,
      rangeM: 34_000,
      pitchDeg: -48,
    },
    {
      id: 'rjtt',
      timeZone: 'Asia/Tokyo',
      label: 'Tokyo Haneda',
      lat: 35.5494,
      lon: 139.7798,
      rangeM: 34_000,
      pitchDeg: -48,
    },
  ].map((stop) => Object.freeze(stop)),
);
