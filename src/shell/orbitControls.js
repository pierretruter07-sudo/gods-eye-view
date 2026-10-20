/**
 * @file Globe navigation that always pivots on the Earth's centre (Pierre,
 * 21 Oct: "the focal point of the camera should always be the centre of the
 * planet ... with the exception of when you pan").
 *
 * Cesium's default mouse controls pick a point under the cursor and rotate,
 * tilt and zoom about it. With the Google 3D city and a hidden globe that
 * point is often a building, the horizon or empty space, so a drag swung the
 * view about a point that seemed random. Mouse input is handled here instead:
 *
 * - left drag: turn the globe about its axis and centre (north stays up), so
 *   the surface follows the cursor at any height, with a little inertia;
 * - right drag: sideways turns the view about the line from the Earth's
 *   centre through the camera (heading); up and down zooms;
 * - middle drag, or Shift + left drag: pan (the one move that leaves the
 *   centre);
 * - wheel or trackpad pinch: zoom straight towards or away from the centre,
 *   never below the 3D city's roofs.
 *
 * Touch keeps Cesium's own gestures (pinch, two-finger turn). Following an
 * aircraft (a tracked entity) keeps Cesium's tracking controls, and anything
 * that switches camera input off (`enableInputs = false`) is respected.
 * @module shell/orbitControls
 */

export const ORBIT = Object.freeze({
  /** Inertia: the share of the spin kept each frame after release. */
  inertia: 0.9,
  /** Stop coasting below this angular speed (radians per frame). */
  inertiaFloor: 1e-5,
  /** Wheel: share of the height moved per 100 wheel units. */
  zoomPer100: 0.18,
  /** Closest the camera comes to the surface beneath it (metres). */
  minAboveSurfaceM: 80,
  /** Furthest from the surface (metres). */
  maxHeightM: 60_000_000,
});

const EARTH_RADIUS_M = 6_371_000;

/**
 * Radians of globe rotation per screen pixel at a camera height, so the
 * ground under the cursor follows it: the view spans about 2·h·tan(fov/2)
 * metres of ground across the screen when close, and the whole globe (about
 * π) when far.
 * @param {number} heightM camera height above the surface
 * @param {number} fovY vertical field of view (radians)
 * @param {number} screenPx canvas height in CSS pixels
 */
export function radiansPerPixel(heightM, fovY, screenPx) {
  const h = Math.max(1, heightM);
  const span = (2 * h * Math.tan(fovY / 2)) / EARTH_RADIUS_M;
  return Math.min(span, Math.PI * 1.1) / Math.max(1, screenPx);
}

/** Metres of ground per screen pixel at a camera height (for pan). */
export function metresPerPixel(heightM, fovY, screenPx) {
  return (
    (2 * Math.max(1, heightM) * Math.tan(fovY / 2)) / Math.max(1, screenPx)
  );
}

/**
 * The height change for a wheel step: zooming in moves a share of the
 * height (so it slows near the ground), never below the floor.
 * @returns {number} metres to move towards the centre (negative: away)
 */
export function wheelStep(deltaY, heightM, floorM, rules = ORBIT) {
  const share =
    1 - Math.exp((-Math.abs(deltaY) / 100) * rules.zoomPer100 * 1.1);
  const move = heightM * Math.min(0.6, share) * Math.sign(-deltaY || 0);
  if (move > 0) return Math.min(move, Math.max(0, heightM - floorM));
  return Math.max(move, -(rules.maxHeightM - heightM));
}

/**
 * Install the controls. Returns a disposer.
 * @param {object} viewer a Cesium Viewer
 * @param {object} Cesium the Cesium namespace
 * @param {{releaseFrame?: () => boolean, rules?: typeof ORBIT}} [options]
 *   releaseFrame: true when a camera frame left by the Director may be
 *   dropped on the first drag (the Director stops on any input)
 */
export function installOrbitControls(
  viewer,
  Cesium,
  { releaseFrame = () => false, rules = ORBIT } = {},
) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  const canvas = viewer.canvas;
  const controller = scene.screenSpaceCameraController;
  const MOUSE_FLAGS = [
    'enableRotate',
    'enableTilt',
    'enableTranslate',
    'enableZoom',
    'enableLook',
  ];
  const saved = Object.fromEntries(MOUSE_FLAGS.map((f) => [f, controller[f]]));
  camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;

  /** Ours to drive: no tracking, camera input on, the plain world frame. */
  const ours = () =>
    controller.enableInputs !== false &&
    !viewer.trackedEntity &&
    Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY);

  /** Hand mouse input to Cesium (touch, tracking) or take it ourselves. */
  function cesiumMouse(on) {
    for (const f of MOUSE_FLAGS) controller[f] = on ? saved[f] : false;
  }
  cesiumMouse(false);

  const heightM = () => Math.max(1, camera.positionCartographic?.height ?? 1);
  const fov = () => camera.frustum?.fovy ?? camera.frustum?.fov ?? 1.0;
  const screenPx = () => canvas.clientHeight || 800;
  const render = () => scene.requestRender?.();

  /** The 3D city's surface under the camera, when 3D tiles are loaded. */
  function surfaceBelow() {
    try {
      if (!scene.sampleHeightSupported) return 0;
      const c = camera.positionCartographic;
      const h = scene.sampleHeight(
        new Cesium.Cartographic(c.longitude, c.latitude),
      );
      return Number.isFinite(h) ? h : 0;
    } catch {
      return 0;
    }
  }

  function spin(dxPx, dyPx) {
    const k = radiansPerPixel(heightM(), fov(), screenPx());
    // Dragging right moves the camera west and dragging down moves it
    // north, so the ground under the cursor follows it.
    if (dxPx) camera.rotateLeft(dxPx * k);
    if (dyPx) camera.rotateUp(-dyPx * k);
    render();
    return { x: dxPx * k, y: -dyPx * k };
  }
  function turn(dxPx) {
    const axis = Cesium.Cartesian3.normalize(
      camera.positionWC,
      new Cesium.Cartesian3(),
    );
    camera.rotate(
      axis,
      (dxPx / Math.max(1, canvas.clientWidth || 1200)) * Math.PI,
    );
    render();
  }
  function pan(dxPx, dyPx) {
    const m = metresPerPixel(heightM(), fov(), screenPx());
    if (dxPx) camera.moveLeft(dxPx * m);
    if (dyPx) camera.moveUp(dyPx * m);
    render();
  }
  function zoomBy(deltaY) {
    const h = heightM();
    const floor =
      surfaceBelow() +
      Math.max(rules.minAboveSurfaceM, controller.minimumZoomDistance || 0);
    const move = wheelStep(deltaY, h, floor, rules);
    if (!move) return;
    const toCentre = Cesium.Cartesian3.negate(
      Cesium.Cartesian3.normalize(camera.positionWC, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    camera.move(toCentre, move);
    render();
  }

  // ── Coasting after a spin ─────────────────────────────────────────────
  let coast = 0;
  let velocity = { x: 0, y: 0 };
  function stopCoast() {
    cancelAnimationFrame(coast);
    coast = 0;
  }
  function startCoast() {
    stopCoast();
    const step = () => {
      velocity = {
        x: velocity.x * rules.inertia,
        y: velocity.y * rules.inertia,
      };
      if (Math.hypot(velocity.x, velocity.y) < rules.inertiaFloor || !ours()) {
        coast = 0;
        return;
      }
      camera.rotateLeft(velocity.x);
      camera.rotateUp(velocity.y);
      render();
      coast = requestAnimationFrame(step);
    };
    coast = requestAnimationFrame(step);
  }

  // ── Pointer input ─────────────────────────────────────────────────────
  let drag = null; // { id, mode, x, y, t }
  function onDown(event) {
    stopCoast();
    // The Director aims the camera from its subject's frame; the first drag
    // that stops it starts from the plain world frame.
    if (
      !viewer.trackedEntity &&
      controller.enableInputs !== false &&
      !Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY) &&
      releaseFrame()
    ) {
      try {
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } catch {
        /* viewer torn down */
      }
    }
    if (event.pointerType === 'touch' || !ours()) {
      // Touch gestures and tracking stay with Cesium.
      cesiumMouse(true);
      return;
    }
    cesiumMouse(false);
    const mode =
      event.button === 1 || (event.button === 0 && event.shiftKey)
        ? 'pan'
        : event.button === 2
          ? 'turn'
          : event.button === 0
            ? 'spin'
            : null;
    if (!mode) return;
    drag = {
      id: event.pointerId,
      mode,
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
    };
    velocity = { x: 0, y: 0 };
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture not available */
    }
  }
  function onMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!ours()) {
      drag = null;
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.t = now;
    if (!dx && !dy) return;
    if (drag.mode === 'spin') {
      const moved = spin(dx, dy);
      // Per-frame velocity (about 16 ms), smoothed.
      const f = 16 / dt;
      velocity = {
        x: velocity.x * 0.5 + moved.x * f * 0.5,
        y: velocity.y * 0.5 + moved.y * f * 0.5,
      };
    } else if (drag.mode === 'turn') {
      if (Math.abs(dx) >= Math.abs(dy)) turn(dx);
      else zoomBy(-dy * 2);
    } else pan(dx, dy);
  }
  function onUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const wasSpin = drag.mode === 'spin';
    const idleMs = performance.now() - drag.t;
    drag = null;
    // Coast only after a flick, not after holding still.
    if (wasSpin && idleMs < 80) startCoast();
  }
  function onWheel(event) {
    if (!ours()) {
      cesiumMouse(true);
      return;
    }
    event.preventDefault();
    stopCoast();
    const scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    // Trackpad pinch arrives as Ctrl+wheel, already scaled up by the
    // viewer's pinch relay (app/viewer.js).
    zoomBy(event.deltaY * scale);
  }
  const noMenu = (event) => event.preventDefault();

  /** Diagnostics: where the camera is (degrees, metres). */
  function state() {
    const c = camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
      heightM: c.height,
      centreDistanceM: Cesium.Cartesian3.magnitude(camera.positionWC),
      headingDeg: Cesium.Math.toDegrees(camera.heading),
      pitchDeg: Cesium.Math.toDegrees(camera.pitch),
    };
  }
  globalThis.__gevOrbit = { state };

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);

  return () => {
    stopCoast();
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', noMenu);
    cesiumMouse(true);
    if (globalThis.__gevOrbit?.state === state) delete globalThis.__gevOrbit;
  };
}
