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
      const tileset = attempt.googleKey
        ? await createGoogleDirectTileset(Cesium, attempt.googleKey)
        : await createGoogleIonTileset(Cesium, ionToken);
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
