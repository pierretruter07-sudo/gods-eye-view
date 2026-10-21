/**
 * Adaptive render quality as a ladder of levels, best first. The display's
 * native resolution is ALWAYS kept, so text, icons and edges stay crisp
 * (Pierre, 21 Oct: "keep native resolution"). On slow frames the ladder
 * sheds, in order: sun shadows, then the bloom effect, then multisample
 * anti-aliasing, then 3D tile detail. Pure: no Cesium, no DOM.
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
  /** After a level proved too slow, don't climb back to it for this long
   * (each change reallocates the framebuffers: a bounce is a hitch). */
  failedLevelHoldMs: 3 * 60_000,
});

/** Quality levels for a display, best first. All at native resolution. */
export function qualityLevels(devicePixelRatio = 1) {
  const native = Math.min(QUALITY.maxRatio, Math.max(1, devicePixelRatio || 1));
  // sse: 3D tile detail (maximumScreenSpaceError; Cesium's default is 16).
  // shadows: sun shadows on the 3D city, the costliest extra (another
  // render of the close-in city from the Sun's side), dropped first.
  return [
    { ratio: native, msaa: 4, effects: true, shadows: true, sse: 16 },
    { ratio: native, msaa: 2, effects: true, shadows: true, sse: 16 },
    { ratio: native, msaa: 2, effects: true, shadows: false, sse: 16 },
    { ratio: native, msaa: 2, effects: false, sse: 16 },
    { ratio: native, msaa: 1, effects: false, sse: 16 },
    { ratio: native, msaa: 1, effects: false, sse: 20 },
    { ratio: native, msaa: 1, effects: false, sse: 24 },
  ];
}

/** Start one step below the best: crisp, anti-aliased, with headroom. */
export const START_LEVEL = 1;

/**
 * One measurement window → next state. With `now` (ms), a level that was
 * just dropped from is not climbed back to for QUALITY.failedLevelHoldMs,
 * so a GPU on the edge settles instead of bouncing between two levels.
 * @param {{level:number, good:number, bad:number, noRaise?: {level:number, until:number}}} state
 * @param {number} fps
 * @param {number} levelCount
 * @param {number} [now]
 */
export function nextQuality(state, fps, levelCount, now) {
  const { level } = state;
  const timed = Number.isFinite(now);
  const noRaise = state.noRaise;
  if (fps < QUALITY.lowFps) {
    const bad = state.bad + 1;
    if (bad >= QUALITY.badWindowsToDrop && level < levelCount - 1)
      return {
        level: level + 1,
        good: 0,
        bad: 0,
        noRaise: timed
          ? { level, until: now + QUALITY.failedLevelHoldMs }
          : noRaise,
      };
    return { level, good: 0, bad, noRaise };
  }
  if (fps > QUALITY.highFps) {
    const good = state.good + 1;
    if (good >= QUALITY.goodWindowsToRaise && level > 0) {
      const target = level - 1;
      if (timed && noRaise?.level === target && now < noRaise.until)
        return { level, good: 0, bad: 0, noRaise };
      return { level: target, good: 0, bad: 0, noRaise };
    }
    return { level, good, bad: 0, noRaise };
  }
  return { level, good: 0, bad: 0, noRaise };
}
