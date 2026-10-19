/**
 * @file World visuals: live day/night with city lights, comet trails behind
 * aircraft and ships, and shockwave rings for earthquakes the Director
 * shows. Each part can be switched off from the URL (`?daynight=0`,
 * `?trails=0`, `?quakerings=0`) or at run time through `window.__gevWorld`.
 * @module visuals
 */
import * as Cesium from 'cesium';
import { createDayNight } from './dayNight.js';
import { createTrails } from './trails.js';
import { createQuakeRings } from './quakeRings.js';
import { visualFlags } from './flags.js';

export { visualFlags };

/** Mount all three for the application lifetime. */
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
  tryMount('dayNight', () =>
    createDayNight({ viewer, Cesium, enabled: flags.dayNight }),
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
