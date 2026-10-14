import { flyToGlobe } from '../camera.js';

/**
 * Camera presentation at start-up. God's Eye View's whole interface is the
 * shell (src/shell); this phase only opens on the whole planet.
 */
export function createApplicationControls({
  scene: { viewer },
  loaderStatus,
  defer,
}) {
  if (loaderStatus) loaderStatus.textContent = 'Loading planet...';
  defer(flyToGlobe(viewer));
  return {};
}
