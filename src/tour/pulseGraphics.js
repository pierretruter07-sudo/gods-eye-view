/**
 * Canvas sprites for the Director focus pulse. Drawn once and cached, then
 * animated as screen-facing billboards (crisp at any zoom, no ground
 * tessellation cost): a targeting reticle, a rotating radar sweep and a thin
 * expanding ring. Warm palette only — no red.
 */

const cache = new Map();

function sprite(key, draw, size = 128) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** A thin glowing ring (used for the expanding pulse). */
export function ringSprite(hex) {
  return sprite(`ring:${hex}`, (ctx, s) => {
    const r = s / 2;
    ctx.strokeStyle = hex;
    ctx.lineWidth = 4;
    ctx.shadowColor = hex;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(r, r, r - 10, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Four corner brackets plus a faint inner ring: a targeting reticle. */
export function reticleSprite(hex) {
  return sprite(`reticle:${hex}`, (ctx, s) => {
    const m = 14;
    const len = 22;
    ctx.strokeStyle = hex;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = hex;
    ctx.shadowBlur = 6;
    const corner = (x, y, dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x, y + dy * len);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * len, y);
      ctx.stroke();
    };
    corner(m, m, 1, 1);
    corner(s - m, m, -1, 1);
    corner(m, s - m, 1, -1);
    corner(s - m, s - m, -1, -1);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 34, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** A soft wedge that fades around the circle: rotate it for a radar sweep. */
export function sweepSprite(hex) {
  return sprite(`sweep:${hex}`, (ctx, s) => {
    const r = s / 2;
    if (typeof ctx.createConicGradient !== 'function') return;
    const g = ctx.createConicGradient(-Math.PI / 2, r, r);
    g.addColorStop(0, hexAlpha(hex, 0.55));
    g.addColorStop(0.12, hexAlpha(hex, 0));
    g.addColorStop(1, hexAlpha(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r - 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
