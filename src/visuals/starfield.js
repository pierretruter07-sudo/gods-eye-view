/**
 * @file The night sky: a high-resolution Milky Way sky box in place of
 * Cesium's default star map, seen behind space stops and, now that the sky
 * darkens at night (visuals/sun.js), above night-side cities.
 *
 * The six 2048 px faces are built offline by `scripts/sky/build-starfield.py`
 * from the XHIP extended Hipparcos compilation (118,000 real stars down to
 * magnitude 14, placed by their catalogue positions and coloured by B-V),
 * with a modelled Milky Way glow. Provenance: `public/sky/README.md`.
 * `?stars=0` keeps Cesium's own sky.
 * @module visuals/starfield
 */

export const STAR_FACES = Object.freeze({
  positiveX: 'sky/stars_px.jpg',
  negativeX: 'sky/stars_mx.jpg',
  positiveY: 'sky/stars_py.jpg',
  negativeY: 'sky/stars_my.jpg',
  positiveZ: 'sky/stars_pz.jpg',
  negativeZ: 'sky/stars_mz.jpg',
});

/** The six face URLs under the app's base path. */
export function starFaceUrls(base = '/') {
  const root = base.endsWith('/') ? base : `${base}/`;
  return Object.fromEntries(
    Object.entries(STAR_FACES).map(([face, path]) => [face, `${root}${path}`]),
  );
}

/**
 * Swap in the Milky Way sky box once its faces have loaded (the default sky
 * stays until then, so nothing flashes black).
 * The faces (1.6 MB) load a few seconds after start-up, so the first
 * Google tiles are not kept waiting.
 * @param {{viewer: object, Cesium: object, enabled?: boolean, base?: string,
 *   delayMs?: number}} options
 */
export function createStarfield({
  viewer,
  Cesium,
  enabled = true,
  base = '/',
  delayMs = 4000,
}) {
  const scene = viewer.scene;
  const original = scene.skyBox;
  const sources = starFaceUrls(base);
  let milkyWay = null;
  let on = enabled;
  let failed = false;

  function apply() {
    if (scene.isDestroyed?.()) return;
    const next = on && milkyWay ? milkyWay : original;
    if (scene.skyBox !== next) scene.skyBox = next;
    scene.requestRender?.();
  }

  let timer = null;
  let started = false;
  let destroyed = false;
  const load = async () => {
    timer = null;
    if (started || destroyed || scene.isDestroyed?.()) return;
    started = true;
    try {
      const images = await Promise.all(
        Object.values(sources).map((url) =>
          Cesium.Resource.fetchImage({ url }),
        ),
      );
      const faces = Object.fromEntries(
        Object.keys(sources).map((face, i) => [face, images[i]]),
      );
      const box = new Cesium.SkyBox({ sources: faces });
      if (destroyed) {
        box.destroy?.();
        return;
      }
      milkyWay = box;
      apply();
    } catch (error) {
      failed = true;
      console.warn(
        '[visuals] Milky Way sky unavailable; keeping the default sky',
        error,
      );
    }
  };
  // Off from the start (`?stars=0`): nothing is downloaded until it is
  // switched on.
  function schedule() {
    if (started || timer || !on) return;
    if (delayMs > 0) timer = setTimeout(load, delayMs);
    else load();
  }
  schedule();

  return {
    setEnabled(value) {
      on = Boolean(value);
      schedule();
      apply();
    },
    enabled: () => on,
    state: () => ({
      enabled: on,
      loaded: Boolean(milkyWay),
      shown: Boolean(milkyWay) && scene.skyBox === milkyWay,
      failed,
    }),
    destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      destroyed = true;
      on = false;
      apply();
      if (milkyWay && !milkyWay.isDestroyed?.()) milkyWay.destroy?.();
      milkyWay = null;
    },
  };
}
