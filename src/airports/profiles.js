/**
 * Airport profiles for the close-up view. Runway thresholds and headings are
 * from the OurAirports public dataset (public domain); each runway's heading
 * is its low-designator number × 10°, the standard convention.
 *
 * `calmWind` is the designator stem active in calm wind — used only to break
 * the takeoff/landing ambiguity when an aircraft has no vertical-rate reading.
 */

function runway(ref) {
  const [low, high] = ref.split('/');
  const stem = (d) => d.replace(/[LRC]$/, '');
  return {
    ref,
    low,
    high,
    lowHeadingDeg: Number(stem(low)) * 10,
    highHeadingDeg: (Number(stem(low)) * 10 + 180) % 360,
  };
}

export const AIRPORT_PROFILES = Object.freeze({
  ybbn: {
    id: 'ybbn',
    icao: 'YBBN',
    label: 'Brisbane Airport',
    lat: -27.3842,
    lon: 153.117,
    elevationM: 4,
    runways: [runway('01L/19R'), runway('01R/19L')],
    calmWind: '19',
    terminalRadiusKm: 10,
  },
  yssy: {
    id: 'yssy',
    icao: 'YSSY',
    label: 'Sydney Airport',
    lat: -33.9461,
    lon: 151.177,
    elevationM: 6,
    runways: [runway('07/25'), runway('16L/34R'), runway('16R/34L')],
    calmWind: '34',
    terminalRadiusKm: 10,
  },
  ypad: {
    id: 'ypad',
    icao: 'YPAD',
    label: 'Adelaide Airport',
    lat: -34.9475,
    lon: 138.5334,
    elevationM: 6,
    runways: [runway('05/23'), runway('12/30')],
    calmWind: '23',
    terminalRadiusKm: 10,
  },
});

export const AIRPORTS = Object.freeze(Object.values(AIRPORT_PROFILES));

/** The heading an aircraft flies when landing/departing on the calm-wind end. */
export function calmWindHeadingDeg(profile) {
  for (const rw of profile.runways) {
    if (rw.low.replace(/[LRC]$/, '') === profile.calmWind) return rw.lowHeadingDeg;
    if (rw.high.replace(/[LRC]$/, '') === profile.calmWind) return rw.highHeadingDeg;
  }
  return null;
}
