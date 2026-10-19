/**
 * @file The Director's opening descent.
 *
 * On the first Director run after the dashboard opens, the camera steps down
 * from the geostationary belt to street level: GEO belt → ISS → an airliner
 * near 40,000 ft → a low-level helicopter → a ground vehicle → a street
 * camera → nearby cameras. Steps from the airliner down stay over one region,
 * chosen where it is daytime. Every subject is a live record; a step with
 * nothing live is skipped, never faked. Pure: no Cesium, no DOM.
 * @module tour/descent
 */
import {
  DESCENT_CAMERA,
  DESCENT_DWELL_S,
  DESCENT_REGIONS,
  DESCENT_RULES,
  STOP_CAMERA,
} from './config.js';
import { distanceKm } from './events.js';
import {
  cruiseLine,
  geoBeltLine,
  groundLine,
  lowLevelLine,
  satelliteLine,
  streetLine,
} from './lines.js';

/** Returned by next() while a step's data source has not loaded yet. */
export const DESCENT_WAIT = Object.freeze({ wait: true });

export const DESCENT_STEPS = Object.freeze([
  'geo',
  'iss',
  'cruise',
  'low',
  'ground',
  'street',
  ...Array.from({ length: DESCENT_RULES.nearbyCameras }, () => 'nearby'),
]);

const ISS_NORAD = '25544';
const HOUR_MS = 3_600_000;
const finite = Number.isFinite;
const placed = (r) => finite(r?.lat) && finite(r?.lon);

/** Local solar time (hours, 0-24) at a longitude. */
export function solarHour(lon, now) {
  const utcH =
    (((now % (24 * HOUR_MS)) + 24 * HOUR_MS) % (24 * HOUR_MS)) / HOUR_MS;
  return (((utcH + lon / 15) % 24) + 24) % 24;
}

/** The region whose local solar time is closest to early afternoon. */
export function pickDescentRegion(now, regions = DESCENT_REGIONS) {
  let best = null;
  let bestScore = Infinity;
  for (const region of regions) {
    const score = Math.abs(solarHour(region.lon, now) - 12.5);
    if (score < bestScore) {
      best = region;
      bestScore = score;
    }
  }
  return best;
}

const categoryOf = (a) => a?.category ?? a?.emitterCategory ?? null;
export const isHelicopter = (a) =>
  a?.aircraftClass === 'helicopter' || categoryOf(a) === 8;
const isLight = (a) => a?.aircraftClass === 'light' || categoryOf(a) === 2;
const NOT_CRUISERS = new Set(['helicopter', 'light', 'glider', 'uav']);

/** ADS-B surface vehicles: emitter category C1 (16) or C2 (17). */
export function surfaceVehicle(a) {
  const c = categoryOf(a);
  if (c === 16) return 'emergency';
  if (c === 17) return 'service';
  return null;
}

function nearest(list, lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const item of list) {
    const km = distanceKm(lat, lon, item.lat, item.lon);
    if (km < bestKm) {
      best = item;
      bestKm = km;
    }
  }
  return best;
}

/** Live layer records first; the region's staged load fills the gaps. */
function aircraftPool(data) {
  const live = (data.flights || []).filter(placed);
  const seen = new Set(live.map((f) => f.icao24).filter(Boolean));
  const staged = (data.staged || []).filter(
    (f) => placed(f) && !(f.icao24 && seen.has(f.icao24)),
  );
  return [...live, ...staged];
}

/**
 * @param {{region?: object, rules?: object}} [options]
 */
export function createDescentPlanner({
  region = DESCENT_REGIONS[0],
  rules = DESCENT_RULES,
} = {}) {
  let index = 0;
  let streetCamera = null;
  const visitedCameras = new Set();

  const groundHeightNear = (lat, lon) =>
    distanceKm(lat, lon, region.lat, region.lon) <= 150 ? region.groundM : 0;

  const stop = (descent, kind, fields, view, line) => ({
    kind,
    descent,
    ...fields,
    view,
    line,
    dwellS: DESCENT_DWELL_S[descent],
  });

  function aircraftStop(descent, a, line, camera, heightM) {
    return stop(
      descent,
      'aircraft',
      { aircraft: a },
      { lat: a.lat, lon: a.lon, heightM, ...camera },
      line,
    );
  }

  function cameraStop(descent, camera, first) {
    visitedCameras.add(camera.id);
    const heightM = finite(camera.groundElevationM)
      ? camera.groundElevationM
      : groundHeightNear(camera.lat, camera.lon);
    return stop(
      descent,
      'camera',
      { camera },
      { lat: camera.lat, lon: camera.lon, heightM, ...DESCENT_CAMERA.street },
      streetLine(camera, { first }),
    );
  }

  /** @returns {object|null|typeof DESCENT_WAIT} */
  const builders = {
    geo(data) {
      const sats = (data.satellites || []).filter(placed);
      if (!sats.length) return DESCENT_WAIT;
      const belt = sats.filter(
        (s) =>
          s.group === 'geo' ||
          (finite(s.altitudeM) &&
            s.altitudeM >= rules.geoMinM &&
            s.altitudeM <= rules.geoMaxM),
      );
      if (!belt.length) return null;
      return stop(
        'geo',
        'geo',
        { count: belt.length },
        { lat: 0, lon: region.lon, heightM: 0, ...DESCENT_CAMERA.geo },
        geoBeltLine(belt.length),
      );
    },

    iss(data) {
      const sats = (data.satellites || []).filter(placed);
      if (!sats.length) return DESCENT_WAIT;
      const iss = sats.find((s) => String(s.noradId) === ISS_NORAD);
      if (!iss || !finite(iss.altitudeM)) return null;
      const satellite = { ...iss, isIss: true };
      return stop(
        'satellite',
        'satellite',
        { satellite },
        {
          lat: iss.lat,
          lon: iss.lon,
          heightM: iss.altitudeM,
          ...STOP_CAMERA.satellite,
        },
        satelliteLine(satellite),
      );
    },

    cruise(data) {
      const pool = aircraftPool(data);
      if (!pool.length) return DESCENT_WAIT;
      const cruising = pool.filter(
        (a) =>
          !a.onGround &&
          finite(a.altitudeM) &&
          a.altitudeM >= rules.cruiseMinM &&
          a.altitudeM <= rules.cruiseMaxM &&
          !NOT_CRUISERS.has(a.aircraftClass) &&
          !isHelicopter(a),
      );
      const a = nearest(cruising, region.lat, region.lon);
      if (!a) return null;
      return aircraftStop(
        'cruise',
        a,
        cruiseLine(a),
        DESCENT_CAMERA.cruise,
        a.altitudeM,
      );
    },

    low(data) {
      const pool = aircraftPool(data);
      if (!pool.length) return DESCENT_WAIT;
      const airborneBelow = (maxM) => (a) =>
        !a.onGround &&
        finite(a.altitudeM) &&
        a.altitudeM > 0 &&
        a.altitudeM <= maxM;
      const helis = pool
        .filter(isHelicopter)
        .filter(airborneBelow(rules.helicopterMaxM));
      const helicopter = helis.length > 0;
      const candidates = helicopter
        ? helis
        : pool.filter(isLight).filter(airborneBelow(rules.lightMaxM));
      const a = nearest(candidates, region.lat, region.lon);
      if (!a) return null;
      return aircraftStop(
        'low',
        a,
        lowLevelLine(a, { helicopter }),
        DESCENT_CAMERA.low,
        a.altitudeM,
      );
    },

    ground(data) {
      const pool = aircraftPool(data);
      if (!pool.length) return DESCENT_WAIT;
      const vehicles = pool.filter((a) => surfaceVehicle(a));
      let a = nearest(vehicles, region.lat, region.lon);
      const vehicle = a ? surfaceVehicle(a) : null;
      if (!a) {
        const taxiing = pool.filter(
          (f) =>
            f.onGround &&
            finite(f.speedMps) &&
            f.speedMps >= rules.taxiMinMps &&
            f.speedMps <= rules.taxiMaxMps,
        );
        a = nearest(taxiing, region.lat, region.lon);
      }
      if (!a) return null;
      return aircraftStop(
        'ground',
        a,
        groundLine(a, { vehicle }),
        DESCENT_CAMERA.ground,
        groundHeightNear(a.lat, a.lon),
      );
    },

    street(data) {
      const cameras = (data.cameras || []).filter(placed);
      if (!cameras.length) return DESCENT_WAIT;
      const camera = nearest(cameras, region.lat, region.lon);
      streetCamera = camera;
      return cameraStop('street', camera, true);
    },

    nearby(data) {
      if (!streetCamera) return null;
      const near = (data.cameras || []).filter(
        (c) =>
          placed(c) &&
          !visitedCameras.has(c.id) &&
          distanceKm(streetCamera.lat, streetCamera.lon, c.lat, c.lon) <=
            rules.nearbyCameraMaxKm,
      );
      const camera = nearest(near, streetCamera.lat, streetCamera.lon);
      return camera ? cameraStop('nearby', camera, false) : null;
    },
  };

  return {
    region,
    /** The step the next call to next() will try, or null when finished. */
    peekStep: () => DESCENT_STEPS[index] ?? null,
    isDone: () => index >= DESCENT_STEPS.length,
    /** Give up on the current step (its data never arrived). */
    skip() {
      if (index < DESCENT_STEPS.length) index += 1;
    },
    /**
     * The next descent stop; DESCENT_WAIT while the current step's source
     * is still empty; null once the descent is over. Steps with nothing live
     * to show are skipped.
     */
    next(data) {
      while (index < DESCENT_STEPS.length) {
        const result = builders[DESCENT_STEPS[index]](data);
        if (result === DESCENT_WAIT) return DESCENT_WAIT;
        index += 1;
        if (result) return result;
      }
      return null;
    },
  };
}
