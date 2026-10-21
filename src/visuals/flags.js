/**
 * @file Which world visuals are on, from the page URL.
 * @module visuals/flags
 */

/**
 * Which parts are on, from the page URL (`?<name>=0` turns one off). Sun
 * shadows (`?shadows=0`), the night-side city (`?nightcity=0`) and the
 * Milky Way sky (`?stars=0`) are on by default. The quake shockwave rings
 * are off unless asked for (`?quakerings=1`): the Director's alert is one
 * glass sphere (Pierre, 21 Oct: "too much").
 */
export function visualFlags(search = '') {
  const off = (name) => new RegExp(`[?&]${name}=0\\b`).test(search);
  const on = (name) => new RegExp(`[?&]${name}=1\\b`).test(search);
  return {
    dayNight: !off('daynight'),
    trails: !off('trails'),
    quakeRings: on('quakerings'),
    shadows: !off('shadows'),
    nightCity: !off('nightcity'),
    stars: !off('stars'),
  };
}
