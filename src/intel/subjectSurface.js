/**
 * @file Where a focused asset is actually drawn, and where on screen that is.
 *
 * The intel HUD's leader lines, reticle and close-up 3D ship all meet the
 * focused asset at one point. That point has to carry the height the asset
 * is RENDERED at, not the raw feed value: a feed altitude is barometric or
 * mean-sea-level, a place or camera has no height at all, and the globe works
 * in ellipsoid heights. Placed at ellipsoid 0 m, an airport 600 m up projects
 * far from its icon on an oblique view (the line ends in empty space), and a
 * ship sits under the sea wherever the geoid is above the ellipsoid.
 *
 * Height rules (all heights ellipsoidal, metres):
 *  - `orbit`    satellites: the feed height as given.
 *  - `sea`      ships: the geoid (mean sea level) plus a small lift, the
 *               same datum the vessels layer draws its icons at; never the
 *               ground under them (a ship under a bridge must not climb it).
 *  - `ground`   cameras, places, quakes, aircraft on the ground: the rendered
 *               surface (3D tiles or terrain, sampled) plus a small lift;
 *               until a sample lands, the orthometric hint lifted by the
 *               geoid, so a first frame is at sea level, not 0 m.
 *  - `airborne` aircraft in the air: the feed altitude lifted by the geoid,
 *               never below the surface plus a margin.
 *
 * Pure helpers are exported for the unit suite; the sampler takes Cesium and
 * the scene as arguments so this file imports nothing at load time.
 * @module intel/subjectSurface
 */

/** Clearance above a sampled surface for a ground asset (m). */
export const GROUND_LIFT_M = 1.5;
/** Ships ride this far above the geoid — the vessels layer's VESSEL_LIFT_M. */
export const SEA_LIFT_M = 3;
/** An airborne aircraft is never drawn closer than this to the surface (m). */
export const AIRBORNE_MARGIN_M = 30;
/** Surface cell size: 4 decimal degrees (~11 m). */
const CELL_DECIMALS = 4;
/** A successful sample is refreshed this often (tiles refine as they stream). */
export const SURFACE_REFRESH_MS = 60_000;
/** First retry after a miss; doubles per miss up to SURFACE_RETRY_MAX_MS. */
export const SURFACE_RETRY_BASE_MS = 1_000;
export const SURFACE_RETRY_MAX_MS = 30_000;
/** At most this many cells are remembered (oldest dropped first). */
const MAX_CELLS = 256;
/** At most this many samples start per second (a fast mover crosses a new
 *  cell every frame; each sample is a pick render). */
export const SURFACE_SAMPLES_PER_S = 4;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * Which height rule an intel object follows.
 * @param {{kind?: string, onGround?: boolean}|null|undefined} o
 * @returns {'orbit'|'sea'|'ground'|'airborne'}
 */
export function subjectRule(o) {
  if (o?.kind === 'satellite') return 'orbit';
  if (o?.kind === 'vessel') return 'sea';
  if (o?.kind === 'aircraft' && o.onGround !== true) return 'airborne';
  return 'ground';
}

/**
 * The ellipsoidal height an asset is drawn at.
 * @param {'orbit'|'sea'|'ground'|'airborne'} rule
 * @param {{rawM?: number|null, geoidN?: number|null, surfaceM?: number|null}} input
 *   rawM: the feed height (orthometric for aircraft and ground hints,
 *   ellipsoidal for satellites); geoidN: geoid undulation here, when known;
 *   surfaceM: the rendered surface's ellipsoidal height here, when sampled.
 * @returns {number}
 */
export function subjectHeightM(rule, { rawM, geoidN, surfaceM } = {}) {
  const raw = finite(rawM) ? rawM : 0;
  const n = finite(geoidN) ? geoidN : 0;
  if (rule === 'orbit') return raw;
  if (rule === 'sea') return n + SEA_LIFT_M;
  if (rule === 'ground') {
    return finite(surfaceM) ? surfaceM + GROUND_LIFT_M : n + Math.max(0, raw);
  }
  // airborne
  const fromFeed = raw + n;
  return finite(surfaceM)
    ? Math.max(fromFeed, surfaceM + AIRBORNE_MARGIN_M)
    : fromFeed;
}

/**
 * Cesium window coordinates (CSS pixels from the canvas's top-left corner)
 * to coordinates in the leader-line overlay. The two only coincide when the
 * canvas and the overlay share an origin and the canvas is not scaled by CSS;
 * drawing-buffer size, resolutionScale and devicePixelRatio are already
 * divided out by Cesium, so they must NOT be applied again here.
 * @param {{x: number, y: number}|null|undefined} win
 * @param {{left: number, top: number, width: number, height: number}} canvasRect
 *   the canvas's getBoundingClientRect()
 * @param {{width: number, height: number}} canvasClient
 *   the canvas's clientWidth / clientHeight (the space Cesium reports in)
 * @param {{left: number, top: number}} [overlayRect] the overlay's rect
 * @returns {{x: number, y: number}|null}
 */
export function toOverlayPoint(
  win,
  canvasRect,
  canvasClient,
  overlayRect = { left: 0, top: 0 },
) {
  if (!win || !finite(win.x) || !finite(win.y) || !canvasRect) return null;
  const sx =
    canvasClient?.width > 0 && canvasRect.width > 0
      ? canvasRect.width / canvasClient.width
      : 1;
  const sy =
    canvasClient?.height > 0 && canvasRect.height > 0
      ? canvasRect.height / canvasClient.height
      : 1;
  return {
    x: canvasRect.left + win.x * sx - (overlayRect.left || 0),
    y: canvasRect.top + win.y * sy - (overlayRect.top || 0),
  };
}

/**
 * Whether a window point lies on the canvas (a line to a point off the
 * canvas would end at the screen edge, pointing at nothing).
 * @param {{x: number, y: number}|null|undefined} win
 * @param {{width: number, height: number}} canvasClient
 * @param {number} [marginPx] how far inside the edge the point must be
 */
export function onCanvas(win, canvasClient, marginPx = 0) {
  if (!win || !finite(win.x) || !finite(win.y)) return false;
  const w = canvasClient?.width;
  const h = canvasClient?.height;
  if (!(w > 0) || !(h > 0)) return false;
  return (
    win.x >= marginPx &&
    win.y >= marginPx &&
    win.x <= w - marginPx &&
    win.y <= h - marginPx
  );
}

/**
 * Cache key for a surface sample: the cell and the surface regime (3D tiles
 * or globe terrain) it was measured on — a stack switch must not reuse it.
 * @param {number} lat
 * @param {number} lon
 * @param {string} regime
 */
export function surfaceCellKey(lat, lon, regime) {
  return `${regime}:${lat.toFixed(CELL_DECIMALS)},${lon.toFixed(CELL_DECIMALS)}`;
}

/** Retry delay after `misses` consecutive misses (ms). */
export function surfaceRetryMs(misses) {
  const k = Math.max(0, Math.floor(misses) - 1);
  return Math.min(SURFACE_RETRY_MAX_MS, SURFACE_RETRY_BASE_MS * 2 ** k);
}

/**
 * Rendered-surface heights, sampled asynchronously and cached per cell.
 * `heightAt` is a cache read (safe every frame); a miss starts at most one
 * `scene.sampleHeightMostDetailed` per cell (3D tiles and globe), retried
 * with backoff and refreshed every SURFACE_REFRESH_MS. With the globe shown,
 * its loaded terrain answers synchronously meanwhile.
 * @param {{Cesium: object, scene: object, exclude?: () => object[],
 *   onSample?: () => void, now?: () => number}} deps
 */
export function createSurfaceSampler({
  Cesium,
  scene,
  exclude = () => [],
  onSample = () => {},
  now = () => performance.now(),
}) {
  const cells = new Map();
  let destroyed = false;
  let windowStart = -Infinity;
  let windowCount = 0;
  /** Spend one sample from this second's budget, if any is left. */
  function takeBudget(t) {
    if (t - windowStart >= 1000) {
      windowStart = t;
      windowCount = 0;
    }
    if (windowCount >= SURFACE_SAMPLES_PER_S) return false;
    windowCount += 1;
    return true;
  }
  const regime = () => (scene.globe?.show === false ? 'tiles' : 'globe');

  function sample(cell, lat, lon) {
    if (
      scene.sampleHeightSupported !== true ||
      typeof scene.sampleHeightMostDetailed !== 'function'
    )
      return;
    cell.pending = true;
    const done = (heightM) => {
      cell.pending = false;
      if (destroyed) return;
      cell.at = now();
      if (finite(heightM)) {
        cell.heightM = heightM;
        cell.misses = 0;
        onSample();
      } else {
        cell.misses += 1;
        cell.retryAt = cell.at + surfaceRetryMs(cell.misses);
      }
    };
    let request;
    try {
      request = scene.sampleHeightMostDetailed(
        [Cesium.Cartographic.fromDegrees(lon, lat)],
        exclude(),
      );
    } catch {
      return done(undefined); // unsupported in this scene mode
    }
    Promise.resolve(request).then(
      (out) => done(out?.[0]?.height),
      () => done(undefined),
    );
  }

  /**
   * The rendered surface's ellipsoidal height at (lat, lon), or null.
   * @param {number} lat
   * @param {number} lon
   * @param {{sample?: boolean}} [opts] sample: false reads what is already
   *   known (cache, loaded globe terrain) without starting a new sample —
   *   for fast movers, whose every frame is a new cell.
   * @returns {number|null}
   */
  function heightAt(lat, lon, { sample: allowSample = true } = {}) {
    if (destroyed || !finite(lat) || !finite(lon)) return null;
    const key = surfaceCellKey(lat, lon, regime());
    let cell = cells.get(key);
    if (!cell && !allowSample) return globeHeight(lat, lon);
    if (!cell) {
      cell = { heightM: null, at: 0, retryAt: 0, misses: 0, pending: false };
      cells.set(key, cell);
      if (cells.size > MAX_CELLS) cells.delete(cells.keys().next().value);
    }
    const t = now();
    if (
      allowSample &&
      !cell.pending &&
      (cell.heightM == null
        ? t >= cell.retryAt
        : t - cell.at >= SURFACE_REFRESH_MS) &&
      takeBudget(t)
    )
      sample(cell, lat, lon);
    if (cell.heightM != null) return cell.heightM;
    return globeHeight(lat, lon);
  }

  /** The globe's loaded terrain height, when the globe is what is shown. */
  function globeHeight(lat, lon) {
    if (!scene.globe || scene.globe.show === false) return null;
    const h = scene.globe.getHeight?.(
      Cesium.Cartographic.fromDegrees(lon, lat),
    );
    return finite(h) ? h : null;
  }

  return {
    heightAt,
    destroy() {
      destroyed = true;
      cells.clear();
    },
  };
}
