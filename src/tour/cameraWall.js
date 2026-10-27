/**
 * @file The camera wall: four live public cameras from one city square shown
 * together while the Director holds the street-level stop (Pierre, 28 Oct:
 * "show 4 live cameras on screen and maybe take 10 seconds longer on that
 * director step to let the viewer watch").
 *
 * Each tile plays the camera's own video when it publishes one (live HLS
 * through the server relay, or a clip) and otherwise its still, refreshed
 * every CAMERA_FRAME_REFRESH_MS. Labels come from the camera catalog and are
 * set with textContent only.
 * @module tour/cameraWall
 */
import { attachCctvVideo } from '../layers/cctv/videoPlayback.js';
import { CAMERA_FRAME_REFRESH_MS } from '../intel/camera.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.cameras - The cctv layer module
 *   (frameUrl, mediaUrl, mediaType), or null when the layer is off.
 * @param {Document} [deps.doc]
 */
export function createCameraWall({ cameras, doc = globalThis.document }) {
  let root = null;
  let timer = null;
  const players = [];

  function tile(camera) {
    const layer = cameras?.() || null;
    const fig = doc.createElement('figure');
    fig.className = 'gev-wall__tile';
    const media = layer?.mediaUrl?.(camera.id) || null;
    const type = layer?.mediaType?.(camera.id) || null;
    const still = layer?.frameUrl?.(camera.id) || null;
    const img = doc.createElement('img');
    img.alt = `Live still from ${camera.name || 'camera'}`;
    img.decoding = 'async';
    if (still) img.src = still;
    fig.append(img);
    const badge = doc.createElement('span');
    badge.className = 'gev-wall__badge';
    badge.textContent = 'LIVE STILL';
    fig.append(badge);
    if (media) {
      const v = doc.createElement('video');
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      if (still) v.poster = still;
      const playback = attachCctvVideo(v, media, type, {
        onFailure: () => {
          v.remove();
          badge.textContent = 'LIVE STILL';
        },
      });
      players.push(playback);
      fig.append(v);
      badge.textContent = type === 'hls' ? 'LIVE VIDEO' : 'VIDEO CLIP';
    }
    const cap = doc.createElement('figcaption');
    const name = doc.createElement('b');
    name.textContent = camera.name || 'Camera';
    const src = doc.createElement('span');
    src.textContent = [camera.provider, camera.license]
      .filter(Boolean)
      .join(' · ');
    cap.append(name, src);
    fig.append(cap);
    fig.dataset.cameraId = camera.id;
    return fig;
  }

  function refreshStills() {
    const layer = cameras?.() || null;
    if (!root || !layer) return;
    for (const fig of root.querySelectorAll('.gev-wall__tile')) {
      const img = fig.querySelector('img');
      const url = layer.frameUrl?.(fig.dataset.cameraId);
      if (img && url && img.src !== url) img.src = url;
    }
  }

  return {
    /** Show the square's cameras (the first four). */
    show(square, { place = '' } = {}) {
      this.hide();
      if (!doc || !Array.isArray(square) || !square.length) return;
      root = doc.createElement('section');
      root.className = 'gev-wall gev-glass';
      root.setAttribute('aria-label', 'Four live cameras in this square');
      const head = doc.createElement('header');
      head.className = 'gev-wall__head';
      const title = doc.createElement('span');
      title.textContent = place
        ? `${square.length} live cameras · ${place}`
        : `${square.length} live cameras`;
      const feed = doc.createElement('span');
      feed.className = 'gev-wall__feed';
      feed.textContent = 'FEED';
      head.append(title, feed);
      const grid = doc.createElement('div');
      grid.className = 'gev-wall__grid';
      for (const c of square.slice(0, 4)) grid.append(tile(c));
      root.append(head, grid);
      doc.body.append(root);
      timer = setInterval(refreshStills, CAMERA_FRAME_REFRESH_MS);
    },
    hide() {
      clearInterval(timer);
      timer = null;
      for (const p of players.splice(0)) p?.dispose?.();
      root?.remove();
      root = null;
    },
    isShown: () => Boolean(root),
  };
}
