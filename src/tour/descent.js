/**
 * @file The Director's opening descent.
 *
 * On the first Director run after the dashboard opens, the camera steps down
 * from the geostationary belt to street level: GEO belt → ISS → an airliner
 * near 40,000 ft → a low-level helicopter → a ship → a ground vehicle → a
 * street camera. Incidents wait until it ends. Steps from the airliner down stay over one region,
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
import { introLine } from './introScript.js';
import {
  cruiseLine,
  geoBeltLine,
  groundLine,
  lowLevelLine,
  satelliteLine,
  streetLine,
  nightCityLine,
  nightStreetLine,
  vesselLine,
} from './lines.js';

/** A unique key per step position ('nearby' appears more than once). */
const stepKey = (i) =>
  DESCENT_STEPS[i] === 'nearby' ? `nearby${i}` : DESCENT_STEPS[i];

/**
 * Checklist state per level: 'active' while one of its steps is on screen,
 * 'done' once one was shown, 'skipped' when all its steps were skipped,
 * otherwise 'pending'.
 * @param {Map<string,string>} outcomes - from planner.outcomes()
 * @param {string|null} activeKey - the step key on screen, or null
 */
export function levelStates(outcomes, activeKey) {
  return DESCENT_LEVELS.map((level) => {
    if (activeKey && level.steps.includes(activeKey)) return 'active';
    const seen = level.steps.map((k) => outcomes.get(k)).filter(Boolean);
    if (seen.includes('shown')) return 'done';
    if (seen.length && seen.length === level.steps.length) return 'skipped';
    return 'pending';
  });
}

/** Short live detail for a descent stop, for the checklist. */
export function descentDetail(stop) {
  const ft = (m) =>
    `${(Math.round((m * 3.28084) / 100) * 100).toLocaleString('en-US')} ft`;
  if (!stop) return '';
  if (stop.kind === 'geo')
    return `${stop.count.toLocaleString('en-US')} satellites`;
  if (stop.kind === 'satellite')
    return `${Math.round(stop.satellite.altitudeM / 1000).toLocaleString('en-US')} km`;
  if (stop.kind === 'aircraft' && stop.descent !== 'ground')
    return [stop.aircraft.callsign, ft(stop.aircraft.altitudeM)]
      .filter(Boolean)
      .join(' · ');
  if (stop.kind === 'aircraft')
    return stop.aircraft.callsign || 'Airport vehicle';
  if (stop.kind === 'vessel') return stop.vessel.name || 'Vessel';
  if (stop.kind === 'camera') return stop.camera.name || 'Camera';
  if (stop.kind === 'region') return `${stop.region.label} at night`;
  return '';
}

/** Returned by next() while a step's data source has not loaded yet. */
export const DESCENT_WAIT = Object.freeze({ wait: true });

export const DESCENT_STEPS = Object.freeze([
  'geo',
  'iss',
  'cruise',
  'low',
  'ship',
  'ground',
  'street',
  ...Array.from({ length: DESCENT_RULES.nearbyCameras }, () => 'nearby'),
  // The night side (Pierre, 20 Oct): a city at night with its lights, then
  // one of its streets in night vision.
  'nightCity',
  'nightStreet',
]);

/**
 * The levels shown on the descent checklist, top to bottom. Each lists
 * the step keys that belong to it; nominal heights are physical facts or
 * the step's band, the live value comes from the stop itself.
 */
export const DESCENT_LEVELS = Object.freeze(
  [
    {
      id: 'geo',
      label: 'Geostationary orbit',
      nominal: '35,786 km',
      steps: ['geo'],
    },
    { id: 'iss', label: 'Space station', nominal: '~420 km', steps: ['iss'] },
    {
      id: 'cruise',
      label: 'Airliner at cruise',
      nominal: '~40,000 ft',
      steps: ['cruise'],
    },
    {
      id: 'low',
      label: 'Low-level flight',
      nominal: 'Under 5,000 ft',
      steps: ['low'],
    },
    { id: 'ship', label: 'Ship at sea', nominal: 'Sea level', steps: ['ship'] },
    {
      id: 'ground',
      label: 'Ground vehicle',
      nominal: 'Ground',
      steps: ['ground'],
    },
    {
      id: 'street',
      label: 'Street cameras',
      nominal: 'Street level',
      steps: [
        'street',
        ...DESCENT_STEPS.map((_, i) => stepKey(i)).filter((k) =>
          k.startsWith('nearby'),
        ),
      ],
    },
    {
      id: 'night',
      label: 'City at night',
      nominal: 'Night side',
      steps: ['nightCity', 'nightStreet'],
    },
  ].map((l) => Object.freeze(l)),
);

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

/**
 * The night city: the camera region where it is dark now, nearest the
 * evening hour (lights on, streets still lit). Null when it is daytime in
 * every region; the day region is never picked.
 */
export function pickNightRegion(
  now,
  { exclude = null, regions = DESCENT_REGIONS, rules = DESCENT_RULES } = {},
) {
  let best = null;
  let bestScore = Infinity;
  for (const region of regions) {
    if (exclude && region.id === exclude.id) continue;
    const h = solarHour(region.lon, now);
    if (h < rules.nightFromH && h > rules.nightToH) continue;
    // Hours from the target, wrapping past midnight.
    const d = Math.abs(h - rules.nightTargetH);
    // Live street video beats a still: such a city wins when it is dark too.
    const score =
      Math.min(d, 24 - d) - (region.liveVideo ? rules.videoBonusH || 0 : 0);
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

/** A camera with live video near the centre beats a nearer still. */
function pickStreetCamera(cameras, center) {
  const video = cameras.filter(
    (c) =>
      ['hls', 'mp4', 'webm'].includes(c.feedType) &&
      distanceKm(center.lat, center.lon, c.lat, c.lon) <=
        DESCENT_RULES.streetVideoRadiusKm,
  );
  const pool = video.some((c) => c.feedType === 'hls')
    ? video.filter((c) => c.feedType === 'hls')
    : video.length
      ? video
      : cameras;
  return nearest(pool, center.lat, center.lon);
}

/**
 * @param {{region?: object, nightRegion?: object|null, now?: number,
 *   rules?: object}} [options]
 */
export function createDescentPlanner({
  region = DESCENT_REGIONS[0],
  nightRegion = null,
  now = Date.now(),
  rules = DESCENT_RULES,
} = {}) {
  let index = 0;
  let streetCamera = null;
  /** step id -> 'shown' | 'skipped', in the order they were decided. */
  const outcomes = new Map();
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
      {
        lat: camera.lat,
        lon: camera.lon,
        heightM,
        ...DESCENT_CAMERA.street,
        // No published ground height: aim at sampled terrain instead.
        sampleGround: !finite(camera.groundElevationM),
      },
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
        {
          // Off the equator, on the day region's side, so the belt is a ring.
          lat: (region.lat < 0 ? -1 : 1) * DESCENT_CAMERA.geo.tiltDeg,
          lon: region.lon,
          heightM: 0,
          ...DESCENT_CAMERA.geo,
        },
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
        'iss',
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
      const low = aircraftStop(
        'low',
        a,
        lowLevelLine(a, { helicopter }),
        DESCENT_CAMERA.low,
        a.altitudeM,
      );
      low.helicopter = helicopter;
      return low;
    },

    ship(data) {
      const vessels = (data.vessels || []).filter(placed);
      if (!vessels.length) return DESCENT_WAIT;
      const underWay = vessels.filter(
        (v) => finite(v.speedKts) && v.speedKts >= rules.shipMinKts,
      );
      const vessel = nearest(
        underWay.length ? underWay : vessels,
        region.lat,
        region.lon,
      );
      if (!vessel) return null;
      return stop(
        'ship',
        'vessel',
        { vessel },
        {
          lat: vessel.lat,
          lon: vessel.lon,
          heightM: 0,
          ...DESCENT_CAMERA.ship,
        },
        vesselLine(vessel),
      );
    },

    ground(data) {
      const pool = aircraftPool(data);
      if (!pool.length) return DESCENT_WAIT;
      // Wheeled vehicles only (ADS-B C1/C2): an aircraft is never shown
      // as the ground vehicle. None live: the step is skipped.
      const vehicles = pool.filter((a) => surfaceVehicle(a));
      const a = nearest(vehicles, region.lat, region.lon);
      if (!a) return null;
      const stopped = aircraftStop(
        'ground',
        a,
        groundLine(a, { vehicle: surfaceVehicle(a) }),
        DESCENT_CAMERA.ground,
        groundHeightNear(a.lat, a.lon),
      );
      // Aim at the real ground height there (sampled on the way in).
      stopped.view.sampleGround = true;
      stopped.vehicle = surfaceVehicle(a);
      return stopped;
    },

    street(data) {
      const cameras = (data.cameras || []).filter(placed);
      if (!cameras.length) return DESCENT_WAIT;
      const camera = pickStreetCamera(cameras, region);
      streetCamera = camera;
      return cameraStop('street', camera, true);
    },

    nightCity() {
      if (!nightRegion) return null;
      return stop(
        'nightCity',
        'region',
        { region: nightRegion },
        {
          lat: nightRegion.lat,
          lon: nightRegion.lon,
          heightM: 0,
          ...DESCENT_CAMERA.nightCity,
        },
        nightCityLine(nightRegion, solarHour(nightRegion.lon, now)),
      );
    },

    nightStreet(data) {
      if (!nightRegion) return null;
      const cameras = (data.cameras || []).filter(
        (c) =>
          placed(c) &&
          !visitedCameras.has(c.id) &&
          distanceKm(nightRegion.lat, nightRegion.lon, c.lat, c.lon) <=
            rules.nightCameraMaxKm,
      );
      if (!cameras.length)
        return (data.cameras || []).length ? null : DESCENT_WAIT;
      const camera = pickStreetCamera(cameras, nightRegion);
      const stopped = cameraStop('nightStreet', camera, true);
      stopped.line = nightStreetLine(camera);
      return stopped;
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
    nightRegion,
    /** The step the next call to next() will try, or null when finished. */
    peekStep: () => DESCENT_STEPS[index] ?? null,
    isDone: () => index >= DESCENT_STEPS.length,
    /** Give up on the current step (its data never arrived). */
    skip() {
      if (index < DESCENT_STEPS.length) {
        if (!outcomes.has(stepKey(index)))
          outcomes.set(stepKey(index), 'skipped');
        index += 1;
      }
    },
    /** What happened to each step so far (for the descent checklist). */
    outcomes: () => new Map(outcomes),
    /**
     * The next descent stop; DESCENT_WAIT while the current step's source
     * is still empty; null once the descent is over. Steps with nothing live
     * to show are skipped.
     */
    next(data) {
      while (index < DESCENT_STEPS.length) {
        const result = builders[DESCENT_STEPS[index]](data);
        if (result === DESCENT_WAIT) return DESCENT_WAIT;
        outcomes.set(stepKey(index), result ? 'shown' : 'skipped');
        if (result) {
          result.stepKey = stepKey(index);
          // The introduction script: what this level shows and how.
          const scripted = introLine(result, {
            hour: nightRegion ? solarHour(nightRegion.lon, now) : null,
            city: nightRegion?.label,
          });
          if (scripted) result.line = scripted;
        }
        index += 1;
        if (result) return result;
      }
      return null;
    },
  };
}
