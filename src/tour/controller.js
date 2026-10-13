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
import { reticleSprite, ringSprite, sweepSprite } from './pulseGraphics.js';
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
export function createTourController({ viewer, dataManager, ui, narrator = createNarrator(), onFocus = null }) {
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
   * A cinematic, screen-space focus pulse: a breathing targeting reticle, a
   * rotating radar sweep, two eased expanding rings and a crisp label pill.
   * Billboards stay crisp at any zoom and cost no ground tessellation; the
   * orbit already holds continuous rendering, so the callbacks animate.
   */
  function showMarker(event) {
    clearMarker();
    const hex = event.simulated ? '#ffc24d' : '#ff9500';
    const base = Cesium.Color.fromCssColorString(hex);
    const pos = Cesium.Cartesian3.fromDegrees(event.lon, event.lat);
    const common = {
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.NONE,
    };
    const easeOut = (t) => 1 - (1 - t) * (1 - t);
    const period = 2600;
    const ringPhase = (offset) => ((performance.now() / period + offset) % 1);

    const reticle = viewer.entities.add({
      position: pos,
      billboard: {
        image: reticleSprite(hex),
        width: 84,
        height: 84,
        color: new Cesium.CallbackProperty(() => {
          const b = 0.85 + 0.15 * Math.sin(performance.now() / 500);
          return base.withAlpha(b);
        }, false),
        ...common,
      },
    });

    const sweep = viewer.entities.add({
      position: pos,
      billboard: {
        image: sweepSprite(hex),
        width: 84,
        height: 84,
        rotation: new Cesium.CallbackProperty(() => (-performance.now() / 900) % (Math.PI * 2), false),
        color: base.withAlpha(0.9),
        ...common,
      },
    });

    const ring = (offset) =>
      viewer.entities.add({
        position: pos,
        billboard: {
          image: ringSprite(hex),
          width: new Cesium.CallbackProperty(() => 40 + 150 * easeOut(ringPhase(offset)), false),
          height: new Cesium.CallbackProperty(() => 40 + 150 * easeOut(ringPhase(offset)), false),
          color: new Cesium.CallbackProperty(() => base.withAlpha(0.8 * (1 - ringPhase(offset)) ** 1.4), false),
          ...common,
        },
      });

    const label = viewer.entities.add({
      position: pos,
      label: {
        text: event.simulated ? 'SIMULATED' : event.title,
        font: '600 14px -apple-system, "Segoe UI", sans-serif',
        fillColor: Cesium.Color.fromCssColorString(event.simulated ? '#ffd480' : '#ffffff'),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0a0f16').withAlpha(0.62),
        backgroundPadding: new Cesium.Cartesian2(10, 6),
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -56),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    marker = [ring(0), ring(0.5), sweep, reticle, label];
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

  /** What the stop is looking at, as {layerId, record} for the intel view. */
  function focusOf(next) {
    if (next.kind === 'event' && next.event?.kind === 'aircraft') {
      const f = next.event.facts || {};
      return { layerId: 'flights', record: { ...f, lat: next.event.lat, lon: next.event.lon, simulated: next.event.simulated } };
    }
    if (next.kind === 'event' && next.event?.kind === 'earthquake') {
      const f = next.event.facts || {};
      return {
        layerId: 'earthquakes',
        record: { ...f, id: next.event.key, lat: next.event.lat, lon: next.event.lon, simulated: next.event.simulated },
      };
    }
    if (next.kind === 'vessel') return { layerId: 'ais-live-vessels', record: next.vessel };
    if (next.kind === 'satellite') return { layerId: 'satellites', record: next.satellite };
    return null;
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
      onFocus?.(null);
      await flyTo(next.view, signal);
      startOrbit(next.view);
      onFocus?.(focusOf(next));
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
  };
}
