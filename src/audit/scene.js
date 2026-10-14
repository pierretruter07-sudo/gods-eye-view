/**
 * @file The CrossCheck orbit, drawn with three.js over God's Eye View's globe.
 *
 * World units are Earth radii, Earth-fixed (ECEF). The globe graticule is
 * built in ECEF so it lines up with the real Earth during the morph; the
 * rings live in an orbit-local group rotated to face the viewer's longitude.
 * Calm by design: no bloom; only must-fix items are lit on first load and
 * every other layer sits at 15% until switched on.
 * @module audit/scene
 */
import * as THREE from '../../vendor/three/three.module.min.js';
import { basisForLongitude, ease, phase } from './cameraMath.js';
import { RINGS, nodeOpacity } from './model.js';

const COLOR = {
  C: 0x6fd3a6,
  L: 0x9ad97f,
  P: 0xf0b44c,
  N: 0xff6b5e,
  NA: 0x4a5a70,
  UN: 0xdfe8f2,
  OUT: 0x2a3546,
  saf: 0x7aa7dc,
  sec: 0xa294dc,
  link: 0x9fb6d4,
  linkHot: 0xffd0c8,
};

function nodeColor(item) {
  if (item.out) return COLOR.OUT;
  if (!item.status) return COLOR.UN;
  return COLOR[item.status] ?? COLOR.UN;
}

function fresnelMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      c: { value: new THREE.Color(color) },
      alpha: { value: 0 },
    },
    vertexShader:
      'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader:
      'uniform vec3 c; uniform float alpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-max(dot(vN,vV),0.),2.6); gl_FragColor = vec4(c*(f*1.5+0.03), (f*0.95+0.03)*alpha); }',
  });
}

function lineMaterial(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function circle(radius, y, segments = 160) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/**
 * Build the orbit scene.
 * @param {{nodes: object[], groups: object[], themes: object[]}} model
 */
export function createOrbitScene({ nodes, groups, themes }) {
  const scene = new THREE.Scene();
  const fadeables = []; // { material, base, key }: opacity = base × factor(key)

  // ── Stars, far away ───────────────────────────────────────────────────
  {
    const n = 900;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 120;
      p[i * 3] = r * Math.sqrt(1 - u * u) * Math.cos(t);
      p[i * 3 + 1] = r * Math.sqrt(1 - u * u) * Math.sin(t);
      p[i * 3 + 2] = r * u;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({
      color: 0x8fa8c8,
      size: 1.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
    });
    fadeables.push({ material: m, base: 0.45, key: 'veil' });
    scene.add(new THREE.Points(g, m));
  }

  // ── The software item: a glass Earth with the real graticule (ECEF) ──
  const core = new THREE.Group();
  scene.add(core);
  const shell = fresnelMaterial(0x9cc6ef);
  core.add(new THREE.Mesh(new THREE.SphereGeometry(1.0, 96, 64), shell));
  const grid = lineMaterial(0x8fbbe6, 0);
  fadeables.push({ material: grid, base: 0.24, key: 'core' });
  for (let lat = -60; lat <= 60; lat += 30) {
    const r = Math.cos((lat * Math.PI) / 180);
    const z = Math.sin((lat * Math.PI) / 180);
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
    }
    core.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), grid),
    );
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const L = (lon * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(
          Math.cos(a) * Math.cos(L),
          Math.cos(a) * Math.sin(L),
          Math.sin(a),
        ),
      );
    }
    core.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), grid),
    );
  }

  // ── The orbit, in orbit-local axes (y = Earth's axis) ─────────────────
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  scene.add(root);
  const rings = new THREE.Group(); // scaled during the morph
  root.add(rings);

  const floorMat = lineMaterial(0x2c4566, 0);
  fadeables.push({ material: floorMat, base: 0.12, key: 'rings' });
  for (const r of [2.6, 4.3, 5.9, 7.5])
    rings.add(new THREE.Line(circle(r, -1.47), floorMat));

  for (const g of groups) {
    const ring = RINGS[g.lens];
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = g.from + ((g.to - g.from) * i) / 48;
      pts.push(
        new THREE.Vector3(
          Math.cos(a) * ring.radius,
          ring.base,
          Math.sin(a) * ring.radius,
        ),
      );
    }
    const m = new THREE.MeshBasicMaterial({
      color: COLOR[g.lens],
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    fadeables.push({ material: m, base: 0.45, key: 'rings' });
    rings.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts),
          48,
          g.lens === 'sec' ? 0.02 : 0.019,
          6,
          false,
        ),
        m,
      ),
    );
  }

  const dot = new THREE.SphereGeometry(1, 14, 10);
  const byId = new Map();
  for (const n of nodes) {
    const color = n.blocking
      ? n.item.status === 'N'
        ? COLOR.N
        : COLOR.P
      : nodeColor(n.item);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(dot, material);
    mesh.scale.setScalar(n.size * (n.blocking ? 1.5 : 0.8));
    mesh.position.set(...n.base);
    rings.add(mesh);
    const entry = { node: n, mesh, material, stem: null, foot: null };
    if (n.blocking) {
      const stemMat = lineMaterial(color, 0);
      const stemGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...n.base),
        new THREE.Vector3(...n.base),
      ]);
      entry.stem = new THREE.Line(stemGeo, stemMat);
      rings.add(entry.stem);
      const footMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      entry.foot = new THREE.Mesh(
        new THREE.RingGeometry(n.size * 1.6, n.size * 2.2, 24),
        footMat,
      );
      entry.foot.rotation.x = -Math.PI / 2;
      entry.foot.position.set(n.base[0], n.base[1] + 0.005, n.base[2]);
      rings.add(entry.foot);
    }
    byId.set(n.id, entry);
  }

  // ── Links between the standards (shared evidence themes) ──────────────
  const links = [];
  themes.forEach((t, ti) => {
    for (const a of t.saf)
      for (const b of t.sec) {
        const A = byId.get(a);
        const B = byId.get(b);
        if (!A || !B) continue;
        const material = new THREE.MeshBasicMaterial({
          color: COLOR.link,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        rings.add(mesh);
        links.push({ theme: ti, a, b, mesh, material, built: -1 });
      }
  });

  // ── Selection marks ───────────────────────────────────────────────────
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.165, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.visible = false;
  rings.add(halo);
  const linkMarks = [];

  // ── State ─────────────────────────────────────────────────────────────
  const state = {
    morph: 0,
    layers: {},
    selected: null,
    linked: new Set(),
    pulse: null, // { key: 'saf'|'sec'|'core'|'mustfix', until }
  };
  const tmp = new THREE.Vector3();

  function factor(key, t) {
    if (key === 'veil') return ease(phase(t, 0.0, 0.5));
    if (key === 'core') return ease(phase(t, 0.05, 0.45));
    return ease(phase(t, 0.3, 0.65));
  }

  function liftFactor(t) {
    return ease(phase(t, 0.7, 1));
  }

  function rebuildLink(l, lift) {
    if (l.built === lift) return;
    const A = byId.get(l.a).node;
    const B = byId.get(l.b).node;
    const pa = new THREE.Vector3(
      A.base[0],
      A.base[1] + (A.position[1] - A.base[1]) * lift,
      A.base[2],
    );
    const pb = new THREE.Vector3(
      B.base[0],
      B.base[1] + (B.position[1] - B.base[1]) * lift,
      B.base[2],
    );
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y += 0.7 + pa.distanceTo(pb) * 0.1;
    l.mesh.geometry.dispose();
    l.mesh.geometry = new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(pa, mid, pb),
      48,
      0.0045,
      5,
      false,
    );
    l.built = lift;
  }

  /** Re-apply every opacity, position and scale from the current state. */
  function apply(now = performance.now()) {
    const t = state.morph;
    shell.uniforms.alpha.value = factor('core', t);
    for (const f of fadeables) f.material.opacity = f.base * factor(f.key, t);
    const ringFactor = factor('rings', t);
    const s = 0.22 + 0.78 * ease(phase(t, 0.3, 0.8));
    rings.scale.set(s, 1, s);
    const lift = Math.round(liftFactor(t) * 20) / 20;
    const pulseOn = state.pulse && now < state.pulse.until;
    const pulse = pulseOn ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
    for (const e of byId.values()) {
      const n = e.node;
      let o = nodeOpacity(n, state.layers, {
        selected: state.selected,
        linked: state.linked,
      });
      if (
        pulseOn &&
        (state.pulse.key === n.lens ||
          (state.pulse.key === 'mustfix' && n.blocking))
      )
        o = Math.max(o, 0.35 + 0.65 * pulse);
      e.material.opacity = o * ringFactor;
      const y = n.base[1] + (n.position[1] - n.base[1]) * lift;
      e.mesh.position.y = y;
      if (e.stem) {
        const pos = e.stem.geometry.attributes.position;
        pos.setY(1, y);
        pos.needsUpdate = true;
        e.stem.material.opacity = 0.75 * o * ringFactor;
        e.foot.material.opacity = 0.6 * o * ringFactor;
      }
    }
    const linksOn = !!state.layers.links;
    for (const l of links) {
      const hot =
        state.selected && (l.a === state.selected || l.b === state.selected);
      rebuildLink(l, lift);
      l.material.color.setHex(hot ? COLOR.linkHot : COLOR.link);
      l.material.opacity = (hot ? 0.95 : linksOn ? 0.4 : 0.035) * ringFactor;
    }
    if (pulseOn && state.pulse.key === 'core')
      shell.uniforms.alpha.value *= 1 + 0.6 * pulse;
    halo.visible = !!state.selected && t > 0.95;
  }

  /** Place the orbit for a viewer at longitude `lon` (radians). */
  function setLongitude(lon) {
    const b = basisForLongitude(lon);
    root.matrix.set(
      b.x[0],
      b.y[0],
      b.z[0],
      0,
      b.x[1],
      b.y[1],
      b.z[1],
      0,
      b.x[2],
      b.y[2],
      b.z[2],
      0,
      0,
      0,
      0,
      1,
    );
    root.matrixWorldNeedsUpdate = true;
  }

  function setMorph(t) {
    state.morph = Math.min(1, Math.max(0, t));
    apply();
  }

  function setLayers(layers) {
    state.layers = { ...layers };
    apply();
  }

  function select(id, linked = new Set()) {
    for (const m of linkMarks) rings.remove(m);
    linkMarks.length = 0;
    state.selected = id;
    state.linked = linked;
    if (id && byId.has(id)) {
      const e = byId.get(id);
      halo.position.copy(e.mesh.position);
      for (const other of linked) {
        const o = byId.get(other);
        if (!o) continue;
        const r = new THREE.Mesh(
          new THREE.RingGeometry(0.075, 0.084, 48),
          new THREE.MeshBasicMaterial({
            color: COLOR.linkHot,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        r.position.copy(o.mesh.position);
        r.userData.follow = o.mesh;
        rings.add(r);
        linkMarks.push(r);
      }
    }
    apply();
  }

  function pulse(key, ms = 2600) {
    state.pulse = { key, until: performance.now() + ms };
  }

  /** Per-frame: face marks at the camera and animate pulses. */
  function frame(camera, now) {
    if (state.selected) {
      const e = byId.get(state.selected);
      if (e) halo.position.copy(e.mesh.position);
      halo.lookAt(camera.position);
      const s = 1 + 0.08 * Math.sin(now / 420);
      halo.scale.setScalar(s);
    }
    for (const m of linkMarks) {
      m.position.copy(m.userData.follow.position);
      m.lookAt(camera.position);
    }
    if (state.pulse) {
      apply(now);
      if (now > state.pulse.until) state.pulse = null;
    }
  }

  /** World position (Earth radii, ECEF) of a node or a local point. */
  function worldOf(idOrPoint) {
    if (typeof idOrPoint === 'string') {
      const e = byId.get(idOrPoint);
      if (!e) return null;
      return rings.localToWorld(tmp.copy(e.mesh.position)).clone();
    }
    return rings.localToWorld(tmp.set(...idOrPoint)).clone();
  }

  /** Nearest node to a screen point, preferring visible ones. */
  function pick(camera, x, y, width, height, radiusPx = 14) {
    let best = null;
    let bestScore = Infinity;
    for (const e of byId.values()) {
      if (e.material.opacity <= 0.01) continue;
      const w = rings.localToWorld(tmp.copy(e.mesh.position)).project(camera);
      if (w.z > 1) continue;
      const sx = ((w.x + 1) / 2) * width;
      const sy = ((1 - w.y) / 2) * height;
      const d = Math.hypot(sx - x, sy - y);
      if (d > radiusPx) continue;
      const score = d - (e.material.opacity > 0.5 ? 6 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e.node.id;
      }
    }
    return best;
  }

  function dispose() {
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
  }

  apply();
  return {
    scene,
    setLongitude,
    setMorph,
    setLayers,
    select,
    pulse,
    frame,
    worldOf,
    pick,
    dispose,
    get morph() {
      return state.morph;
    },
  };
}

export { THREE };
