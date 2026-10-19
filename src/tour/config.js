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
  /** At most one alert (new or revisited) per this many minutes. */
  alertGapMin: 10,
  /** A military aircraft is not shown again within this many minutes. */
  militaryRepeatMin: 30,
  /** Longest wait, when leaving, for the next stop's aircraft to load. */
  stageMaxWaitS: 6,
});

/** Camera framing per stop kind. Steep enough that the far field (coarse,
 * differently-coloured imagery tiles) stays out of frame and fewer tiles load. */
export const STOP_CAMERA = Object.freeze({
  aircraft: Object.freeze({ rangeM: 70_000, pitchDeg: -42 }),
  earthquake: Object.freeze({ rangeM: 350_000, pitchDeg: -50 }),
  airport: Object.freeze({ rangeM: 14_000, pitchDeg: -40 }),
  base: Object.freeze({ rangeM: 12_000, pitchDeg: -42 }),
  vessel: Object.freeze({ rangeM: 9_000, pitchDeg: -40 }),
  military: Object.freeze({ rangeM: 45_000, pitchDeg: -42 }),
  satellite: Object.freeze({ rangeM: 2_500_000, pitchDeg: -35 }),
  // Geostationary: far enough back to see the satellite against the Earth.
  geoSatellite: Object.freeze({ rangeM: 9_000_000, pitchDeg: -25 }),
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
 * What to show between alerts, in order, repeating: a defence-minded tour
 * of military aircraft, the busiest airports and well-known military
 * airfields, with naval traffic, satellites and the planet in between. A
 * slot with nothing available is skipped. Alerts (at most one every
 * TOUR_TIMING.alertGapMin) come before the rotation.
 */
export const TOUR_ROTATION = Object.freeze([
  'military',
  'airport',
  'base',
  'satellite',
  'vessel',
  'military',
  'airport',
  'base',
  'satellite',
  'city',
]);

/**
 * Space stays in the tour: at least one stop in every `every` is a
 * satellite (Pierre, 20 Oct), whatever the rotation falls back to. Space
 * stops cycle through these groups so the tour shows geostationary
 * satellites, crewed stations and navigation constellations in turn.
 */
export const TOUR_SPACE = Object.freeze({
  every: 5,
  groups: Object.freeze([
    'geo',
    'stations',
    'gps-ops',
    'geo',
    'galileo',
    'stations',
    'glonass',
    'visual',
  ]),
});

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
  /** Ship step: vessels at least this fast count as under way (knots). */
  shipMinKts: 1,
  /** Geostationary altitude band used to count the belt (metres). */
  geoMinM: 34_000_000,
  geoMaxM: 37_500_000,
  /** Nearby cameras visited after the first street-level stop. */
  nearbyCameras: 0, // one street camera ends the descent (Pierre, 20 Oct)
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
  ship: Object.freeze({ rangeM: 2_500, pitchDeg: -30 }),
  ground: Object.freeze({ rangeM: 900, pitchDeg: -35 }),
  street: Object.freeze({ rangeM: 380, pitchDeg: -18, orbitDegPerS: 6 }),
});

export const DESCENT_DWELL_S = Object.freeze({
  geo: 9,
  iss: 10,
  cruise: 10,
  low: 10,
  ship: 10,
  ground: 10,
  street: 20,
  nearby: 12,
});

/**
 * Sensor looks the Director uses at a stop (Pierre, 20 Oct): thermal
 * (FLIR, white-hot) for military aircraft, airfields and naval ships, night
 * vision (NVG) where the sun is down at the stop, the normal look otherwise.
 * Never for space or planet-scale views, the descent's GEO and ISS steps,
 * or street cameras (their pictures must stay readable). Visual only.
 */
export const DIRECTOR_SENSORS = Object.freeze({
  /** Wider views than this see regions, not an asset: normal look. */
  maxRangeM: 600_000,
  /** Night vision when the sun is below this elevation at the stop. */
  nightBelowDeg: 0,
  flirKinds: Object.freeze(['military', 'base']),
  noneKinds: Object.freeze(['satellite', 'geo', 'camera']),
  noneDescentSteps: Object.freeze(['geo', 'iss', 'street']),
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
    // Among the world's busiest passenger airports (approximate reference
    // points; the live aircraft count is what the Director reports).
    {
      id: 'katl',
      label: 'Atlanta Hartsfield-Jackson',
      lat: 33.6407,
      lon: -84.4277,
      timeZone: 'America/New_York',
    },
    {
      id: 'omdb',
      label: 'Dubai International',
      lat: 25.2532,
      lon: 55.3657,
      timeZone: 'Asia/Dubai',
    },
    {
      id: 'egll',
      label: 'London Heathrow',
      lat: 51.47,
      lon: -0.4543,
      timeZone: 'Europe/London',
    },
    {
      id: 'kdfw',
      label: 'Dallas/Fort Worth',
      lat: 32.8998,
      lon: -97.0403,
      timeZone: 'America/Chicago',
    },
    {
      id: 'rjtt',
      label: 'Tokyo Haneda',
      lat: 35.5494,
      lon: 139.7798,
      timeZone: 'Asia/Tokyo',
    },
    {
      id: 'ltfm',
      label: 'Istanbul Airport',
      lat: 41.2753,
      lon: 28.7519,
      timeZone: 'Europe/Istanbul',
    },
    {
      id: 'kord',
      label: "Chicago O'Hare",
      lat: 41.9742,
      lon: -87.9073,
      timeZone: 'America/Chicago',
    },
    {
      id: 'klax',
      label: 'Los Angeles International',
      lat: 33.9416,
      lon: -118.4085,
      timeZone: 'America/Los_Angeles',
    },
    {
      id: 'wsss',
      label: 'Singapore Changi',
      lat: 1.3644,
      lon: 103.9915,
      timeZone: 'Asia/Singapore',
    },
    {
      id: 'lfpg',
      label: 'Paris Charles de Gaulle',
      lat: 49.0097,
      lon: 2.5479,
      timeZone: 'Europe/Paris',
    },
  ].map((a) => Object.freeze(a)),
);

/**
 * Well-known military airfields, public names and approximate reference
 * points. The Director shows each with its live traffic and the mapped
 * installation outlines; it never claims what is based there.
 */
export const TOUR_BASES = Object.freeze(
  [
    {
      id: 'yamb',
      label: 'RAAF Base Amberley',
      region: 'Queensland',
      lat: -27.6406,
      lon: 152.7119,
      timeZone: 'Australia/Brisbane',
    },
    {
      id: 'ywlm',
      label: 'RAAF Base Williamtown',
      region: 'New South Wales',
      lat: -32.795,
      lon: 151.8344,
      timeZone: 'Australia/Sydney',
    },
    {
      id: 'etar',
      label: 'Ramstein Air Base',
      region: 'Germany',
      lat: 49.4369,
      lon: 7.6003,
      timeZone: 'Europe/Berlin',
    },
    {
      id: 'klsv',
      label: 'Nellis Air Force Base',
      region: 'Nevada',
      lat: 36.2362,
      lon: -115.0343,
      timeZone: 'America/Los_Angeles',
    },
    {
      id: 'rodn',
      label: 'Kadena Air Base',
      region: 'Okinawa',
      lat: 26.3556,
      lon: 127.7675,
      timeZone: 'Asia/Tokyo',
    },
    {
      id: 'egul',
      label: 'RAF Lakenheath',
      region: 'England',
      lat: 52.4093,
      lon: 0.561,
      timeZone: 'Europe/London',
    },
    {
      id: 'kngu',
      label: 'Naval Station Norfolk',
      region: 'Virginia',
      lat: 36.9376,
      lon: -76.2893,
      timeZone: 'America/New_York',
    },
    {
      id: 'phik',
      label: 'Joint Base Pearl Harbor-Hickam',
      region: 'Hawaii',
      lat: 21.3187,
      lon: -157.9224,
      timeZone: 'Pacific/Honolulu',
    },
    {
      id: 'pgua',
      label: 'Andersen Air Force Base',
      region: 'Guam',
      lat: 13.584,
      lon: 144.93,
      timeZone: 'Pacific/Guam',
    },
    {
      id: 'yptn',
      label: 'RAAF Base Tindal',
      region: 'Northern Territory',
      lat: -14.5214,
      lon: 132.3778,
      timeZone: 'Australia/Darwin',
    },
  ].map((b) => Object.freeze(b)),
);

/**
 * Military types worth flying to, with a display name and an interest
 * score (higher first). ICAO type designators as the feeds report them.
 */
export const MILITARY_TYPES = Object.freeze({
  H60: { name: 'Black Hawk helicopter', score: 5 },
  H47: { name: 'Chinook helicopter', score: 5 },
  V22: { name: 'V-22 Osprey', score: 5 },
  B52: { name: 'B-52 Stratofortress', score: 5 },
  P8: { name: 'P-8 Poseidon maritime patrol aircraft', score: 5 },
  E3TF: { name: 'E-3 Sentry AWACS', score: 5 },
  E3CF: { name: 'E-3 Sentry AWACS', score: 5 },
  E737: { name: 'E-7 Wedgetail AEW&C', score: 5 },
  R135: { name: 'RC-135 reconnaissance aircraft', score: 5 },
  K35R: { name: 'KC-135 tanker', score: 4 },
  F35: { name: 'F-35 Lightning II', score: 4 },
  F16: { name: 'F-16 Fighting Falcon', score: 4 },
  F15: { name: 'F-15 Eagle', score: 4 },
  F18S: { name: 'F/A-18 Super Hornet', score: 4 },
  F18H: { name: 'F/A-18 Hornet', score: 4 },
  EUFI: { name: 'Eurofighter Typhoon', score: 4 },
  C17: { name: 'C-17 Globemaster III', score: 3 },
  C130: { name: 'C-130 Hercules', score: 3 },
  C30J: { name: 'C-130J Super Hercules', score: 3 },
  A400: { name: 'A400M Atlas', score: 3 },
});

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
