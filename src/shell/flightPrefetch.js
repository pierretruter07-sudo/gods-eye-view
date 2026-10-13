import * as Cesium from 'cesium';
import { shouldRefreshFlights } from './flightPrefetchPolicy.js';

/**
 * Makes aircraft appear as soon as the camera arrives somewhere new instead of
 * waiting for the 30 s poll:
 *  - warm(lat, lon): fire-and-forget request for the destination, sent as a
 *    flight STARTS, so the server's regional cache is hot on arrival;
 *  - on every camera stop, refresh the flights layer immediately if the view
 *    moved far enough from the last refresh.
 */
export function installFlightPrefetch({ viewer, dataManager }) {
  let last = null; // { lat, lon, at }

  const isOn = (id) => {
    try {
      return dataManager.isEnabled(id) === true;
    } catch {
      return false;
    }
  };

  function centre() {
    const canvas = viewer.scene.canvas;
    const p = viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
    );
    if (!p) return null;
    const c = Cesium.Cartographic.fromCartesian(p);
    return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) };
  }

  function refreshNow(here) {
    last = { ...here, at: Date.now() };
    for (const id of ['flights', 'military']) {
      if (!isOn(id)) continue;
      Promise.resolve(dataManager.refreshLayer?.(id)).catch(() => {});
    }
  }

  const onMoveEnd = () => {
    if (!isOn('flights')) return;
    const heightM = viewer.camera.positionCartographic?.height ?? Infinity;
    const here = centre();
    if (!here) return;
    if (shouldRefreshFlights({ last, here, heightM, now: Date.now() })) refreshNow(here);
  };
  const remove = viewer.camera.moveEnd.addEventListener(onMoveEnd);

  /** Warm the server cache for a destination before the camera gets there. */
  function warm(lat, lon) {
    if (!isOn('flights') || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const url = `/api/opensky?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => r.body?.cancel?.())
      .catch(() => {});
  }

  return {
    warm,
    /** Refresh for wherever the camera is looking now (after a fly-to). */
    refreshHere() {
      const here = centre();
      if (here && isOn('flights')) refreshNow(here);
    },
    destroy: () => remove(),
  };
}
