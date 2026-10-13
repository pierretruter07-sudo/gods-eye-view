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

/** A clean double ring: a steady scope rim (no corner brackets). */
export function reticleSprite(hex) {
  return sprite(`reticle:${hex}`, (ctx, s) => {
    const r = s / 2;
    ctx.strokeStyle = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r, r, r - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(r, r, r - 30, 0, Math.PI * 2);
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
