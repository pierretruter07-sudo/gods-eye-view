/**
 * Intel console model for a public street (traffic) camera. Every row is a
 * value from the served camera catalog or computed from it, so every card is
 * FEED: no simulated rows are ever attached to a camera. The live view is the
 * camera's own still, relayed by the server from its registered address.
 * Pure: no DOM, no Cesium.
 */

/** How often the open camera's still is refreshed in the console. */
export const CAMERA_FRAME_REFRESH_MS = 10_000;

const row = (label, value) =>
  value == null || value === ''
    ? null
    : { label, value: String(value), sim: false };
const rows = (...r) => r.filter(Boolean);
const card = (id, title, list, extra = {}) => ({
  id,
  title,
  rows: list,
  source: 'feed',
  ...extra,
});

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Compass point for a heading in degrees, or null. */
export function compassPoint(deg) {
  const d = Number(deg);
  if (!Number.isFinite(d)) return null;
  return COMPASS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
}

/** Facing text: the heading only when the source published one with confidence. */
export function cameraFacing(o) {
  const confidence = String(o.headingConfidence || '').toLowerCase();
  if (confidence !== 'high' && confidence !== 'medium') return 'Not published';
  const point = compassPoint(o.headingDeg);
  return point ? `${point} (${Math.round(o.headingDeg)}°)` : 'Not published';
}

/** "14:02:31 local", or null. */
export function clockText(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

const countKind = (items, kind) =>
  items.filter((n) => n.object?.kind === kind).length;

/**
 * @param {object} o - Intel object from the camera layer (kind 'camera').
 * @param {object} [ctx]
 * @param {string|null} [ctx.frameUrl] - Current still URL from the layer.
 * @param {number} [ctx.refreshedAt] - When that URL was issued (ms).
 * @param {object[]} [ctx.nearby] - Objects around the camera (intel nearby list).
 * @param {number} [ctx.radiusKm]
 * @param {boolean} [ctx.panel3d] - The camera's panel is shown in the city.
 * @param {boolean} [ctx.adjusting] - The panel's adjust tool is on.
 */
export function buildCameraHud(o, ctx = {}) {
  const nearby = Array.isArray(ctx.nearby) ? ctx.nearby : [];
  const radius = Number.isFinite(ctx.radiusKm) ? ctx.radiusKm : 50;
  const credit = [o.provider, o.credit].filter(Boolean).join(' · ');
  const cards = [
    card(
      'live',
      'Live view',
      rows(
        row('Refreshed', clockText(ctx.refreshedAt)),
        row('Cadence', `Every ${CAMERA_FRAME_REFRESH_MS / 1000} s`),
      ),
      {
        frame: ctx.frameUrl
          ? { url: ctx.frameUrl, alt: `Live still from ${o.name || 'camera'}` }
          : null,
      },
    ),
    card(
      'camera',
      'Camera',
      rows(
        row('Location', o.name),
        row('Area', o.city),
        row('Facing', cameraFacing(o)),
        row(
          'Position',
          `${Number(o.lat).toFixed(4)}, ${Number(o.lon).toFixed(4)}`,
        ),
      ),
    ),
    card(
      'source',
      'Source',
      rows(
        row('Network', o.provider),
        row('Licence', o.license || 'See data attribution'),
        row('Credit', o.credit || null),
        row('Feed', o.feedType === 'image' ? 'Still image' : o.feedType),
      ),
    ),
    card(
      'around',
      'Around',
      rows(
        row(
          `Aircraft within ${radius} km`,
          String(countKind(nearby, 'aircraft')),
        ),
        row(`Vessels within ${radius} km`, String(countKind(nearby, 'vessel'))),
        row(
          `Other cameras within ${radius} km`,
          String(countKind(nearby, 'camera')),
        ),
      ),
    ),
  ];
  return {
    kind: 'camera',
    title: o.name || 'Street camera',
    subtitle: [o.city, o.provider].filter(Boolean).join(' · '),
    source: credit ? `FEED · ${credit}` : 'FEED',
    demo: false,
    status: 'Public traffic camera · live still',
    cards,
    actions: [],
    camera: { panel3d: !!ctx.panel3d, adjusting: !!ctx.adjusting },
  };
}
