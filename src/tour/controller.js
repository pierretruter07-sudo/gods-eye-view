import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { TOUR_LAYERS, TOUR_TIMING } from './config.js';
import { createNarrator } from './narrator.js';
import { createPlanner } from './planner.js';
import { createStopQueue } from './queue.js';
import { simulatedAircraft, simulatedQuake } from './simulate.js';
import { glassSphereSprite } from './pulseGraphics.js';
import { createAirportOverlay } from '../airports/overlay.js';
import { AIRPORT_PROFILES } from '../airports/profiles.js';

const RENDER_HOLD = 'tour-orbit';

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
}) {
  const planner = createPlanner();
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

  function startOrbit({ lat, lon, heightM = 0, rangeM, pitchDeg }) {
    stopOrbit();
    const target = Cesium.Cartesian3.fromDegrees(lon, lat, heightM);
    const rate = Cesium.Math.toRadians(TOUR_TIMING.orbitDegPerS);
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

  /** Wait out a stop, cutting it short if a brand-new incident appears. */
  async function dwell(seconds, profile, signal) {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      const step = Math.min(
        TOUR_TIMING.interruptCheckS * 1000,
        until - Date.now(),
      );
      await sleep(step, signal);
      if (profile) airport?.update(profile, airportFlights());
      if (planner.hasFresh(incidentData())) return;
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
    return null;
  }

  async function loop(signal) {
    runSignal = signal;
    for (;;) {
      // Keep orbiting here until the next stop's data is in (or briefly).
      const next = await queue.take();
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
      onFocus?.(null);
      onTravel?.('depart', next.view, focusOf(next));
      await flyTo(next.view, signal);
      startOrbit(next.view);
      onTravel?.('arrive', next.view);
      // Queue the next stop now: its data loads during this whole dwell.
      queue.planAhead();
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
      );
    }
  }

  async function enableLayers() {
    for (const id of TOUR_LAYERS) {
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
    enableLayers();
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
    narrator.stop();
    stopOrbit();
    clearMarker();
    airport?.clear();
    onFocus?.(null);
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
    /** Diagnostics: the queued stop and recent look-ahead decisions. */
    queue: () => ({ next: queue.peek(), log: queue.log() }),
  };
}
