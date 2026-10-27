/**
 * @file Focus camera: frame one asset and orbit it, the way game and 3D
 * editors do (Unity, Unreal and Blender "frame selected", Google Earth's
 * fly-to), so the viewer never loses their bearings around a subject
 * (Pierre, 28 Oct: "the second I rotate to an asset or focus on an asset
 * ... it is exceptionally hard to maintain your bearings").
 *
 * Rules, from common game-camera practice:
 *  - one pivot: while focused, everything turns about the asset, never about
 *    whatever happens to be under the cursor, and the camera stays upright
 *    (no roll) with the tilt held between near-overhead and just above the
 *    horizon;
 *  - damped, not snapped: the camera eases onto the asset and onto every
 *    change (a critically damped follow), and follows a moving asset the
 *    same way, so nothing jumps;
 *  - nothing moves on its own: no automatic spin, the asset stays where the
 *    viewer put it;
 *  - one clear way out: Esc, the Home key or any pan hands the free camera
 *    back exactly where it is.
 *
 * Mouse while focused: left drag orbits (sideways turns, up and down tilts),
 * the wheel moves closer or further. Right or middle drag pans away, which
 * ends the focus. The maths is plain numbers so it is tested in node.
 * @module shell/focusCamera
 */

export const FOCUS = Object.freeze({
  /** Degrees of turn per pixel of drag. */
  degPerPx: 0.3,
  /** Pitch limits (degrees, negative looks down). */
  minPitchDeg: -88,
  maxPitchDeg: -4,
  /** Closest and furthest (metres from the asset). */
  minRangeM: 40,
  maxRangeM: 8_000_000,
  /** Wheel: the range changes by e^(delta·k). */
  wheelK: 0.0015,
  /** Damping time constants (seconds): the aim and the framing. */
  aimTauS: 0.25,
  frameTauS: 0.35,
});

/** Clamp the framing to the rules. */
export function clampFrame(f, rules = FOCUS) {
  return {
    headingDeg: ((f.headingDeg % 360) + 360) % 360,
    pitchDeg: Math.min(
      rules.maxPitchDeg,
      Math.max(rules.minPitchDeg, f.pitchDeg),
    ),
    rangeM: Math.min(rules.maxRangeM, Math.max(rules.minRangeM, f.rangeM)),
  };
}

/** A left drag of (dx, dy) pixels: drag right turns the view right. */
export function dragFrame(f, dx, dy, rules = FOCUS) {
  return clampFrame(
    {
      headingDeg: f.headingDeg + dx * rules.degPerPx,
      pitchDeg: f.pitchDeg - dy * rules.degPerPx,
      rangeM: f.rangeM,
    },
    rules,
  );
}

/** A wheel step (deltaY > 0 moves away, as in every map). */
export function wheelFrame(f, deltaY, rules = FOCUS) {
  return clampFrame(
    { ...f, rangeM: f.rangeM * Math.exp(deltaY * rules.wheelK) },
    rules,
  );
}

/** Shortest signed turn from a to b (degrees). */
export function turnBetween(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * One damped step of the framing towards the wanted one (exponential
 * smoothing; heading takes the short way round, range eases in log space).
 */
export function easeFrame(now, want, dtS, tauS = FOCUS.frameTauS) {
  const k = tauS > 0 ? 1 - Math.exp(-Math.max(0, dtS) / tauS) : 1;
  return {
    headingDeg:
      now.headingDeg + turnBetween(now.headingDeg, want.headingDeg) * k,
    pitchDeg: now.pitchDeg + (want.pitchDeg - now.pitchDeg) * k,
    rangeM: Math.exp(
      Math.log(now.rangeM) + (Math.log(want.rangeM) - Math.log(now.rangeM)) * k,
    ),
  };
}

/**
 * @param {{viewer: object, Cesium: object, rules?: typeof FOCUS,
 *   onChange?: (state: {active: boolean, label: string}) => void}} options
 */
export function createFocusCamera({
  viewer,
  Cesium,
  rules = FOCUS,
  onChange = () => {},
}) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  const canvas = viewer.canvas;
  const controller = scene.screenSpaceCameraController;
  let active = null; // { locate, want, now, aim, label, last }
  let remove = null;
  let drag = null;

  const toDeg = (r) => (r * 180) / Math.PI;
  const toRad = (d) => (d * Math.PI) / 180;

  function frameToCamera(f) {
    return new Cesium.HeadingPitchRange(
      toRad(f.headingDeg),
      toRad(f.pitchDeg),
      f.rangeM,
    );
  }

  function tick() {
    if (!active) return;
    const t = performance.now();
    const dt = Math.min(0.1, (t - active.last) / 1000);
    active.last = t;
    let target = null;
    try {
      target = active.locate(new Cesium.Cartesian3());
    } catch {
      target = null;
    }
    if (target) {
      // Damped aim: the camera glides onto the asset and stays with it.
      const k = 1 - Math.exp(-dt / rules.aimTauS);
      const gap = Cesium.Cartesian3.distance(active.aim, target);
      if (gap > 2_000_000) Cesium.Cartesian3.clone(target, active.aim);
      else Cesium.Cartesian3.lerp(active.aim, target, k, active.aim);
    }
    active.now = easeFrame(active.now, active.want, dt, rules.frameTauS);
    camera.lookAt(active.aim, frameToCamera(active.now));
  }

  function onPointerDown(event) {
    if (!active) return;
    const pan =
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && (event.shiftKey || event.ctrlKey));
    if (pan) {
      // Panning leaves the asset: the free camera takes this drag.
      release('pan');
      return;
    }
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event) {
    if (!active || !drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    active.want = dragFrame(active.want, dx, dy, rules);
    // Orbiting follows the hand directly; only the target eases.
    active.now = { ...active.want, rangeM: active.now.rangeM };
  }
  function onPointerUp(event) {
    if (drag && event.pointerId === drag.id) drag = null;
  }
  function onWheel(event) {
    if (!active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    active.want = wheelFrame(active.want, delta, rules);
  }

  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  canvas.addEventListener('pointermove', onPointerMove, { capture: true });
  canvas.addEventListener('pointerup', onPointerUp, { capture: true });
  canvas.addEventListener('pointercancel', onPointerUp, { capture: true });
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });

  /**
   * Frame an asset and orbit it. `locate(result)` returns where it is drawn
   * now (a Cartesian3) or null; `frame` the wanted range and pitch.
   */
  function focus(locate, { rangeM = 20_000, pitchDeg = -30, label = '' } = {}) {
    if (typeof locate !== 'function') return false;
    const first = locate(new Cesium.Cartesian3());
    if (!first) return false;
    try {
      camera.cancelFlight();
    } catch {
      /* no flight */
    }
    const from = camera.positionWC;
    const distance = Cesium.Cartesian3.distance(from, first);
    // Start from where the camera is looking now, at the asset's distance,
    // so the move is one smooth glide rather than a jump.
    const aim = Cesium.Cartesian3.add(
      from,
      Cesium.Cartesian3.multiplyByScalar(
        camera.directionWC,
        distance,
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );
    const now = clampFrame(
      {
        headingDeg: toDeg(camera.heading),
        pitchDeg: Math.min(-10, toDeg(camera.pitch)),
        rangeM: distance,
      },
      rules,
    );
    const want = clampFrame(
      { headingDeg: now.headingDeg, pitchDeg, rangeM },
      rules,
    );
    const wasActive = Boolean(active);
    active = { locate, want, now, aim, label, last: performance.now() };
    if (!wasActive) {
      controller.enableInputs = false;
      remove = scene.preRender.addEventListener(tick);
    }
    scene.requestRender?.();
    onChange({ active: true, label });
    return true;
  }

  /** Hand the free camera back where it is. */
  function release(reason = 'user') {
    if (!active) return false;
    active = null;
    drag = null;
    remove?.();
    remove = null;
    try {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch {
      /* viewer torn down */
    }
    controller.enableInputs = true;
    onChange({ active: false, label: '', reason });
    return true;
  }

  /** Keyboard while focused: turn, tilt and zoom about the asset. */
  function nudge({ turnDeg = 0, tiltDeg = 0, zoom = 0 } = {}) {
    if (!active) return false;
    active.want = clampFrame(
      {
        headingDeg: active.want.headingDeg + turnDeg,
        pitchDeg: active.want.pitchDeg + tiltDeg,
        rangeM: active.want.rangeM * Math.exp(-zoom),
      },
      rules,
    );
    return true;
  }

  /** Face north (keep the asset, the tilt and the distance). */
  function faceNorth() {
    if (!active) return false;
    active.want = { ...active.want, headingDeg: 0 };
    return true;
  }

  function destroy() {
    release('destroy');
    canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
    canvas.removeEventListener('pointermove', onPointerMove, { capture: true });
    canvas.removeEventListener('pointerup', onPointerUp, { capture: true });
    canvas.removeEventListener('pointercancel', onPointerUp, { capture: true });
    canvas.removeEventListener('wheel', onWheel, { capture: true });
  }

  return {
    focus,
    release,
    nudge,
    faceNorth,
    destroy,
    isActive: () => Boolean(active),
    label: () => active?.label || '',
  };
}
