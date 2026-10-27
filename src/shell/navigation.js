/**
 * @file Free 3D navigation, like Google Earth or any 3D map (Pierre, 28 Oct:
 * "I can't pan, it's always rotating weird ... don't make the earth the
 * centre focus point, just make it free navigation").
 *
 * The previous controls (orbitControls.js) turned the camera about the
 * Earth's centre on every left drag (`camera.rotateLeft/rotateUp` with the
 * polar axis constrained), turned the heading about the centre-to-camera
 * line on a right drag, and zoomed straight down towards the centre. In a
 * tilted city view that swings the camera round the planet instead of
 * sliding over the ground, so panning never felt like panning.
 *
 * Mouse and touch now go to Cesium's own ScreenSpaceCameraController, mapped
 * so that:
 *
 * - left drag rotates: sideways turns and up-and-down tilts about the
 *   point under the cursor (never about the Earth's centre);
 * - right drag, middle drag, or Shift/Ctrl + left drag pans: the point you
 *   grab stays under the cursor (on the 3D city, terrain or the globe);
 * - Alt + left drag looks around from where the camera is;
 * - the wheel and trackpad pinch zoom towards the point under the cursor,
 *   slower near the ground and never through the 3D city;
 * - touch: one finger rotates, pinch zooms and turns.
 *
 * Inertia is short (a flick glides for a fraction of a second; a held drag
 * stops where you let go) and nothing moves the camera on its own after the
 * user has touched it. The keyboard pans, turns, tilts and zooms too. Any
 * flight in progress (a search, an asset fly-to) is cancelled by the first
 * input, so the camera never fights the user.
 *
 * The maths for the keyboard is plain vectors (no Cesium) so it is tested
 * in node; the installer takes the Cesium namespace as an argument.
 * @module shell/navigation
 */

export const NAV = Object.freeze({
  /** Cesium inertia coefficients (0 = none, 1 = forever). A flick glides
   * for about 0.15 s; the wheel keeps a little more so zooming is smooth. */
  inertiaSpin: 0.75,
  inertiaTranslate: 0.75,
  inertiaZoom: 0.8,
  /** Closest the camera comes to the surface or the 3D city (metres). */
  minimumZoomDistanceM: 25,
  /** Furthest from the surface (metres). */
  maximumZoomDistanceM: 60_000_000,
  keys: Object.freeze({
    /** Pan speed: this share of the camera height per second... */
    panShareOfHeightPerS: 0.9,
    /** ...but never more than this angle of the globe per second (orbit). */
    maxPanRadPerS: 0.6,
    /** Q/E: degrees of heading per second. */
    turnDegPerS: 60,
    /** R/F: degrees of tilt per second. */
    tiltDegPerS: 45,
    /** +/-: the distance to the target shrinks by e^(rate·t). */
    zoomRatePerS: 1.6,
    /** Tilt limits: straight down to just above the horizon. */
    minPitchDeg: -89.5,
    maxPitchDeg: -2,
  }),
});

const EARTH_RADIUS_M = 6_371_000;

// ── Cesium mouse and touch mapping ────────────────────────────────────────

/** The event mapping for Cesium's ScreenSpaceCameraController. */
export function cesiumEventMapping(Cesium) {
  const T = Cesium.CameraEventType;
  const M = Cesium.KeyboardEventModifier;
  return {
    // Standard 3D mouse navigation (Pierre, 28 Oct): left drag rotates,
    // right drag, middle drag or Shift/Ctrl + left drag pans, wheel zooms.
    // Pan: grab the ground; the point you grab stays under the cursor.
    rotateEventTypes: [
      T.RIGHT_DRAG,
      T.MIDDLE_DRAG,
      { eventType: T.LEFT_DRAG, modifier: M.SHIFT },
      { eventType: T.LEFT_DRAG, modifier: M.CTRL },
    ],
    // Rotate: left drag turns (sideways) and tilts (up and down) about the
    // point under the cursor, never about the Earth's centre.
    tiltEventTypes: [T.LEFT_DRAG, T.PINCH],
    // Wheel and pinch zoom towards the cursor. Ctrl+wheel is the trackpad
    // pinch (relayed by app/viewer.js). No drag zooms.
    zoomEventTypes: [
      T.WHEEL,
      T.PINCH,
      { eventType: T.WHEEL, modifier: M.CTRL },
    ],
    // Alt+left drag: look around from where the camera is.
    lookEventTypes: [{ eventType: T.LEFT_DRAG, modifier: M.ALT }],
    // Columbus view / 2D only: pans like the 3D pan.
    translateEventTypes: [T.RIGHT_DRAG, T.MIDDLE_DRAG],
  };
}

const CONTROLLER_FIELDS = [
  'enableRotate',
  'enableTilt',
  'enableTranslate',
  'enableZoom',
  'enableLook',
  'rotateEventTypes',
  'tiltEventTypes',
  'zoomEventTypes',
  'lookEventTypes',
  'translateEventTypes',
  'inertiaSpin',
  'inertiaTranslate',
  'inertiaZoom',
  'minimumZoomDistance',
  'maximumZoomDistance',
  'enableCollisionDetection',
];

/**
 * Configure Cesium's controller for free navigation. Returns a function
 * that puts every changed field back.
 */
export function configureCesiumNavigation(controller, Cesium, rules = NAV) {
  const saved = Object.fromEntries(
    CONTROLLER_FIELDS.map((f) => [f, controller[f]]),
  );
  Object.assign(controller, cesiumEventMapping(Cesium), {
    enableRotate: true,
    enableTilt: true,
    enableTranslate: true,
    enableZoom: true,
    enableLook: true,
    inertiaSpin: rules.inertiaSpin,
    inertiaTranslate: rules.inertiaTranslate,
    inertiaZoom: rules.inertiaZoom,
    minimumZoomDistance: rules.minimumZoomDistanceM,
    maximumZoomDistance: rules.maximumZoomDistanceM,
    enableCollisionDetection: true,
  });
  return () => Object.assign(controller, saved);
}

// ── Keyboard ──────────────────────────────────────────────────────────────

// Held keys move the camera; the layout follows common game and globe
// conventions (WASD or arrows move, Q/E turn, Shift + arrows tilt and turn
// as in Google Earth). F, N, U, H and Esc are single-press commands.
const KEY_ACTIONS = Object.freeze({
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'back',
  KeyS: 'back',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyQ: 'turnLeft',
  KeyE: 'turnRight',
  KeyZ: 'tiltUp',
  KeyX: 'tiltDown',
  PageUp: 'tiltUp',
  PageDown: 'tiltDown',
  Equal: 'zoomIn',
  NumpadAdd: 'zoomIn',
  Minus: 'zoomOut',
  NumpadSubtract: 'zoomOut',
});
const SHIFT_ACTIONS = Object.freeze({
  ArrowUp: 'tiltUp',
  ArrowDown: 'tiltDown',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
});
const KEY_FALLBACK = Object.freeze({
  w: 'forward',
  s: 'back',
  a: 'left',
  d: 'right',
  q: 'turnLeft',
  e: 'turnRight',
  z: 'tiltUp',
  x: 'tiltDown',
  '+': 'zoomIn',
  '=': 'zoomIn',
  '-': 'zoomOut',
  _: 'zoomOut',
});
/** Single-press camera commands. */
const KEY_COMMANDS = Object.freeze({
  KeyF: 'focus',
  KeyN: 'north',
  KeyU: 'topDown',
  KeyH: 'home',
  Home: 'home',
  Escape: 'release',
});

/**
 * The navigation action for a key event, or null. Browser shortcuts (Ctrl,
 * Cmd or Alt held) are left alone.
 */
export function navKeyAction(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.shiftKey && SHIFT_ACTIONS[event.code])
    return SHIFT_ACTIONS[event.code];
  return (
    KEY_ACTIONS[event.code] ||
    KEY_ACTIONS[event.key] ||
    KEY_FALLBACK[String(event.key || '').toLowerCase()] ||
    null
  );
}

/** Every held action a key can stand for (released together on key up). */
export function navKeyActions(code) {
  return [KEY_ACTIONS[code], SHIFT_ACTIONS[code]].filter(Boolean);
}

/** The single-press command for a key event (F, N, U, H, Home, Esc), or null. */
export function navKeyCommand(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  return (
    KEY_COMMANDS[event.code] ||
    KEY_COMMANDS[event.key] ||
    { f: 'focus', n: 'north', u: 'topDown', h: 'home' }[
      String(event.key || '').toLowerCase()
    ] ||
    null
  );
}

/** Held actions that move the camera off the asset (pans). */
const PAN_ACTIONS = new Set(['forward', 'back', 'left', 'right']);

/** True when keys typed there belong to a text field or an open dialog. */
export function isTypingTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  try {
    return !!target.closest?.(
      '[contenteditable=""],[contenteditable="true"],[aria-modal="true"]',
    );
  } catch {
    return false;
  }
}

// ── Vector maths (plain {x, y, z}, Earth-centred metres) ──────────────────

export const vec = Object.freeze({
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  len: (a) => Math.hypot(a.x, a.y, a.z),
  norm(a) {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  },
  /** Rotate v about the unit axis k by angle (right hand, Rodrigues). */
  rotate(v, k, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const kxv = vec.cross(k, v);
    const kdv = vec.dot(k, v);
    return {
      x: v.x * c + kxv.x * s + k.x * kdv * (1 - c),
      y: v.y * c + kxv.y * s + k.y * kdv * (1 - c),
      z: v.z * c + kxv.z * s + k.z * kdv * (1 - c),
    };
  },
});

/** Pitch of a camera frame against the local vertical (radians, down < 0). */
export function pitchOf(frame) {
  const up = vec.norm(frame.position);
  return Math.asin(Math.max(-1, Math.min(1, vec.dot(frame.direction, up))));
}

/**
 * The first point where a ray meets a sphere about the Earth's centre, or
 * null when it misses (looking at the sky).
 */
export function raySphere(origin, direction, radius) {
  const b = vec.dot(origin, direction);
  const c = vec.dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t = -b - root > 0 ? -b - root : -b + root;
  return t > 0 ? vec.add(origin, vec.scale(direction, t)) : null;
}

function turnFrame(frame, origin, axis, angle) {
  const rel = vec.sub(frame.position, origin);
  return {
    position: vec.add(origin, vec.rotate(rel, axis, angle)),
    direction: vec.norm(vec.rotate(frame.direction, axis, angle)),
    up: vec.norm(vec.rotate(frame.up, axis, angle)),
  };
}

/**
 * Pan over the ground: slide the camera along the surface (forward is the
 * way it faces, flattened), keeping its height, tilt and heading. It moves
 * as a turn about the Earth's centre, so it works from street to orbit.
 * @param {{position, direction, up}} frame
 * @param {{forward: number, right: number}} input each -1..1
 * @param {number} dt seconds
 * @param {number} heightM camera height above the surface
 */
export function panFrame(
  frame,
  { forward = 0, right = 0 },
  dt,
  heightM,
  rules = NAV.keys,
) {
  if (!forward && !right) return frame;
  const n = vec.norm(frame.position);
  // Facing straight down, "forward" is the top of the screen.
  const flat = (v) => vec.sub(v, vec.scale(n, vec.dot(v, n)));
  let f = flat(frame.direction);
  if (vec.len(f) < 1e-3) f = flat(frame.up);
  f = vec.norm(f);
  const r = vec.norm(vec.cross(f, n));
  const t = vec.norm(vec.add(vec.scale(f, forward), vec.scale(r, right)));
  const rate = Math.min(
    rules.maxPanRadPerS,
    (rules.panShareOfHeightPerS * Math.max(1, heightM)) / EARTH_RADIUS_M,
  );
  const axis = vec.norm(vec.cross(n, t));
  return turnFrame(frame, { x: 0, y: 0, z: 0 }, axis, rate * dt);
}

/**
 * Turn the view about the vertical through a pivot (the point at the centre
 * of the screen; the camera itself when looking at the sky). Positive turns
 * left (heading decreases).
 */
export function turnAbout(frame, pivot, angle) {
  const p = pivot || frame.position;
  return turnFrame(frame, p, vec.norm(p), angle);
}

/**
 * Tilt about the horizontal through the pivot. Positive tilts up towards
 * the horizon. Returns null when the step would pass the tilt limits or
 * take the camera below `floorRadius` (metres from the centre).
 */
export function tiltAbout(
  frame,
  pivot,
  angle,
  { floorRadius = 0, rules = NAV.keys } = {},
) {
  const right = vec.norm(vec.cross(frame.direction, frame.up));
  const next = turnFrame(frame, pivot || frame.position, right, angle);
  const pitch = (pitchOf(next) * 180) / Math.PI;
  if (angle > 0 && pitch > rules.maxPitchDeg) return null;
  if (angle < 0 && pitch < rules.minPitchDeg) return null;
  if (vec.len(next.position) < floorRadius) return null;
  return next;
}

/**
 * Zoom towards the pivot (or along the view when there is none). `sign` is
 * +1 in, -1 out. Stops `minDistanceM` short of the pivot and inside
 * `maxRadius` from the centre.
 */
export function zoomToward(
  frame,
  pivot,
  sign,
  dt,
  {
    heightM,
    minDistanceM = NAV.minimumZoomDistanceM,
    maxRadius = Infinity,
    rules = NAV.keys,
  } = {},
) {
  const toward = pivot ? vec.sub(pivot, frame.position) : null;
  const dist = toward ? vec.len(toward) : Math.max(1, heightM ?? 1);
  const dir = toward ? vec.norm(toward) : frame.direction;
  const k = rules.zoomRatePerS * dt;
  let move = sign > 0 ? dist * (1 - Math.exp(-k)) : -dist * (Math.exp(k) - 1);
  if (sign > 0) move = Math.min(move, Math.max(0, dist - minDistanceM));
  if (!move) return frame;
  let position = vec.add(frame.position, vec.scale(dir, move));
  if (vec.len(position) > maxRadius)
    position = vec.scale(vec.norm(position), maxRadius);
  return { position, direction: frame.direction, up: frame.up };
}

/**
 * One frame of held keys → the new camera frame. `held` is a set of
 * actions; `pivot` the point at the screen centre (or null).
 */
export function keyFrame(
  frame,
  held,
  dt,
  {
    pivot = null,
    heightM = 1,
    floorRadius = 0,
    maxRadius = Infinity,
    rules = NAV,
  } = {},
) {
  const k = rules.keys;
  const has = (a) => held.has(a);
  let next = frame;
  const forward = (has('forward') ? 1 : 0) - (has('back') ? 1 : 0);
  const right = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
  let panned = false;
  if (forward || right) {
    next = panFrame(next, { forward, right }, dt, heightM, k);
    panned = true;
  }
  const deg = Math.PI / 180;
  const turn = (has('turnLeft') ? 1 : 0) - (has('turnRight') ? 1 : 0);
  if (turn)
    next = turnAbout(
      next,
      panned ? null : pivot,
      turn * k.turnDegPerS * deg * dt,
    );
  const tilt = (has('tiltUp') ? 1 : 0) - (has('tiltDown') ? 1 : 0);
  if (tilt)
    next =
      tiltAbout(next, panned ? null : pivot, tilt * k.tiltDegPerS * deg * dt, {
        floorRadius,
        rules: k,
      }) || next;
  const zoom = (has('zoomIn') ? 1 : 0) - (has('zoomOut') ? 1 : 0);
  if (zoom)
    next = zoomToward(next, panned ? null : pivot, zoom, dt, {
      heightM,
      minDistanceM: rules.minimumZoomDistanceM,
      maxRadius,
      rules: k,
    });
  return { frame: next, panned };
}

// ── Installer ─────────────────────────────────────────────────────────────

/**
 * Install free navigation. Returns a disposer.
 * @param {object} viewer a Cesium Viewer
 * @param {object} Cesium the Cesium namespace
 * @param {{releaseFrame?: () => boolean, onManualInput?: (reason: string) => void, rules?: typeof NAV}} [options]
 *   releaseFrame: true when a camera frame left by the Director may be
 *   dropped on the first input (the Director stops on any input);
 *   onManualInput: called when the keyboard moves the camera (the canvas's
 *   own pointer and wheel events already reach the Director and the HUD).
 */
export function installNavigation(
  viewer,
  Cesium,
  {
    releaseFrame = () => false,
    onManualInput = () => {},
    rules = NAV,
    focus = null,
    commands = {},
  } = {},
) {
  const scene = viewer.scene;
  const camera = viewer.camera;
  const canvas = viewer.canvas;
  const controller = scene.screenSpaceCameraController;
  const restoreController = configureCesiumNavigation(
    controller,
    Cesium,
    rules,
  );
  camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
  let navigated = false;

  const identity = () =>
    Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY);
  /** Free camera: input on, not following anything, the plain world frame. */
  const free = () =>
    controller.enableInputs !== false && !viewer.trackedEntity && identity();

  /** The Director may leave the camera in its subject's frame; drop it. */
  function releaseDirectorFrame() {
    if (
      viewer.trackedEntity ||
      controller.enableInputs === false ||
      identity() ||
      !releaseFrame()
    )
      return;
    try {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch {
      /* viewer torn down */
    }
  }
  /** The user has the camera: no flight keeps going under them. */
  function takeCamera() {
    navigated = true;
    releaseDirectorFrame();
    if (controller.enableInputs === false) return;
    try {
      camera.cancelFlight();
    } catch {
      /* no flight */
    }
  }
  const onPointer = () => takeCamera();
  const noMenu = (event) => event.preventDefault();

  // ── Keyboard ──────────────────────────────────────────────────────────
  const held = new Set();
  let raf = 0;
  let last = 0;
  let pivot = null;
  let pivotFresh = false;

  const plain = (c) => ({ x: c.x, y: c.y, z: c.z });
  const toCart = (v) => new Cesium.Cartesian3(v.x, v.y, v.z);
  /** Radius of the ground under the camera (ellipsoid + 3D city / terrain). */
  function groundRadius() {
    const pos = camera.positionWC;
    let r = EARTH_RADIUS_M;
    try {
      const s = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(
        pos,
        new Cesium.Cartesian3(),
      );
      if (s) r = Cesium.Cartesian3.magnitude(s);
    } catch {
      /* keep the mean radius */
    }
    const ground = Number(scene.globeHeight);
    return r + (Number.isFinite(ground) ? ground : 0);
  }
  /** The point at the centre of the screen: the 3D city when close, else the globe. */
  function findPivot() {
    const width = canvas.clientWidth || 1200;
    const height = canvas.clientHeight || 800;
    const centre = new Cesium.Cartesian2(width / 2, height / 2);
    const h = camera.positionCartographic?.height ?? 0;
    if (h < 150_000 && scene.pickPositionSupported) {
      try {
        const hit = scene.pickPosition(centre);
        if (
          hit &&
          Cesium.Cartesian3.distance(hit, camera.positionWC) <
            Math.max(5_000, h * 50)
        )
          return plain(hit);
      } catch {
        /* depth picking unavailable */
      }
    }
    return raySphere(
      plain(camera.positionWC),
      plain(camera.directionWC),
      groundRadius(),
    );
  }
  function step(now) {
    raf = 0;
    if (!held.size) return;
    // Focused on an asset: turn, tilt and zoom about it.
    if (focus?.isActive()) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const k = rules.keys;
      const has = (a) => held.has(a);
      focus.nudge({
        turnDeg:
          ((has('turnRight') ? 1 : 0) - (has('turnLeft') ? 1 : 0)) *
          k.turnDegPerS *
          dt,
        tiltDeg:
          ((has('tiltUp') ? 1 : 0) - (has('tiltDown') ? 1 : 0)) *
          k.tiltDegPerS *
          dt,
        zoom:
          ((has('zoomIn') ? 1 : 0) - (has('zoomOut') ? 1 : 0)) *
          k.zoomRatePerS *
          dt,
      });
      raf = requestAnimationFrame(step);
      return;
    }
    if (!free()) {
      held.clear();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (dt > 0) {
      if (!pivotFresh) {
        pivot = findPivot();
        pivotFresh = true;
      }
      const ground = groundRadius();
      const frame = {
        position: plain(camera.positionWC),
        direction: plain(camera.directionWC),
        up: plain(camera.upWC),
      };
      const heightM = Math.max(1, vec.len(frame.position) - ground);
      const out = keyFrame(frame, held, dt, {
        pivot,
        heightM,
        floorRadius: ground + rules.minimumZoomDistanceM,
        maxRadius: ground + rules.maximumZoomDistanceM,
        rules,
      });
      if (out.panned) pivotFresh = false;
      camera.setView({
        destination: toCart(out.frame.position),
        orientation: {
          direction: toCart(vec.norm(out.frame.direction)),
          up: toCart(vec.norm(out.frame.up)),
        },
      });
      scene.requestRender?.();
    }
    raf = requestAnimationFrame(step);
  }
  // ── Camera commands: frame, face north, look down, whole planet ──────
  /** The point at the screen centre and how far it is. */
  function centreTarget() {
    const p = findPivot();
    if (!p) return null;
    const point = toCart(p);
    return {
      point,
      rangeM: Cesium.Cartesian3.distance(camera.positionWC, point),
    };
  }
  /** Ease to a new heading and pitch about the screen centre. */
  function reframe({ headingDeg = null, pitchDeg = null }, durationS = 0.8) {
    const c = centreTarget();
    const heading =
      headingDeg == null ? camera.heading : Cesium.Math.toRadians(headingDeg);
    const pitch =
      pitchDeg == null
        ? Math.min(camera.pitch, Cesium.Math.toRadians(rules.keys.maxPitchDeg))
        : Cesium.Math.toRadians(pitchDeg);
    if (!c) {
      camera.setView({ orientation: { heading, pitch, roll: 0 } });
      return;
    }
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(c.point, 0), {
      offset: new Cesium.HeadingPitchRange(heading, pitch, c.rangeM),
      duration: durationS,
    });
  }
  function home() {
    const c = camera.positionCartographic;
    camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        c.longitude,
        Cesium.Math.clamp(c.latitude, -1, 1) * 0.5,
        20_000_000,
      ),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1.6,
    });
  }
  /** Run a single-press command. Returns true when it was handled. */
  function runCommand(name) {
    if (name === 'release') return focus?.release('escape') || false;
    if (name === 'focus') return commands.focusSelected?.() || false;
    onManualInput('keyboard');
    if (name === 'north') {
      if (focus?.faceNorth()) return true;
      takeCamera();
      reframe({ headingDeg: 0 });
      return true;
    }
    if (name === 'topDown') {
      if (focus?.isActive()) return focus.nudge({ tiltDeg: -180 });
      takeCamera();
      reframe({ pitchDeg: -90 });
      return true;
    }
    if (name === 'home') {
      focus?.release('home');
      takeCamera();
      home();
      return true;
    }
    return false;
  }

  // Double-click flies in to that spot (Google Earth), keeping the bearing.
  function onDoubleClick(event) {
    if (focus?.isActive() || controller.enableInputs === false) return;
    const rect = canvas.getBoundingClientRect();
    const at = new Cesium.Cartesian2(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    let point = null;
    try {
      if (scene.pickPositionSupported) point = scene.pickPosition(at);
    } catch {
      point = null;
    }
    if (!point) {
      const ray = camera.getPickRay(at);
      point = ray ? scene.globe.pick(ray, scene) : null;
    }
    if (!point) return;
    takeCamera();
    const range = Cesium.Cartesian3.distance(camera.positionWC, point) * 0.45;
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(point, 0), {
      offset: new Cesium.HeadingPitchRange(
        camera.heading,
        Math.min(camera.pitch, Cesium.Math.toRadians(-20)),
        Math.max(rules.minimumZoomDistanceM * 4, range),
      ),
      duration: 1.0,
    });
  }
  try {
    viewer.cesiumWidget?.screenSpaceEventHandler?.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
  } catch {
    /* no default handler */
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const command = navKeyCommand(event);
    if (command) {
      if (runCommand(command)) event.preventDefault();
      return;
    }
    const action = navKeyAction(event);
    if (!action) return;
    event.preventDefault();
    if (held.has(action)) return;
    onManualInput('keyboard');
    // Moving off sideways leaves the asset; turning, tilting and zooming
    // stay on it.
    if (focus?.isActive()) {
      if (PAN_ACTIONS.has(action)) focus.release('pan');
      else {
        held.add(action);
        if (!raf) {
          last = performance.now();
          raf = requestAnimationFrame(step);
        }
        return;
      }
    }
    takeCamera();
    if (!free()) return;
    held.add(action);
    if (!raf) {
      last = performance.now();
      pivotFresh = false;
      raf = requestAnimationFrame(step);
    }
  }
  function onKeyUp(event) {
    for (const a of navKeyActions(event.code)) held.delete(a);
    const action = navKeyAction({ code: event.code, key: event.key });
    if (action) held.delete(action);
  }
  const releaseAll = () => held.clear();

  /** Diagnostics: where the camera is (degrees, metres). */
  function state() {
    const c = camera.positionCartographic;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
      heightM: c.height,
      headingDeg: Cesium.Math.toDegrees(camera.heading),
      pitchDeg: Cesium.Math.toDegrees(camera.pitch),
      keys: [...held],
      navigated,
    };
  }
  const diagnostics = { state };
  globalThis.__gevNav = diagnostics;

  // Capture: runs before Cesium's own handlers on the canvas.
  canvas.addEventListener('pointerdown', onPointer, {
    capture: true,
    passive: true,
  });
  canvas.addEventListener('wheel', onPointer, { capture: true, passive: true });
  canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  const dispose = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    held.clear();
    canvas.removeEventListener('pointerdown', onPointer, { capture: true });
    canvas.removeEventListener('wheel', onPointer, { capture: true });
    canvas.removeEventListener('contextmenu', noMenu);
    canvas.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    restoreController();
    if (globalThis.__gevNav === diagnostics) delete globalThis.__gevNav;
  };
  /** True once the user has moved the camera themselves (no idle spin after). */
  dispose.navigated = () => navigated;
  /** Run a camera command from a button (the controls panel). */
  dispose.command = (name) => runCommand(name);
  return dispose;
}
