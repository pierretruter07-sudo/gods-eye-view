/**
 * @file Which world visuals are on, from the page URL.
 * @module visuals/flags
 */

/** Which parts are on, from the page URL (`?<name>=0` turns one off). */
export function visualFlags(search = '') {
  const off = (name) => new RegExp(`[?&]${name}=0\\b`).test(search);
  return {
    dayNight: !off('daynight'),
    trails: !off('trails'),
    quakeRings: !off('quakerings'),
  };
}
