/**
 * @file Map tiles fetched before the camera gets there.
 *
 * Pierre, 28 Oct: "create a predetermined destination list, pre-render the
 * Google tiles before getting there through some system that loads them
 * before you get there, and that they don't require a camera to be pointed
 * at them".
 *
 * This deployment draws the planet with the globe's own imagery and terrain
 * (Esri World Imagery and Re:Earth terrain), not Google 3D Tiles, and Cesium
 * only asks for globe tiles that its one real camera can see. So this module
 * asks for them itself: for each upcoming stop it works out which imagery
 * and terrain tiles that view will need (the tile under the subject, in
 * rings that get coarser with distance, all the way round since the
 * Director circles every subject) and downloads them through the map's own
 * providers, at the exact addresses the globe will request. Both services
 * send long cache lifetimes (imagery a day, terrain 30 days), so when the
 * camera arrives the globe's requests are answered from the browser cache
 * at once instead of over the network.
 *
 * The tile maths is plain numbers (tested in node); the providers' own
 * tiling schemes turn positions into tile numbers.
 * @module tour/globePrefetch
 */

/** Equatorial circumference (m), for the size of a tile at a level. */
const EARTH_M = 40_075_016;

export const GLOBE_PREFETCH = Object.freeze({
  /** Rings round the subject: distance multiples of the view's range. */
  rings: Object.freeze([1, 2, 4, 8]),
  /** Each ring covers this many times its distance in every direction. */
  coverFactor: 1.25,
  /** Screen height and field of view used to pick the tile level. */
  screenPx: 1080,
  fovDeg: 60,
  /** Cesium's globe refines to about this many screen pixels per texel. */
  pixelsPerTexel: 1,
  /** Most tiles asked for per stop (imagery and terrain together). */
  maxTilesPerStop: 700,
  /** Downloads in flight at once. */
  concurrency: 8,
  /** Tiles remembered as fetched (oldest forgotten first). */
  rememberTiles: 30_000,
  /** Views wider than this see whole regions: nothing to fetch. */
  maxRangeM: 1_000_000,
});

/**
 * The imagery level the globe will draw at a distance (m) from the camera,
 * at a latitude (256 px tiles, Web Mercator or geographic alike).
 */
export function imageryLevelFor(distanceM, latDeg = 0, rules = GLOBE_PREFETCH) {
  const metresPerPx =
    (Math.max(1, distanceM) * 2 * Math.tan((rules.fovDeg * Math.PI) / 360)) /
    rules.screenPx;
  const tileM = metresPerPx * rules.pixelsPerTexel * 256;
  const across = EARTH_M * Math.max(0.05, Math.cos((latDeg * Math.PI) / 180));
  return Math.max(0, Math.min(22, Math.round(Math.log2(across / tileM))));
}

/**
 * The areas and levels one view needs: one ring per distance band, each a
 * lat/lon box round the subject at the level drawn at that distance.
 * @param {{lat: number, lon: number, rangeM: number}} view
 * @returns {Array<{level: number, west: number, south: number, east: number, north: number}>}
 */
export function prefetchRings(view, rules = GLOBE_PREFETCH) {
  if (
    !view ||
    !Number.isFinite(view.lat) ||
    !Number.isFinite(view.lon) ||
    !Number.isFinite(view.rangeM) ||
    view.rangeM > rules.maxRangeM
  )
    return [];
  const out = [];
  const mPerDegLat = 111_320;
  const mPerDegLon =
    111_320 * Math.max(0.05, Math.cos((view.lat * Math.PI) / 180));
  for (const k of rules.rings) {
    const d = view.rangeM * k;
    const r = d * rules.coverFactor;
    const dLat = r / mPerDegLat;
    const dLon = r / mPerDegLon;
    out.push({
      level: imageryLevelFor(d, view.lat, rules),
      west: view.lon - dLon,
      east: view.lon + dLon,
      south: Math.max(-85, view.lat - dLat),
      north: Math.min(85, view.lat + dLat),
    });
  }
  return out;
}

/**
 * @param {{viewer: object, Cesium: object, rules?: typeof GLOBE_PREFETCH}} options
 */
export function createGlobePrefetcher({
  viewer,
  Cesium,
  rules = GLOBE_PREFETCH,
}) {
  const fetched = new Set(); // 'i:L/x/y' or 't:L/x/y'
  let queue = []; // [{key, run}]
  let active = 0;
  const counts = { asked: 0, done: 0, failed: 0 };

  function remember(key) {
    fetched.add(key);
    if (fetched.size > rules.rememberTiles) {
      const oldest = fetched.values().next().value;
      fetched.delete(oldest);
    }
  }

  function pump() {
    while (active < rules.concurrency && queue.length) {
      const job = queue.shift();
      active += 1;
      let p = null;
      try {
        p = job.run();
      } catch {
        p = null;
      }
      Promise.resolve(p)
        .then(
          (ok) => {
            if (ok === undefined) {
              // The provider declined (throttled): ask again later.
              fetched.delete(job.key);
            } else counts.done += 1;
          },
          () => {
            counts.failed += 1;
          },
        )
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  /** The tile numbers covering a box at a level, for one tiling scheme. */
  function tilesIn(scheme, box, level) {
    const nw = scheme.positionToTileXY(
      Cesium.Cartographic.fromDegrees(box.west, box.north),
      level,
    );
    const se = scheme.positionToTileXY(
      Cesium.Cartographic.fromDegrees(box.east, box.south),
      level,
    );
    if (!nw || !se) return [];
    const out = [];
    const xMax = scheme.getNumberOfXTilesAtLevel(level);
    const y0 = Math.min(nw.y, se.y);
    const y1 = Math.max(nw.y, se.y);
    // A box across the date line wraps round.
    const xs = [];
    if (se.x >= nw.x) for (let x = nw.x; x <= se.x; x += 1) xs.push(x);
    else {
      for (let x = nw.x; x < xMax; x += 1) xs.push(x);
      for (let x = 0; x <= se.x; x += 1) xs.push(x);
    }
    for (const x of xs) for (let y = y0; y <= y1; y += 1) out.push({ x, y });
    return out;
  }

  /** The jobs for one view: nearest ring first, imagery then terrain. */
  function jobsFor(view) {
    const imagery = viewer.imageryLayers?.get?.(0)?.imageryProvider;
    const terrain = viewer.terrainProvider;
    const jobs = [];
    for (const ring of prefetchRings(view, rules)) {
      if (imagery?.tilingScheme && imagery.requestImage) {
        const level = Math.min(ring.level, imagery.maximumLevel ?? 22);
        for (const { x, y } of tilesIn(imagery.tilingScheme, ring, level)) {
          const key = `i:${level}/${x}/${y}`;
          if (!fetched.has(key))
            jobs.push({
              key,
              run: () => imagery.requestImage(x, y, level),
            });
        }
      }
      if (terrain?.tilingScheme && terrain.requestTileGeometry) {
        // Terrain refines a level or two behind the imagery drawn on it.
        const level = Math.max(0, ring.level - 2);
        for (const { x, y } of tilesIn(terrain.tilingScheme, ring, level)) {
          const key = `t:${level}/${x}/${y}`;
          if (fetched.has(key)) continue;
          if (terrain.getTileDataAvailable?.(x, y, level) === false) continue;
          jobs.push({
            key,
            run: () => terrain.requestTileGeometry(x, y, level),
          });
        }
      }
      if (jobs.length >= rules.maxTilesPerStop) break;
    }
    return jobs.slice(0, rules.maxTilesPerStop);
  }

  /**
   * Fetch the tiles for these views, nearest stop first. Calling it again
   * with the same views costs nothing (fetched tiles are remembered); a new
   * list replaces what is still waiting.
   * @param {Array<{lat: number, lon: number, rangeM: number}>} views
   */
  function prefetch(views) {
    // Tiles still waiting from the last list are asked for again below if
    // this list still needs them.
    for (const old of queue) fetched.delete(old.key);
    queue = [];
    const next = [];
    const seen = new Set();
    for (const view of views || []) {
      for (const job of jobsFor(view)) {
        if (seen.has(job.key)) continue;
        seen.add(job.key);
        next.push(job);
      }
    }
    for (const job of next) remember(job.key);
    const asked = next.length;
    counts.asked += asked;
    queue = next;
    pump();
    return asked;
  }

  function stop() {
    for (const old of queue) fetched.delete(old.key);
    queue = [];
  }

  return {
    prefetch,
    stop,
    /** Diagnostics: tiles asked for, downloaded, failed, waiting. */
    stats: () => ({ ...counts, waiting: queue.length, inFlight: active }),
  };
}
