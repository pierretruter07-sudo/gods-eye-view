/**
 * @file World visuals: the real Sun with shadows on the 3D city, a true
 * night side on the city's tiles, live day/night with city lights from
 * orbit, the Milky Way sky, comet trails behind aircraft and ships, and (on
 * request only, `?quakerings=1`) shockwave rings for earthquakes the
 * Director shows. Each can be switched off from the URL (`?shadows=0`,
 * `?nightcity=0`, `?daynight=0`, `?stars=0`, `?trails=0`) or at run time
 * through `window.__gevWorld`.
 * @module visuals
 */
import * as Cesium from 'cesium';
import { createDayNight } from './dayNight.js';
import { createSun } from './sun.js';
import { createNightTiles } from './nightTiles.js';
import { createStarfield } from './starfield.js';
import { createTrails } from './trails.js';
import { createQuakeRings } from './quakeRings.js';
import { visualFlags } from './flags.js';

export { visualFlags };

/** Mount them all for the application lifetime. */
export function installWorldVisuals({ viewer, dataManager }) {
  let search = '';
  try {
    search = globalThis.location?.search || '';
  } catch {
    search = '';
  }
  const flags = visualFlags(search);
  const parts = {};
  const tryMount = (name, make) => {
    try {
      parts[name] = make();
    } catch (error) {
      console.warn(`[visuals] ${name} unavailable`, error);
    }
  };
  tryMount('sun', () => createSun({ viewer, Cesium, shadows: flags.shadows }));
  tryMount('dayNight', () =>
    createDayNight({ viewer, Cesium, enabled: flags.dayNight }),
  );
  if (parts.sun)
    tryMount('nightCity', () =>
      createNightTiles({
        viewer,
        Cesium,
        enabled: flags.nightCity,
        sunDirection: () => parts.sun.direction(),
        lightsImage: () => parts.dayNight?.lightsImage?.() || null,
      }),
    );
  tryMount('stars', () =>
    createStarfield({
      viewer,
      Cesium,
      enabled: flags.stars,
      base: import.meta.env?.BASE_URL || '/',
    }),
  );
  tryMount('trails', () =>
    createTrails({ viewer, Cesium, dataManager, enabled: flags.trails }),
  );
  tryMount('quakeRings', () =>
    createQuakeRings({ viewer, Cesium, enabled: flags.quakeRings }),
  );

  const api = {
    /**
     * The Director's current subject (null between stops): rings for an
     * earthquake, the subject's tail drawn first.
     */
    onFocus(focus) {
      const record = focus?.record || null;
      parts.trails?.setFocus(record);
      if (focus?.layerId === 'earthquakes')
        parts.quakeRings?.show({
          lat: record?.lat,
          lon: record?.lon,
          magnitude: record?.magnitude,
        });
      else parts.quakeRings?.clear();
    },
    /** The quality ladder's say on shadows (off on its lower rungs). */
    allowShadows(on) {
      parts.sun?.setAllowed(on);
    },
    set(name, on) {
      parts[name]?.setEnabled(on);
      return api.state();
    },
    state: () =>
      Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.state()])),
    parts,
    destroy() {
      for (const p of Object.values(parts)) p.destroy();
    },
  };
  window.__gevWorld = api;
  return api;
}
