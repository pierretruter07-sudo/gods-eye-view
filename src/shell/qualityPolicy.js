/**
 * Adaptive render quality as a ladder of levels, best first. Native device
 * resolution keeps text, icons and edges crisp, so it is held as long as
 * possible: the ladder first trades away multisample anti-aliasing, and only
 * drops below native resolution when the frame rate is really suffering —
 * and never below CSS resolution. The last rungs also coarsen 3D tile detail. Pure: no Cesium, no DOM.
 */
export const QUALITY = Object.freeze({
  /** Step down after this many windows below lowFps in a row. */
  lowFps: 40,
  badWindowsToDrop: 2,
  /** Step up after this many windows above highFps in a row. */
  highFps: 56,
  goodWindowsToRaise: 4,
  /** Never render sharper than this many pixels per CSS pixel. */
  maxRatio: 2,
});

/** Quality levels for a display, best first. */
export function qualityLevels(devicePixelRatio = 1) {
  const native = Math.min(QUALITY.maxRatio, Math.max(1, devicePixelRatio || 1));
  const levels = [
    { ratio: native, msaa: 4 },
    { ratio: native, msaa: 2 },
    { ratio: native, msaa: 1 },
  ];
  if (native > 1.15)
    levels.push({ ratio: +Math.max(1, native * 0.85).toFixed(2), msaa: 1 });
  if (native > 1) levels.push({ ratio: 1, msaa: 1 });
  // 3D tile detail (maximumScreenSpaceError; Cesium's default is 16). Lower
  // resolution barely reduces tile loading, because Cesium scales the error
  // by the pixel ratio, so the bottom rungs also ask for coarser tiles.
  return levels.map((l, i) => ({
    ...l,
    sse: i === levels.length - 1 ? 24 : i >= 3 ? 20 : 16,
  }));
}

/** Start one step below the best: crisp, anti-aliased, with headroom. */
export const START_LEVEL = 1;

/**
 * One measurement window → next state.
 * @param {{level:number, good:number, bad:number}} state
 * @param {number} fps
 * @param {number} levelCount
 */
export function nextQuality(state, fps, levelCount) {
  const { level } = state;
  if (fps < QUALITY.lowFps) {
    const bad = state.bad + 1;
    if (bad >= QUALITY.badWindowsToDrop && level < levelCount - 1)
      return { level: level + 1, good: 0, bad: 0 };
    return { level, good: 0, bad };
  }
  if (fps > QUALITY.highFps) {
    const good = state.good + 1;
    if (good >= QUALITY.goodWindowsToRaise && level > 0)
      return { level: level - 1, good: 0, bad: 0 };
    return { level, good, bad: 0 };
  }
  return { level, good: 0, bad: 0 };
}
