import * as Cesium from 'cesium';
import { holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';

import { IDLE_SPIN_DEG_PER_S, shouldSpin } from './idleSpinPolicy.js';

const HOLD = 'gev-idle-spin';

/**
 * Slowly turns the globe (west → east, like the real Earth from space) while
 * nobody is touching it and the camera is zoomed out. Any input stops it at
 * once; it resumes a few seconds after the last input.
 * @param {{viewer: Cesium.Viewer, isBlocked: () => boolean}} options
 */
export function installIdleSpin({ viewer, isBlocked = () => false }) {
  const scene = viewer.scene;
  let lastInput = performance.now();
  let lastFrame = null;
  let holding = false;

  const poke = () => {
    lastInput = performance.now();
  };
  const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
  for (const e of events) window.addEventListener(e, poke, { passive: true, capture: true });

  function setHold(on) {
    if (on === holding) return;
    holding = on;
    if (on) holdContinuousRender(HOLD);
    else releaseContinuousRender(HOLD);
  }

  const timer = setInterval(() => {
    // Wake the render loop when spinning should begin.
    const heightM = scene.camera.positionCartographic?.height ?? 0;
    const idleS = (performance.now() - lastInput) / 1000;
    const flying = !!viewer.camera._currentFlight;
    setHold(shouldSpin({ idleS, heightM, blocked: flying || isBlocked() }));
  }, 500);

  const remove = scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = lastFrame == null ? 0 : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!holding || !dt) return;
    const heightM = scene.camera.positionCartographic?.height ?? 0;
    const idleS = (now - lastInput) / 1000;
    if (!shouldSpin({ idleS, heightM, blocked: !!viewer.camera._currentFlight || isBlocked() })) return;
    // Rotating the camera about the polar axis the opposite way makes the
    // globe appear to turn eastward.
    scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -Cesium.Math.toRadians(IDLE_SPIN_DEG_PER_S * dt));
  });

  return () => {
    clearInterval(timer);
    remove();
    setHold(false);
    for (const e of events) window.removeEventListener(e, poke, { capture: true });
  };
}
