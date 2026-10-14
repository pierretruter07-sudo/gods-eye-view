/**
 * Canvas sprites for the Director focus pulse and the intel reticle. Drawn
 * once and cached, then animated as screen-facing billboards (crisp at any
 * zoom, no ground tessellation cost). The alert pulse is a glass sphere: a
 * near-clear body, a brighter rim (fresnel) and a small specular highlight,
 * expanding from the event and fading as it grows.
 */

const cache = new Map();

/** Sprites are designed on a 128 px grid and rasterised at `size` px so the
 * expanding pulse stays sharp when drawn large on high-density screens. */
function sprite(key, draw, size = 192) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 128, size / 128);
  draw(ctx, 128);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/**
 * A glass sphere, tinted `hex`: clear centre, fresnel rim, a thin white edge
 * and a specular arc top-left. Rasterised large so it stays crisp when the
 * pulse expands to ~220 px on high-density screens.
 */
export function glassSphereSprite(hex) {
  return sprite(
    `glass:${hex}`,
    (ctx, s) => {
      const r = s / 2;
      const body = ctx.createRadialGradient(r * 0.82, r * 0.74, 0, r, r, r - 2);
      body.addColorStop(0, hexAlpha(hex, 0.1));
      body.addColorStop(0.62, hexAlpha(hex, 0.05));
      body.addColorStop(0.9, hexAlpha(hex, 0.22));
      body.addColorStop(1, hexAlpha(hex, 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(r, r, r - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = hexAlpha(hex, 0.45);
      ctx.beginPath();
      ctx.arc(r, r, r - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(r, r, r - 12, Math.PI * 1.08, Math.PI * 1.42);
      ctx.stroke();
    },
    384,
  );
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

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
