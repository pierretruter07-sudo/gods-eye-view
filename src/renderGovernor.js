/**
 * Idle render governor — the wave-2 flagship of the 2026-08-05 perf
 * investigation.
 *
 * The problem: Cesium's default render loop repaints every vsync forever, so
 * the app burned ~60% GPU + ~54% of a core with ZERO layers enabled and a
 * parked camera. The fix: flip the scene into Cesium's `requestRenderMode`
 * whenever nothing animates per frame, and return to the continuous loop the
 * moment something does.
 *
 * Architecture — a binary mode driven by ref-counted holds:
 *
 * - **Continuous mode** (`requestRenderMode = false`, today's behavior)
 *   while ANY hold is registered. Every per-frame animator — fleet
 *   interpolation, traffic sim, satellite motion, tracked-entity follow,
 *   style crossfades, CCTV projection — registers a hold for exactly the
 *   lifetime of its scene-loop listener or animation. While one is active,
 *   behavior is byte-identical to pre-governor main: the locked
 *   interpolation/tracking invariants are preserved by construction.
 * - **Idle mode** (`requestRenderMode = true`) when zero holds. Cesium
 *   auto-renders on camera input and tile loads; every other scene mutation
 *   must call `governorRequestRender()` for its one frame. Discrete
 *   mutators (layer poll ticks, slider writes, annotation changes) route
 *   through that.
 *
 * Holds are identity-keyed (a Set of owner ids), NOT a counter — a module
 * that double-holds or double-releases cannot corrupt the mode. Owners are
 * short stable strings ('flights', 'traffic', 'style-anim', …) so the
 * diagnostics read like a story.
 *
 * - **Cadence holds** (`holdRenderCadence(owner, ms)`): an animator whose
 *   picture only changes every N ms (the aircraft fleet steps every 80 ms,
 *   ships and satellites slower) does not need 60 fps. While no continuous
 *   hold exists, one timer requests a frame at the fastest active cadence
 *   and Cesium still renders at once on camera input and tile loads. The
 *   owner's preRender work runs on exactly those frames, so what is drawn is
 *   unchanged; the GPU stops redrawing identical frames in between.
 *
 * The governor does no per-frame work of its own.
 */

let _viewer = null;
let _installed = false;
const _holds = new Set();
/** Cadence holds: owner → milliseconds between required frames. */
const _cadences = new Map();
let _cadenceTimer = null;
let _cadenceMs = 0;

function applyCadence() {
  const want =
    _installed && _holds.size === 0 && _cadences.size
      ? Math.min(..._cadences.values())
      : 0;
  if (want === _cadenceMs) return;
  if (_cadenceTimer) clearInterval(_cadenceTimer);
  _cadenceTimer = null;
  _cadenceMs = want;
  if (want)
    _cadenceTimer = setInterval(() => _viewer?.scene?.requestRender?.(), want);
}

/** Debug trail of the most recent one-shot render requests (idle mode only). */
const _recentRequests = [];
const RECENT_REQUEST_CAP = 16;

function applyMode() {
  applyCadence();
  if (!_installed || !_viewer?.scene) return;
  const continuous = _holds.size > 0;
  const scene = _viewer.scene;
  if (scene.requestRenderMode === !continuous) return;
  scene.requestRenderMode = !continuous;
  if (!continuous) {
    // Entering idle: render one settling frame so anything the last
    // continuous frame mutated is on screen before the loop stops.
    scene.requestRender?.();
  }
}

/**
 * Install the governor on the viewer. Idempotent. Before install,
 * hold/release still record into the holds set (and apply at install time);
 * requests are safe no-ops — so modules can call all three unconditionally
 * in tests without a viewer.
 * @param {Cesium.Viewer} viewer
 * @returns {void}
 */
export function installRenderGovernor(viewer) {
  if (!viewer?.scene)
    throw new TypeError('installRenderGovernor requires a Cesium viewer');
  _viewer = viewer;
  _installed = true;
  // Never let Cesium re-render on simulation-time deltas behind our back —
  // idle means idle. All re-renders are camera/tiles (Cesium-native) or
  // explicit requests.
  viewer.scene.maximumRenderTimeChange = Infinity;
  applyMode();
}

/**
 * Register a continuous-render hold. Idempotent per owner.
 * Call where the owner's per-frame work BEGINS (scene listener installed,
 * animation starts, tracking begins).
 * @param {string} ownerId Short stable id, e.g. 'flights', 'traffic'.
 * @returns {void}
 */
export function holdContinuousRender(ownerId) {
  if (!ownerId) return;
  _holds.add(ownerId);
  applyMode();
}

/**
 * Register a cadence hold: the owner's picture changes every `ms` ms, so a
 * frame at that pace is enough (see the module notes). Idempotent per owner;
 * the latest `ms` wins. Released by `releaseContinuousRender(ownerId)`.
 * @param {string} ownerId
 * @param {number} ms
 * @returns {void}
 */
export function holdRenderCadence(ownerId, ms) {
  if (!ownerId || !(ms > 0)) return;
  _cadences.set(ownerId, ms);
  applyMode();
  _viewer?.scene?.requestRender?.();
}

/**
 * Release a hold (continuous or cadence). Safe when never held.
 * Call where the owner's per-frame work ENDS (listener removed, animation
 * settled, tracking stopped, layer disabled).
 * @param {string} ownerId
 * @returns {void}
 */
export function releaseContinuousRender(ownerId) {
  if (!ownerId) return;
  _holds.delete(ownerId);
  _cadences.delete(ownerId);
  applyMode();
}

/**
 * One-shot render request for a discrete scene mutation (layer tick, slider
 * write, annotation change). Always forwards to scene.requestRender() — in
 * continuous mode that is a harmless flag set (and forwarding closes the
 * request-then-last-release race); only idle-mode requests are recorded in
 * diagnostics. Cheap enough to call unconditionally after any mutation.
 * @param {string} [reason] For diagnostics only.
 * @returns {void}
 */
export function governorRequestRender(reason = 'unspecified') {
  if (!_installed || !_viewer?.scene) return;
  if (_holds.size === 0) {
    _recentRequests.push({ reason, at: Date.now() });
    if (_recentRequests.length > RECENT_REQUEST_CAP) _recentRequests.shift();
  }
  _viewer.scene.requestRender?.();
}

/**
 * @returns {{installed: boolean, mode: 'continuous'|'cadence'|'idle', holds: string[],
 *   cadences: Record<string, number>, cadenceMs: number,
 *   recentRequests: Array<{reason: string, at: number}>}}
 */
export function getRenderGovernorDiagnostics() {
  return {
    installed: _installed,
    mode: _holds.size > 0 ? 'continuous' : _cadenceMs ? 'cadence' : 'idle',
    holds: [..._holds].sort(),
    cadences: Object.fromEntries([..._cadences].sort()),
    cadenceMs: _cadenceMs,
    recentRequests: [..._recentRequests],
  };
}

/** Release the installed viewer after its animation owners have stopped. */
export function uninstallRenderGovernor(viewer) {
  if (_viewer !== viewer) return;
  _viewer = null;
  _installed = false;
  _holds.clear();
  _cadences.clear();
  applyCadence();
  _recentRequests.length = 0;
}

/** Test seam: reset module state between unit tests. */
export function _resetRenderGovernorForTest() {
  _viewer = null;
  _installed = false;
  _holds.clear();
  _cadences.clear();
  applyCadence();
  _recentRequests.length = 0;
}
