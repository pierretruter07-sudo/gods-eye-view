import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV,
  cesiumEventMapping,
  configureCesiumNavigation,
  isTypingTarget,
  keyFrame,
  navKeyAction,
  panFrame,
  pitchOf,
  raySphere,
  tiltAbout,
  turnAbout,
  vec,
  zoomToward,
} from './navigation.js';
import { shouldSpin } from './idleSpinPolicy.js';

const R = 6_371_000;
const DEG = Math.PI / 180;
const T = Object.freeze({
  LEFT_DRAG: 0,
  RIGHT_DRAG: 1,
  MIDDLE_DRAG: 2,
  WHEEL: 3,
  PINCH: 4,
});
const M = Object.freeze({ SHIFT: 0, CTRL: 1, ALT: 2 });
const FAKE_CESIUM = { CameraEventType: T, KeyboardEventModifier: M };

const near = (a, b, eps, msg) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/**
 * A camera over (lat 0, lon 0) at `h` metres, facing north and pitched down
 * by `pitchDeg`. East is +y, north is +z, up is +x.
 */
function frameAt(h, pitchDeg) {
  const p = pitchDeg * DEG;
  const north = { x: 0, y: 0, z: 1 };
  const up = { x: 1, y: 0, z: 0 };
  const direction = vec.add(
    vec.scale(north, Math.cos(p)),
    vec.scale(up, Math.sin(p)),
  );
  const camUp = vec.add(
    vec.scale(north, -Math.sin(p)),
    vec.scale(up, Math.cos(p)),
  );
  return { position: { x: R + h, y: 0, z: 0 }, direction, up: camUp };
}
const heightOf = (f) => vec.len(f.position) - R;
const latDeg = (f) => Math.asin(f.position.z / vec.len(f.position)) / DEG;
const lonDeg = (f) => Math.atan2(f.position.y, f.position.x) / DEG;
/** Heading clockwise from north, from the frame's flattened direction. */
function headingDeg(f) {
  const n = vec.norm(f.position);
  const east = vec.norm(vec.cross({ x: 0, y: 0, z: 1 }, n));
  const north = vec.cross(n, east);
  return (
    Math.atan2(vec.dot(f.direction, east), vec.dot(f.direction, north)) / DEG
  );
}

test('mouse and touch map to free navigation: drag pans, right drag turns and tilts, wheel zooms', () => {
  const m = cesiumEventMapping(FAKE_CESIUM);
  // Left drag is Cesium's "rotate", which in 3D grabs the point under the
  // cursor and keeps it there (pan), not a turn about the Earth's centre.
  assert.deepEqual(m.rotateEventTypes, [T.LEFT_DRAG]);
  // Right drag no longer zooms; it turns and tilts about the cursor point.
  assert.ok(m.tiltEventTypes.includes(T.RIGHT_DRAG));
  assert.ok(m.tiltEventTypes.includes(T.MIDDLE_DRAG));
  assert.ok(
    m.tiltEventTypes.some(
      (b) => b.eventType === T.LEFT_DRAG && b.modifier === M.CTRL,
    ),
    'Ctrl + left drag tilts',
  );
  assert.ok(!m.zoomEventTypes.includes(T.RIGHT_DRAG));
  assert.ok(m.zoomEventTypes.includes(T.WHEEL));
  assert.ok(m.zoomEventTypes.includes(T.PINCH));
  assert.ok(
    m.zoomEventTypes.some(
      (b) => b.eventType === T.WHEEL && b.modifier === M.CTRL,
    ),
    'trackpad pinch (Ctrl + wheel) zooms',
  );

  const controller = {
    rotateEventTypes: 'old',
    inertiaSpin: 0.9,
    inertiaZoom: 0.8,
    minimumZoomDistance: 1,
    maximumZoomDistance: Infinity,
    enableRotate: false,
  };
  const restore = configureCesiumNavigation(controller, FAKE_CESIUM);
  assert.equal(controller.enableRotate, true);
  assert.ok(controller.inertiaSpin < 0.9, 'short inertia');
  assert.equal(controller.minimumZoomDistance, NAV.minimumZoomDistanceM);
  assert.equal(controller.maximumZoomDistance, NAV.maximumZoomDistanceM);
  restore();
  assert.equal(controller.rotateEventTypes, 'old');
  assert.equal(controller.inertiaSpin, 0.9);
  assert.equal(controller.minimumZoomDistance, 1);
});

test('keys: arrows and WASD pan, Q/E turn, R/F tilt, +/- zoom; never in a text field or with Ctrl', () => {
  const cases = [
    [{ code: 'ArrowUp' }, 'forward'],
    [{ code: 'KeyW', key: 'w' }, 'forward'],
    [{ code: 'KeyS' }, 'back'],
    [{ code: 'ArrowLeft' }, 'left'],
    [{ code: 'KeyD' }, 'right'],
    [{ code: 'KeyQ' }, 'turnLeft'],
    [{ code: 'KeyE' }, 'turnRight'],
    [{ code: 'KeyR' }, 'tiltUp'],
    [{ code: 'KeyF' }, 'tiltDown'],
    [{ code: 'Equal', key: '+' }, 'zoomIn'],
    [{ code: 'NumpadAdd' }, 'zoomIn'],
    [{ code: 'Minus' }, 'zoomOut'],
    [{ key: 'w' }, 'forward'],
    [{ key: '-' }, 'zoomOut'],
    [{ code: 'KeyX', key: 'x' }, null],
    [{ code: 'KeyR', ctrlKey: true }, null],
    [{ code: 'KeyW', metaKey: true }, null],
  ];
  for (const [event, action] of cases)
    assert.equal(navKeyAction(event), action, JSON.stringify(event));

  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'textarea' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(
    isTypingTarget({ tagName: 'BUTTON', closest: () => ({}) }),
    true,
    'inside an open dialog',
  );
  assert.equal(isTypingTarget({ tagName: 'CANVAS', closest: () => null }), false);
  assert.equal(isTypingTarget(null), false);
});

test('panning slides over the ground: same height, tilt and heading, from street to orbit', () => {
  for (const h of [300, 5_000, 200_000, 18_000_000]) {
    const f = frameAt(h, -35);
    const next = panFrame(f, { forward: 1 }, 0.5, h);
    near(heightOf(next), h, Math.max(1e-3, h * 1e-9), `height kept at ${h}`);
    near(pitchOf(next) / DEG, -35, 1e-6, 'tilt kept');
    assert.ok(latDeg(next) > 0, 'forward (north) moves north');
    near(lonDeg(next), 0, 1e-9, 'no sideways drift');
    near(headingDeg(next), 0, 1e-6, 'heading kept');
  }
  // Close in, half a second covers about 0.45 of the height.
  const f = frameAt(1_000, -35);
  const moved = panFrame(f, { forward: 1 }, 0.5, 1_000);
  near(latDeg(moved) * DEG * R, 0.45 * 1_000, 1, 'ground speed follows height');
  // From orbit the speed is capped, so a tap never flings the globe round.
  const far = panFrame(frameAt(30e6, -90), { forward: 1 }, 1, 30e6);
  assert.ok(latDeg(far) <= NAV.keys.maxPanRadPerS / DEG + 1e-6);
  // Right is east; straight down, forward is the top of the screen.
  const right = panFrame(frameAt(1_000, -90), { right: 1 }, 0.5, 1_000);
  assert.ok(lonDeg(right) > 0, 'right moves east');
  near(latDeg(right), 0, 1e-9, 'right does not move north');
  const down = panFrame(frameAt(1_000, -90), { forward: 1 }, 0.5, 1_000);
  assert.ok(latDeg(down) > 0, 'top-down forward moves north');
});

test('Q/E turn and R/F tilt about the point at the screen centre, within the tilt limits', () => {
  const f = frameAt(1_000, -45);
  const pivot = raySphere(f.position, f.direction, R);
  assert.ok(pivot, 'the view ray meets the ground');
  const dist = vec.len(vec.sub(pivot, f.position));
  near(dist, 1_000 * Math.SQRT2, 1, 'pivot 45° ahead');
  assert.equal(raySphere(frameAt(1_000, 10).position, frameAt(1_000, 10).direction, R), null);

  // Turning keeps the pivot centred, the distance and the tilt; Q turns left.
  const turned = turnAbout(f, pivot, 30 * DEG);
  near(vec.len(vec.sub(pivot, turned.position)), dist, 1e-3, 'distance kept');
  near(vec.dot(vec.norm(vec.sub(pivot, turned.position)), turned.direction), 1, 1e-9, 'pivot stays centred');
  near(pitchOf(turned) / DEG, -45, 0.05, 'tilt kept');
  assert.ok(headingDeg(turned) < 0, `turn left lowers the heading (${headingDeg(turned)})`);

  // Tilting up lowers the camera towards the horizon, keeping the pivot.
  const up = tiltAbout(f, pivot, 10 * DEG);
  assert.ok(up);
  near(pitchOf(up) / DEG, -35, 0.05, 'tilted up by 10°');
  assert.ok(heightOf(up) < heightOf(f), 'camera comes down');
  near(vec.len(vec.sub(pivot, up.position)), dist, 1e-3, 'distance kept');
  // Never past the horizon or straight-down limits, never into the ground.
  assert.equal(tiltAbout(frameAt(1_000, -3), null, 2 * DEG), null);
  assert.equal(tiltAbout(frameAt(1_000, -89.4), null, -1 * DEG), null);
  assert.equal(tiltAbout(f, pivot, 10 * DEG, { floorRadius: R + 1_000 }), null);
});

test('+/- zoom towards the screen-centre point, smoothly, never into it or out past the limit', () => {
  const f = frameAt(10_000, -90);
  const pivot = raySphere(f.position, f.direction, R);
  const zin = zoomToward(f, pivot, +1, 0.1, { heightM: 10_000 });
  const share = 1 - heightOf(zin) / 10_000;
  near(share, 1 - Math.exp(-NAV.keys.zoomRatePerS * 0.1), 1e-6, 'a share of the distance');
  const zout = zoomToward(f, pivot, -1, 0.1, { heightM: 10_000 });
  assert.ok(heightOf(zout) > 10_000, 'minus zooms out');
  // Stops short of the target.
  let c = frameAt(40, -90);
  for (let i = 0; i < 100; i++) c = zoomToward(c, pivot, +1, 0.05, { heightM: heightOf(c) });
  near(heightOf(c), NAV.minimumZoomDistanceM, 1e-6, 'never closer than the minimum');
  // Never out past the far limit.
  const capped = zoomToward(frameAt(59e6, -90), raySphere(frameAt(59e6, -90).position, frameAt(59e6, -90).direction, R), -1, 1, {
    heightM: 59e6,
    maxRadius: R + 60e6,
  });
  near(vec.len(capped.position), R + 60e6, 1, 'capped');
});

test('held keys combine in one frame; nothing moves without a key', () => {
  const f = frameAt(2_000, -40);
  const same = keyFrame(f, new Set(), 0.016, { heightM: 2_000 });
  assert.deepEqual(same.frame, f);
  assert.equal(same.panned, false);
  const both = keyFrame(f, new Set(['forward', 'turnLeft']), 0.1, { heightM: 2_000 });
  assert.equal(both.panned, true);
  assert.ok(latDeg(both.frame) > 0);
  assert.ok(headingDeg(both.frame) < 0);
  near(heightOf(both.frame), 2_000, 1e-3, 'height kept while panning and turning');
});

test('the globe never turns on its own once the user has moved the camera', () => {
  assert.equal(shouldSpin({ idleS: 60, heightM: 18e6, blocked: false }), true);
  assert.equal(
    shouldSpin({ idleS: 60, heightM: 18e6, blocked: false, navigated: true }),
    false,
  );
});

test('a navigation key stops the Director, cancels any flight and moves the camera; typing in a field does not', async () => {
  const { installNavigation } = await import('./navigation.js');
  const listeners = {};
  const target = (name) => ({
    addEventListener: (type, fn) => {
      listeners[`${name}:${type}`] = fn;
    },
    removeEventListener: (type) => {
      delete listeners[`${name}:${type}`];
    },
  });
  const frames = [];
  const saved = {
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  globalThis.window = target('window');
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  class Cartesian3 {
    constructor(x = 0, y = 0, z = 0) {
      Object.assign(this, { x, y, z });
    }
    static magnitude = (v) => vec.len(v);
    static distance = (a, b) => vec.len(vec.sub(a, b));
    static UNIT_Z = new Cartesian3(0, 0, 1);
  }
  const IDENTITY = {};
  const Cesium = {
    ...FAKE_CESIUM,
    Cartesian3,
    Cartesian2: class {},
    Matrix4: { IDENTITY, equals: (a, b) => a === b },
    Ellipsoid: { WGS84: { scaleToGeodeticSurface: (p) => vec.scale(vec.norm(p), R) } },
    Math: { toDegrees: (r) => r / DEG },
  };
  const f = frameAt(1_000, -45);
  const views = [];
  let cancelled = 0;
  const camera = {
    transform: IDENTITY,
    positionWC: f.position,
    directionWC: f.direction,
    upWC: f.up,
    positionCartographic: { height: 1_000, latitude: 0, longitude: 0 },
    setView: (v) => views.push(v),
    cancelFlight: () => cancelled++,
  };
  const controller = { enableInputs: true };
  const viewer = {
    scene: { screenSpaceCameraController: controller, pickPositionSupported: false },
    camera,
    canvas: target('canvas'),
  };
  const reasons = [];
  try {
    const dispose = installNavigation(viewer, Cesium, {
      onManualInput: (r) => reasons.push(r),
    });
    assert.equal(controller.minimumZoomDistance, NAV.minimumZoomDistanceM);
    assert.equal(dispose.navigated(), false);
    let prevented = 0;
    const key = (extra) => ({
      code: 'KeyW',
      key: 'w',
      target: { tagName: 'CANVAS', closest: () => null },
      preventDefault: () => prevented++,
      ...extra,
    });
    listeners['window:keydown'](key({ target: { tagName: 'INPUT' } }));
    assert.deepEqual(reasons, [], 'typing in the search box is not navigation');
    assert.equal(frames.length, 0);
    listeners['window:keydown'](key());
    assert.deepEqual(reasons, ['keyboard']);
    assert.equal(cancelled, 1, 'a flight in progress gives way');
    assert.equal(prevented, 1);
    assert.equal(dispose.navigated(), true);
    frames.shift()(performance.now() + 16);
    assert.equal(views.length, 1, 'the camera moved');
    assert.ok(views[0].destination.z > 0, 'W moved it forward (north)');
    listeners['window:keyup']({ code: 'KeyW', key: 'w' });
    while (frames.length) frames.shift()(performance.now() + 32);
    assert.equal(views.length, 1, 'no drift after the key is released');
    dispose();
    assert.equal(listeners['window:keydown'], undefined);
    assert.equal(controller.minimumZoomDistance, undefined, 'controller restored');
  } finally {
    globalThis.window = saved.window;
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
  }
});
