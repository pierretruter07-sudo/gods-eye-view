/** Pure idle-spin policy (no Cesium), shared by the spinner and tests. */
/** Degrees of longitude per second the globe turns while idle. */
export const IDLE_SPIN_DEG_PER_S = 2;
/** Seconds without input before the spin starts (or resumes). */
export const IDLE_SPIN_DELAY_S = 4;
/** Only spin when the camera is this high — i.e. a whole-globe view. */
export const IDLE_SPIN_MIN_HEIGHT_M = 5_000_000;

/**
 * Pure gate: should the globe be turning right now? Never once the user has
 * moved the camera themselves (`navigated`): from then on the camera stays
 * exactly where they leave it.
 */
export function shouldSpin({ idleS, heightM, blocked, navigated = false }) {
  return (
    !blocked &&
    !navigated &&
    idleS >= IDLE_SPIN_DELAY_S &&
    heightM >= IDLE_SPIN_MIN_HEIGHT_M
  );
}
