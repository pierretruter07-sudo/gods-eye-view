import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { DESCENT_RULES, TOUR_HOP, TOUR_LAYERS, TOUR_TIMING } from './config.js';
import { aircraftIcon } from '../data/aircraftIcons.js';
import {
  DESCENT_LEVELS,
  DESCENT_WAIT,
  createDescentPlanner,
  descentDetail,
  levelStates,
  pickDescentRegion,
  isHelicopter,
  pickNightRegion,
  surfaceVehicle,
} from './descent.js';
import { createNarrator } from './narrator.js';
import { createPlanner } from './planner.js';
import { createStopQueue } from './queue.js';
import { simulatedAircraft, simulatedQuake } from './simulate.js';
import { createTileWarmer } from './tileWarmer.js';
import {
  arrivalHeadingDeg,
  flightSeconds,
  hopRig,
  leadPosition,
  planHop,
  smoothToward,
  spinsGlobe,
} from './flight.js';
import { sensorFor } from './sensors.js';
import { createSensorLook } from './sensorLook.js';
import {
  createSpaceOverlay,
  isGeoSatellite,
  satrecPosition,
} from './spaceOverlay.js';
import {
  frostedSphereSprite,
  glassSphereSprite,
  pulseFrame,
} from './pulseGraphics.js';
import { createAirportOverlay } from '../airports/overlay.js';
import { AIRPORT_PROFILES } from '../airports/profiles.js';

const RENDER_HOLD = 'tour-orbit';

/** A short, stable name for a stop (tile log and warm-up matching). */
export function stopLabel(stop) {
  if (!stop) return '';
  const id =
    stop.stepKey ||
    stop.airport?.id ||
    stop.stop?.id ||
    stop.event?.key ||
    stop.base?.id ||
    stop.base?.name ||
    stop.focus?.id ||
    '';
  return `${stop.kind || 'stop'}:${id}`;
}

/** `?tilewarm=0` turns the Google tile warm-up off (for comparison runs). */
function tileWarmFromUrl() {
  try {
    return !/[?&]tilewarm=0\b/.test(globalThis.location?.search || '');
  } catch {
    return true;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * The Director: an automatic, narrated tour that visits live events first
 * and fixed stops otherwise. Any manual camera input hands control back.
 */
export function createTourController({
  viewer,
  dataManager,
  ui,
  narrator = createNarrator(),
  onFocus = null,
  onTravel = null,
  stage = null,
  openingDescent = false,
  checklist = null,
}) {
  const planner = createPlanner();
  // The opening descent runs on the first start after the dashboard opens;
  // later starts go straight to the normal rotation.
  let descentPending = openingDescent;
  // The descent's next step, worked out while dwelling at this one so its
  // tiles can load before the camera leaves.
  let descentAhead = null; // Promise<stop|null>
  let descentAheadStop = null;
  const warmer = createTileWarmer({
    viewer,
    Cesium,
    enabled: tileWarmFromUrl(),
  });
  // Thermal / night-vision looks at stops that suit them (sensors.js).
  const sensorLook = createSensorLook({ viewer, Cesium });
  // Space stops: orbit ring, GEO belt and coverage footprint.
  const satrecFor = (noradId) =>
    dataManager.layers
      ?.get?.('satellites')
      ?.module?.getCatalogSatrecs?.()
      ?.find((s) => s.noradId === noradId)?.satrec || null;
  const space = createSpaceOverlay({ viewer, satrecFor });
  let descent = null;
  let regionStaged = { aircraft: [], at: 0 };
  // Street cameras the descent switched on are switched off again when it
  // ends (left on, every later stop near a city filled with camera stills).
  let cctvByDescent = false;
  let descentWrapped = true;
  const staged = { flights: [], quakes: [] };
  let run = null; // { controller: AbortController }
  let removeOrbit = null;
  let marker = null;
  // The Director's own icon for a subject the live layer is not drawing.
  let standIn = null;
  let standInHalo = null;
  // Where the camera is aimed now (it follows a moving subject), so the
  // next hop starts from the subject's real position.
  let lastAim = null;
  let airport = null; // created lazily; one CustomDataSource for the whole run

  const layerModule = (id) => dataManager.layers.get(id)?.module;
  const records = (id) => {
    try {
      return layerModule(id)?.getAnalystRecords?.(50_000) || [];
    } catch {
      return [];
    }
  };

  function stopOrbit() {
    if (removeOrbit) {
      removeOrbit();
      removeOrbit = null;
      releaseContinuousRender(RENDER_HOLD);
      try {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } catch {
        /* viewer torn down */
      }
    }
  }

  function clearMarker() {
    for (const e of marker || []) viewer.entities.remove(e);
    marker = null;
    if (standIn) viewer.entities.remove(standIn);
    if (standInHalo) viewer.entities.remove(standInHalo);
    standIn = null;
    standInHalo = null;
  }

  /**
   * Where a stop's moving subject is drawn right now, read every frame so
   * the camera stays on it (Pierre, 20 Oct: the airliner flew off screen
   * while the camera circled where it had been). Aircraft: exactly where the
   * live layer draws the icon. Satellites below GEO: propagated from their
   * orbit elements. Null when there is nothing to follow.
   * @returns {((result: object) => object|null)|null}
   */
  function subjectTracker(stop) {
    const icao =
      stop?.aircraft?.icao24 ??
      (stop?.event?.kind === 'aircraft' ? stop.event.facts?.icao24 : null);
    if (icao) {
      // A military stop's aircraft is drawn by the military layer; look
      // there first so a copy in the civil feed never wins.
      const layers =
        stop.kind === 'military'
          ? ['military', 'flights']
          : ['flights', 'military'];
      return (result) => {
        for (const id of layers) {
          const p = layerModule(id)?.getDisplayPosition?.(icao);
          if (p) return Cesium.Cartesian3.clone(p, result);
        }
        return null;
      };
    }
    const sat = stop?.satellite;
    if (sat?.noradId == null || isGeoSatellite(sat)) return null;
    let satrec = null;
    try {
      satrec = satrecFor(String(sat.noradId));
    } catch {
      satrec = null;
    }
    if (!satrec) return null;
    return (result) => {
      const p = satrecPosition(satrec, new Date());
      return p
        ? Cesium.Cartesian3.fromDegrees(
            p.lon,
            p.lat,
            p.altKm * 1000,
            undefined,
            result,
          )
        : null;
    };
  }

  /** Longest hold for an alert's tiles before flying to it. */
  const ALERT_SETTLE_MAX_MS = 3000;
  /** Seconds a planet hop takes, start to finish. */
  const HOP_S = TOUR_HOP.outS + TOUR_HOP.holdS + TOUR_HOP.inS;

  /**
   * Where a moving aircraft will be when the camera lands on it: its live
   * icon position carried `leadS()` seconds along its course. For the tile
   * warm-up (an airliner covers 10-15 km during a dwell and a hop, so
   * warming where it was queued loaded the wrong tiles). Null for a subject
   * that does not move or has no live position.
   * @param {object} stop
   * @param {() => number} leadS
   */
  function arrivalLocate(stop, leadS) {
    const track = stop?.aircraft || stop?.event?.facts;
    if (!track || !(track.speedMps > 1)) return null;
    const live = subjectTracker(stop);
    if (!live) return null;
    const scratch = new Cesium.Cartesian3();
    return () => {
      const p = live(scratch);
      const c = p ? Cesium.Cartographic.fromCartesian(p) : null;
      if (!c) return null;
      return leadPosition(
        {
          lat: Cesium.Math.toDegrees(c.latitude),
          lon: Cesium.Math.toDegrees(c.longitude),
          heightM: c.height,
        },
        track.heading ?? track.headingDeg,
        track.speedMps,
        leadS(),
      );
    };
  }

  /** The camera heading a stop will be reached with (see arrivalHeadingDeg). */
  function arrivalHeading(stop) {
    const cam = viewer.camera.positionCartographic;
    const plan = planHop(
      {
        lat: Cesium.Math.toDegrees(cam.latitude),
        lon: Cesium.Math.toDegrees(cam.longitude),
        heightM: cam.height,
      },
      stop.view,
    );
    return arrivalHeadingDeg(plan, stop.view, {
      descent: Boolean(stop.descent),
      hasLastView: Boolean(lastView),
    });
  }

  /**
   * An aircraft or ground vehicle the live layer is not drawing (Pierre, 20
   * Oct: the ground vehicle stop showed nothing) gets the Director's own
   * icon at its reported position, carried forward on its reported course
   * and speed. Hidden whenever the layer draws the real icon.
   */
  function showStandIn(stop, follow) {
    const a = stop.aircraft;
    if (!a || !Number.isFinite(stop.view?.lat)) return;
    const kind =
      stop.vehicle || surfaceVehicle(a)
        ? 'vehicle'
        : isHelicopter(a)
          ? 'helicopter'
          : 'airliner';
    const start = Cesium.Cartesian3.fromDegrees(
      stop.view.lon,
      stop.view.lat,
      (stop.view.heightM || 0) + 2,
    );
    const headingRad = Cesium.Math.toRadians(
      Number.isFinite(a.heading) ? a.heading : 0,
    );
    const mps = Number.isFinite(a.speedMps) ? a.speedMps : 0;
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(start);
    const startedAt = performance.now();
    const step = new Cesium.Cartesian3();
    const probe = new Cesium.Cartesian3();
    const shown = new Cesium.CallbackProperty(
      () => !(follow && follow(probe)),
      false,
    );
    const where = new Cesium.CallbackProperty((time, result) => {
      const d = (mps * (performance.now() - startedAt)) / 1000;
      step.x = Math.sin(headingRad) * d;
      step.y = Math.cos(headingRad) * d;
      step.z = 0;
      Cesium.Matrix4.multiplyByPointAsVector(frame, step, step);
      return Cesium.Cartesian3.add(
        start,
        step,
        result ?? new Cesium.Cartesian3(),
      );
    }, false);
    // A soft glass halo under the icon, so it reads at a glance (Replit's
    // check, 20 Oct: a small white icon alone was hard to make out).
    standInHalo = viewer.entities.add({
      position: where,
      billboard: {
        image: glassSphereSprite('#64d2ff'),
        width: 84,
        height: 84,
        color: Cesium.Color.WHITE.withAlpha(0.7),
        show: shown,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    standIn = viewer.entities.add({
      position: where,
      billboard: {
        image: aircraftIcon(kind, 128),
        width: 56,
        height: 56,
        color: Cesium.Color.fromCssColorString('#8fe3ff'),
        // Icons are drawn nose up: turn to the course, relative to the view.
        rotation: new Cesium.CallbackProperty(
          () => viewer.camera.heading - headingRad,
          false,
        ),
        show: shown,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  /**
   * Alert pulse (Pierre, 21 Oct: "just a minimalist sphere"): one frosted
   * glass sphere grows from the event, starting fully opaque and fading to
   * nothing as it spreads, then starts again. Nothing else is drawn on the
   * globe: the title is in the header. Ice-blue for live events, amber for
   * staged ones. A screen-facing billboard: crisp at any zoom, no ground
   * tessellation; the orbit already holds continuous rendering.
   */
  function showMarker(event) {
    clearMarker();
    const frame = pulseFrame;
    const sprite = frostedSphereSprite(event.simulated ? '#ffcf7a' : '#bfe6ff');
    const white = Cesium.Color.WHITE;
    const now = () => frame(performance.now() / 1000);
    const pulse = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
      billboard: {
        image: sprite,
        width: new Cesium.CallbackProperty(() => now().sizePx, false),
        height: new Cesium.CallbackProperty(() => now().sizePx, false),
        color: new Cesium.CallbackProperty(
          () => white.withAlpha(now().alpha),
          false,
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.NONE,
      },
    });
    marker = [pulse];
  }

  /** Fly so the target sits in view at the given range and pitch. */
  function flyTo(
    { lat, lon, heightM = 0, rangeM, pitchDeg },
    signal,
    { durationS = null } = {},
  ) {
    // Stopped already (e.g. during the airport fade-out): never fly.
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        viewer.camera.cancelFlight();
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const center = Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
      // Longer jumps (street to orbit and back) take longer, so they ease.
      const travelM = Cesium.Cartesian3.distance(
        viewer.camera.positionWC,
        center,
      );
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 0), {
        offset: new Cesium.HeadingPitchRange(
          // Planet-scale views arrive north-up so the globe spin starts clean.
          spinsGlobe({ heightM, rangeM }) ? 0 : viewer.camera.heading,
          Cesium.Math.toRadians(pitchDeg),
          rangeM,
        ),
        duration: durationS ?? flightSeconds(travelM),
        complete: () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        cancel: () => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) reject(signal.reason);
          else resolve();
        },
      });
    });
  }

  /**
   * Normal stops: one continuous move out until the whole planet is in
   * view, a short hold, and back in to the next subject (TOUR_HOP, about
   * 10 s). Our own animation rather than Cesium's flyTo, whose long climbs
   * sat low and then shot up (it looked like a snap). The next stop's
   * tiles load all the way, through the warmer's preload camera.
   */
  async function hopTo(next, signal, follow = null) {
    signal.throwIfAborted();
    const cam = viewer.camera.positionCartographic;
    const plan = planHop(
      {
        lat: Cesium.Math.toDegrees(cam.latitude),
        lon: Cesium.Math.toDegrees(cam.longitude),
        heightM: cam.height,
      },
      next.view,
    );
    if (!plan.via || !lastView) {
      await flyTo(next.view, signal, { durationS: plan.inS ?? undefined });
      return null;
    }
    const from = {
      ...lastView,
      ...(lastAim || {}),
      headingDeg: Cesium.Math.toDegrees(viewer.camera.heading),
    };
    const to = { ...next.view, headingDeg: 0 };
    const live = new Cesium.Cartesian3();
    const totalMs = (plan.outS + plan.holdS + plan.inS) * 1000;
    stopOrbit();
    // Keep loading the arrival view's tiles through the hop: north-up (how
    // the hop arrives), at the subject's position on landing.
    let leftS = totalMs / 1000;
    warmer.warm(next.view, stopLabel(next), {
      headingDeg: 0,
      locate: arrivalLocate(next, () => leftS),
    });
    holdContinuousRender(RENDER_HOLD);
    try {
      await new Promise((resolve, reject) => {
        const started = performance.now();
        let remove = null;
        const onAbort = () => {
          remove?.();
          reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        remove = viewer.scene.preRender.addEventListener(() => {
          const u = Math.min(1, (performance.now() - started) / totalMs);
          leftS = ((1 - u) * totalMs) / 1000;
          // A moving subject is met where it is now, not where it was.
          if (follow && follow(live)) {
            const c = Cesium.Cartographic.fromCartesian(live);
            if (c) {
              to.lat = Cesium.Math.toDegrees(c.latitude);
              to.lon = Cesium.Math.toDegrees(c.longitude);
              to.heightM = c.height;
            }
          }
          const r = hopRig(from, to, u);
          viewer.camera.lookAt(
            Cesium.Cartesian3.fromDegrees(r.lon, r.lat, r.heightM),
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(r.headingDeg),
              Cesium.Math.toRadians(r.pitchDeg),
              r.rangeM,
            ),
          );
          if (u >= 1) {
            remove();
            signal.removeEventListener('abort', onAbort);
            resolve();
          }
        });
      });
    } finally {
      releaseContinuousRender(RENDER_HOLD);
      warmer.stop();
      try {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } catch {
        /* viewer torn down */
      }
    }
    return { lat: to.lat, lon: to.lon, heightM: to.heightM };
  }

  function startOrbit(
    {
      lat,
      lon,
      heightM = 0,
      rangeM,
      pitchDeg,
      orbitDegPerS = TOUR_TIMING.orbitDegPerS,
    },
    follow = null,
  ) {
    stopOrbit();
    const target = Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
    lastAim = { lat, lon, heightM };
    const rate = Cesium.Math.toRadians(orbitDegPerS);
    const pitch = Cesium.Math.toRadians(pitchDeg);
    let heading = viewer.camera.heading;
    let last = performance.now();
    holdContinuousRender(RENDER_HOLD);
    // Planet-scale views are shot near straight down, where turning the
    // heading only spins the picture in place. Turn the globe instead: walk
    // the look-at point westward so the Earth rolls eastward, as from space.
    if (spinsGlobe({ heightM, rangeM })) {
      const spin = TOUR_TIMING.globeSpinDegPerS;
      let centreLon = lon;
      const north = new Cesium.HeadingPitchRange(0, pitch, rangeM);
      removeOrbit = viewer.scene.preRender.addEventListener(() => {
        const now = performance.now();
        centreLon -= spin * Math.min(0.25, (now - last) / 1000);
        last = now;
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(centreLon, lat, 0),
          north,
        );
      });
      return;
    }
    // A moving subject is followed: the aim eases onto its live position
    // every frame, so it stays centred while the camera circles it.
    const aim = Cesium.Cartesian3.clone(target);
    const live = new Cesium.Cartesian3();
    const easing = { tauS: TOUR_TIMING.followTauS };
    let notedAt = 0;
    removeOrbit = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now();
      const elapsedS = (now - last) / 1000;
      heading += rate * Math.min(0.25, elapsedS);
      last = now;
      if (follow && follow(live)) {
        // Real elapsed time here (not capped): on a slow frame the aim must
        // still keep up with the subject.
        smoothToward(aim, live, elapsedS, easing, aim);
        if (now - notedAt > 250) {
          notedAt = now;
          const c = Cesium.Cartographic.fromCartesian(aim);
          if (c)
            lastAim = {
              lat: Cesium.Math.toDegrees(c.latitude),
              lon: Cesium.Math.toDegrees(c.longitude),
              heightM: c.height,
            };
        }
      }
      viewer.camera.lookAt(
        aim,
        new Cesium.HeadingPitchRange(heading, pitch, rangeM),
      );
    });
  }

  /** Move a planned stop's view onto its subject's latest live position. */
  function refreshTarget(stop) {
    const pick = (layerId, key, value) =>
      value == null ? null : records(layerId).find((r) => r?.[key] === value);
    let live = null;
    if (stop.kind === 'satellite')
      live = pick('satellites', 'noradId', stop.satellite?.noradId);
    else if (stop.kind === 'aircraft' && stop.descent === 'ground') {
      // A ground vehicle: aim at where the live layer has it now, but keep
      // the sampled ground height (its feed height is not a ground height).
      const v = pick('flights', 'icao24', stop.aircraft?.icao24);
      if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon))
        stop.view = { ...stop.view, lat: v.lat, lon: v.lon };
      return;
    } else if (stop.kind === 'aircraft')
      live = pick('flights', 'icao24', stop.aircraft?.icao24);
    else if (stop.kind === 'military')
      live =
        pick('military', 'icao24', stop.aircraft?.icao24) ||
        pick('flights', 'icao24', stop.aircraft?.icao24);
    if (!live || !Number.isFinite(live.lat) || !Number.isFinite(live.lon))
      return;
    const heightM = Number.isFinite(live.altitudeM)
      ? live.altitudeM
      : stop.view.heightM;
    stop.view = { ...stop.view, lat: live.lat, lon: live.lon, heightM };
  }

  function incidentData() {
    return {
      flights: [...records('flights'), ...staged.flights],
      quakes: [...records('earthquakes'), ...staged.quakes],
    };
  }

  // Look-ahead: the next stop is chosen on arrival at this one and its
  // aircraft start loading then, so they are on the globe when we get there.
  let runSignal = null;
  // The view of the stop the camera is at (where the next hop starts).
  let lastView = null;
  const queue = createStopQueue({
    planner,
    liveData: () => liveData(),
    incidents: incidentData,
    stage,
    maxWaitMs: TOUR_TIMING.stageMaxWaitS * 1000,
    wait: (ms) => sleep(ms, runSignal),
  });

  // Aircraft loaded ahead for the current stop: drawn on arrival until the
  // live layer's own records cover the place (dropped after a minute).
  let stagedAircraft = [];
  let stagedAt = 0;
  function airportFlights() {
    const live = records('flights');
    if (!stagedAircraft.length || Date.now() - stagedAt > 60_000) return live;
    const seen = new Set(live.map((f) => f.icao24).filter(Boolean));
    return [...live, ...stagedAircraft.filter((f) => !seen.has(f.icao24))];
  }

  function liveData() {
    return {
      flights: [...records('flights'), ...staged.flights],
      quakes: [...records('earthquakes'), ...staged.quakes],
      vessels: records('ais-live-vessels'),
      military: records('military'),
      satellites: records('satellites'),
    };
  }

  /**
   * Wait out a stop, cutting it short if a brand-new incident appears.
   * Opening-descent stops are never cut short: the descent has priority and
   * incidents are shown as soon as it ends.
   */
  async function dwell(
    seconds,
    profile,
    signal,
    { interruptible = true } = {},
  ) {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      const step = Math.min(
        TOUR_TIMING.interruptCheckS * 1000,
        until - Date.now(),
      );
      await sleep(step, signal);
      if (profile) airport?.update(profile, airportFlights());
      // A fresh incident cuts the dwell short, whether it is still waiting
      // or the queue has already taken it (and is loading its tiles).
      if (
        interruptible &&
        (queue.peek()?.kind === 'event' ||
          // Building the incident data walks every flight: only when an
          // alert could be shown at all.
          (planner.canAlert() && planner.hasFresh(incidentData())))
      )
        return;
    }
  }

  /** What the stop is looking at, as {layerId, record} for the intel view. */
  function focusOf(next) {
    if (next.kind === 'event' && next.event?.kind === 'aircraft') {
      const f = next.event.facts || {};
      return {
        layerId: 'flights',
        headline: next.event.title,
        record: {
          ...f,
          lat: next.event.lat,
          lon: next.event.lon,
          simulated: next.event.simulated,
        },
      };
    }
    if (next.kind === 'event' && next.event?.kind === 'earthquake') {
      const f = next.event.facts || {};
      return {
        layerId: 'earthquakes',
        headline: next.event.title,
        record: {
          ...f,
          id: next.event.key,
          lat: next.event.lat,
          lon: next.event.lon,
          simulated: next.event.simulated,
        },
      };
    }
    if (next.kind === 'vessel')
      return { layerId: 'ais-live-vessels', record: next.vessel };
    if (next.kind === 'military')
      return { layerId: 'military', record: next.aircraft };
    if (next.kind === 'satellite')
      return { layerId: 'satellites', record: next.satellite };
    if (next.kind === 'aircraft')
      return { layerId: 'flights', record: next.aircraft };
    if (next.kind === 'camera') return { layerId: 'cctv', record: next.camera };
    if (next.kind === 'geo' || next.kind === 'region') return null;
    // Airports and city stops open the place view: live traffic, weather,
    // incidents nearby and what else is around (never an empty screen).
    const place = placeOf(next);
    if (place) return { place, staged: stagedAircraft, stagedAt };
    return null;
  }

  /** The place a stop is about, or null for planet-scale views. */
  function placeOf(next) {
    if (next.kind === 'airport') {
      const a = next.airport;
      const profile = AIRPORT_PROFILES[a.id] || null;
      return {
        kind: 'airport',
        id: a.id,
        label: a.label,
        icao: profile?.icao || a.id.toUpperCase(),
        lat: a.lat,
        lon: a.lon,
        profile,
        timeZone: profile?.timeZone || a.timeZone,
      };
    }
    if (next.kind === 'base') {
      const b = next.base;
      return {
        kind: 'airport',
        id: b.id,
        label: b.label,
        icao: b.id.toUpperCase(),
        lat: b.lat,
        lon: b.lon,
        profile: null,
        timeZone: b.timeZone,
      };
    }
    if (next.kind === 'city' && next.stop && next.view?.rangeM <= 1_000_000) {
      const s = next.stop;
      return {
        kind: /^[a-z]{4}$/.test(s.id) ? 'airport' : 'city',
        id: s.id,
        label: s.label,
        icao: /^[a-z]{4}$/.test(s.id) ? s.id.toUpperCase() : null,
        lat: s.lat,
        lon: s.lon,
        profile: AIRPORT_PROFILES[s.id] || null,
        timeZone: s.timeZone,
      };
    }
    return null;
  }

  // ── Opening descent ────────────────────────────────────────────────
  /** Load the descent region's aircraft (at most every 20 s, 6 s cap). */
  async function stageRegion(region, signal) {
    if (!stage || Date.now() - regionStaged.at < 20_000) return;
    const result = await Promise.race([
      Promise.resolve(
        stage(
          { lat: region.lat, lon: region.lon },
          { radiusKm: DESCENT_RULES.regionRadiusKm },
        ),
      ).catch(() => null),
      sleep(6000, signal).then(() => null),
    ]);
    regionStaged = {
      aircraft: Array.isArray(result?.aircraft) ? result.aircraft : [],
      at: Date.now(),
    };
  }

  function descentData() {
    return {
      ...liveData(),
      cameras: records('cctv'),
      staged: regionStaged.aircraft,
    };
  }

  /** The next descent stop, or null once the descent is over. */
  async function nextDescentStop(signal) {
    let waitedMs = 0;
    for (;;) {
      if (['cruise', 'low', 'ground'].includes(descent.peekStep()))
        await stageRegion(descent.region, signal);
      const stop = descent.next(descentData());
      if (stop !== DESCENT_WAIT) return stop;
      if (waitedMs >= DESCENT_RULES.stepMaxWaitS * 1000) {
        descent.skip();
        waitedMs = 0;
        continue;
      }
      await sleep(1000, signal);
      waitedMs += 1000;
    }
  }

  /** The descent is over: tick the last level, fade the list, tidy up. */
  function wrapDescent() {
    if (descentWrapped || !descent) return;
    descentWrapped = true;
    checklist?.update(levelStates(descent.outcomes(), null));
    checklist?.finish();
    if (cctvByDescent) {
      cctvByDescent = false;
      Promise.resolve(dataManager.setEnabled('cctv', false)).catch(() => {});
    }
  }

  /** Aim height for a ground-level stop: sampled terrain, else the view's. */
  async function groundHeightAt(view, signal) {
    try {
      const sample = Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [
        Cesium.Cartographic.fromDegrees(view.lon, view.lat),
      ]);
      const result = await Promise.race([
        sample,
        sleep(2500, signal).then(() => null),
      ]);
      const h = result?.[0]?.height;
      return Number.isFinite(h) ? h : view.heightM;
    } catch (error) {
      if (signal.aborted) throw error;
      return view.heightM;
    }
  }

  /** Start working out the descent's next step (and its ground height). */
  function aheadDescent(signal) {
    descentAheadStop = null;
    const ahead = nextDescentStop(signal).then(async (stop) => {
      if (stop?.view?.sampleGround) {
        stop.view = {
          ...stop.view,
          heightM: await groundHeightAt(stop.view, signal),
          sampleGround: false,
        };
      }
      if (descentAhead === ahead) descentAheadStop = stop;
      return stop;
    });
    ahead.catch(() => {}); // an abort is handled where it is awaited
    descentAhead = ahead;
  }

  /**
   * Where the Director goes next, if it already knows (for tile warm-up):
   * the view, the heading it will arrive with and, for a moving aircraft,
   * where it will be. A fresh alert that came in during the dwell takes
   * the queued slot now, so its tiles load before the camera leaves
   * instead of the camera arriving to a blur.
   */
  let freshCheckedAt = 0;
  function upcomingView() {
    // Ranking incidents walks every flight: at most once a second.
    if (
      !descentAhead &&
      !(descent && !descent.isDone()) &&
      Date.now() - freshCheckedAt >= 1000
    ) {
      freshCheckedAt = Date.now();
      queue.preferFresh();
    }
    const stop = descentAhead ? descentAheadStop : queue.peek();
    if (!stop?.view) return null;
    return {
      view: stop.view,
      label: stopLabel(stop),
      headingDeg: arrivalHeading(stop),
      locate: arrivalLocate(stop, () => HOP_S + 1),
    };
  }

  /**
   * The opening descent runs start to finish first, ahead of incidents;
   * anything that came in meanwhile is shown straight after it.
   */
  async function takeNext(signal) {
    if (descentAhead) {
      const ahead = descentAhead;
      descentAhead = null;
      descentAheadStop = null;
      const stop = await ahead;
      if (stop) return stop;
    }
    if (descent && !descent.isDone()) {
      const stop = await nextDescentStop(signal);
      if (stop) return stop;
    }
    wrapDescent();
    return queue.take();
  }

  async function loop(signal) {
    runSignal = signal;
    for (;;) {
      // Keep orbiting here until the next stop's data is in (or briefly).
      const next = await takeNext(signal);
      // Hold here (still orbiting) until the next stop's Google tiles are
      // in, at most a few seconds. A fresh alert is not being warmed, so it
      // goes at once.
      await warmer.settle(stopLabel(next), {
        sleep: (ms) => sleep(ms, signal),
        // An alert is time-critical: a shorter hold for its tiles.
        ...(next.kind === 'event' ? { maxMs: ALERT_SETTLE_MAX_MS } : {}),
      });
      stagedAircraft = next.staged?.aircraft || [];
      stagedAt = next.staged?.at || Date.now();
      // The airport picture fades out as the camera leaves.
      await airport?.fadeOut();
      // Each await is a point where the tour may have been stopped; carry
      // on and the camera would fly and orbit with nobody able to stop it.
      signal.throwIfAborted();
      stopOrbit();
      clearMarker();
      airport?.clear();
      const profile =
        next.kind === 'airport' ? AIRPORT_PROFILES[next.airport.id] : null;
      if (next.event) {
        ui.showEvent(next.event);
        showMarker(next.event);
      } else {
        ui.showStop(next);
      }
      if (next.stepKey && descent) {
        const index = DESCENT_LEVELS.findIndex((l) =>
          l.steps.includes(next.stepKey),
        );
        checklist?.update(levelStates(descent.outcomes(), next.stepKey), {
          index,
          detail: descentDetail(next),
        });
      }
      if (next.view?.sampleGround)
        next.view = {
          ...next.view,
          heightM: await groundHeightAt(next.view, signal),
        };
      signal.throwIfAborted();
      // A stop planned a dwell ahead aims where its subject WAS; satellites
      // and aircraft have moved since (the ISS by ~100 km). Re-aim at the
      // live position just before the flight so it arrives centred.
      refreshTarget(next);
      onFocus?.(null);
      onTravel?.('depart', next.view, focusOf(next));
      // A real flight preloads its own destination from here on.
      warmer.stop();
      // Flights are always shown in the normal look.
      sensorLook.set(null);
      space.clear();
      const follow = subjectTracker(next);
      let arrived = null;
      if (next.descent) await flyTo(next.view, signal);
      else arrived = await hopTo(next, signal, follow);
      signal.throwIfAborted();
      startOrbit({ ...next.view, ...(arrived || {}) }, follow);
      if (next.aircraft) showStandIn(next, follow);
      lastView = next.view;
      onTravel?.('arrive', next.view);
      sensorLook.set(sensorFor(next, Date.now()));
      space.show(next);
      // Queue the next stop now: its data loads during this whole dwell,
      // and its Google tiles once this stop's own tiles are in. A fresh
      // alert still replaces it at departure and is flown to directly.
      if (descent && !descent.isDone()) aheadDescent(signal);
      else queue.planAhead();
      warmer.holdDetail(true);
      warmer.arrived(stopLabel(next), upcomingView);
      onFocus?.(focusOf(next));
      if (profile) {
        if (!airport) airport = createAirportOverlay(viewer);
        airport.update(profile, airportFlights());
        airport.fadeIn();
      }
      ui.setCaption(next.line);
      const started = Date.now();
      await narrator.speak(next.line, { signal });
      signal.throwIfAborted();
      const spokenS = (Date.now() - started) / 1000;
      // The whole-planet overview is held briefly and left rotating; every
      // other stop keeps its own dwell.
      const isGlobe = next.stop?.id === 'globe';
      const budget = isGlobe ? TOUR_TIMING.globeDwellS : next.dwellS;
      await dwell(
        Math.max(budget - spokenS, isGlobe ? 0.5 : 1),
        profile,
        signal,
        { interruptible: !next.descent },
      );
    }
  }

  async function enableLayers(extra = []) {
    for (const id of [...TOUR_LAYERS, ...extra]) {
      try {
        if (!dataManager.isEnabled(id)) await dataManager.setEnabled(id, true);
      } catch (error) {
        console.warn(`[tour] could not enable ${id}`, error);
      }
    }
  }

  async function start() {
    if (run) return;
    const controller = new AbortController();
    run = { controller };
    interruptCameraMotion('tour-start');
    viewer.trackedEntity = undefined;
    ui.setState('running');
    descent = null;
    if (descentPending) {
      descentPending = false;
      const startedAt = Date.now();
      const region = pickDescentRegion(startedAt);
      descent = createDescentPlanner({
        region,
        nightRegion: pickNightRegion(startedAt, { exclude: region }),
        now: startedAt,
      });
      regionStaged = { aircraft: [], at: 0 };
      descentWrapped = false;
      try {
        cctvByDescent = !dataManager.isEnabled('cctv');
      } catch {
        cctvByDescent = false;
      }
      checklist?.start(DESCENT_LEVELS);
    }
    enableLayers(descent ? ['cctv'] : []);
    try {
      await loop(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) console.error('[tour] stopped', error);
    } finally {
      // The loop ended on its own (an error, not exit()): hand the camera
      // back exactly as exit() does, so Stop, Esc and the mouse work again.
      if (run?.controller === controller) {
        run = null;
        if (!controller.signal.aborted)
          controller.abort(new DOMException('error', 'AbortError'));
        teardown();
      }
    }
  }

  /** Hand the camera back to the viewer. */
  function exit(reason = 'user') {
    if (!run) return;
    const { controller } = run;
    run = null;
    controller.abort(new DOMException(reason, 'AbortError'));
    teardown();
  }

  /** Everything a stopped tour leaves behind, cleared (one place). */
  function teardown() {
    queue.reset();
    warmer.stop();
    warmer.holdDetail(false);
    lastView = null; // the viewer moves the camera from here on
    lastAim = null;
    sensorLook.set(null);
    space.clear();
    descentAhead = null;
    descentAheadStop = null;
    narrator.stop();
    stopOrbit();
    clearMarker();
    airport?.clear();
    onFocus?.(null);
    // Stopped mid-descent: the checklist goes; the cameras stay as they are.
    if (!descentWrapped) {
      descentWrapped = true;
      checklist?.finish({ delayMs: 0 });
    }
    ui.setState('paused');
  }

  /** Queue a staged event; it is shown next, and the tour starts if idle. */
  function simulate(kind) {
    const now = Date.now();
    if (kind === 'earthquake') staged.quakes.push(simulatedQuake(now));
    else staged.flights.push(simulatedAircraft(now));
    // A running tour picks it up at its next check; an idle one starts.
    if (!run) start();
  }

  // Any manual camera input ends the tour.
  const canvas = viewer.scene.canvas;
  const onInput = () => exit('manual-input');
  const onKey = (e) => {
    if (e.key === 'Escape') exit('escape');
  };
  canvas.addEventListener('pointerdown', onInput, { passive: true });
  canvas.addEventListener('wheel', onInput, { passive: true });
  window.addEventListener('keydown', onKey);

  function destroy() {
    exit('destroy');
    airport?.destroy();
    airport = null;
    space.destroy();
    canvas.removeEventListener('pointerdown', onInput);
    canvas.removeEventListener('wheel', onInput);
    window.removeEventListener('keydown', onKey);
  }

  return {
    start,
    exit,
    simulate,
    destroy,
    isRunning: () => Boolean(run),
    /** Diagnostics: the opening descent's region and next step. */
    descent: () =>
      descent
        ? {
            region: descent.region.id,
            step: descent.peekStep(),
            done: descent.isDone(),
          }
        : null,
    /** Diagnostics: the queued stop and recent look-ahead decisions. */
    queue: () => ({ next: queue.peek(), log: queue.log() }),
    /** Diagnostics: per arrival, whether its tiles were warmed and ready. */
    tileLog: () => warmer.log(),
    /** Turn the Google tile warm-up on or off (comparison runs). */
    tileWarm: (on) => {
      if (on !== undefined) warmer.setEnabled(on);
      return warmer.enabled();
    },
    /** Diagnostics: the sensor look in use ('flir', 'nvg' or null). */
    sensor: () => sensorLook.mode(),
  };
}
