import { searchAndFlyTo } from '../locations.js';
import { setScopeMaskEnabled } from '../scopeMask.js';
import { installTour } from '../tour/index.js';
import { installIntel } from '../intel/index.js';
import { installIdleSpin } from './idleSpin.js';
import { showWelcome, welcomeEnabled } from './welcome.js';
import * as Cesium from 'cesium';
import { installAdaptiveQuality } from './quality.js';
import { graphicsFlags, installGraphics } from './graphics.js';
import { installOrbitControls } from './orbitControls.js';
import { installFlightPrefetch } from './flightPrefetch.js';
import { installLayout } from './layout.js';
import { installWorldVisuals } from '../visuals/index.js';

/** Layers offered in the Layers panel, in display order. */
export const SHELL_LAYERS = Object.freeze(
  [
    { id: 'flights', name: 'Flights', dot: '#ffd60a' },
    { id: 'military', name: 'Military flights', dot: '#ff9f0a' },
    { id: 'ais-live-vessels', name: 'Ships', dot: '#64d2ff' },
    { id: 'satellites', name: 'Satellites', dot: '#bf5af2' },
    { id: 'earthquakes', name: 'Earthquakes', dot: '#ff453a' },
    { id: 'local-firms', name: 'Fires', dot: '#ff6b35' },
    { id: 'weather-cyclones', name: 'Cyclones', dot: '#5ac8fa' },
    {
      id: 'military-installations',
      name: 'Military installations',
      dot: '#98989d',
    },
    {
      id: 'telegeography-submarine-cables',
      name: 'Submarine cables',
      dot: '#30d158',
    },
    { id: 'cctv', name: 'Street cameras', dot: '#e5e5ea' },
  ].map((layer) => Object.freeze(layer)),
);

/** Layers switched on when the app opens (staggered so start-up stays smooth). */
const DEFAULT_ON = Object.freeze([
  'satellites',
  'earthquakes',
  'flights',
  'military',
  'ais-live-vessels',
  'military-installations',
]);
const DEFAULT_ON_STAGGER_MS = 1500;

const ICONS = {
  eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  search:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  layers:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
};

function el(tag, attrs = {}, html) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html != null) node.innerHTML = html;
  return node;
}

/** Every glTF the layers can draw (public/models). */
export const MODEL_URLS = Object.freeze([
  '/models/airplane.glb',
  '/models/atr72.glb',
  '/models/b789.glb',
  '/models/bell206.glb',
  '/models/c172.glb',
  '/models/citation2.glb',
  '/models/jet.glb',
  '/models/mq9.glb',
  '/models/ship.glb',
]);

function warmModels() {
  // A low-priority prefetch hint fills the HTTP cache without holding the
  // model bytes in page memory (fetch + arrayBuffer kept every body alive).
  for (const url of MODEL_URLS) {
    if (document.head.querySelector(`link[rel="prefetch"][href="${url}"]`))
      continue;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'fetch';
    link.href = url;
    document.head.append(link);
  }
}

/**
 * The clean shell: one floating top bar (search, Layers, Director), a
 * collapsible Layers panel, and the Director's alert card and caption.
 * The original app chrome is hidden by `body.gev-clean` (shell.css).
 */
export function installShell({ viewer, dataManager, placeSearch }) {
  document.body.classList.add('gev-clean');
  setScopeMaskEnabled(false);

  // The scene look (HDR, gentle bloom, sharpening; graphics.js), then the
  // quality ladder, which keeps native resolution and sheds bloom first.
  const graphics = installGraphics(viewer, Cesium, {
    flags: graphicsFlags(window.location.search),
  });
  window.__gevGraphics = graphics;
  // Shadows are the first thing the ladder drops (sun.js); the world
  // visuals mount further down, so the ladder's say is kept until then.
  let shadowsAllowed = true;
  let worldRef = null;
  const stopQuality = installAdaptiveQuality(viewer, {
    setEffects: (on) => graphics.setEffects(on),
    setShadows: (on) => {
      shadowsAllowed = on;
      worldRef?.allowShadows(on);
    },
  });
  // No animated-wave water effect: up close its normal-mapped waves were
  // drawn far too large and read as white froth across the sea (owner
  // request, 20 Oct). The sea keeps its real imagery colour.
  try {
    viewer.scene.globe.showWaterEffect = false;
  } catch {
    /* globe unavailable */
  }

  // ── Top bar ──────────────────────────────────────────────────────────
  const bar = el('header', { class: 'gev-bar gev-glass' });
  const brand = el(
    'span',
    { class: 'gev-bar__brand' },
    `${ICONS.eye}<span>God's Eye View</span>`,
  );
  const form = el('form', { class: 'gev-bar__search', role: 'search' });
  const input = el('input', {
    type: 'search',
    placeholder: 'Search a place',
    'aria-label': 'Search a place',
    autocomplete: 'off',
  });
  form.append(
    el('span', { class: 'gev-bar__search-icon' }, ICONS.search),
    input,
  );
  // A status pill: every feed on screen is live (the simulated Exercise
  // mode was removed for the final version, Pierre 21 Oct).
  const modeSwitch = el('div', {
    class: 'gev-seg',
    role: 'status',
    'aria-label': 'Live data',
  });
  const liveBtn = el(
    'span',
    { class: 'gev-seg__live', 'data-mode': 'live' },
    '<span class="gev-seg__dot gev-seg__dot--live"></span>Live',
  );
  modeSwitch.append(liveBtn);
  const layersBtn = el(
    'button',
    {
      type: 'button',
      class: 'gev-btn',
      'aria-label': 'Layers',
      'aria-expanded': 'false',
      'aria-controls': 'gev-layers',
    },
    `${ICONS.layers}<span>Layers</span>`,
  );
  const triageBtn = el(
    'button',
    {
      type: 'button',
      class: 'gev-btn',
      'aria-label': 'Triage',
      'aria-pressed': 'false',
    },
    `${ICONS.list}<span>Triage</span><span class="gev-badge" hidden></span>`,
  );
  const directorBtn = el(
    'button',
    {
      type: 'button',
      class: 'gev-btn gev-btn--primary',
      'aria-label': 'Start the Director',
    },
    `${ICONS.play}<span>Director</span>`,
  );
  bar.append(
    brand,
    el('span', { class: 'gev-bar__divider', 'aria-hidden': 'true' }),
    modeSwitch,
    form,
    layersBtn,
    triageBtn,
    directorBtn,
  );

  // ── Layers panel ─────────────────────────────────────────────────────
  const panel = el('section', {
    id: 'gev-layers',
    class: 'gev-layers gev-glass',
    'aria-label': 'Layers',
  });
  panel.hidden = true;
  const head = el('div', { class: 'gev-layers__head' });
  const collapse = el(
    'button',
    { type: 'button', class: 'gev-icon-btn', 'aria-label': 'Close layers' },
    ICONS.back,
  );
  head.append(el('h2', {}, 'Layers'), collapse);
  panel.append(head);
  const rows = new Map();
  for (const layer of SHELL_LAYERS) {
    const row = el('button', {
      type: 'button',
      class: 'gev-layer',
      'aria-pressed': 'false',
    });
    row.append(
      el('span', {
        class: 'gev-layer__dot',
        style: `background:${layer.dot}`,
        'aria-hidden': 'true',
      }),
      el('span', { class: 'gev-layer__name' }, layer.name),
      el(
        'span',
        { class: 'gev-switch', 'aria-hidden': 'true' },
        '<span></span>',
      ),
    );
    row.querySelector('.gev-layer__name').textContent = layer.name;
    row.addEventListener('click', () => toggleLayer(layer.id));
    rows.set(layer.id, row);
    panel.append(row);
  }

  // ?fps shows Cesium's frame-rate readout, to measure on a real GPU.
  try {
    if (new URLSearchParams(window.location.search).has('fps'))
      viewer.scene.debugShowFramesPerSecond = true;
  } catch {
    /* no URL access: leave it off */
  }
  document.body.append(bar, panel);

  // ── Behaviour ────────────────────────────────────────────────────────
  function isOn(id) {
    try {
      return dataManager.isEnabled(id) === true;
    } catch {
      return false;
    }
  }
  function refreshRows() {
    for (const [id, row] of rows)
      row.setAttribute('aria-pressed', String(isOn(id)));
  }
  async function toggleLayer(id) {
    const row = rows.get(id);
    const next = !isOn(id);
    row.setAttribute('aria-pressed', String(next));
    row.disabled = true;
    try {
      await dataManager.setEnabled(id, next);
    } catch (error) {
      console.warn(`[shell] could not switch ${id}`, error);
    } finally {
      row.disabled = false;
      refreshRows();
    }
  }
  function setPanel(open) {
    panel.hidden = !open;
    layersBtn.setAttribute('aria-expanded', String(open));
    if (open) refreshRows();
  }
  layersBtn.addEventListener('click', () => {
    if (panel.hidden) intel.setTriage(false);
    setPanel(panel.hidden);
  });
  collapse.addEventListener('click', () => setPanel(false));

  let intelRef = null; // set once the intel view exists (the tour can start first)
  const prefetch = installFlightPrefetch({ viewer, dataManager });
  // Day/night with city lights, comet trails, quake shockwave rings.
  const world = installWorldVisuals({ viewer, dataManager });
  worldRef = world;
  world.allowShadows(shadowsAllowed);
  // The Director stages each next stop's aircraft itself (one request per
  // stop, a whole dwell ahead), so there is no background warm loop: a loop
  // over every stop kept the free regional sources near their rate limits.
  const tour = installTour({
    viewer,
    dataManager,
    // The Director's look-ahead: load the next stop's aircraft a dwell early
    // (the opening descent asks for a wider radius around its region).
    stage: (view, opts) =>
      prefetch.stage(view, { radiusKm: opts?.radiusKm ?? 50 }),
    // First run after the dashboard opens: GEO belt down to street level.
    openingDescent: true,
    // Warm the destination's aircraft before the camera gets there, then
    // refresh the moment it arrives (instead of waiting for the 30 s poll).
    onTravel(phase, view, focus) {
      // Timing hook for diagnostics and the stop-load benchmark (no-op otherwise).
      window.dispatchEvent(
        new CustomEvent('gev:tour', {
          detail: {
            phase,
            at: performance.now(),
            lat: view?.lat,
            lon: view?.lon,
            rangeM: view?.rangeM,
            layerId: focus?.layerId || null,
          },
        }),
      );
      // The subject's type photo downloads during the flight, not on arrival.
      if (phase === 'depart' && focus) intelRef?.prefetch(focus);
      if (!view || !(view.rangeM <= 1_000_000)) return;
      if (phase === 'depart') prefetch.preload(view.lat, view.lon);
      else {
        prefetch.refreshHere();
        // Mapped installations load on camera move-end, which never fires
        // while the Director orbits: ask on arrival at a close view.
        try {
          if (
            view.rangeM <= 200_000 &&
            dataManager.isEnabled('military-installations')
          )
            Promise.resolve(
              dataManager.refreshLayer?.('military-installations'),
            ).catch(() => {});
        } catch {
          /* layer not registered */
        }
      }
    },
    // The Director's current subject opens in the intel view, as if clicked.
    onFocus(focus) {
      world.onFocus(focus);
      if (intelRef) intelRef.showFocus(focus);
      // The focused aircraft gets the full 3D model look (graphics pass).
      const icao =
        ['flights', 'military'].includes(focus?.layerId) &&
        !focus?.record?.simulated
          ? focus.record?.icao24 || null
          : null;
      for (const id of ['flights', 'military']) {
        try {
          dataManager
            .getLayerModule?.(id)
            ?.setFocusModel?.(focus?.layerId === id ? icao : null);
        } catch {
          /* layer not registered */
        }
      }
    },
    onState(state) {
      const live = state === 'running';
      document.body.classList.toggle('gev-touring', live);
      intelRef?.refresh?.();
      directorBtn.classList.toggle('gev-btn--live', live);
      directorBtn.innerHTML = live
        ? `${ICONS.stop}<span>Stop</span>`
        : `${ICONS.play}<span>Director</span>`;
      directorBtn.setAttribute(
        'aria-label',
        live ? 'Stop the Director' : 'Start the Director',
      );
      if (live) setPanel(false);
      refreshRows();
    },
  });
  // Key satellites (stations, GPS, Galileo, GLONASS, geostationary) are on
  // from the start; the dense Starlink shell stays off.
  // One at a time, each after the previous has finished loading, so the
  // browser never has to ingest every feed in the same moment.
  const startupTimers = [];
  (async () => {
    for (const id of DEFAULT_ON) {
      if (isOn(id)) continue;
      try {
        await dataManager.setEnabled(id, true);
      } catch (error) {
        console.warn(`[shell] could not switch on ${id}`, error);
      }
      refreshRows();
      await new Promise((resolve) =>
        startupTimers.push(setTimeout(resolve, DEFAULT_ON_STAGGER_MS)),
      );
    }
  })();

  // ── Opening card → Director (the default start) ───────────────────────
  let closeWelcome = null;
  if (welcomeEnabled()) {
    closeWelcome = showWelcome({
      onDone(action) {
        closeWelcome = null;
        if (action === 'explore' || action === 'dismissed') return;
        tour.controller.start();
      },
    });
  } else tour.controller.start();

  directorBtn.addEventListener('click', () => {
    if (tour.controller.isRunning()) tour.controller.exit('button');
    else tour.controller.start();
  });

  // Mouse navigation pivots on the Earth's centre (orbitControls.js).
  const stopOrbitControls = installOrbitControls(viewer, Cesium, {
    releaseFrame: () => tour.controller.isRunning(),
  });

  // ── Intelligence layer ───────────────────────────────────────────────
  const intel = installIntel({
    viewer,
    dataManager,
    isLive: () => true,
    onManualFocus: (reason) => {
      if (tour.controller.isRunning()) tour.controller.exit(reason);
    },
  });
  intelRef = intel;
  // Diagnostics and the UI layout check (as window.__gevTour for the Director).
  window.__gevIntel = intel;
  // The screen map: one place decides where every overlay goes.
  const layout = installLayout();
  // Two small API calls resolve the whole type-photo catalogue; do it once
  // the default layers have had their head start.
  startupTimers.push(setTimeout(() => intel.warmReferenceImages(), 6000));
  // Speculative downloads wait until the opening descent is over: they
  // competed with its Google tiles (audit, 21 Oct). `quietThen` runs `fn`
  // once the descent is done, the Director is not running, or 5 minutes
  // have passed, whichever comes first.
  const quietThen = (fn, minMs) => {
    const started = Date.now();
    const check = () => {
      const d = tour.controller.descent?.();
      const quiet =
        d?.done === true ||
        (!tour.controller.isRunning() && Date.now() - started >= minMs) ||
        Date.now() - started >= 5 * 60_000;
      if (quiet) fn();
      else startupTimers.push(setTimeout(check, 5000));
    };
    startupTimers.push(setTimeout(check, minMs));
  };
  // Warm the 3D models (≈3 MB) into the HTTP cache at low priority, so the
  // first aircraft or ship of each class does not stall when it appears.
  quietThen(warmModels, 9000);
  const badge = triageBtn.querySelector('.gev-badge');
  function refreshBadge() {
    const n = intel.flaggedCount();
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    triageBtn.setAttribute('aria-label', n ? `Triage, ${n} flagged` : 'Triage');
  }
  intel.onTriage((on) => triageBtn.setAttribute('aria-pressed', String(on)));
  intel.onWatch(refreshBadge);
  intel.onOpen(() => setPanel(false));

  // Slow idle rotation of the zoomed-out globe.
  const stopSpin = installIdleSpin({
    viewer,
    isBlocked: () =>
      tour.controller.isRunning() || intel.isOpen() || !!viewer.trackedEntity,
  });
  triageBtn.addEventListener('click', () => {
    setPanel(false);
    intel.setTriage(!intel.isTriageOpen());
  });
  const badgeTimer = setInterval(refreshBadge, 15000);
  startupTimers.push(setTimeout(refreshBadge, 12000));

  // Esc closes the asset view.
  const onEscape = (event) => {
    if (event.key === 'Escape') intel.close();
  };
  window.addEventListener('keydown', onEscape);

  // A hidden tab needs no fresh feeds; catch up the moment it is visible.
  const onVisibility = () => {
    if (document.hidden) dataManager?.pausePolling?.('hidden');
    else dataManager?.resumePolling?.('hidden');
  };
  document.addEventListener('visibilitychange', onVisibility);

  let searchAbort = null;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    tour.controller.exit('search');
    searchAbort?.abort();
    searchAbort = new AbortController();
    form.classList.add('is-busy');
    try {
      await searchAndFlyTo(viewer, query, {
        placeSearch,
        signal: searchAbort.signal,
      });
      input.blur();
    } catch (error) {
      if (error?.name !== 'AbortError')
        console.warn('[shell] search failed', error);
    } finally {
      form.classList.remove('is-busy');
    }
  });

  return () => {
    searchAbort?.abort();
    closeWelcome?.();
    clearInterval(badgeTimer);
    stopSpin();
    stopOrbitControls();
    stopQuality();
    graphics.destroy();
    if (window.__gevGraphics === graphics) delete window.__gevGraphics;
    prefetch.destroy();
    startupTimers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', onVisibility);
    layout.destroy();
    if (window.__gevIntel === intel) delete window.__gevIntel;
    intel.destroy();
    window.removeEventListener('keydown', onEscape);
    tour.dispose();
    world.destroy();
    if (window.__gevWorld === world) delete window.__gevWorld;
    bar.remove();
    panel.remove();
    document.body.classList.remove(
      'gev-clean',
      'gev-touring',
      'gev-intel-open',
    );
  };
}
