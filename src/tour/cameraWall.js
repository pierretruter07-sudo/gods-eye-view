/**
 * @file The camera wall: four live public cameras from one city square,
 * playing together while the Director holds the street-level stop.
 *
 * Pierre, 28 Oct: "I want you to do four live video cameras, not four live
 * stills ... put them on the side panels on the left and the right" and
 * "have them replace the other one that's already there". So the wall is
 * two columns, two feeds each, down the screen edges (the centre stays
 * clear for the street), and the Director shows no asset cards here.
 *
 * Each tile plays the camera's own live video (HLS through the server
 * relay); its latest still is the poster until the first frames arrive, and
 * stays (badged LIVE STILL) only if the stream fails. Labels come from the
 * camera catalog and are set with textContent only.
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
  let columns = [];
  let timer = null;
  const players = [];

  function tile(camera) {
    const layer = cameras?.() || null;
    const fig = doc.createElement('figure');
    fig.className = 'gev-wall__tile';
    const media = layer?.mediaUrl?.(camera.id) || null;
    const type = layer?.mediaType?.(camera.id) || camera.feedType || null;
    const still = layer?.frameUrl?.(camera.id) || null;
    const img = doc.createElement('img');
    img.alt = `Latest still from ${camera.name || 'camera'}`;
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
      v.setAttribute(
        'aria-label',
        `Live video from ${camera.name || 'camera'}`,
      );
      if (still) v.poster = still;
      badge.textContent = type === 'hls' ? 'CONNECTING' : 'VIDEO CLIP';
      v.addEventListener('playing', () => {
        badge.textContent = type === 'hls' ? 'LIVE VIDEO' : 'VIDEO CLIP';
        badge.classList.add('is-live');
      });
      const playback = attachCctvVideo(v, media, type, {
        onFailure: () => {
          v.remove();
          badge.textContent = 'LIVE STILL';
          badge.classList.remove('is-live');
        },
      });
      players.push(playback);
      fig.append(v);
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
    if (!layer) return;
    for (const col of columns)
      for (const fig of col.querySelectorAll('.gev-wall__tile')) {
        const img = fig.querySelector('img');
        const url = layer.frameUrl?.(fig.dataset.cameraId);
        if (img && url && img.src !== url) img.src = url;
      }
  }

  function column(side, title, list) {
    const root = doc.createElement('section');
    root.className = `gev-wall gev-wall--${side} gev-glass`;
    root.setAttribute(
      'aria-label',
      side === 'left' ? 'Live cameras, left' : 'Live cameras, right',
    );
    const head = doc.createElement('header');
    head.className = 'gev-wall__head';
    const label = doc.createElement('span');
    label.textContent = title;
    const feed = doc.createElement('span');
    feed.className = 'gev-wall__feed';
    feed.textContent = 'FEED';
    head.append(label, feed);
    root.append(head);
    for (const c of list) root.append(tile(c));
    return root;
  }

  return {
    /** Show the square's first four cameras: two down each side. */
    show(square, { place = '' } = {}) {
      this.hide();
      if (!doc || !Array.isArray(square) || !square.length) return;
      const four = square.slice(0, 4);
      const n = four.length;
      const title = place
        ? `${n} live cameras · ${place}`
        : `${n} live cameras`;
      columns = [
        column('left', title, four.slice(0, 2)),
        column('right', 'Same square, live', four.slice(2)),
      ].filter((c) => c.querySelector('.gev-wall__tile'));
      for (const c of columns) doc.body.append(c);
      timer = setInterval(refreshStills, CAMERA_FRAME_REFRESH_MS);
    },
    hide() {
      clearInterval(timer);
      timer = null;
      for (const p of players.splice(0)) p?.dispose?.();
      for (const c of columns) c.remove();
      columns = [];
    },
    isShown: () => columns.length > 0,
  };
}
