import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { DESCENT_RULES, TOUR_HOP, TOUR_LAYERS, TOUR_TIMING } from './config.js';
import { aircraftIcon, iconTierPx } from '../data/aircraftIcons.js';
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
import { createTileWarmer, warmable } from './tileWarmer.js';
import {
  arrivalHeadingDeg,
  flightSeconds,
  arrivalRangeM,
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
import { frostedSphereSprite, pulseFrame } from './pulseGraphics.js';
import { createAirportOverlay } from '../airports/overlay.js';
import { createCameraWall } from './cameraWall.js';
import { AIRPORT_PROFILES } from '../airports/profiles.js';

const RENDER_HOLD = 'tour-orbit';
/** How many stops ahead have their Google tiles loaded (Pierre, 28 Oct:
 * "preload the Google Tiles for the next two steps before we get there"). */
export const TILE_LOOKAHEAD = 2;
/** How often the introduction's route ahead is worked out again (ms). */
const PREVIEW_EVERY_MS = 3000;

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

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    // Called every 100 ms while tiles load: the abort listener is removed
    // when the wait ends normally, or a long demo piles them up.
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
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
  // The street stop's city square: four live cameras on screen at once.
  const wall = createCameraWall({
    cameras: () => dataManager.layers?.get?.('cctv')?.module || null,
  });
  let descent = null;
  let regionStaged = { aircraft: [], at: 0 };
  // Street cameras the descent switched on are switched off again when it
  // ends (left on, every later stop near a city filled with camera stills).
  let cctvByDescent = false;
  let descentWrapped = true;
  let run = null; // { controller: AbortController }
  // Next: end the current stop's dwell and narration and move on.
  let skipRequested = false;
  let removeOrbit = null;
  let marker = null;
  // The Director's own icon for a subject the live layer is not drawing.
  let standIn = null;
  // Where the camera is aimed now (it follows a moving subject), so the
  // next hop starts from the subject's real position.
  let lastAim = null;
  // Diagnostics: how long each arrival was held for its tiles (s).
  let arrivalHeld = null;
  const arrivals = [];
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
    standIn = null;
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
   * Where an aircraft the live layer is not drawing is now: its reported
   * position at departure, carried forward on its reported course and speed.
   * Null for a stop without an aircraft.
   * @returns {((result?: object) => object)|null}
   */
  function deadReckoner(stop) {
    const a = stop.aircraft;
    if (!a || !Number.isFinite(stop.view?.lat)) return null;
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
    const at = (result) => {
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
    };
    at.headingRad = headingRad;
    return at;
  }

  /**
   * The subject the camera follows: where the live layer draws it, else
   * where it is reckoned to be (Pierre, 28 Oct: the helicopter "flew off
   * screen to the left" — the camera circled its old position while its
   * stand-in icon flew on).
   */
  function followOf(live, reckon) {
    if (!reckon) return live;
    return (result) => (live && live(result)) || reckon(result);
  }

  /**
   * An aircraft or ground vehicle the live layer is not drawing (Pierre, 20
   * Oct: the ground vehicle stop showed nothing) gets the Director's own
   * icon at its reckoned position, drawn like every other aircraft icon (a
   * cyan glass halo read as a stray shape on screen, 28 Oct). Whether the
   * layer draws it is checked once a second, not every frame, and once the
   * layer has it the stand-in goes for good, so it never flickers in beside
   * the real icon.
   */
  function showStandIn(stop, live, reckon) {
    const a = stop.aircraft;
    if (!a || !reckon) return;
    const kind =
      stop.vehicle || surfaceVehicle(a)
        ? 'vehicle'
        : isHelicopter(a)
          ? 'helicopter'
          : 'airliner';
    const probe = new Cesium.Cartesian3();
    let drawnByLayer = Boolean(live && live(probe));
    let checkedAt = performance.now();
    const shown = new Cesium.CallbackProperty(() => {
      const t = performance.now();
      if (!drawnByLayer && t - checkedAt > 1000) {
        checkedAt = t;
        drawnByLayer = Boolean(live && live(probe));
      }
      return !drawnByLayer;
    }, false);
    const where = new Cesium.CallbackProperty(
      (time, result) => reckon(result),
      false,
    );
    standIn = viewer.entities.add({
      position: where,
      billboard: {
        // Raster tier for 44 CSS px on this screen (crisp on 1× to 3×).
        image: aircraftIcon(
          kind,
          iconTierPx(44 * Math.min(3, globalThis.devicePixelRatio || 1), 128),
        ),
        width: 44,
        height: 44,
        color: Cesium.Color.WHITE,
        // Icons are drawn nose up: turn to the course, relative to the view.
        rotation: new Cesium.CallbackProperty(
          () => viewer.camera.heading - reckon.headingRad,
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
    // The hop comes down to an approach range above the subject, holds
    // there (creeping in) until the final view's Google tiles are in, then
    // glides the last stretch: the reveal is never a blur.
    const approachM = to.rangeM * TOUR_HOP.approachFactor;
    const toApproach = { ...to, rangeM: approachM };
    const live = new Cesium.Cartesian3();
    const totalMs = (plan.outS + plan.holdS + plan.inS) * 1000;
    const holdMaxMs = TOUR_HOP.holdMaxS * 1000;
    const glideMs = TOUR_HOP.glideS * 1000;
    stopOrbit();
    // Keep loading the arrival view's tiles through the hop: north-up (how
    // the hop arrives), at the subject's position on landing.
    let leftS = (totalMs + glideMs) / 1000;
    warmer.warm(next.view, stopLabel(next), {
      headingDeg: 0,
      locate: arrivalLocate(next, () => leftS),
    });
    const loaded = warmer.loadWatch();
    holdContinuousRender(RENDER_HOLD);
    try {
      await new Promise((resolve, reject) => {
        const started = performance.now();
        let phase = 'hop';
        let phaseAt = started;
        let glideFrom = approachM;
        let remove = null;
        const onAbort = () => {
          remove?.();
          reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        remove = viewer.scene.preRender.addEventListener(() => {
          const now = performance.now();
          // A moving subject is met where it is now, not where it was.
          if (follow && follow(live)) {
            const c = Cesium.Cartographic.fromCartesian(live);
            if (c) {
              to.lat = toApproach.lat = Cesium.Math.toDegrees(c.latitude);
              to.lon = toApproach.lon = Cesium.Math.toDegrees(c.longitude);
              to.heightM = toApproach.heightM = c.height;
            }
          }
          let r;
          if (phase === 'hop') {
            const u = Math.min(1, (now - started) / totalMs);
            leftS = ((1 - u) * totalMs + glideMs) / 1000;
            r = hopRig(from, toApproach, u);
            if (u >= 1) {
              phase = 'hold';
              phaseAt = now;
            }
          } else {
            r = { ...to, pitchDeg: to.pitchDeg, headingDeg: 0 };
            if (phase === 'hold') {
              const waitedS = (now - phaseAt) / 1000;
              r.rangeM = arrivalRangeM(approachM, to.rangeM, { waitedS });
              if (loaded.ready(now) || now - phaseAt >= holdMaxMs) {
                phase = 'glide';
                phaseAt = now;
                glideFrom = r.rangeM;
                arrivalHeld = Math.round(waitedS * 10) / 10;
              }
            } else {
              const glideU = Math.min(1, (now - phaseAt) / glideMs);
              leftS = ((1 - glideU) * glideMs) / 1000;
              r.rangeM = arrivalRangeM(approachM, to.rangeM, {
                glideU,
                from: glideFrom,
              });
              if (glideU >= 1) phase = 'done';
            }
          }
          viewer.camera.lookAt(
            Cesium.Cartesian3.fromDegrees(r.lon, r.lat, r.heightM),
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(r.headingDeg),
              Cesium.Math.toRadians(r.pitchDeg),
              r.rangeM,
            ),
          );
          if (phase === 'done') {
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
      flights: records('flights'),
      quakes: records('earthquakes'),
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
      flights: records('flights'),
      quakes: records('earthquakes'),
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
      if (skipRequested) {
        skipRequested = false;
        return;
      }
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
      // Only cameras whose own frames are coming through: the descent ends
      // on a street camera, and a stand-in image must never be shown live.
      cameras: records('cctv').filter(
        (c) => layerModule('cctv')?.frameIsGenuine?.(c.id) !== false,
      ),
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
  function upcomingViews() {
    // Ranking incidents walks every flight: at most once a second.
    if (
      !descentAhead &&
      !(descent && !descent.isDone()) &&
      Date.now() - freshCheckedAt >= 1000
    ) {
      freshCheckedAt = Date.now();
      queue.preferFresh();
    }
    const toWarm = (stop) => ({
      view: stop.view,
      label: stopLabel(stop),
      headingDeg: arrivalHeading(stop),
      locate: arrivalLocate(stop, () => HOP_S + 1),
    });
    const inDescent =
      Boolean(descentAhead) || Boolean(descent && !descent.isDone());
    if (!inDescent) {
      const stop = queue.peek();
      return stop?.view ? [toWarm(stop)] : [];
    }
    // The introduction knows its whole route: the step being prepared, then
    // the ones after it, as they would be chosen from the live data now.
    const list = [];
    if (descentAheadStop?.view) list.push(descentAheadStop);
    if (descent && !descent.isDone()) {
      if (Date.now() - preview.at > PREVIEW_EVERY_MS) {
        try {
          preview = {
            at: Date.now(),
            stops: descent.preview(descentData(), 3),
          };
        } catch {
          preview = { at: Date.now(), stops: [] };
        }
      }
      for (const s of preview.stops)
        if (!list.some((x) => stopLabel(x) === stopLabel(s))) list.push(s);
    }
    return list
      .filter((s) => warmable(s.view))
      .slice(0, TILE_LOOKAHEAD)
      .map(toWarm);
  }
  /** Introduction steps worked out ahead, refreshed every few seconds. */
  let preview = { at: 0, stops: [] };

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
      wall.hide();
      onFocus?.(null);
      onTravel?.('depart', next.view, focusOf(next));
      // A real flight preloads its own destination from here on.
      warmer.stop();
      // Flights are always shown in the normal look.
      sensorLook.set(null);
      space.clear();
      const live = subjectTracker(next);
      const reckon = deadReckoner(next);
      const follow = followOf(live, reckon);
      let arrived = null;
      if (next.descent) await flyTo(next.view, signal);
      else arrived = await hopTo(next, signal, follow);
      signal.throwIfAborted();
      startOrbit({ ...next.view, ...(arrived || {}) }, follow);
      if (next.aircraft) showStandIn(next, live, reckon);
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
      // Never talk over a blur: wait (still orbiting) until this view's
      // tiles are in, before the caption, narration and asset sheets. The
      // next stop's warm-up starts only after, so it does not compete.
      const gate = await warmer.waitLoaded({
        maxMs: next.kind === 'event' ? 2500 : 4000,
        sleep: (ms) => sleep(ms, signal),
      });
      signal.throwIfAborted();
      arrivals.push({
        stop: stopLabel(next),
        heldS: arrivalHeld,
        gateMs: Math.round(gate.waitedMs),
        settled: gate.settled,
      });
      if (arrivals.length > 30) arrivals.shift();
      arrivalHeld = null;
      warmer.arrived(stopLabel(next), upcomingViews);
      // A city square shows its four live feeds down the screen edges in
      // place of the asset cards (Pierre, 28 Oct: "have them replace the
      // other one that's already there").
      if (next.square) wall.show(next.square, { place: next.camera?.city });
      else onFocus?.(focusOf(next));
      if (profile) {
        if (!airport) airport = createAirportOverlay(viewer);
        airport.update(profile, airportFlights());
        airport.fadeIn();
      }
      ui.setCaption(next.line);
      const started = Date.now();
      skipRequested = false;
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

  /**
   * @param {{intro?: boolean}} [options] - intro: true starts the From orbit
   *   to street introduction, false the live Director; omitted, the
   *   introduction runs on the first start only.
   */
  async function start({ intro } = {}) {
    if (run) return;
    const controller = new AbortController();
    run = { controller };
    interruptCameraMotion('tour-start');
    viewer.trackedEntity = undefined;
    // An aircraft or satellite the viewer was following keeps its own follow
    // camera and highlight; the Director owns the camera now.
    for (const id of ['flights', 'military', 'satellites']) {
      try {
        layerModule(id)?.stopTracking?.({ origin: 'director' });
      } catch {
        /* layer not registered */
      }
    }
    preview = { at: 0, stops: [] };
    ui.setState('running');
    descent = null;
    const wantIntro = intro ?? descentPending;
    descentPending = false;
    if (wantIntro) {
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
    wall.hide();
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

  /** Move on from the current stop now (the Next button, N key). */
  function skip() {
    if (!run) return false;
    skipRequested = true;
    narrator.stop();
    return true;
  }

  return {
    start,
    skip,
    exit,
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
    /** Diagnostics: per arrival, the hold for tiles and the gate before narration. */
    arrivalLog: () => arrivals.map((a) => ({ ...a })),
    /** Turn the Google tile warm-up on or off (comparison runs). */
    tileWarm: (on) => {
      if (on !== undefined) warmer.setEnabled(on);
      return warmer.enabled();
    },
    /** Diagnostics: the sensor look in use ('flir', 'nvg' or null). */
    sensor: () => sensorLook.mode(),
  };
}
