/**
 * Drone-swarm cinematic (Exercise mode) on a plain 2D canvas composited over
 * the frozen Cesium view. Waves of drones streak in from one flank toward
 * impact anchors on the fictional airfield, blooming into additive explosions
 * with smoke, debris, flash and a screen shake.
 *
 * Choreography for the camera, not a tactical model: drones follow authored
 * curves to preset screen points handed in by the caller. 2D canvas (not
 * WebGL) so it reliably draws over the globe without a second GL context.
 */

function sprite(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function glowSprite() {
  return sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,238,196,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function smokeSprite() {
  return sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(46,44,42,0.9)');
    g.addColorStop(0.6, 'rgba(40,38,36,0.5)');
    g.addColorStop(1, 'rgba(30,28,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

function droneSprite() {
  return sprite((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#eef2f6';
    ctx.strokeStyle = 'rgba(255,190,110,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(s * 0.26, s * 0.28);
    ctx.lineTo(0, s * 0.12);
    ctx.lineTo(-s * 0.26, s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, 48);
}

function tracerSprite() {
  return sprite((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,170,80,0)');
    g.addColorStop(1, 'rgba(255,196,110,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(s * 0.4, 0, s * 0.2, s);
  }, 64);
}

const rand = (a, b) => a + Math.random() * (b - a);
const easeIn = (t) => t * t;

export function createSwarmCinematic() {
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
    transition: 'opacity 350ms ease',
  });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0;
  let H = 0;
  let dpr = 1;
  function size() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', size);
  size();

  const img = {
    glow: glowSprite(),
    smoke: smokeSprite(),
    drone: droneSprite(),
    tracer: tracerSprite(),
  };

  let raf = 0;
  let running = false;
  let drones = [];
  let sprites = [];
  let shakeAmt = 0;
  let pendingResolve = null;

  function reset() {
    drones = [];
    sprites = [];
    shakeAmt = 0;
  }

  function spawnDrone(anchor, launchAtMs) {
    const start = { x: rand(-W * 0.1, W * 0.5), y: rand(-H * 0.18, -30) };
    drones.push({ x: start.x, y: start.y, start, anchor, launchAtMs, flightMs: rand(1300, 2100), done: false });
  }

  function impact(anchor, big) {
    const base = big ? 240 : 140;
    sprites.push({ kind: 'flash', x: anchor.x, y: anchor.y, age: 0, life: 0.2, from: base * 0.4, to: base, hue: '#ffffff' });
    for (let i = 0; i < (big ? 3 : 2); i += 1) {
      sprites.push({ kind: 'fire', x: anchor.x + rand(-14, 14), y: anchor.y + rand(-14, 14), age: 0, life: rand(0.5, 0.85), from: base * 0.28, to: base });
    }
    for (let i = 0; i < (big ? 18 : 11); i += 1) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(130, big ? 430 : 300);
      sprites.push({ kind: 'debris', x: anchor.x, y: anchor.y, age: 0, life: rand(0.6, 1.1), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rand(60, 180), gy: 620, sz: rand(4, 8) });
    }
    for (let i = 0; i < (big ? 6 : 4); i += 1) {
      sprites.push({ kind: 'smoke', x: anchor.x + rand(-18, 18), y: anchor.y + rand(-10, 10), age: rand(0, 0.3), life: rand(2.2, 3.6), vy: -rand(20, 45), sz: rand(44, 74), grow: rand(60, 110), peak: rand(0.45, 0.7) });
    }
    if (big) shakeAmt = Math.max(shakeAmt, 14);
  }

  function fallbackAnchors() {
    return [
      { x: W * 0.5, y: H * 0.56 }, { x: W * 0.42, y: H * 0.62 }, { x: W * 0.58, y: H * 0.5 },
      { x: W * 0.47, y: H * 0.48 }, { x: W * 0.62, y: H * 0.62 }, { x: W * 0.38, y: H * 0.52 },
    ];
  }

  function update(now, dt) {
    for (const d of drones) {
      if (d.done || now < d.launchAtMs) continue;
      const t = Math.min(1, (now - d.launchAtMs) / d.flightMs);
      const e = easeIn(t);
      d.px = d.x;
      d.py = d.y;
      d.x = d.start.x + (d.anchor.x - d.start.x) * e;
      d.y = d.start.y + (d.anchor.y - d.start.y) * e;
      d.t = t;
      if (t >= 1) {
        d.done = true;
        impact(d.anchor, Math.random() < 0.18);
      }
    }
    for (let i = sprites.length - 1; i >= 0; i -= 1) {
      const s = sprites[i];
      s.age += dt;
      if (s.age / s.life >= 1) {
        sprites.splice(i, 1);
        continue;
      }
      if (s.kind === 'debris') {
        s.vy += s.gy * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      } else if (s.kind === 'smoke') {
        s.y += s.vy * dt;
        s.sz += s.grow * dt;
      }
    }
    if (shakeAmt > 0.3) shakeAmt *= 0.9;
    else shakeAmt = 0;
  }

  function stamp(image, x, y, w, h, rot) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shakeAmt) ctx.translate(rand(-shakeAmt, shakeAmt), rand(-shakeAmt, shakeAmt));

    // Smoke behind.
    ctx.globalCompositeOperation = 'source-over';
    for (const s of sprites) {
      if (s.kind !== 'smoke') continue;
      ctx.globalAlpha = Math.sin(Math.min(s.age / s.life, 1) * Math.PI) * s.peak;
      stamp(img.smoke, s.x, s.y, s.sz, s.sz, 0);
    }

    // Drones + tracers.
    ctx.globalAlpha = 1;
    for (const d of drones) {
      if (d.done || d.t == null) continue;
      const ang = Math.atan2(d.y - (d.py ?? d.y), d.x - (d.px ?? d.x));
      const grow = 16 + 12 * d.t;
      ctx.globalAlpha = 0.85;
      stamp(img.tracer, d.x, d.y, 10, 26 + 26 * d.t, ang + Math.PI / 2);
      ctx.globalAlpha = 1;
      stamp(img.drone, d.x, d.y, grow, grow, ang + Math.PI / 2);
    }

    // Explosions, flash and debris (additive).
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sprites) {
      const k = s.age / s.life;
      if (s.kind === 'flash' || s.kind === 'fire') {
        const sc = s.from + (s.to - s.from) * easeIn(k);
        ctx.globalAlpha = 1 - k;
        stamp(img.glow, s.x, s.y, sc, sc, 0);
      } else if (s.kind === 'debris') {
        ctx.globalAlpha = 1 - k;
        stamp(img.glow, s.x, s.y, s.sz, s.sz, 0);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function finish() {
    running = false;
    canvas.style.opacity = '0';
    reset();
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
  }

  function play({ anchors, durationMs = 16000 } = {}) {
    stop();
    const pts = anchors && anchors.length ? anchors : fallbackAnchors();
    running = true;
    canvas.style.opacity = '1';
    const startMs = performance.now();
    console.info(`[exercise] swarm cinematic started: ${pts.length} anchors, ${W}x${H}`);
    const safety = setTimeout(finish, durationMs + 6000);
    const total = 90;
    for (let i = 0; i < total; i += 1) {
      spawnDrone(pts[i % pts.length], startMs + (i / total) * durationMs * 0.7 + rand(0, 400));
    }
    return new Promise((resolve) => {
      pendingResolve = () => {
        clearTimeout(safety);
        resolve();
      };
      let last = startMs;
      const tick = (now) => {
        if (!running) return finish();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        try {
          update(now, dt);
          draw();
        } catch (error) {
          console.error('[exercise] swarm tick error', error);
          return finish();
        }
        if (now - startMs > durationMs && drones.every((d) => d.done) && sprites.length === 0) {
          return finish();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    finish();
  }

  function destroy() {
    stop();
    window.removeEventListener('resize', size);
    canvas.remove();
  }

  return { play, stop, destroy };
}
