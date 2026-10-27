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
 * The preload camera is aimed where the real camera will be on ARRIVAL
 * (Pierre, 21 Oct: still three seconds of blur on arrival). Two things made
 * the old aim miss: planet hops arrive facing north while the warm used
 * the orbit's current heading (often the far side of the subject), and a
 * moving aircraft is met where it is when the camera lands, not where it
 * was when it was queued. So a warm takes the arrival heading and, for a
 * moving subject, a `locate` function that is re-read every second.
 * @module tour/tileWarmer
 */

/** Timers that never keep a process alive on their own (tests, servers). */
const later = (fn, ms) => {
  const t = setTimeout(fn, ms);
  t?.unref?.();
  return t;
};
const every = (fn, ms) => {
  const t = setInterval(fn, ms);
  t?.unref?.();
  return t;
};

/** Views wider than this see whole regions; nothing city-scale to warm. */
export const WARM_MAX_RANGE_M = 1_000_000;
/** Start warming once this stop's own tiles are in, or after this long. */
export const WARM_AFTER_ARRIVAL_MS = 2500;
/** Stop timing an arrival's tile load after this long. */
const LOAD_TIMEOUT_MS = 30_000;
const POLL_MS = 250;
/** How often a warm re-aims (a moving subject, the live orbit heading). */
export const REAIM_MS = 1000;
/** Longest the Director holds at departure for the next stop's tiles (it
 * keeps orbiting the current stop meanwhile, so the wait is not seen). */
export const SETTLE_MAX_MS = 8000;
/** No tile requests in flight for this long counts as loaded. */
const SETTLE_QUIET_MS = 500;
/** Look-ahead sweep: each aim is held until its tile requests are done
 * (quiet this long) or this long at most, then the next aim is taken. A
 * shorter hold cancels its own requests: Cesium drops requests for tiles
 * no pass asked for in the last frame. */
export const SWEEP_QUIET_MS = 400;
export const SWEEP_HOLD_MAX_MS = 4000;
/** Headings each upcoming stop is warmed from: the Director circles every
 * subject, so all four sides of it are seen during the dwell. */
export const SWEEP_TURNS_DEG = Object.freeze([0, 90, 180, 270]);

/**
 * The order the look-ahead sweep aims in, for up to two upcoming stops:
 * the next stop's arrival view first, then the one after's, then the rest
 * of the next stop's sides before the rest of the second's. Returns
 * [{target, turnDeg}] (target = index into the list).
 */
export function sweepPlan(count, turns = SWEEP_TURNS_DEG) {
  if (count <= 0) return [];
  if (count === 1) return turns.map((turnDeg) => ({ target: 0, turnDeg }));
  const [first, ...rest] = turns;
  const out = [
    { target: 0, turnDeg: first },
    { target: 1, turnDeg: first },
  ];
  for (const t of rest) out.push({ target: 0, turnDeg: t });
  for (const t of rest) out.push({ target: 1, turnDeg: t });
  for (let i = 2; i < count; i += 1)
    for (const turnDeg of turns) out.push({ target: i, turnDeg });
  return out;
}

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
  let warming = null; // { label, view, since, headingDeg, locate }
  let reaimTimer = 0;
  let lastWarmed = null; // label of the stop warmed before this departure
  let timer = 0;
  let arrival = null; // { label, at, warmed, readyOnArrival }
  let lastHold = null; // { label, heldMs }: the wait at the last departure
  const log = [];

  const allLoaded = () => {
    const sets = tilesets();
    return sets.length > 0 && sets.every((t) => t.tilesLoaded);
  };

  function aim(view, headingDeg = null) {
    const pc = scene.preloadFlightCamera;
    if (!pc) return false;
    const aspect = camera.frustum?.aspectRatio;
    if (pc.frustum && Number.isFinite(aspect)) pc.frustum.aspectRatio = aspect;
    pc.lookAt(
      Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.heightM || 0),
      new Cesium.HeadingPitchRange(
        Number.isFinite(headingDeg)
          ? Cesium.Math.toRadians(headingDeg)
          : camera.heading,
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

  /** Where to aim now: the subject's predicted position, else the view. */
  function target(w) {
    let at = null;
    try {
      at = w.locate?.() || null;
    } catch {
      at = null;
    }
    return at && Number.isFinite(at.lat) && Number.isFinite(at.lon)
      ? {
          ...w.view,
          lat: at.lat,
          lon: at.lon,
          heightM: at.heightM ?? w.view.heightM,
        }
      : w.view;
  }

  /**
   * Begin loading a stop's tiles (call while dwelling here, and again on
   * departure). `headingDeg` is the heading the camera will arrive with
   * (null: the camera's own heading at the time); `locate` returns where a
   * moving subject will be on arrival ({lat, lon, heightM}).
   */
  function warm(view, label = '', { headingDeg = null, locate = null } = {}) {
    if (!on || !warmable(view)) return false;
    const next = { label, view, since: now(), headingDeg, locate };
    try {
      if (!aim(target(next), headingDeg)) return false;
    } catch (error) {
      console.warn('[tour] tile warm-up failed', error);
      return false;
    }
    // Instance override: Cesium runs its preload pass only during a flight.
    camera.canPreloadFlight = () => true;
    warming = next;
    clearInterval(reaimTimer);
    reaimTimer =
      locate || !Number.isFinite(headingDeg)
        ? every(() => {
            if (warming !== next) return;
            try {
              aim(target(next), headingDeg);
            } catch {
              /* viewer torn down */
            }
          }, REAIM_MS)
        : 0;
    return true;
  }

  // ── Look-ahead: the next two stops, all sides ─────────────────────────
  let ahead = null; // { key, targets, plan, step, since, quietSince }
  let sweepTimer = 0;

  function aimSweep() {
    if (!ahead) return;
    const { target: index, turnDeg } =
      ahead.plan[ahead.step % ahead.plan.length];
    const t = ahead.targets[index];
    const base = Number.isFinite(t.headingDeg)
      ? t.headingDeg
      : (camera.heading * 180) / Math.PI;
    try {
      aim(target(t), base + turnDeg);
    } catch {
      /* viewer torn down */
    }
    ahead.since = now();
    ahead.quietSince = null;
  }

  /**
   * Keep loading the tiles of the next stops (Pierre, 28 Oct: "preload the
   * Google Tiles for the next two steps before we get there"). `list` is
   * [{view, label, headingDeg, locate}], nearest first; the warmer works
   * through each stop's arrival view and then its other sides, holding each
   * aim until its tiles are in, and keeps cycling (cached tiles come back
   * quiet at once) until the list changes or a flight starts.
   */
  function warmAhead(list) {
    if (!on) return false;
    const targets = (list || []).filter((t) => t && warmable(t.view));
    if (!targets.length) return false;
    const key = targets.map((t) => t.label).join('|');
    if (ahead?.key === key && warming) {
      ahead.targets = targets; // fresh views and locate functions
      return true;
    }
    if (!scene.preloadFlightCamera) return false;
    clearInterval(reaimTimer);
    reaimTimer = 0;
    clearInterval(sweepTimer);
    const first = targets[0];
    warming = {
      label: first.label,
      view: first.view,
      since: now(),
      headingDeg: first.headingDeg ?? null,
      locate: first.locate ?? null,
    };
    camera.canPreloadFlight = () => true;
    ahead = { key, targets, plan: sweepPlan(targets.length), step: 0 };
    aimSweep();
    sweepTimer = every(() => {
      if (!ahead) return;
      const t = now();
      if (pendingTiles() === 0) {
        ahead.quietSince ??= t;
        if (t - ahead.quietSince < SWEEP_QUIET_MS) return;
      } else {
        ahead.quietSince = null;
        if (t - ahead.since < SWEEP_HOLD_MAX_MS) return;
      }
      ahead.step += 1;
      aimSweep();
    }, POLL_MS);
    return true;
  }

  /** Stop the sweep and hold the preload camera on one stop's arrival. */
  function focusArrival(label) {
    const t = ahead?.targets?.find((x) => x.label === label);
    clearInterval(sweepTimer);
    sweepTimer = 0;
    ahead = null;
    if (!t) return false;
    warm(t.view, t.label, { headingDeg: t.headingDeg, locate: t.locate });
    return true;
  }

  /** Hand back to Cesium (a real flight, or the tour ending). */
  function stop() {
    clearTimeout(timer);
    clearInterval(reaimTimer);
    clearInterval(sweepTimer);
    sweepTimer = 0;
    ahead = null;
    timer = 0;
    reaimTimer = 0;
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
        // Re-aimed if the upcoming stops change (an empty airport replaced,
        // a fresh alert queued). `next` gives one stop or a list of them.
        const n = typeof next === 'function' ? next() : null;
        const list = Array.isArray(n) ? n : n ? [n] : [];
        if (list.length > 1) warmAhead(list);
        else if (list.length && warming?.label !== list[0].label)
          warm(list[0].view, list[0].label, {
            headingDeg: list[0].headingDeg,
            locate: list[0].locate,
          });
      }
      // Fast at first, then once a second until departure, so a fresh
      // alert queued late in a long dwell is warmed too.
      timer = later(tick, waited < LOAD_TIMEOUT_MS ? POLL_MS : REAIM_MS);
    };
    timer = later(tick, entry.readyOnArrival ? 0 : POLL_MS);
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
    // Leaving now: the preload camera holds on this stop's arrival view.
    if (ahead) focusArrival(label);
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

  /**
   * A watch over tile loading for the held arrival: `ready(now)` is true
   * once no tile request has been in flight for `quietMs` (both the camera's
   * own view and the warmed arrival view), or at once when there are no 3D
   * tiles at all (no Google key).
   */
  function loadWatch({ quietMs = 300 } = {}) {
    let quietSince = null;
    return {
      ready(t = now()) {
        if (!on || !tilesets().length) return true;
        if (pendingTiles() > 0) {
          quietSince = null;
          return false;
        }
        quietSince ??= t;
        return t - quietSince >= quietMs && allLoaded();
      },
    };
  }

  /**
   * After arrival: wait (at most `maxMs`) until the view's tiles are in, so
   * the Director never starts talking over a blur. Resolves with how long
   * it waited.
   */
  async function waitLoaded({ maxMs = 4000, quietMs = 300, sleep } = {}) {
    const wait =
      sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const started = now();
    const watch = loadWatch({ quietMs });
    for (;;) {
      const t = now();
      if (watch.ready(t)) return { waitedMs: t - started, settled: true };
      if (t - started >= maxMs)
        return { waitedMs: t - started, settled: false };
      await wait(100);
    }
  }

  /** While the Director runs, tiles are not skipped or kept coarse because
   * the camera is moving (it always is: it orbits). Cesium's foveated
   * detail lowers the edges of the view and defers their tiles until the
   * camera stops, which for the Director is never: the edges stayed blurred. */
  const held = new Map();
  function holdDetail(onOff) {
    for (const t of tilesets()) {
      if (onOff && !held.has(t)) {
        held.set(t, {
          cull: t.cullRequestsWhileMoving,
          foveated: t.foveatedScreenSpaceError,
        });
        t.cullRequestsWhileMoving = false;
        if ('foveatedScreenSpaceError' in t) t.foveatedScreenSpaceError = false;
      } else if (!onOff && held.has(t)) {
        const was = held.get(t);
        t.cullRequestsWhileMoving = was.cull;
        if ('foveatedScreenSpaceError' in t)
          t.foveatedScreenSpaceError = was.foveated;
        held.delete(t);
      }
    }
  }

  return {
    warm,
    warmAhead,
    stop,
    arrived,
    settle,
    loadWatch,
    waitLoaded,
    holdDetail,
    pendingTiles,
    isWarming: () => Boolean(warming),
    /** Diagnostics: what is being warmed, and where it is aimed now. */
    warming: () =>
      warming
        ? {
            label: warming.label,
            headingDeg: warming.headingDeg,
            at: target(warming),
            ahead: ahead
              ? {
                  stops: ahead.targets.map((t) => t.label),
                  step: ahead.step,
                }
              : null,
          }
        : null,
    setEnabled(value) {
      on = Boolean(value);
      if (!on) stop();
    },
    enabled: () => on,
    /** Diagnostics: per arrival, whether it was warmed and tile timing. */
    log: () => log.map((e) => ({ ...e })),
  };
}
