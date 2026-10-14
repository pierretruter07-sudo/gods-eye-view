import { createSurfaceServices } from './surfaceServices.js';

/** Assemble application operations from the caller's request services. */
export function createApplicationOperations({ requests, signal, eventTarget }) {
  if (typeof requests?.terrain?.getHeights !== 'function')
    throw new TypeError('Missing application request service: terrain');
  const surface = createSurfaceServices({
    terrainSource: requests.terrain,
    signal,
    eventTarget,
  });
  return Object.freeze({ requests, surface });
}
