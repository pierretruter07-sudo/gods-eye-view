/**
 * @file Camera math for the AUDIT overlay. Pure functions on plain arrays.
 *
 * The overlay draws in Earth radii. God's Eye View's Cesium camera works in
 * metres, Earth-fixed (ECEF: z through the North Pole). Every frame the
 * overlay copies Cesium's camera, so both cameras see exactly the same
 * picture and the orbit sphere sits on the real Earth.
 * @module audit/cameraMath
 */

/** WGS84 equatorial radius, metres: one overlay unit. */
export const EARTH_RADIUS_M = 6378137;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Orbit-local axes for a viewer at longitude `lon` (radians): x east,
 * y north (Earth's axis), z towards the viewer. All three in ECEF.
 */
export function basisForLongitude(lon) {
  return {
    x: [-Math.sin(lon), Math.cos(lon), 0],
    y: [0, 0, 1],
    z: [Math.cos(lon), Math.sin(lon), 0],
  };
}

/** Orbit-local point (Earth radii) to ECEF (Earth radii). */
export function localToEcef(v, basis) {
  return add(
    add(scale(basis.x, v[0]), scale(basis.y, v[1])),
    scale(basis.z, v[2]),
  );
}

/**
 * The camera pose the AUDIT view flies to: the design's framing (the orbit
 * seen from about 33° above the ring plane), scaled to Cesium's field of view.
 * @param {number} lon - Viewer longitude, radians.
 * @param {number} fovy - Cesium vertical field of view, radians.
 * @returns {{destination:number[], direction:number[], up:number[], target:number[]}} ECEF metres / unit vectors.
 */
export function auditPose(lon, fovy, { radiusM = EARTH_RADIUS_M } = {}) {
  const designFovy = (30 * Math.PI) / 180;
  const k = Math.tan(designFovy / 2) / Math.tan(fovy / 2);
  const target = [0, -0.8, 0.13];
  const eye = add(target, scale(sub([0, 13, 20.33], target), k));
  const basis = basisForLongitude(lon);
  const destination = scale(localToEcef(eye, basis), radiusM);
  const targetEcef = scale(localToEcef(target, basis), radiusM);
  const direction = norm(sub(targetEcef, destination));
  const north = [0, 0, 1];
  const up = norm(sub(north, scale(direction, dot(north, direction))));
  return { destination, direction, up, target: targetEcef };
}

/**
 * Overlay camera parameters from Cesium's camera (values copied out of
 * `camera.positionWC`, `directionWC`, `upWC` and `frustum`).
 * @returns {{position:number[], target:number[], up:number[], fovDeg:number, aspect:number, near:number, far:number}}
 */
export function overlayCamera(
  { position, direction, up, fovy, aspect },
  { radiusM = EARTH_RADIUS_M } = {},
) {
  const p = scale(position, 1 / radiusM);
  const distance = Math.hypot(p[0], p[1], p[2]);
  return {
    position: p,
    target: add(p, direction),
    up: [...up],
    fovDeg: (fovy * 180) / Math.PI,
    aspect,
    near: Math.max(0.002, distance * 0.001),
    far: Math.max(200, distance * 30),
  };
}

function slerp(a, b, t) {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const theta = Math.acos(d);
  if (theta < 1e-6) return norm(add(a, scale(sub(b, a), t)));
  const s = Math.sin(theta);
  return add(
    scale(a, Math.sin((1 - t) * theta) / s),
    scale(b, Math.sin(t * theta) / s),
  );
}

/**
 * Camera pose part-way between two poses: position moves on a sphere with
 * distance interpolated logarithmically (a smooth zoom out or in);
 * direction and up turn along the shortest arc and stay orthonormal.
 * @param {{position:number[], direction:number[], up:number[]}} from
 * @param {{position:number[], direction:number[], up:number[]}} to
 * @param {number} t - 0..1 (already eased).
 */
export function interpolatePose(from, to, t) {
  const d0 = Math.hypot(...from.position);
  const d1 = Math.hypot(...to.position);
  const dist = d0 * Math.pow(d1 / d0, t);
  const position = scale(
    norm(slerp(norm(from.position), norm(to.position), t)),
    dist,
  );
  const direction = norm(slerp(from.direction, to.direction, t));
  const upRaw = slerp(from.up, to.up, t);
  const up = norm(sub(upRaw, scale(direction, dot(upRaw, direction))));
  return { position, direction, up };
}

/** Ease in and out (cubic), 0..1 → 0..1. */
export function ease(t) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Map overall progress `t` into a sub-phase [a, b] (clamped 0..1). */
export function phase(t, a, b) {
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}
