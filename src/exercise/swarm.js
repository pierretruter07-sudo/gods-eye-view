import * as THREE from 'three';

/**
 * Drone-swarm cinematic (Exercise mode). A transparent Three.js overlay
 * composited over a frozen Cesium view: waves of drones streak in from one
 * flank toward impact anchors on the fictional airfield, blooming into
 * additive explosions with smoke, debris and a screen flash.
 *
 * This is choreography for the camera, not a tactical model: drones follow
 * authored curves to preset screen points. Nothing here is geo-registered
 * beyond the anchor pixels handed in by the caller.
 */

function texture(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function glowTexture() {
  return texture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,240,200,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function smokeTexture() {
  return texture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(40,40,46,0.9)');
    g.addColorStop(0.6, 'rgba(30,30,36,0.5)');
    g.addColorStop(1, 'rgba(20,20,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function droneTexture() {
  return texture((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#e8edf2';
    ctx.strokeStyle = 'rgba(255,200,120,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.32);
    ctx.lineTo(s * 0.26, s * 0.28);
    ctx.lineTo(0, s * 0.12);
    ctx.lineTo(-s * 0.26, s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, 64);
}

function tracerTexture() {
  return texture((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,180,90,0)');
    g.addColorStop(1, 'rgba(255,190,110,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(s * 0.42, 0, s * 0.16, s);
  }, 64);
}

const rand = (a, b) => a + Math.random() * (b - a);
const easeIn = (t) => t * t;

export function createSwarmCinematic({ viewer }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gev-swarm';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '170',
    opacity: '0',
    transition: 'opacity 400ms ease',
  });
  document.body.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  let W = window.innerWidth;
  let H = window.innerHeight;
  // Pixel-space ortho overlay: x 0..W (left→right), y 0..H (top→bottom).
  // Camera pulled back on +Z looking down -Z, so sprites at z 0..5 sit in
  // front of it within the near/far range (a defensive, unambiguous setup).
  const camera = new THREE.OrthographicCamera(0, W, 0, H, 0.1, 1000);
  camera.position.z = 10;

  const tex = {
    glow: glowTexture(),
    smoke: smokeTexture(),
    drone: droneTexture(),
    tracer: tracerTexture(),
  };
  const material = {
    glow: () => new THREE.SpriteMaterial({ map: tex.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    smoke: () => new THREE.SpriteMaterial({ map: tex.smoke, transparent: true, depthWrite: false }),
    drone: () => new THREE.SpriteMaterial({ map: tex.drone, transparent: true, depthWrite: false }),
    tracer: () => new THREE.SpriteMaterial({ map: tex.tracer, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  };

  function size() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.right = W;
    camera.bottom = H;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', size);
  size();

  let raf = 0;
  let running = false;
  let drones = [];
  let sprites = []; // {sprite, kind, ...}
  let pendingResolve = null;

  function addSprite(mat, x, y, scale, z = 0) {
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    scene.add(s);
    return s;
  }

  function spawnDrone(anchor, launchAtMs) {
    // Inbound from the upper-left flank, converging on the anchor.
    const start = { x: rand(-W * 0.1, W * 0.5), y: rand(-H * 0.15, -20) };
    const sprite = addSprite(material.drone(), start.x, start.y, 22, 2);
    const tracer = addSprite(material.tracer(), start.x, start.y, 18, 1);
    drones.push({
      sprite,
      tracer,
      start,
      anchor,
      launchAtMs,
      flightMs: rand(1300, 2100),
      done: false,
    });
  }

  function impact(anchor, big) {
    const baseScale = big ? 230 : 130;
    // Flash
    const f = addSprite(material.glow(), anchor.x, anchor.y, baseScale * 0.4, 5);
    sprites.push({ sprite: f, kind: 'flash', age: 0, life: 0.18, from: baseScale * 0.4, to: baseScale * 0.9 });
    // Fireballs
    for (let i = 0; i < (big ? 3 : 2); i += 1) {
      const g = addSprite(material.glow(), anchor.x + rand(-14, 14), anchor.y + rand(-14, 14), baseScale * 0.3, 4);
      g.material.color.set(i === 0 ? '#fff2cc' : '#ff9a3c');
      sprites.push({ sprite: g, kind: 'fire', age: 0, life: rand(0.5, 0.8), from: baseScale * 0.3, to: baseScale });
    }
    // Debris
    for (let i = 0; i < (big ? 16 : 10); i += 1) {
      const d = addSprite(material.glow(), anchor.x, anchor.y, rand(3, 6), 3);
      d.material.color.set('#ffcf80');
      const ang = rand(0, Math.PI * 2);
      const spd = rand(120, big ? 420 : 300);
      sprites.push({ sprite: d, kind: 'debris', age: 0, life: rand(0.6, 1.1), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rand(60, 180), gy: 600 });
    }
    // Smoke
    for (let i = 0; i < (big ? 6 : 4); i += 1) {
      const sm = addSprite(material.smoke(), anchor.x + rand(-18, 18), anchor.y + rand(-10, 10), rand(40, 70), 0);
      sm.material.opacity = 0.0;
      sprites.push({ sprite: sm, kind: 'smoke', age: rand(0, 0.3), life: rand(2.2, 3.4), vy: -rand(20, 45), grow: rand(60, 110), peak: rand(0.45, 0.7) });
    }
    if (big) shake(14);
  }

  let shakeAmt = 0;
  function shake(px) {
    shakeAmt = Math.max(shakeAmt, px);
  }

  function clearAll() {
    for (const d of drones) {
      scene.remove(d.sprite, d.tracer);
      d.sprite.material.dispose();
      d.tracer.material.dispose();
    }
    for (const s of sprites) {
      scene.remove(s.sprite);
      s.sprite.material.dispose();
    }
    drones = [];
    sprites = [];
  }

  function play({ anchors, durationMs = 16000 }) {
    stop();
    const pts = anchors && anchors.length ? anchors : fallbackAnchors();
    running = true;
    canvas.style.opacity = '1';
    const startMs = performance.now();
    console.info(`[exercise] swarm cinematic started: ${pts.length} anchors`);
    // Fail-safe: never leave the overlay or the awaiting launch hanging.
    const safety = setTimeout(() => stop(), durationMs + 6000);
    // Schedule drones in waves over the first ~70% of the run.
    const total = 90;
    for (let i = 0; i < total; i += 1) {
      const anchor = pts[i % pts.length];
      spawnDrone(anchor, startMs + (i / total) * durationMs * 0.7 + rand(0, 400));
    }

    return new Promise((resolve) => {
      pendingResolve = () => {
        clearTimeout(safety);
        resolve();
      };
      let last = startMs;
      const tick = (now) => {
        if (!running) return pendingResolve();
        let dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        try {
          step(now, dt);
        } catch (error) {
          console.error('[exercise] swarm tick error', error);
          running = false;
          canvas.style.opacity = '0';
          clearAll();
          return pendingResolve();
        }
        if (now - startMs > durationMs && drones.every((d) => d.done) && sprites.length === 0) {
          running = false;
          canvas.style.opacity = '0';
          clearAll();
          return pendingResolve();
        }
        raf = requestAnimationFrame(tick);
      };

      const step = (now, dt) => {

        for (const d of drones) {
          if (d.done || now < d.launchAtMs) continue;
          const t = Math.min(1, (now - d.launchAtMs) / d.flightMs);
          const e = easeIn(t);
          const x = d.start.x + (d.anchor.x - d.start.x) * e;
          const y = d.start.y + (d.anchor.y - d.start.y) * e;
          const px = d.sprite.position.x;
          const py = d.sprite.position.y;
          d.sprite.position.set(x, y, 2);
          d.tracer.position.set(x, y - 10, 1);
          const ang = Math.atan2(y - py, x - px);
          d.sprite.material.rotation = ang - Math.PI / 2;
          d.tracer.material.rotation = ang - Math.PI / 2;
          const grow = 14 + 12 * t;
          d.sprite.scale.set(grow, grow, 1);
          d.tracer.scale.set(8, 20 + 24 * t, 1);
          if (t >= 1) {
            d.done = true;
            scene.remove(d.sprite, d.tracer);
            d.sprite.material.dispose();
            d.tracer.material.dispose();
            const big = Math.random() < 0.18;
            impact(d.anchor, big);
          }
        }

        for (let i = sprites.length - 1; i >= 0; i -= 1) {
          const s = sprites[i];
          s.age += dt;
          const k = s.age / s.life;
          if (k >= 1) {
            scene.remove(s.sprite);
            s.sprite.material.dispose();
            sprites.splice(i, 1);
            continue;
          }
          if (s.kind === 'flash' || s.kind === 'fire') {
            const sc = s.from + (s.to - s.from) * easeIn(k);
            s.sprite.scale.set(sc, sc, 1);
            s.sprite.material.opacity = 1 - k;
          } else if (s.kind === 'debris') {
            s.vy += s.gy * dt;
            s.sprite.position.x += s.vx * dt;
            s.sprite.position.y += s.vy * dt;
            s.sprite.material.opacity = 1 - k;
          } else if (s.kind === 'smoke') {
            s.sprite.position.y += s.vy * dt;
            const sc = s.sprite.scale.x + s.grow * dt;
            s.sprite.scale.set(sc, sc, 1);
            s.sprite.material.opacity = Math.sin(Math.min(k, 1) * Math.PI) * s.peak;
          }
        }

        if (shakeAmt > 0.3) {
          camera.left = rand(-shakeAmt, shakeAmt);
          camera.right = W + camera.left;
          camera.top = rand(-shakeAmt, shakeAmt);
          camera.bottom = H + camera.top;
          camera.updateProjectionMatrix();
          shakeAmt *= 0.9;
        } else if (shakeAmt) {
          shakeAmt = 0;
          camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;
          camera.updateProjectionMatrix();
        }

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  function fallbackAnchors() {
    return [
      { x: W * 0.5, y: H * 0.56 },
      { x: W * 0.42, y: H * 0.62 },
      { x: W * 0.58, y: H * 0.5 },
      { x: W * 0.47, y: H * 0.48 },
      { x: W * 0.62, y: H * 0.62 },
      { x: W * 0.38, y: H * 0.52 },
    ];
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    canvas.style.opacity = '0';
    clearAll();
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  }

  function destroy() {
    stop();
    window.removeEventListener('resize', size);
    renderer.dispose();
    for (const t of Object.values(tex)) t.dispose();
    canvas.remove();
  }

  return { play, stop, destroy };
}
