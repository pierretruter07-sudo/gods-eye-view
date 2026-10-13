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

  function _flightQuery(viewer) {
    // Ask for aircraft around what the camera is LOOKING at (screen centre),
    // not where the camera hangs — at an oblique airport view those differ
    // by tens of km, and a regional source would miss the airport itself.
    try {
      const canvas = viewer?.scene?.canvas;
      const centre =
        canvas &&
        viewer.camera.pickEllipsoid(
          new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
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
  return { _abortActiveUpdates, _flightQuery };
}
