import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { DESCENT_RULES, TOUR_LAYERS, TOUR_TIMING } from './config.js';
import {
  DESCENT_LEVELS,
  DESCENT_WAIT,
  createDescentPlanner,
  descentDetail,
  levelStates,
  pickDescentRegion,
} from './descent.js';
import { createNarrator } from './narrator.js';
import { createPlanner } from './planner.js';
import { createStopQueue } from './queue.js';
import { simulatedAircraft, simulatedQuake } from './simulate.js';
import { createTileWarmer } from './tileWarmer.js';
import { sensorFor } from './sensors.js';
import { createSensorLook } from './sensorLook.js';
import { glassSphereSprite } from './pulseGraphics.js';
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
  }

  /**
   * Glass alert pulse: a steady glass core on the event and two glass
   * spheres that expand from it and fade as they grow (staggered half a
   * period). Ice-blue for live events, warm amber for staged ones. Billboards
   * stay crisp at any zoom and cost no ground tessellation; the orbit already
   * holds continuous rendering, so the callbacks animate.
   */
  function showMarker(event) {
    clearMarker();
    const hex = event.simulated ? '#ffcf7a' : '#bfe6ff';
    const sphere = glassSphereSprite(hex);
    const pos = Cesium.Cartesian3.fromDegrees(event.lon, event.lat);
    const common = {
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    };
    const easeOut = (t) => 1 - (1 - t) ** 3;
    const PERIOD_MS = 3200;
    const phase = (offset) => (performance.now() / PERIOD_MS + offset) % 1;
    const white = Cesium.Color.WHITE;

    const core = viewer.entities.add({
      position: pos,
      billboard: {
        image: sphere,
        width: 26,
        height: 26,
        color: new Cesium.CallbackProperty(
          () =>
            white.withAlpha(0.88 + 0.12 * Math.sin(performance.now() / 700)),
          false,
        ),
        ...common,
      },
    });

    // A crisp point at the exact event position, inside the glass core.
    const dot = viewer.entities.add({
      position: pos,
      point: {
        pixelSize: 5,
        color: Cesium.Color.fromCssColorString(hex),
        outlineColor: white.withAlpha(0.9),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    const wave = (offset) => {
      const size = new Cesium.CallbackProperty(
        () => 26 + 200 * easeOut(phase(offset)),
        false,
      );
      return viewer.entities.add({
        position: pos,
        billboard: {
          image: sphere,
          width: size,
          height: size,
          color: new Cesium.CallbackProperty(
            () => white.withAlpha(0.95 * (1 - phase(offset)) ** 1.6),
            false,
          ),
          ...common,
        },
      });
    };

    const label = viewer.entities.add({
      position: pos,
      label: {
        text: event.simulated ? 'SIMULATED' : event.title,
        font: '600 14px -apple-system, "Segoe UI", sans-serif',
        fillColor: Cesium.Color.fromCssColorString(
          event.simulated ? '#ffd480' : '#ffffff',
        ),
        showBackground: true,
        backgroundColor:
          Cesium.Color.fromCssColorString('#0b1422').withAlpha(0.55),
        backgroundPadding: new Cesium.Cartesian2(10, 6),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -56),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    marker = [wave(0), wave(0.5), core, dot, label];
  }

  /** Fly so the target sits in view at the given range and pitch. */
  function flyTo({ lat, lon, heightM = 0, rangeM, pitchDeg }, signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        viewer.camera.cancelFlight();
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      viewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(
          Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
          0,
        ),
        {
          offset: new Cesium.HeadingPitchRange(
            // Planet-scale views arrive north-up so the globe spin starts clean.
            rangeM >= TOUR_TIMING.globeSpinMinRangeM
              ? 0
              : viewer.camera.heading,
            Cesium.Math.toRadians(pitchDeg),
            rangeM,
          ),
          duration: TOUR_TIMING.flyInS,
          complete: () => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          },
          cancel: () => {
            signal.removeEventListener('abort', onAbort);
            if (signal.aborted) reject(signal.reason);
            else resolve();
          },
        },
      );
    });
  }

  function startOrbit({
    lat,
    lon,
    heightM = 0,
    rangeM,
    pitchDeg,
    orbitDegPerS = TOUR_TIMING.orbitDegPerS,
  }) {
    stopOrbit();
    const target = Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
    const rate = Cesium.Math.toRadians(orbitDegPerS);
    const pitch = Cesium.Math.toRadians(pitchDeg);
    let heading = viewer.camera.heading;
    let last = performance.now();
    holdContinuousRender(RENDER_HOLD);
    // Planet-scale views are shot near straight down, where turning the
    // heading only spins the picture in place. Turn the globe instead: walk
    // the look-at point westward so the Earth rolls eastward, as from space.
    if (rangeM >= TOUR_TIMING.globeSpinMinRangeM) {
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
    removeOrbit = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now();
      heading += rate * Math.min(0.25, (now - last) / 1000);
      last = now;
      viewer.camera.lookAt(
        target,
        new Cesium.HeadingPitchRange(heading, pitch, rangeM),
      );
    });
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
      if (interruptible && planner.hasFresh(incidentData())) return;
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
    if (next.kind === 'geo') return null;
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

  /** Where the Director goes next, if it already knows (for tile warm-up). */
  function upcomingView() {
    const stop = descentAhead ? descentAheadStop : queue.peek();
    return stop?.view ? { view: stop.view, label: stopLabel(stop) } : null;
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
      stagedAircraft = next.staged?.aircraft || [];
      stagedAt = next.staged?.at || Date.now();
      // The airport picture fades out as the camera leaves.
      await airport?.fadeOut();
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
      onFocus?.(null);
      onTravel?.('depart', next.view, focusOf(next));
      // A real flight preloads its own destination from here on.
      warmer.stop();
      // Flights are always shown in the normal look.
      sensorLook.set(null);
      await flyTo(next.view, signal);
      startOrbit(next.view);
      onTravel?.('arrive', next.view);
      sensorLook.set(sensorFor(next, Date.now()));
      // Queue the next stop now: its data loads during this whole dwell,
      // and its Google tiles once this stop's own tiles are in. A fresh
      // alert still replaces it at departure and is flown to directly.
      if (descent && !descent.isDone()) aheadDescent(signal);
      else queue.planAhead();
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
      descent = createDescentPlanner({ region: pickDescentRegion(Date.now()) });
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
      if (run?.controller === controller) run = null;
    }
  }

  /** Hand the camera back to the viewer. */
  function exit(reason = 'user') {
    if (!run) return;
    const { controller } = run;
    run = null;
    controller.abort(new DOMException(reason, 'AbortError'));
    warmer.stop();
    sensorLook.set(null);
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
