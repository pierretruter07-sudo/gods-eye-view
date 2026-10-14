import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';

/** Construct the reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    cables: createBundledCableSource(),
  };
}
