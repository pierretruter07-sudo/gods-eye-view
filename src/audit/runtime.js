/**
 * @file The AUDIT runtime: loaded on the first press of AUDIT.
 *
 * Flies God's Eye View's camera out to the whole globe, morphs the real Earth
 * into the CrossCheck orbit (an overlay that copies the Cesium camera every
 * frame), and runs the cockpit, evidence drawer and guided tour. Navigation
 * stays Cesium's own: rotate, zoom, tilt and pan behave as in God's Eye View.
 * @module audit/runtime
 */
import * as Cesium from 'cesium';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { loadBundledJson } from '../data/bundledJson.js';
import { createOrbitScene, THREE } from './scene.js';
import {
  EARTH_RADIUS_M,
  auditPose,
  ease,
  interpolatePose,
  norm,
  overlayCamera,
  phase,
} from './cameraMath.js';
import {
  LAYERS,
  SEC_STATUS_NAME,
  STATUS_NAME,
  layout,
  linkedIds,
  mustFix,
  rollup,
} from './model.js';
import { createCockpit } from './cockpit.js';
import { createEvidenceDrawer } from './evidence.js';
import { createTour, tourSeen } from './tour.js';

const HOLD = 'gev-audit';
const R = EARTH_RADIUS_M;
const FLY_IN_S = 2.6;
const MORPH_IN_MS = 2800;
const MORPH_OUT_MS = 1900;
const SPIN_RAD_PER_S = (0.8 * Math.PI) / 180;
const SPIN_IDLE_MS = 5000;

const c3 = (v) => new Cesium.Cartesian3(v[0], v[1], v[2]);
const arr = (c) => [c.x, c.y, c.z];

function animate(from, to, ms, step) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      step(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * @param {{viewer: Cesium.Viewer, onExited?: () => void}} options
 */
export async function createAuditRuntime({ viewer, onExited }) {
  const [data, ledger] = await Promise.all([
    loadBundledJson(
      new URL('./data/assessment.json', import.meta.url),
      () => import('./data/assessment.json', { with: { type: 'json' } }),
    ),
    loadBundledJson(
      new URL('../../docs/evidence/ledger.json', import.meta.url),
      () =>
        import('../../docs/evidence/ledger.json', { with: { type: 'json' } }),
    ),
  ]);
  const opts = { swal: data.swal, asvsLevel: data.asvsLevel };
  const saf = rollup(data.items, 'saf', opts);
  const sec = rollup(data.items, 'sec', opts);
  const { nodes, groups } = layout(data.items);
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const historyById = new Map(ledger.findings.map((f) => [f.id, f]));
  const scene = viewer.scene;
  const camera = viewer.camera;
  const controller = scene.screenSpaceCameraController;

  // ── DOM: one layer above the globe ────────────────────────────────────
  const layer = document.createElement('div');
  layer.className = 'gev-audit-layer';
  layer.hidden = true;
  const veil = document.createElement('div');
  veil.className = 'gev-audit-veil';
  const canvas = document.createElement('canvas');
  canvas.className = 'gev-audit-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const labels = document.createElement('div');
  labels.className = 'gev-audit-labels';
  labels.setAttribute('aria-hidden', 'true');
  layer.append(veil, canvas, labels);
  document.body.append(layer);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  const cam3 = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  const orbit = createOrbitScene({ nodes, groups, themes: data.themes });

  function resize() {
    const rect = viewer.canvas.getBoundingClientRect();
    Object.assign(canvas.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(rect.width, rect.height, false);
  }
  resize();
  window.addEventListener('resize', resize);

  // ── State ─────────────────────────────────────────────────────────────
  let active = false;
  let busy = false;
  let saved = null;
  let hidden = null;
  let selected = null;
  let hovered = null;
  let lastInput = performance.now();
  const layers = Object.fromEntries(LAYERS.map((l) => [l.id, l.on]));

  // ── Labels (HTML, projected every frame) ──────────────────────────────
  function label(cls, text) {
    const el = document.createElement('span');
    el.className = `gev-audit-label ${cls}`;
    el.textContent = text;
    labels.append(el);
    return el;
  }
  const fixedLabels = [
    { el: label('is-core', data.item), at: [0, 1.22, 0] },
    { el: label('is-saf', 'Safety · ED-153'), at: [0, -0.18, 3.73] },
    { el: label('is-sec', 'Security · OWASP ASVS'), at: [6.2, -0.62, 2.1] },
  ];
  const groupLabels = groups.map((g) => ({
    el: label(
      `is-group is-${g.lens}`,
      g.lens === 'sec' ? `${g.key} ${g.name}` : g.name,
    ),
    at: g.label,
  }));
  const callout = label('is-callout', '');
  const tooltip = label('is-tip', '');
  const linkLabels = [];
  const v = new THREE.Vector3();

  function place(el, world, rect, dy = 0) {
    v.copy(world).project(cam3);
    const on = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    el.style.opacity = on ? '' : '0';
    if (!on) return;
    const x = ((v.x + 1) / 2) * rect.width;
    const y = ((1 - v.y) / 2) * rect.height + dy;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  function positionLabels() {
    const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    const shown = orbit.morph > 0.92;
    labels.dataset.visible = shown ? 'true' : 'false';
    if (!shown) return;
    for (const l of fixedLabels) place(l.el, orbit.worldOf(l.at), rect);
    for (const l of groupLabels) {
      l.el.hidden = !layers.labels;
      if (layers.labels) place(l.el, orbit.worldOf(l.at), rect);
    }
    callout.hidden = !selected;
    if (selected) place(callout, orbit.worldOf(selected), rect);
    tooltip.hidden = !hovered || hovered === selected;
    if (!tooltip.hidden) place(tooltip, orbit.worldOf(hovered), rect);
    for (const l of linkLabels) place(l.el, orbit.worldOf(l.id), rect);
  }

  // ── Camera sync and drawing ───────────────────────────────────────────
  function syncCamera() {
    const f = camera.frustum;
    const o = overlayCamera({
      position: arr(camera.positionWC),
      direction: arr(camera.directionWC),
      up: arr(camera.upWC),
      fovy: f.fovy,
      aspect: f.aspectRatio,
    });
    cam3.position.set(...o.position);
    cam3.up.set(...o.up);
    cam3.lookAt(...o.target);
    cam3.fov = o.fovDeg;
    cam3.aspect = o.aspect;
    cam3.near = o.near;
    cam3.far = o.far;
    cam3.updateProjectionMatrix();
  }
  const onPostRender = () => {
    if (layer.hidden) return;
    syncCamera();
    orbit.frame(cam3, performance.now());
    renderer.render(orbit.scene, cam3);
    positionLabels();
  };
  scene.postRender.addEventListener(onPostRender);

  // Slow rotation while nobody touches the view (the "rotating planet").
  let lastSpin = null;
  const onPreRender = () => {
    const now = performance.now();
    const dt = lastSpin == null ? 0 : (now - lastSpin) / 1000;
    lastSpin = now;
    if (!active || busy || tour.isOpen() || now - lastInput < SPIN_IDLE_MS)
      return;
    camera.rotate(
      Cesium.Cartesian3.UNIT_Z,
      -SPIN_RAD_PER_S * Math.min(dt, 0.1),
    );
  };
  scene.preRender.addEventListener(onPreRender);
  const poke = (e) => {
    lastInput = performance.now();
    if (e && !busy && e.type !== 'keydown') flight?.cancel();
  };
  for (const e of ['pointerdown', 'wheel', 'keydown', 'touchstart'])
    window.addEventListener(e, poke, { capture: true, passive: true });

  // ── Hide the live scene under the orbit (rendering and picking) ───────
  function hideScene() {
    if (hidden) return;
    hidden = {
      globe: scene.globe?.show,
      primitives: scene.primitives.show,
      ground: scene.groundPrimitives?.show,
      atmosphere: scene.skyAtmosphere?.show,
    };
    if (scene.globe) scene.globe.show = false;
    scene.primitives.show = false;
    if (scene.groundPrimitives) scene.groundPrimitives.show = false;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  }
  function restoreScene() {
    if (!hidden) return;
    if (scene.globe) scene.globe.show = hidden.globe;
    scene.primitives.show = hidden.primitives;
    if (scene.groundPrimitives) scene.groundPrimitives.show = hidden.ground;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = hidden.atmosphere;
    hidden = null;
  }

  // Our own camera flight: exact final orientation (Cesium's flyTo converts
  // direction/up through heading-pitch-roll and lands a few degrees off).
  // Any user input cancels it, so navigation is never fought.
  let flight = null;
  function setPose(pose) {
    camera.position = c3(pose.position);
    camera.direction = c3(pose.direction);
    camera.up = c3(pose.up);
    camera.right = Cesium.Cartesian3.cross(
      camera.direction,
      camera.up,
      new Cesium.Cartesian3(),
    );
  }
  function flyTo(destination, direction, up, duration) {
    flight?.cancel();
    const from = {
      position: arr(camera.positionWC),
      direction: arr(camera.directionWC),
      up: arr(camera.upWC),
    };
    const to = { position: destination, direction, up };
    return new Promise((resolve) => {
      const t0 = performance.now();
      let cancelled = false;
      const tick = (now) => {
        if (cancelled) return resolve(false);
        const k = Math.min(1, (now - t0) / (duration * 1000));
        setPose(interpolatePose(from, to, ease(k)));
        if (k < 1) requestAnimationFrame(tick);
        else {
          flight = null;
          resolve(true);
        }
      };
      flight = {
        cancel() {
          cancelled = true;
          flight = null;
        },
      };
      requestAnimationFrame(tick);
    });
  }

  function setMorph(t) {
    orbit.setMorph(t);
    veil.style.opacity = String(ease(phase(t, 0, 0.5)));
    if (t >= 0.5) hideScene();
    else if (t < 0.45) restoreScene();
  }

  // ── Selection and focus ───────────────────────────────────────────────
  function select(id) {
    selected = id && itemById.has(id) ? id : null;
    const linked = selected ? linkedIds(data.themes, selected) : new Set();
    orbit.select(selected, linked);
    for (const l of linkLabels) l.el.remove();
    linkLabels.length = 0;
    for (const other of linked)
      linkLabels.push({ id: other, el: label('is-link', other) });
    if (!selected) {
      cockpit.setDetail(null);
      return;
    }
    const item = itemById.get(selected);
    const names = item.lens === 'sec' ? SEC_STATUS_NAME : STATUS_NAME;
    callout.textContent = `${selected} · ${(names[item.status] || 'Not rated').toLowerCase()}`;
    callout.dataset.tone =
      item.status === 'N' ? 'bad' : item.status === 'P' ? 'warn' : 'ok';
    cockpit.setDetail({
      item,
      linked: [...linked].map((id) => itemById.get(id)).filter(Boolean),
      finding: historyById.get(selected) || null,
    });
  }

  function focus(id) {
    const w = orbit.worldOf(id);
    if (!w) return;
    const node = [w.x * R, w.y * R, w.z * R];
    const eye = arr(camera.positionWC);
    const away = norm([eye[0] - node[0], eye[1] - node[1], eye[2] - node[2]]);
    const destination = node.map((n, i) => n + away[i] * 5 * R);
    const direction = away.map((x) => -x);
    const north = [0, 0, 1];
    const d = north.reduce((s, x, i) => s + x * direction[i], 0);
    const up = norm(north.map((x, i) => x - d * direction[i]));
    poke();
    flyTo(destination, direction, up, 1.4);
  }

  function setLayer(id, on) {
    layers[id] = on;
    orbit.setLayers(layers);
    cockpit.setLayers(layers);
  }

  // ── Pointer: click selects, double-click focuses, hover names ─────────
  let down = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, r.width, r.height];
  };
  const target = viewer.canvas;
  const onDown = (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e) => {
    if (!active || busy || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 5 || !quick) return;
    const [x, y, w, h] = local(e);
    select(orbit.pick(cam3, x, y, w, h));
  };
  const onDouble = (e) => {
    if (!active || busy) return;
    const [x, y, w, h] = local(e);
    const id = orbit.pick(cam3, x, y, w, h, 18);
    if (!id) return;
    select(id);
    focus(id);
  };
  let moveQueued = false;
  const onMove = (e) => {
    if (!active || busy || moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      const [x, y, w, h] = local(e);
      const id = orbit.pick(cam3, x, y, w, h, 10);
      hovered = id;
      target.style.cursor = id ? 'pointer' : '';
      if (id) {
        const item = itemById.get(id);
        tooltip.textContent = `${id} · ${item.lens === 'sec' ? 'Security' : 'Safety'}`;
      }
    });
  };
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('dblclick', onDouble);
  target.addEventListener('pointermove', onMove);

  const onKey = (e) => {
    if (!active || busy || e.key !== 'Escape') return;
    if (tour.isOpen()) return; // the tour handles its own keys
    e.stopImmediatePropagation();
    if (drawer.isOpen()) drawer.close();
    else if (selected) select(null);
    else exit();
  };
  window.addEventListener('keydown', onKey, { capture: true });

  // ── Cockpit, evidence drawer, tour ────────────────────────────────────
  const cockpit = createCockpit({
    container: layer,
    data,
    saf,
    sec,
    must: mustFix(data.items),
    layers,
    onLayer: (id) => setLayer(id, !layers[id]),
    onSelect: (id) => {
      select(id);
      focus(id);
    },
    onClear: () => select(null),
    onTour: () => tour.start(),
    onEvidence: () => drawer.open(),
    onExit: () => exit(),
  });
  const drawer = createEvidenceDrawer({
    container: layer,
    ledger,
    items: data.items,
    onShow: (id) => {
      drawer.close();
      select(id);
      focus(id);
    },
  });
  const tour = createTour({
    container: layer,
    zones: cockpit.zones,
    actions: {
      pulse: (key, ms) => orbit.pulse(key, ms),
      select: (id) => select(id),
      layer: (id, on) => setLayer(id, on),
      layerState: (id) => !!layers[id],
      evidence: () => drawer.open(),
      closeEvidence: () => drawer.close(),
    },
  });

  // ── Enter and exit ────────────────────────────────────────────────────
  async function enter() {
    if (active || busy) return;
    active = true;
    busy = true;
    saved = {
      position: arr(camera.positionWC),
      direction: arr(camera.directionWC),
      up: arr(camera.upWC),
      minZoom: controller.minimumZoomDistance,
      maxZoom: controller.maximumZoomDistance,
      tracked: viewer.trackedEntity,
    };
    viewer.trackedEntity = undefined;
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    holdContinuousRender(HOLD);
    resize();
    layer.hidden = false;
    document.body.classList.add('gev-audit');
    cockpit.setVisible(false);
    setMorph(0);
    const lon =
      Cesium.Cartographic.fromCartesian(camera.positionWC)?.longitude ?? 0;
    orbit.setLongitude(lon);
    orbit.setLayers(layers);
    const pose = auditPose(lon, camera.frustum.fovy);
    await flyTo(pose.destination, pose.direction, pose.up, FLY_IN_S);
    await animate(0, 1, MORPH_IN_MS, setMorph);
    controller.minimumZoomDistance = 0.9 * R;
    controller.maximumZoomDistance = 60 * R;
    cockpit.setVisible(true);
    lastInput = performance.now();
    busy = false;
    if (!tourSeen()) tour.prompt();
  }

  async function exit() {
    if (!active || busy) return;
    busy = true;
    tour.close();
    drawer.close();
    select(null);
    hovered = null;
    target.style.cursor = '';
    cockpit.setVisible(false);
    controller.minimumZoomDistance = saved.minZoom;
    controller.maximumZoomDistance = saved.maxZoom;
    await animate(1, 0, MORPH_OUT_MS, setMorph);
    restoreScene();
    layer.hidden = true;
    document.body.classList.remove('gev-audit');
    await flyTo(saved.position, saved.direction, saved.up, 2.0);
    releaseContinuousRender(HOLD);
    active = false;
    busy = false;
    onExited?.();
  }

  function destroy() {
    if (active) {
      restoreScene();
      releaseContinuousRender(HOLD);
      document.body.classList.remove('gev-audit');
    }
    scene.postRender.removeEventListener(onPostRender);
    scene.preRender.removeEventListener(onPreRender);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey, { capture: true });
    for (const e of ['pointerdown', 'wheel', 'keydown', 'touchstart'])
      window.removeEventListener(e, poke, { capture: true });
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointerup', onUp);
    target.removeEventListener('dblclick', onDouble);
    target.removeEventListener('pointermove', onMove);
    tour.destroy();
    drawer.destroy();
    cockpit.destroy();
    orbit.dispose();
    renderer.dispose();
    layer.remove();
  }

  return {
    enter,
    exit,
    destroy,
    isActive: () => active,
    isBusy: () => busy,
    // Diagnostics for tests and the harness.
    debug: { select, focus, setLayer, orbit, layers, saf, sec },
  };
}
