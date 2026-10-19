import * as Cesium from 'cesium';

/**
 * Per-layer data attribution registered into Cesium's credit display.
 *
 * Legal requirement (see DATA_SOURCES.md): every third-party data source
 * this app can display carries its own licence and required attribution —
 * ODbL (adsb.lol, OpenStreetMap/Overpass), CC BY-NC-SA (TeleGeography
 * cables), NASA FIRMS, CelesTrak, USGS, NHC, CC BY (3D models). The MIT code
 * licence does NOT cover this data.
 *
 * These credits are registered ONCE at init as STATIC credits with
 * showOnScreen=false, so they live in the expandable bottom-left "Data
 * attribution" lightbox (Cesium's credit popover) rather than cluttering the
 * on-globe line. Always-present is intentional and reversible: the lightbox is
 * the app's canonical attribution surface and DATA_SOURCES.md is the
 * machine-readable index. Strings are copied verbatim from DATA_SOURCES.md — if
 * you add a data source, add it there AND here.
 */

/**
 * Attribution entries. `html` is the credit markup; keep it minimal and
 * link out where DATA_SOURCES.md provides a canonical URL. Order roughly
 * follows DATA_SOURCES.md (live sources, then bundled snapshots).
 * @type {{ key: string, html: string }[]}
 */
export const DATA_CREDITS = [
  // ── Live sources ────────────────────────────────────────────────
  {
    key: 'opensky',
    html:
      'Flights: OpenSky Network — Schäfer et al., ' +
      '“Bringing Up OpenSky”, IPSN 2014 · ' +
      '<a href="https://opensky-network.org" target="_blank" rel="noopener">opensky-network.org</a> ' +
      '(non-commercial)',
  },
  {
    key: 'adsblol',
    html:
      'Military flights, aircraft traces &amp; bounded regional flight fallback: ' +
      '<a href="https://adsb.lol" target="_blank" rel="noopener">adsb.lol</a> ' +
      '(ODbL 1.0)',
  },
  {
    key: 'adsbdb',
    html:
      'Aircraft type, registration &amp; flight routes: ' +
      '<a href="https://www.adsbdb.com" target="_blank" rel="noopener">adsbdb</a> ' +
      '· aircraft data from PlaneBase · ICAO-to-N-number conversion by ' +
      'Guillaume Michel · route data is the work of ' +
      'David Taylor, Edinburgh, and Jim Mason, Glasgow, and may not be ' +
      'copied, published, or incorporated into other databases without the ' +
      'explicit permission of David J Taylor, Edinburgh',
  },
  {
    key: 'aisstream',
    html:
      'Live vessels (AIS): ' +
      '<a href="https://aisstream.io" target="_blank" rel="noopener">AISStream.io</a>',
  },
  {
    key: 'celestrak',
    html:
      'Satellites (TLEs): CelesTrak ' +
      '(<a href="https://celestrak.org" target="_blank" rel="noopener">celestrak.org</a>), ' +
      'Dr. T.S. Kelso',
  },
  {
    key: 'usgs',
    html: 'Earthquakes: Data courtesy of the U.S. Geological Survey',
  },
  {
    key: 'overpass',
    html:
      'Map features (place context): ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> ' +
      '(ODbL 1.0)',
  },
  {
    key: 'photon-geocoder',
    html:
      'Keyless place search: ' +
      '<a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> (komoot) over ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> ' +
      '(ODbL 1.0)',
  },
  {
    key: 'military-installations-osm',
    html:
      'Mapped installation context: ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> ' +
      '(ODbL 1.0; incomplete mapped context)',
  },
  {
    key: 'reearth-terrain',
    html:
      'Terrain (keyless globe stacks): ' +
      '<a href="https://terrain.reearth.land" target="_blank" rel="noopener">Re:Earth Terrain</a> / ' +
      'Mapterhorn (CC BY 4.0) / EGM2008 (NGA)',
  },
  {
    key: 'weather-cyclones',
    html: 'Cyclone advisories: <a href="https://www.nhc.noaa.gov/" target="_blank" rel="noopener">NOAA/NWS NHC / CPHC</a> · Atlantic and eastern/central North Pacific. Forecast center uncertainty, not storm size.',
  },
  // Street cameras: open-licence networks first; courtesy-only networks
  // are off unless switched on (DATA_SOURCES.md).
  {
    key: 'nsw-cctv',
    html:
      'CCTV cameras &amp; frames (New South Wales): ' +
      '<a href="https://www.livetraffic.com/" target="_blank" rel="noopener">Live Traffic NSW</a> — Transport for NSW ' +
      '(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)',
  },
  {
    key: 'tfl-cctv',
    html:
      'CCTV cameras &amp; frames (London): ' +
      '<a href="https://tfl.gov.uk/info-for/open-data-users/" target="_blank" rel="noopener">Powered by TfL Open Data</a>. ' +
      'Contains OS data © Crown copyright and database rights.',
  },
  {
    key: 'fintraffic-cctv',
    html:
      'CCTV cameras &amp; frames (Finland): Fintraffic / ' +
      '<a href="https://www.digitraffic.fi/en/" target="_blank" rel="noopener">digitraffic.fi</a>, ' +
      'license CC BY 4.0',
  },
  {
    key: 'drivebc-cctv',
    html:
      'CCTV cameras &amp; frames (British Columbia): ' +
      '<a href="https://www.drivebc.ca/" target="_blank" rel="noopener">DriveBC</a>. ' +
      'Contains information licensed under the ' +
      '<a href="https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc" target="_blank" rel="noopener">Open Government Licence – British Columbia</a>. ' +
      'Some cameras are supplied by partners (TransLink, the City of Vancouver, the City of Surrey, Parks Canada and others); each names its provider in the camera card.',
  },
  {
    key: 'calgary-cctv',
    html:
      'Traffic cameras (Calgary): contains information licensed under the ' +
      '<a href="https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa" target="_blank" rel="noopener">Open Government Licence – City of Calgary</a>',
  },
  {
    key: 'iowa-cctv',
    html:
      'Traffic cameras and live video (Iowa): ' +
      '<a href="https://iowadot.gov/" target="_blank" rel="noopener">Iowa Department of Transportation</a>, via ' +
      '<a href="https://data.iowa.gov/" target="_blank" rel="noopener">data.iowa.gov</a> ' +
      '(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)',
  },
  {
    key: 'ontario-511-cctv',
    html:
      'CCTV cameras &amp; frames (Ontario): ' +
      '<a href="https://511on.ca/" target="_blank" rel="noopener">Ontario 511</a> ' +
      '(<a href="https://www.ontario.ca/page/open-government-licence-ontario" target="_blank" rel="noopener">Open Government Licence - Ontario</a>)',
  },
  {
    key: 'austin-cctv',
    html:
      'CCTV cameras &amp; frames: City of Austin, TX — ' +
      '<a href="https://data.austintexas.gov" target="_blank" rel="noopener">data.austintexas.gov</a>',
  },
  {
    key: 'caltrans-cctv',
    html:
      'CCTV cameras &amp; frames (California): Caltrans — ' +
      '<a href="https://cwwp2.dot.ca.gov/" target="_blank" rel="noopener">cwwp2.dot.ca.gov</a>',
  },
  {
    key: 'txdot-cctv',
    html:
      'CCTV cameras &amp; frames (Texas): ' +
      '<a href="https://its.txdot.gov/" target="_blank" rel="noopener">Texas Department of Transportation</a> (courtesy)',
  },
  {
    key: 'tallinn-cctv',
    html:
      'CCTV cameras &amp; frames (Tallinn): City of Tallinn — ' +
      '<a href="https://ristmikud.tallinn.ee/" target="_blank" rel="noopener">ristmikud.tallinn.ee</a> (courtesy)',
  },
  {
    key: 'tarktee-cctv',
    html:
      'CCTV cameras &amp; frames (Estonia road weather): Transpordiamet / Tarktee — ' +
      '<a href="https://tarktee.transpordiamet.ee/" target="_blank" rel="noopener">tarktee.transpordiamet.ee</a> (courtesy)',
  },
  {
    key: 'warendorf-cctv',
    html:
      'Webcam (Warendorf): <a href="https://www.warendorf.de/" target="_blank" rel="noopener">Stadt Warendorf</a> (courtesy); ' +
      'camera poses derived from OpenStreetMap geometry, © OpenStreetMap contributors (ODbL)',
  },
  {
    key: 'metar',
    html: 'Airport weather: <a href="https://aviationweather.gov/" target="_blank" rel="noopener">NOAA Aviation Weather Center</a> METAR reports (U.S. public domain)',
  },
  {
    key: 'firms',
    html:
      'Active fires: NASA FIRMS — we acknowledge the use of data and/or imagery ' +
      'from NASA’s Fire Information for Resource Management System ' +
      '(<a href="https://earthdata.nasa.gov/firms" target="_blank" rel="noopener">earthdata.nasa.gov/firms</a>), ' +
      'part of NASA’s Earth Observing System Data and Information System (EOSDIS)',
  },
  {
    key: 'nasa-gibs-black-marble',
    html:
      'Night lights: NASA Black Marble (VIIRS, public domain) · we acknowledge ' +
      'the use of imagery provided by services from NASA’s Global Imagery ' +
      'Browse Services (<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">GIBS</a>), ' +
      'part of NASA’s Earth Science Data and Information System (ESDIS)',
  },
  {
    key: 'telegeography',
    html:
      'Submarine cables: © TeleGeography — ' +
      '<a href="https://www.submarinecablemap.com" target="_blank" rel="noopener">submarinecablemap.com</a> ' +
      '(CC BY-NC-SA 3.0 — NonCommercial)',
  },
  {
    key: 'airplanes-live',
    html:
      'Regional aircraft fallback: ' +
      '<a href="https://airplanes.live" target="_blank" rel="noopener">airplanes.live</a> (non-commercial use)',
  },
  {
    key: 'adsb-fi',
    html:
      'Regional aircraft fallback: ' +
      '<a href="https://adsb.fi" target="_blank" rel="noopener">adsb.fi</a> open data (personal, non-commercial use)',
  },
  {
    key: '3d-models',
    html:
      '3D aircraft and ship models from Sketchfab creators (CC BY 4.0), modified — ' +
      'full credits in public/models/README.md',
  },
];

/** Registered when the first Natural Earth region outline resolves (public
 * domain — no attribution required; credited as a courtesy). */
export const NATURAL_EARTH_CREDIT = {
  key: 'natural-earth',
  html:
    'Physical region boundaries from ' +
    '<a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> (public domain)',
};

/** @type {Set<string>} Keys of dynamic credits already registered this session. */
const _dynamicCreditKeys = new Set();

/**
 * Register a conditional credit at the moment its data source activates.
 * Idempotent per `credit.key`; lands in the same "Data attribution" popover
 * as the static credits (showOnScreen=false).
 * @param {Cesium.Viewer} viewer — the initialized Cesium viewer
 * @param {{ key: string, html: string }} credit — e.g. `TOMTOM_CREDIT`
 * @returns {boolean} True when the credit is (now) registered.
 */
export function registerDynamicCredit(viewer, credit) {
  const creditDisplay = viewer?.creditDisplay;
  if (!creditDisplay || typeof creditDisplay.addStaticCredit !== 'function') {
    return false;
  }
  if (!credit?.key || !credit?.html) return false;
  if (_dynamicCreditKeys.has(credit.key)) return true;
  creditDisplay.addStaticCredit(new Cesium.Credit(credit.html, false));
  _dynamicCreditKeys.add(credit.key);
  return true;
}

/**
 * Register every per-layer data credit into the viewer's credit display.
 * Idempotent: safe to call once at init. Credits are static and always
 * present in the "Data attribution" popover.
 * @param {Cesium.Viewer} viewer — the initialized Cesium viewer
 */
export function registerDataCredits(viewer, credits = DATA_CREDITS) {
  const creditDisplay = viewer?.creditDisplay;
  if (!creditDisplay || typeof creditDisplay.addStaticCredit !== 'function') {
    return;
  }
  for (const { html } of credits) {
    // showOnScreen=false → lives in the expandable "Data attribution" popover,
    // not the on-globe credit line.
    creditDisplay.addStaticCredit(new Cesium.Credit(html, false));
  }
}
