import * as Cesium from 'cesium';
import {
  recordsNear,
  shouldRefreshFlights,
  statesNear,
  worldwideFresh,
} from './flightPrefetchPolicy.js';

/**
 * Makes aircraft appear as soon as the camera arrives somewhere new instead of
 * waiting for the 30 s poll:
 *  - warm(lat, lon): fire-and-forget request for the destination, sent as a
 *    flight STARTS, so the server's regional cache is hot on arrival;
 *  - preload(lat, lon): load the destination's aircraft while flying there;
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

  /** The flights layer already has the whole world, recently. */
  function haveWorld() {
    try {
      const flights = dataManager.getLayerModule?.('flights');
      return worldwideFresh(flights?.getStats?.(), Date.now()) ? flights : null;
    } catch {
      return null;
    }
  }

  function centre() {
    const canvas = viewer.scene.canvas;
    const p = viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
    );
    if (!p) return null;
    const c = Cesium.Cartographic.fromCartesian(p);
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
    };
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
    if (shouldRefreshFlights({ last, here, heightM, now: Date.now() }))
      refreshNow(here);
  };
  const remove = viewer.camera.moveEnd.addEventListener(onMoveEnd);

  /** Warm the server cache for a destination before the camera gets there. */
  function warm(lat, lon) {
    if (!isOn('flights') || !Number.isFinite(lat) || !Number.isFinite(lon))
      return;
    const url = `/api/opensky?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => r.body?.cancel?.())
      .catch(() => {});
  }

  /**
   * Load the destination's aircraft DURING the camera flight: point the
   * flights query at the destination and refresh now, so they are already
   * on the globe when the camera arrives. The arrival refresh then sees a
   * fresh result for this place and is skipped.
   */
  function preload(lat, lon) {
    if (!isOn('flights') || !Number.isFinite(lat) || !Number.isFinite(lon))
      return;
    // The whole world is already loaded and fresh: nothing to fetch.
    if (haveWorld()) {
      last = { lat, lon, at: Date.now() };
      return;
    }
    const flights = dataManager.getLayerModule?.('flights');
    if (typeof flights?.setQueryAnchor !== 'function') return warm(lat, lon);
    flights.setQueryAnchor(lat, lon, 12000);
    last = { lat, lon, at: Date.now() };
    Promise.resolve(dataManager.refreshLayer?.('flights')).catch(() => {});
  }

  /**
   * Load a destination's aircraft ahead of the Director's flight (a whole
   * dwell early). The answer also warms the server's regional cache, so the
   * layer's own refresh on departure is served at once.
   * @returns {Promise<{ready: boolean, count: number|null, aircraft?: object[], at?: number}>}
   */
  async function stage(view, { radiusKm = 50 } = {}) {
    const { lat, lon } = view || {};
    if (!isOn('flights') || !Number.isFinite(lat) || !Number.isFinite(lon))
      return { ready: true, count: null };
    // Answered from memory when the layer holds a fresh worldwide snapshot.
    const world = haveWorld();
    if (world) {
      const aircraft = recordsNear(
        world.getAnalystRecords?.(50_000),
        lat,
        lon,
        radiusKm,
      );
      return { ready: true, count: aircraft.length, aircraft, at: Date.now() };
    }
    const url = `/api/opensky?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { ready: false, count: 0 };
      const payload = await r.json();
      const aircraft = statesNear(payload?.states, lat, lon, radiusKm);
      return { ready: true, count: aircraft.length, aircraft, at: Date.now() };
    } catch {
      return { ready: false, count: 0 };
    }
  }

  return {
    warm,
    preload,
    stage,
    /** After a fly-to: refresh unless the preload already covered this place. */
    refreshHere() {
      const here = centre();
      if (!here || !isOn('flights') || haveWorld()) return;
      const heightM = viewer.camera.positionCartographic?.height ?? Infinity;
      if (shouldRefreshFlights({ last, here, heightM, now: Date.now() }))
        refreshNow(here);
    },
    destroy: () => remove(),
  };
}
