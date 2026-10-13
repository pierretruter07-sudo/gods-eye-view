/**
 * Adaptive render quality. Rendering cost scales with pixel count, so the
 * one dial that reliably buys frame rate is the render pixel ratio
 * (render pixels per CSS pixel). Start crisp, step down when the frame rate
 * sags, step back up when there is headroom. Pure: no Cesium, no DOM.
 */
export const QUALITY = Object.freeze({
  /** Never render sharper than this many pixels per CSS pixel. */
  maxRatio: 1.5,
  /** Never render softer than this (FXAA keeps it clean). */
  minRatio: 0.7,
  step: 0.15,
  /** Step down below this FPS… */
  lowFps: 42,
  /** …step up above this FPS, after this many good windows in a row. */
  highFps: 57,
  goodWindowsToRaise: 4,
});

/** Starting ratio for a display: crisp, but never above maxRatio. */
export function initialRatio(devicePixelRatio = 1) {
  return Math.min(QUALITY.maxRatio, Math.max(1, devicePixelRatio || 1));
}

/**
 * One measurement window → next state.
 * @param {{ratio:number, good:number, ceiling:number}} state
 * @param {number} fps measured over the window (continuous rendering only)
 */
export function nextQuality(state, fps) {
  const { ratio, good, ceiling } = state;
  if (fps < QUALITY.lowFps && ratio > QUALITY.minRatio) {
    return { ratio: Math.max(QUALITY.minRatio, +(ratio - QUALITY.step).toFixed(2)), good: 0, ceiling };
  }
  if (fps > QUALITY.highFps && ratio < ceiling) {
    const g = good + 1;
    if (g >= QUALITY.goodWindowsToRaise)
      return { ratio: Math.min(ceiling, +(ratio + QUALITY.step).toFixed(2)), good: 0, ceiling };
    return { ratio, good: g, ceiling };
  }
  return { ratio, good: 0, ceiling };
}
