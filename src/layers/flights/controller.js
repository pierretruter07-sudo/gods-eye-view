import * as Cesium from 'cesium';

export function createController({
  flightState,
  services,
  parts,
  layer,
  resolveAsset,
}) {
  function _abortActiveUpdates() {
    for (const controller of flightState.feed._activeUpdateControllers)
      controller.abort();
    flightState.feed._activeUpdateControllers.clear();
  }

  // A short-lived query anchor lets a caller (the Director) load the
  // destination's aircraft while the camera is still flying there.
  let queryAnchor = null; // { latitude, longitude, until }
  function setQueryAnchor(latitude, longitude, ttlMs = 12000) {
    queryAnchor =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude, until: Date.now() + ttlMs }
        : null;
  }

  function _flightQuery(viewer) {
    if (queryAnchor && Date.now() < queryAnchor.until)
      return {
        latitude: queryAnchor.latitude,
        longitude: queryAnchor.longitude,
      };
    queryAnchor = null;
    // Ask for aircraft around what the camera is LOOKING at (screen centre),
    // not where the camera hangs — at an oblique airport view those differ
    // by tens of km, and a regional source would miss the airport itself.
    try {
      const canvas = viewer?.scene?.canvas;
      const centre =
        canvas &&
        viewer.camera.pickEllipsoid(
          new Cesium.Cartesian2(
            canvas.clientWidth / 2,
            canvas.clientHeight / 2,
          ),
        );
      if (centre) {
        const c = Cesium.Cartographic.fromCartesian(centre);
        return {
          latitude: Cesium.Math.toDegrees(c.latitude),
          longitude: Cesium.Math.toDegrees(c.longitude),
        };
      }
    } catch {
      /* fall back to the camera position */
    }
    const cartographic = viewer?.camera?.positionCartographic;
    return cartographic
      ? {
          latitude: Cesium.Math.toDegrees(cartographic.latitude),
          longitude: Cesium.Math.toDegrees(cartographic.longitude),
        }
      : {};
  }
  return { _abortActiveUpdates, _flightQuery, setQueryAnchor };
}
