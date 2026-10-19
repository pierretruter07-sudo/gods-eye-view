import { searchAndFlyTo } from '../locations.js';
import { setScopeMaskEnabled } from '../scopeMask.js';
import { installTour } from '../tour/index.js';
import { createExerciseMode } from '../exercise/mode.js';
import { installIntel } from '../intel/index.js';
import { installIdleSpin } from './idleSpin.js';
import { showWelcome, welcomeEnabled } from './welcome.js';
import { installAdaptiveQuality } from './quality.js';
import { installFlightPrefetch } from './flightPrefetch.js';
import { installAudit } from '../audit/index.js';
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
  target:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  audit:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.8 12.2 2.3 2.3 4.3-4.6"/></svg>',
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
  for (const url of MODEL_URLS) {
    fetch(url, { priority: 'low' })
      .then((r) => r.arrayBuffer())
      .catch(() => {});
  }
}

/** Demo buttons show in development builds or with ?demo in the URL. */
function demoEnabled() {
  try {
    return (
      import.meta.env?.DEV === true ||
      new URLSearchParams(window.location.search).has('demo')
    );
  } catch {
    return false;
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

  // Smoothness first: adaptive render resolution + FXAA (see quality.js).
  const stopQuality = installAdaptiveQuality(viewer);
  // Animated ocean: normal-mapped waves and sun glint wherever the terrain's
  // water mask says sea (Cesium World Terrain, requested with a water mask).
  try {
    viewer.scene.globe.showWaterEffect = true;
  } catch {
    /* globe unavailable */
  }

  // ── Top bar ──────────────────────────────────────────────────────────
  const bar = el('header', { class: 'gev-bar gev-glass' });
  const brand = el(
    'span',
    { class: 'gev-bar__brand' },
    `${ICONS.eye}<span>God's Eye</span>`,
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
  const modeSwitch = el('div', {
    class: 'gev-seg',
    role: 'group',
    'aria-label': 'Mode',
  });
  const liveBtn = el(
    'button',
    { type: 'button', 'data-mode': 'live', 'aria-pressed': 'true' },
    '<span class="gev-seg__dot gev-seg__dot--live"></span>Live',
  );
  const exBtn = el(
    'button',
    { type: 'button', 'data-mode': 'exercise', 'aria-pressed': 'false' },
    '<span class="gev-seg__dot gev-seg__dot--ex"></span>Exercise',
  );
  modeSwitch.append(liveBtn, exBtn);
  const layersBtn = el(
    'button',
    {
      type: 'button',
      class: 'gev-btn',
      'aria-expanded': 'false',
      'aria-controls': 'gev-layers',
    },
    `${ICONS.layers}<span>Layers</span>`,
  );
  const triageBtn = el(
    'button',
    { type: 'button', class: 'gev-btn', 'aria-pressed': 'false' },
    `${ICONS.list}<span>Triage</span><span class="gev-badge" hidden></span>`,
  );
  const directorBtn = el(
    'button',
    { type: 'button', class: 'gev-btn gev-btn--primary' },
    `${ICONS.play}<span>Director</span>`,
  );
  const auditBtn = el(
    'button',
    {
      type: 'button',
      class: 'gev-btn gev-btn--audit',
      title: 'Audit this platform with CrossCheck (ED-153 and OWASP ASVS)',
    },
    `${ICONS.audit}<span>Audit</span>`,
  );
  const generateBtn = el(
    'button',
    { type: 'button', class: 'gev-btn gev-btn--exercise' },
    `${ICONS.target}<span>Generate strike package</span>`,
  );
  generateBtn.hidden = true;
  bar.append(
    brand,
    el('span', { class: 'gev-bar__divider', 'aria-hidden': 'true' }),
    modeSwitch,
    form,
    layersBtn,
    triageBtn,
    directorBtn,
    auditBtn,
    generateBtn,
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

  // ── Demo buttons (staged events) ─────────────────────────────────────
  // ?fps shows Cesium's frame-rate readout, to measure on a real GPU.
  try {
    if (new URLSearchParams(window.location.search).has('fps'))
      viewer.scene.debugShowFramesPerSecond = true;
  } catch {
    /* no URL access: leave it off */
  }
  const demo = demoEnabled() ? el('div', { class: 'gev-demo' }) : null;
  if (demo) {
    const sim = el(
      'button',
      { type: 'button', class: 'gev-chip' },
      'Simulate 7700',
    );
    const quake = el(
      'button',
      { type: 'button', class: 'gev-chip' },
      'Simulate quake',
    );
    sim.addEventListener('click', () => tour.controller.simulate('aircraft'));
    quake.addEventListener('click', () =>
      tour.controller.simulate('earthquake'),
    );
    demo.append(sim, quake);
  }

  // ── Exercise banner (hidden until Exercise mode) ─────────────────────
  const banner = el(
    'div',
    { class: 'gev-exbanner', role: 'status' },
    '<span class="gev-exbanner__dot" aria-hidden="true"></span>EXERCISE · FICTIONAL SCENARIO · LIVE FEEDS DISCONNECTED',
  );
  banner.hidden = true;

  document.body.append(bar, panel, banner, ...(demo ? [demo] : []));

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
  let auditRef = null; // set once AUDIT is installed (idle spin starts first)
  const prefetch = installFlightPrefetch({ viewer, dataManager });
  // Day/night with city lights, comet trails, quake shockwave rings.
  const world = installWorldVisuals({ viewer, dataManager });
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
      else prefetch.refreshHere();
    },
    // The Director's current subject opens in the intel view, as if clicked.
    onFocus(focus) {
      world.onFocus(focus);
      if (intelRef && mode === 'live') intelRef.showFocus(focus);
    },
    onState(state) {
      const live = state === 'running';
      document.body.classList.toggle('gev-touring', live);
      intelRef?.refresh?.();
      directorBtn.classList.toggle('gev-btn--live', live);
      directorBtn.innerHTML = live
        ? `${ICONS.stop}<span>Stop</span>`
        : `${ICONS.play}<span>Director</span>`;
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
        if (action === 'explore' || action === 'dismissed' || mode !== 'live')
          return;
        tour.controller.start();
      },
    });
  } else tour.controller.start();

  directorBtn.addEventListener('click', () => {
    if (tour.controller.isRunning()) tour.controller.exit('button');
    else tour.controller.start();
  });

  // ── Intelligence layer (Live mode only) ─────────────────────────────
  let mode = 'live';
  const intel = installIntel({
    viewer,
    dataManager,
    isLive: () => mode === 'live',
  });
  intelRef = intel;
  // Diagnostics and the UI layout check (as window.__gevTour for the Director).
  window.__gevIntel = intel;
  // The screen map: one place decides where every overlay goes.
  const layout = installLayout();
  // Two small API calls resolve the whole type-photo catalogue; do it once
  // the default layers have had their head start.
  startupTimers.push(setTimeout(() => intel.warmReferenceImages(), 6000));
  // Warm the 3D models (≈3 MB) into the HTTP cache at low priority, so the
  // first aircraft or ship of each class does not stall when it appears.
  startupTimers.push(setTimeout(warmModels, 9000));
  const badge = triageBtn.querySelector('.gev-badge');
  function refreshBadge() {
    if (mode !== 'live') return;
    const n = intel.flaggedCount();
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  }
  intel.onTriage((on) => triageBtn.setAttribute('aria-pressed', String(on)));
  intel.onWatch(refreshBadge);
  intel.onOpen(() => setPanel(false));

  // Slow idle rotation of the zoomed-out globe.
  const stopSpin = installIdleSpin({
    viewer,
    isBlocked: () =>
      auditRef?.isActive() === true ||
      mode !== 'live' ||
      tour.controller.isRunning() ||
      intel.isOpen() ||
      !!viewer.trackedEntity,
  });
  triageBtn.addEventListener('click', () => {
    setPanel(false);
    intel.setTriage(!intel.isTriageOpen());
  });
  const badgeTimer = setInterval(refreshBadge, 15000);
  setTimeout(refreshBadge, 12000);

  // ── Exercise mode ────────────────────────────────────────────────────
  const exCaption = el('div', {
    class: 'gev-caption gev-glass',
    'aria-live': 'polite',
    'data-visible': 'false',
  });
  document.body.append(exCaption);
  const exercise = createExerciseMode({
    viewer,
    dataManager,
    liveLayerIds: SHELL_LAYERS.map((l) => l.id),
    onBanner: (on) => {
      banner.hidden = !on;
    },
    onCaption: (text) => {
      exCaption.textContent = text || '';
      exCaption.dataset.visible = text ? 'true' : 'false';
    },
  });
  // Esc cancels an in-flight exercise launch (the cinematic) without leaving
  // Exercise mode.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (exercise.isLaunching()) exercise.cancelLaunch();
    else intel.close();
  });

  // ── CrossCheck AUDIT (the platform audits itself) ────────────────────
  // Pauses the live platform, flies out to the whole globe and morphs it into
  // the CrossCheck orbit. The runtime loads on first press.
  const audit = installAudit({
    viewer,
    onEnter() {
      // The globe is covered: stop polling the live feeds until exit.
      dataManager?.pausePolling?.('audit');
      closeWelcome?.();
      tour.controller.exit('audit');
      if (exercise.isLaunching()) exercise.cancelLaunch();
      intel.setTriage(false);
      intel.close();
      setPanel(false);
      auditBtn.disabled = true;
    },
    onExit() {
      dataManager?.resumePolling?.('audit');
      auditBtn.disabled = false;
      refreshRows();
    },
  });
  auditRef = audit;
  // A hidden tab needs no fresh feeds; catch up the moment it is visible.
  const onVisibility = () => {
    if (document.hidden) dataManager?.pausePolling?.('hidden');
    else dataManager?.resumePolling?.('hidden');
  };
  document.addEventListener('visibilitychange', onVisibility);
  auditBtn.addEventListener('click', () => audit.enter());
  // Fetch the AUDIT code and data before the press: on intent, or once the
  // start-up work has settled.
  auditBtn.addEventListener('pointerenter', () => audit.prefetch(), {
    once: true,
  });
  auditBtn.addEventListener('focus', () => audit.prefetch(), { once: true });
  startupTimers.push(
    setTimeout(() => {
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
      idle(() => audit.prefetch(), { timeout: 5000 });
    }, 15000),
  );

  async function setMode(next) {
    mode = next;
    const ex = next === 'exercise';
    triageBtn.hidden = ex;
    if (ex) intel.suspend();
    else intel.resume();
    liveBtn.setAttribute('aria-pressed', String(!ex));
    exBtn.setAttribute('aria-pressed', String(ex));
    document.body.classList.toggle('gev-exercise', ex);
    bar.classList.toggle('gev-bar--exercise', ex);
    layersBtn.hidden = ex;
    directorBtn.hidden = ex;
    generateBtn.hidden = !ex;
    if (ex) {
      tour.controller.exit('exercise');
      setPanel(false);
      await exercise.enter();
    } else {
      await exercise.exit();
    }
  }
  liveBtn.addEventListener('click', () => setMode('live'));
  exBtn.addEventListener('click', () => setMode('exercise'));
  generateBtn.addEventListener('click', () => exercise.generate());

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
    stopQuality();
    prefetch.destroy();
    startupTimers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', onVisibility);
    audit.destroy();
    layout.destroy();
    if (window.__gevIntel === intel) delete window.__gevIntel;
    intel.destroy();
    exercise.exit();
    exercise.destroy();
    tour.dispose();
    world.destroy();
    if (window.__gevWorld === world) delete window.__gevWorld;
    bar.remove();
    panel.remove();
    banner.remove();
    exCaption.remove();
    demo?.remove();
    document.body.classList.remove(
      'gev-clean',
      'gev-exercise',
      'gev-touring',
      'gev-intel-open',
      'gev-audit',
    );
  };
}
