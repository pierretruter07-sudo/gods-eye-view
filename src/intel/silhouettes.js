/**
 * Minimal plan-view line silhouettes, one per class (original artwork,
 * ~150 bytes each). Shown behind every type reference: they fill the frame
 * while a photo loads, and stand in when a type has no free photo, the
 * lookup fails, or the type is not in the catalogue. 64×64, nose up,
 * stroked in currentColor.
 */
const PATHS = Object.freeze({
  airliner:
    'M32 4c2 0 3 3 3 7v13l22 12v4l-22-6v14l7 5v3l-10-2-10 2v-3l7-5V34l-22 6v-4l22-12V11c0-4 1-7 3-7Z',
  transport: 'M30 6h4l1 5v13h24v4l-24 3v19h9v4H20v-4h9V31L5 28v-4h24V11Z',
  fighter:
    'M32 3l3 11 1 11 19 15v4l-19-4-1 9 7 6v3l-10-2-10 2v-3l7-6-1-9-19 4v-4l19-15 1-11Z',
  light: 'M31 10h2l1 8h22v4l-22 2v18l7 2v3H24v-3l7-2V24l-22-2v-4h22Z M28 9h8',
  uav: 'M31 10h2l1 14 25 3v3l-25 2v14l7 6v2H23v-2l7-6V32L5 30v-3l25-3Z',
  helicopter:
    'M32 15c4 0 6 3 6 8s-2 9-6 9-6-4-6-9 2-8 6-8Z M32 32v21 M28 53h8 M15 9l34 28 M49 9L15 37',
  warship:
    'M32 3c6 9 8 19 8 31v24H24V34c0-12 2-22 8-31Z M28 30h8v10h-8Z M30 44h4v6h-4Z',
  cargo:
    'M32 4c5 4 9 9 9 15v38H23V19c0-6 4-11 9-15Z M27 22h10 M27 29h10 M27 36h10 M27 43h10 M26 50h12',
  smallcraft: 'M32 12c5 5 7 11 7 18v20H25V30c0-7 2-13 7-18Z M28 34h8',
  satellite:
    'M27 27h10v10H27Z M5 26h18v12H5Z M41 26h18v12H41Z M23 32h4 M37 32h4 M32 27v-7 M29 20h6',
});

/** Aircraft class (src/data/aircraftClass.js) → silhouette. */
const AIRCRAFT_CLASS_SHAPE = Object.freeze({
  light: 'light',
  glider: 'light',
  turboprop: 'transport',
  airliner: 'airliner',
  widebody: 'airliner',
  quadjet: 'airliner',
  bizjet: 'airliner',
  helicopter: 'helicopter',
  fastjet: 'fighter',
  uav: 'uav',
});

export const SILHOUETTE_SHAPES = Object.freeze(Object.keys(PATHS));

/** Silhouette for an aircraft class, defaulting to the airliner outline. */
export function shapeForAircraftClass(klass) {
  return AIRCRAFT_CLASS_SHAPE[klass] || 'airliner';
}

/** Inline SVG markup for a shape (unknown shapes fall back to airliner). */
export function silhouetteSvg(shape) {
  const d = PATHS[shape] || PATHS.airliner;
  return `<svg class="gev-hud__ref-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}
