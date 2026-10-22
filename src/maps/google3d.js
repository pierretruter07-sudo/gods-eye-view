const clean = (value) => String(value || '').trim();

/**
 * Decide which map provider can deliver the best startup experience.
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {'google-direct'|'google-ion'|'osm'}
 */
export function selectMapStartupRoute({
  googleApiKey = '',
  cesiumToken = '',
} = {}) {
  if (clean(googleApiKey)) return 'google-direct';
  if (clean(cesiumToken)) return 'google-ion';
  return 'osm';
}

/** Google's tile host serves HTTP/2, so it takes far more than Cesium's
 * default 18 parallel requests per server; the Director's next-stop warm-up
 * and the current view then load side by side instead of queuing (Pierre,
 * 21 Oct: arrivals still blurred). */
export const GOOGLE_TILE_HOST = 'tile.googleapis.com:443';
export const GOOGLE_TILE_MAX_REQUESTS = 48;
export const MAX_REQUESTS_TOTAL = 80;

export function allowParallelGoogleTiles(Cesium) {
  const scheduler = Cesium?.RequestScheduler;
  if (!scheduler) return;
  const byServer = scheduler.requestsByServer || {};
  byServer[GOOGLE_TILE_HOST] = Math.max(
    byServer[GOOGLE_TILE_HOST] || 0,
    GOOGLE_TILE_MAX_REQUESTS,
  );
  scheduler.requestsByServer = byServer;
  scheduler.maximumRequests = Math.max(
    scheduler.maximumRequests || 0,
    MAX_REQUESTS_TOTAL,
  );
}

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. If the
 * direct request fails and an ion token is available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-ion'|'osm', errors: Error[]}>}
 */
/** A tileset route that has not answered in this long is skipped. */
export const TILESET_STARTUP_TIMEOUT_MS = 15_000;

/**
 * Resolves with the tileset, or rejects after the startup budget so the next
 * route (or the keyless globe) loads instead of a loader that never clears.
 * A tileset that arrives after the budget is destroyed, not leaked.
 * @param {Promise<any>} pending
 * @param {string} route
 * @param {number} [ms]
 */
export function withinStartupBudget(
  pending,
  route,
  ms = TILESET_STARTUP_TIMEOUT_MS,
) {
  let timer;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`${route}: no tileset after ${ms / 1000} s`));
    }, ms);
  });
  pending.then(
    (late) => {
      if (timedOut && late && !late.isDestroyed?.()) late.destroy?.();
    },
    () => {},
  );
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey = '', cesiumToken = '' } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];
  allowParallelGoogleTiles(Cesium);

  const attempts = [];
  if (googleKey) attempts.push({ route: 'google-direct', googleKey });
  if (ionToken) attempts.push({ route: 'google-ion', googleKey: undefined });

  for (const attempt of attempts) {
    try {
      const pending = attempt.googleKey
        ? createGoogleDirectTileset(Cesium, attempt.googleKey)
        : createGoogleIonTileset(Cesium, ionToken);
      const tileset = await withinStartupBudget(pending, attempt.route);
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}

/**
 * Tile cache budget for this device (bytes). Cesium's Google helper keeps up
 * to 1.5 GB plus 1 GB overflow, which is more than a laptop GPU has; size it
 * to the device's memory (navigator.deviceMemory, in GB, capped at 8).
 * @param {number} [deviceMemoryGb]
 */
export function tileCacheBudget(deviceMemoryGb) {
  const mb = 1024 * 1024;
  if (deviceMemoryGb && deviceMemoryGb <= 4)
    return { cacheBytes: 384 * mb, maximumCacheOverflowBytes: 192 * mb };
  if (deviceMemoryGb && deviceMemoryGb < 8)
    return { cacheBytes: 768 * mb, maximumCacheOverflowBytes: 384 * mb };
  return { cacheBytes: 1024 * mb, maximumCacheOverflowBytes: 512 * mb };
}
const deviceBudget = () => tileCacheBudget(globalThis.navigator?.deviceMemory);

/** Pass credentials to the source instead of changing SDK-wide defaults. */
export function createGoogleDirectTileset(Cesium, key) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  // Tiles keep drawing their own texture while draped weather loads.
  return Cesium.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    { asynchronouslyLoadImagery: true, ...deviceBudget() },
  );
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(2275207, {
    accessToken,
  });
  signal?.throwIfAborted();
  // Match the installed SDK's Google helper rendering/cache defaults.
  return Cesium.Cesium3DTileset.fromUrl(resource, {
    ...deviceBudget(),
    enableCollision: true,
    // Tiles keep drawing their own texture while draped weather loads.
    asynchronouslyLoadImagery: true,
  });
}
