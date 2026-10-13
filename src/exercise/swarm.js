/**
 * Drone-swarm cinematic (Exercise mode) on a 2D canvas composited over the
 * frozen Cesium view. Waves of drones streak in from one flank to impact
 * anchors on the fictional airfield and detonate.
 *
 * The explosion visuals follow real-VFX guidance (realtimevfx.com): a brief
 * hot flash, a layered amber fireball with a white-hot core and spiky radial
 * streaks, warm semi-transparent billowing smoke (never solid black), low
 * ground-hugging dust, sandy debris thrown in upward cones, small sparks, and
 * a persistent ground scorch. Choreography for the camera, not a tactical
 * model.
 */

function sprite(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

const radial = (stops, centerY = 0.5) =>
  sprite((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s * centerY, 0, s / 2, s * centerY, s / 2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

const SPRITES = {
  // White-hot core: brief, additive.
  core: radial([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,245,214,0.9)'], [1, 'rgba(255,240,200,0)']]),
  // Fireball body: desaturated amber, additive.
  fire: radial([[0, 'rgba(255,248,230,0.95)'], [0.3, 'rgba(255,210,122,0.85)'], [0.6, 'rgba(255,150,60,0.5)'], [1, 'rgba(255,120,40,0)']]),
  // Smoke: warm grey, denser toward the top, never black. Normal blend.
  smoke: radial([[0, 'rgba(120,112,100,0.85)'], [0.55, 'rgba(96,88,78,0.45)'], [1, 'rgba(78,70,60,0)']], 0.42),
  // Ground dust: brown haze.
  dust: radial([[0, 'rgba(202,170,112,0.7)'], [0.6, 'rgba(184,150,94,0.35)'], [1, 'rgba(170,138,86,0)']]),
  // Ground scorch: dark, persistent.
  scorch: radial([[0, 'rgba(26,18,10,0.8)'], [0.55, 'rgba(32,24,14,0.5)'], [1, 'rgba(32,24,14,0)']]),
};

function droneSprite() {
  return sprite((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#e9edf1';
    ctx.strokeStyle = 'rgba(255,190,110,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.34);
    ctx.lineTo(s * 0.24, s * 0.3);
    ctx.lineTo(0, s * 0.14);
    ctx.lineTo(-s * 0.24, s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, 32);
}

const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
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
  const drone = droneSprite();

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

  let raf = 0;
  let running = false;
  let drones = [];
  let parts = [];
  let scorches = [];
  let shakeAmt = 0;
  let pendingResolve = null;

  function reset() {
    drones = [];
    parts = [];
    scorches = [];
    shakeAmt = 0;
  }

  function spawnDrone(anchor, launchAtMs) {
    const start = { x: rand(-W * 0.1, W * 0.5), y: rand(-H * 0.18, -30) };
    drones.push({ x: start.x, y: start.y, px: start.x, py: start.y, start, anchor, launchAtMs, flightMs: rand(1300, 2100), done: false });
  }

  function add(p) {
    p.age = p.age || 0;
    parts.push(p);
  }

  function impact(a, big) {
    const base = big ? 150 : 95;
    // Persistent ground scorch.
    scorches.push({ x: a.x, y: a.y, sz: base * (big ? 1.5 : 1.1), alpha: 0.55 });
    // Hot flash (very brief, additive).
    add({ kind: 'add', sprite: SPRITES.core, x: a.x, y: a.y, from: base * 0.35, to: base * 0.9, life: 0.12 });
    // White-hot cores.
    for (let i = 0; i < 2; i += 1) {
      add({ kind: 'add', sprite: SPRITES.core, x: a.x + rand(-8, 8), y: a.y + rand(-8, 8), from: base * 0.2, to: base * 0.5, life: rand(0.18, 0.3), age: -i * 0.04 });
    }
    // Fireball body (staggered, varied life, slight rise).
    for (let i = 0; i < (big ? 5 : 3); i += 1) {
      add({ kind: 'add', sprite: SPRITES.fire, x: a.x + rand(-18, 18), y: a.y + rand(-14, 10), from: base * 0.3, to: base * rand(0.8, 1.1), life: rand(0.5, 0.95), vy: -rand(10, 30), age: -i * 0.05 });
    }
    // Spiky radial streaks that break the round core.
    for (let i = 0; i < (big ? 8 : 5); i += 1) {
      add({ kind: 'streak', x: a.x, y: a.y, ang: rand(0, Math.PI * 2), len: base * rand(0.5, 1), life: rand(0.14, 0.24) });
    }
    // Sparks: small, cones, inherit upward bias, gravity.
    for (let i = 0; i < (big ? 16 : 11); i += 1) {
      const ang = -Math.PI / 2 + rand(-1.1, 1.1);
      const spd = rand(160, big ? 520 : 380);
      add({ kind: 'spark', x: a.x, y: a.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, gy: 700, life: rand(0.4, 0.9), sz: rand(1.4, 2.6) });
    }
    // Debris: sandy, upward-biased 45-degree cones, gravity.
    for (let c = 0; c < (big ? 3 : 2); c += 1) {
      const cone = -Math.PI / 2 + rand(-0.9, 0.9);
      for (let i = 0; i < 4; i += 1) {
        const ang = cone + rand(-0.25, 0.25);
        const spd = rand(120, big ? 360 : 260);
        add({ kind: 'debris', x: a.x, y: a.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, gy: 640, life: rand(0.7, 1.3), sz: rand(2.5, 5), rot: rand(0, 6.28), spin: rand(-8, 8) });
      }
    }
    // Smoke: several warm puffs, rise, billow, linger, fade at different times.
    for (let i = 0; i < (big ? 7 : 5); i += 1) {
      add({ kind: 'smoke', x: a.x + rand(-30, 30), y: a.y + rand(-16, 6), sz: rand(44, 74), grow: rand(45, 85), vx: rand(-16, 16), vy: -rand(18, 42), life: rand(2.4, 4), peak: rand(0.26, 0.4), age: -i * 0.12 });
    }
    // Ground dust: low, hugs the ground, spreads outward, lingers.
    for (let i = 0; i < (big ? 6 : 4); i += 1) {
      add({ kind: 'dust', x: a.x + rand(-20, 20), y: a.y + rand(2, 16), sz0: rand(50, 90), sz: 0, grow: rand(50, 90), vx: rand(-70, 70), vy: rand(-4, 6), life: rand(1.6, 2.8), peak: rand(0.16, 0.26) });
    }
    // Shock: a faint, fast dust ring on the big hits only.
    if (big) add({ kind: 'shock', x: a.x, y: a.y, r: base * 0.2, to: base * rand(1.6, 2.1), life: 0.38 });
    if (big) shakeAmt = Math.max(shakeAmt, 13);
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
      d.px = d.x;
      d.py = d.y;
      d.x = d.start.x + (d.anchor.x - d.start.x) * easeIn(t);
      d.y = d.start.y + (d.anchor.y - d.start.y) * easeIn(t);
      d.t = t;
      if (t >= 1) {
        d.done = true;
        impact(d.anchor, Math.random() < 0.2);
      }
    }
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      if (p.age < 0) continue;
      if (p.kind === 'spark' || p.kind === 'debris') {
        p.vy += p.gy * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;
      } else if (p.kind === 'smoke') {
        p.vy *= 0.98;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.sz += p.grow * dt;
      } else if (p.kind === 'dust') {
        p.vx *= 0.95;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.sz = p.sz0 * (0.5 + 0.5 * easeOut(Math.min(p.age / 0.4, 1))) + p.grow * p.age;
      }
    }
    shakeAmt = shakeAmt > 0.3 ? shakeAmt * 0.88 : 0;
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

    ctx.globalCompositeOperation = 'source-over';
    // Scorch (ground), then dust, then smoke — back to front.
    for (const s of scorches) {
      ctx.globalAlpha = s.alpha;
      stamp(SPRITES.scorch, s.x, s.y, s.sz * 2, s.sz * 1.1, 0);
    }
    for (const p of parts) {
      if (p.kind !== 'dust' || p.age < 0) continue;
      ctx.globalAlpha = Math.sin(Math.min(p.age / p.life, 1) * Math.PI) * p.peak;
      stamp(SPRITES.dust, p.x, p.y, p.sz * 2, p.sz, 0);
    }
    for (const p of parts) {
      if (p.kind !== 'smoke' || p.age < 0) continue;
      ctx.globalAlpha = Math.sin(Math.min(p.age / p.life, 1) * Math.PI) * p.peak;
      stamp(SPRITES.smoke, p.x, p.y, p.sz, p.sz, 0);
    }
    // Debris (sandy chunks).
    for (const p of parts) {
      if (p.kind !== 'debris' || p.age < 0) continue;
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = '#7d6a49';
      ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz);
      ctx.restore();
    }
    // Drones + tracers.
    ctx.globalAlpha = 1;
    for (const d of drones) {
      if (d.done || d.t == null) continue;
      const ang = Math.atan2(d.y - d.py, d.x - d.px);
      ctx.strokeStyle = 'rgba(255,196,110,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.x - (d.x - d.px) * 6, d.y - (d.y - d.py) * 6);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
      stamp(drone, d.x, d.y, 11, 11, ang + Math.PI / 2);
    }

    // Additive: fire, cores, flash, streaks, sparks, shock.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (p.kind === 'add') {
        const sc = p.from + (p.to - p.from) * easeOut(k);
        ctx.globalAlpha = 1 - k;
        stamp(p.sprite, p.x, p.y + (p.vy ? p.vy * p.age : 0), sc, sc, 0);
      } else if (p.kind === 'streak') {
        const grow = easeOut(Math.min(k * 2, 1));
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = 'rgba(255,214,140,1)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.ang) * p.len * 0.2 * grow, p.y + Math.sin(p.ang) * p.len * 0.2 * grow);
        ctx.lineTo(p.x + Math.cos(p.ang) * p.len * grow, p.y + Math.sin(p.ang) * p.len * grow);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ffd98a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'shock') {
        const r = p.r + (p.to - p.r) * easeOut(k);
        ctx.globalAlpha = (1 - k) * 0.12;
        ctx.strokeStyle = 'rgba(255,230,190,1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
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
    const safety = setTimeout(finish, durationMs + 7000);
    const total = 26;
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
        if (now - startMs > durationMs && drones.every((d) => d.done) && parts.length === 0) {
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
