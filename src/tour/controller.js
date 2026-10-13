import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { TOUR_LAYERS, TOUR_TIMING } from './config.js';
import { createNarrator } from './narrator.js';
import { createPlanner } from './planner.js';
import { simulatedAircraft, simulatedQuake } from './simulate.js';
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
export function createTourController({ viewer, dataManager, ui, narrator = createNarrator() }) {
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
   * A soft, animated focus pulse: two expanding sonar rings that fade as they
   * grow, a glowing core and a crisp label pill. One entity per visual, driven
   * by wall-clock callbacks (the orbit already holds continuous rendering).
   */
  function showMarker(event) {
    clearMarker();
    const base = Cesium.Color.fromCssColorString(event.simulated ? '#ff9f0a' : '#ff3b30');
    const maxM = event.kind === 'earthquake' ? 90_000 : 18_000;
    const pos = Cesium.Cartesian3.fromDegrees(event.lon, event.lat);
    const period = 2400;
    // Two rings half a cycle apart so a pulse is always expanding.
    const phase = (offset) => (((performance.now() / period) + offset) % 1);
    const ring = (offset) =>
      viewer.entities.add({
        position: pos,
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(() => maxM * (0.1 + 0.9 * phase(offset)), false),
          semiMinorAxis: new Cesium.CallbackProperty(() => maxM * (0.1 + 0.9 * phase(offset)), false),
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => base.withAlpha(0.22 * (1 - phase(offset))), false),
          ),
          outline: true,
          outlineColor: new Cesium.CallbackProperty(() => base.withAlpha(0.85 * (1 - phase(offset))), false),
          outlineWidth: 2,
          height: 0,
        },
      });

    const core = viewer.entities.add({
      position: pos,
      point: {
        pixelSize: 13,
        color: base.withAlpha(0.95),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: event.simulated ? 'SIMULATED' : event.title,
        font: '600 14px -apple-system, "Segoe UI", sans-serif',
        fillColor: event.simulated ? Cesium.Color.fromCssColorString('#ffc36b') : Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0a0f16').withAlpha(0.62),
        backgroundPadding: new Cesium.Cartesian2(10, 6),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    marker = [ring(0), ring(0.5), core];
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
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, heightM), 0),
        {
          offset: new Cesium.HeadingPitchRange(
            viewer.camera.heading,
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

  function liveData() {
    return {
      flights: [...records('flights'), ...staged.flights],
      quakes: [...records('earthquakes'), ...staged.quakes],
      vessels: records('ais-live-vessels'),
      satellites: records('satellites'),
    };
  }

  /** Wait out a stop, cutting it short if a brand-new incident appears. */
  async function dwell(seconds, profile, signal) {
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      const step = Math.min(TOUR_TIMING.interruptCheckS * 1000, until - Date.now());
      await sleep(step, signal);
      if (profile) airport?.update(profile, records('flights'));
      const incidents = {
        flights: [...records('flights'), ...staged.flights],
        quakes: [...records('earthquakes'), ...staged.quakes],
      };
      if (planner.hasFresh(incidents)) return;
    }
  }

  async function loop(signal) {
    for (;;) {
      const next = planner.next(liveData());
      stopOrbit();
      clearMarker();
      airport?.clear();
      const profile = next.kind === 'airport' ? AIRPORT_PROFILES[next.airport.id] : null;
      if (next.event) {
        ui.showEvent(next.event);
        showMarker(next.event);
      } else {
        ui.showStop(next);
      }
      await flyTo(next.view, signal);
      startOrbit(next.view);
      if (profile) {
        if (!airport) airport = createAirportOverlay(viewer);
        airport.update(profile, records('flights'));
      }
      ui.setCaption(next.line);
      const started = Date.now();
      await narrator.speak(next.line, { signal });
      const spokenS = (Date.now() - started) / 1000;
      // The whole-planet overview is held briefly and left rotating; every
      // other stop keeps its own dwell.
      const isGlobe = next.stop?.id === 'globe';
      const budget = isGlobe ? TOUR_TIMING.globeDwellS : next.dwellS;
      await dwell(Math.max(budget - spokenS, isGlobe ? 0.5 : 1), profile, signal);
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
  };
}
