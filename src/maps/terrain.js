import * as Cesium from 'cesium';

/** These factories are lazy: a hidden globe must not trigger terrain loading. */
export async function createWorldTerrain(accessToken, { signal } = {}) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken)
    throw new Error('World terrain requires an explicit ion token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(1, { accessToken });
  signal?.throwIfAborted();
  return {
    provider: await Cesium.CesiumTerrainProvider.fromUrl(resource, {
      requestVertexNormals: true,
      requestWaterMask: true, // animated ocean surface (see shell/ocean)
      ellipsoid: Cesium.Ellipsoid.WGS84,
    }),
  };
}

/** The free Re:Earth terrain host rate-limits bursts (HTTP 429); Cesium's
 * default is 18 parallel requests per server. Six keeps tile loading smooth
 * without tripping the limit during fast Director flights. */
export const KEYLESS_TERRAIN_HOST = 'terrain.reearth.land:443';
export const KEYLESS_TERRAIN_MAX_REQUESTS = 6;

export async function createKeylessTerrain() {
  Cesium.RequestScheduler.requestsByServer[KEYLESS_TERRAIN_HOST] =
    KEYLESS_TERRAIN_MAX_REQUESTS;
  try {
    // Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0.
    return {
      provider: await Cesium.CesiumTerrainProvider.fromUrl(
        'https://terrain.reearth.land/cesium-mesh/ellipsoid',
      ),
    };
  } catch (error) {
    console.warn(
      '[MapStack] Re:Earth terrain unavailable, falling back to flat ellipsoid terrain:',
      error,
    );
    return { provider: new Cesium.EllipsoidTerrainProvider() };
  }
}
