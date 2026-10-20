/**
 * @file Google tile warm-up for the Director's next stop.
 *
 * The Director already knows its next stop while it dwells at this one (the
 * look-ahead queue, or the opening descent's next step). This module asks
 * Cesium to start loading the 3D tiles for that place a few seconds early,
 * so the photorealistic city is there when the camera arrives instead of
 * melting in afterwards.
 *
 * It uses Cesium's own "preload flight destination" pass: the scene keeps a
 * second camera (`scene.preloadFlightCamera`) and, while a flight is under
 * way, every 3D tileset also requests the tiles that camera would see.
 * Between flights the pass is off, so while warming we aim that camera at
 * the next stop and report a flight as under way. A real flyTo replaces the
 * pose with its own destination, so `stop()` is called on departure.
 *
 * Genuine real-time alerts are not warmed: they are chosen at departure and
 * the camera goes straight there.
 * @module tour/tileWarmer
 */

/** Views wider than this see whole regions; nothing city-scale to warm. */
export const WARM_MAX_RANGE_M = 1_000_000;
/** Start warming once this stop's own tiles are in, or after this long. */
export const WARM_AFTER_ARRIVAL_MS = 4000;
/** Stop timing an arrival's tile load after this long. */
const LOAD_TIMEOUT_MS = 30_000;
const POLL_MS = 250;
/** Longest the Director holds at departure for the next stop's tiles. */
export const SETTLE_MAX_MS = 5000;
/** No tile requests in flight for this long counts as loaded. */
const SETTLE_QUIET_MS = 500;

/** Every loaded 3D tileset in the scene (Google's, in practice). */
export function sceneTilesets(viewer) {
  const out = [];
  const prims = viewer?.scene?.primitives;
  if (!prims?.get) return out;
  for (let i = 0; i < prims.length; i += 1) {
    const p = prims.get(i);
    if (p && typeof p.tilesLoaded === 'boolean' && p.show !== false)
      out.push(p);
  }
  return out;
}

/** Whether a stop's view is worth warming (city-scale, real coordinates). */
export function warmable(view) {
  return Boolean(
    view &&
    Number.isFinite(view.lat) &&
    Number.isFinite(view.lon) &&
    Number.isFinite(view.rangeM) &&
    view.rangeM <= WARM_MAX_RANGE_M,
  );
}

/**
 * @param {{viewer: object, Cesium: object, enabled?: boolean,
 *   now?: () => number, tilesets?: () => object[]}} options
 */
export function createTileWarmer({
  viewer,
  Cesium,
  enabled = true,
  now = () => Date.now(),
  tilesets = () => sceneTilesets(viewer),
}) {
  const camera = viewer.camera;
  const scene = viewer.scene;
  let on = enabled;
  let warming = null; // { label, view, since }
  let lastWarmed = null; // label of the stop warmed before this departure
  let timer = 0;
  let arrival = null; // { label, at, warmed, readyOnArrival }
  let lastHold = null; // { label, heldMs }: the wait at the last departure
  const log = [];

  const allLoaded = () => {
    const sets = tilesets();
    return sets.length > 0 && sets.every((t) => t.tilesLoaded);
  };

  function aim(view) {
    const pc = scene.preloadFlightCamera;
    if (!pc) return false;
    const aspect = camera.frustum?.aspectRatio;
    if (pc.frustum && Number.isFinite(aspect)) pc.frustum.aspectRatio = aspect;
    pc.lookAt(
      Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.heightM || 0),
      new Cesium.HeadingPitchRange(
        camera.heading,
        Cesium.Math.toRadians(view.pitchDeg ?? -35),
        view.rangeM,
      ),
    );
    pc.lookAtTransform(Cesium.Matrix4.IDENTITY);
    scene.preloadFlightCullingVolume = pc.frustum.computeCullingVolume(
      pc.positionWC,
      pc.directionWC,
      pc.upWC,
    );
    return true;
  }

  /** Begin loading the next stop's tiles (call while dwelling here). */
  function warm(view, label = '') {
    if (!on || !warmable(view)) return false;
    try {
      if (!aim(view)) return false;
    } catch (error) {
      console.warn('[tour] tile warm-up failed', error);
      return false;
    }
    // Instance override: Cesium runs its preload pass only during a flight.
    camera.canPreloadFlight = () => true;
    warming = { label, view, since: now() };
    return true;
  }

  /** Hand back to Cesium (a real flight, or the tour ending). */
  function stop() {
    clearTimeout(timer);
    timer = 0;
    lastWarmed = warming ? warming.label : null;
    warming = null;
    if (Object.prototype.hasOwnProperty.call(camera, 'canPreloadFlight'))
      delete camera.canPreloadFlight;
  }

  /**
   * The camera has arrived at a stop. Times how long its tiles take, then
   * warms `next()` (the stop after) once they are in, or after a few
   * seconds. Pass `next` = null for no warm-up (an alert may come next).
   * @param {string} label
   * @param {() => (object|null)} [next] returns {view, label} or null
   */
  function arrived(label, next = null) {
    clearTimeout(timer);
    const at = now();
    const entry = {
      stop: label,
      warmed: Boolean(lastWarmed) && lastWarmed === label,
      readyOnArrival: allLoaded(),
      loadedAfterMs: null,
      heldMs: lastHold?.label === label ? lastHold.heldMs : 0,
    };
    lastHold = null;
    arrival = entry;
    log.push(entry);
    if (log.length > 30) log.shift();
    if (entry.readyOnArrival) entry.loadedAfterMs = 0;
    const tick = () => {
      if (arrival !== entry) return;
      const waited = now() - at;
      if (entry.loadedAfterMs == null && allLoaded())
        entry.loadedAfterMs = waited;
      const settled = entry.loadedAfterMs != null;
      if (settled || waited >= WARM_AFTER_ARRIVAL_MS) {
        // Re-aimed if the queued stop changes (an empty airport replaced).
        const n = typeof next === 'function' ? next() : null;
        if (n && warming?.label !== n.label) warm(n.view, n.label);
      }
      if (waited < LOAD_TIMEOUT_MS) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, entry.readyOnArrival ? 0 : POLL_MS);
  }

  /** Tile requests still in flight across the scene's 3D tilesets. */
  function pendingTiles() {
    let n = 0;
    for (const t of tilesets()) {
      const st = t.statistics ?? t._statistics;
      n +=
        (st?.numberOfPendingRequests ?? 0) + (st?.numberOfTilesProcessing ?? 0);
    }
    return n;
  }

  /**
   * Before leaving for the stop being warmed: wait (at most `maxMs`) until
   * its tiles have finished loading, so they are on screen when the camera
   * arrives (Pierre, 20 Oct: "load the Google tiles before we get there").
   * Resolves at once when nothing is being warmed for that stop (a fresh
   * alert goes straight away) or there are no 3D tiles at all.
   * @param {string} label the stop about to be flown to
   * @param {{maxMs?: number, quietMs?: number, sleep?: Function}} [opts]
   * @returns {Promise<{waitedMs: number, settled: boolean}>}
   */
  async function settle(
    label,
    { maxMs = SETTLE_MAX_MS, quietMs = SETTLE_QUIET_MS, sleep } = {},
  ) {
    const wait =
      sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const started = now();
    if (!on || !warming || warming.label !== label || !tilesets().length) {
      lastHold = { label, heldMs: 0 };
      return { waitedMs: 0, settled: false };
    }
    let quietSince = null;
    for (;;) {
      const t = now();
      if (pendingTiles() === 0) {
        quietSince ??= t;
        if (t - quietSince >= quietMs) {
          lastHold = { label, heldMs: t - started };
          return { waitedMs: t - started, settled: true };
        }
      } else quietSince = null;
      if (t - started >= maxMs) {
        lastHold = { label, heldMs: t - started };
        return { waitedMs: t - started, settled: false };
      }
      await wait(POLL_MS);
    }
  }

  /** While the Director runs, tiles are not skipped because the camera is
   * moving (it always is: it orbits), so the view fills in sooner. */
  const held = new Map();
  function holdDetail(onOff) {
    for (const t of tilesets()) {
      if (onOff && !held.has(t)) {
        held.set(t, t.cullRequestsWhileMoving);
        t.cullRequestsWhileMoving = false;
      } else if (!onOff && held.has(t)) {
        t.cullRequestsWhileMoving = held.get(t);
        held.delete(t);
      }
    }
  }

  return {
    warm,
    stop,
    arrived,
    settle,
    holdDetail,
    pendingTiles,
    isWarming: () => Boolean(warming),
    setEnabled(value) {
      on = Boolean(value);
      if (!on) stop();
    },
    enabled: () => on,
    /** Diagnostics: per arrival, whether it was warmed and tile timing. */
    log: () => log.map((e) => ({ ...e })),
  };
}
