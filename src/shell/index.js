import { searchAndFlyTo } from '../locations.js';
import { setScopeMaskEnabled } from '../scopeMask.js';
import { installTour } from '../tour/index.js';
import { createExerciseMode } from '../exercise/mode.js';

/** Layers offered in the Layers panel, in display order. */
export const SHELL_LAYERS = Object.freeze([
  { id: 'flights', name: 'Flights', dot: '#ffd60a' },
  { id: 'military', name: 'Military flights', dot: '#ff9f0a' },
  { id: 'ais-live-vessels', name: 'Ships', dot: '#64d2ff' },
  { id: 'satellites', name: 'Satellites', dot: '#bf5af2' },
  { id: 'earthquakes', name: 'Earthquakes', dot: '#ff453a' },
  { id: 'local-firms', name: 'Fires', dot: '#ff6b35' },
  { id: 'weather-cyclones', name: 'Cyclones', dot: '#5ac8fa' },
  { id: 'military-installations', name: 'Military installations', dot: '#98989d' },
  { id: 'telegeography-submarine-cables', name: 'Submarine cables', dot: '#30d158' },
].map((layer) => Object.freeze(layer)));

/** Layers switched on when the app opens. */
const DEFAULT_ON = Object.freeze(['satellites']);

const ICONS = {
  eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  layers: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
};

function el(tag, attrs = {}, html) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html != null) node.innerHTML = html;
  return node;
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

  // Smooth, anti-aliased rendering: render at the display's real pixel density
  // (capped so 3x phones don't tank), with MSAA and FXAA to clean every edge —
  // labels, markers and the overlay rings.
  try {
    viewer.useBrowserRecommendedResolution = false;
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
  } catch (error) {
    console.warn('[shell] resolution scale unavailable', error);
  }
  try {
    viewer.scene.msaaSamples = 2;
  } catch (error) {
    console.warn('[shell] MSAA unavailable', error);
  }
  try {
    const fxaa = viewer.scene.postProcessStages?.fxaa;
    if (fxaa) fxaa.enabled = true;
  } catch (error) {
    console.warn('[shell] FXAA unavailable', error);
  }

  // ── Top bar ──────────────────────────────────────────────────────────
  const bar = el('header', { class: 'gev-bar gev-glass' });
  const brand = el('span', { class: 'gev-bar__brand' }, `${ICONS.eye}<span>God's Eye</span>`);
  const form = el('form', { class: 'gev-bar__search', role: 'search' });
  const input = el('input', { type: 'search', placeholder: 'Search a place', 'aria-label': 'Search a place', autocomplete: 'off' });
  form.append(el('span', { class: 'gev-bar__search-icon' }, ICONS.search), input);
  const modeSwitch = el('div', { class: 'gev-seg', role: 'group', 'aria-label': 'Mode' });
  const liveBtn = el('button', { type: 'button', 'data-mode': 'live', 'aria-pressed': 'true' }, '<span class="gev-seg__dot gev-seg__dot--live"></span>Live');
  const exBtn = el('button', { type: 'button', 'data-mode': 'exercise', 'aria-pressed': 'false' }, '<span class="gev-seg__dot gev-seg__dot--ex"></span>Exercise');
  modeSwitch.append(liveBtn, exBtn);
  const layersBtn = el('button', { type: 'button', class: 'gev-btn', 'aria-expanded': 'false', 'aria-controls': 'gev-layers' }, `${ICONS.layers}<span>Layers</span>`);
  const directorBtn = el('button', { type: 'button', class: 'gev-btn gev-btn--primary' }, `${ICONS.play}<span>Director</span>`);
  const generateBtn = el('button', { type: 'button', class: 'gev-btn gev-btn--exercise' }, `${ICONS.target}<span>Generate strike package</span>`);
  generateBtn.hidden = true;
  bar.append(brand, el('span', { class: 'gev-bar__divider', 'aria-hidden': 'true' }), modeSwitch, form, layersBtn, directorBtn, generateBtn);

  // ── Layers panel ─────────────────────────────────────────────────────
  const panel = el('section', { id: 'gev-layers', class: 'gev-layers gev-glass', 'aria-label': 'Layers' });
  panel.hidden = true;
  const head = el('div', { class: 'gev-layers__head' });
  const collapse = el('button', { type: 'button', class: 'gev-icon-btn', 'aria-label': 'Close layers' }, ICONS.back);
  head.append(el('h2', {}, 'Layers'), collapse);
  panel.append(head);
  const rows = new Map();
  for (const layer of SHELL_LAYERS) {
    const row = el('button', { type: 'button', class: 'gev-layer', 'aria-pressed': 'false' });
    row.append(
      el('span', { class: 'gev-layer__dot', style: `background:${layer.dot}`, 'aria-hidden': 'true' }),
      el('span', { class: 'gev-layer__name' }, layer.name),
      el('span', { class: 'gev-switch', 'aria-hidden': 'true' }, '<span></span>'),
    );
    row.querySelector('.gev-layer__name').textContent = layer.name;
    row.addEventListener('click', () => toggleLayer(layer.id));
    rows.set(layer.id, row);
    panel.append(row);
  }

  // ── Demo buttons (staged events) ─────────────────────────────────────
  const demo = demoEnabled() ? el('div', { class: 'gev-demo' }) : null;
  if (demo) {
    const sim = el('button', { type: 'button', class: 'gev-chip' }, 'Simulate 7700');
    const quake = el('button', { type: 'button', class: 'gev-chip' }, 'Simulate quake');
    sim.addEventListener('click', () => tour.controller.simulate('aircraft'));
    quake.addEventListener('click', () => tour.controller.simulate('earthquake'));
    demo.append(sim, quake);
  }

  // ── Exercise banner (hidden until Exercise mode) ─────────────────────
  const banner = el('div', { class: 'gev-exbanner', role: 'status' }, '<span class="gev-exbanner__dot" aria-hidden="true"></span>EXERCISE · FICTIONAL SCENARIO · LIVE FEEDS DISCONNECTED');
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
    for (const [id, row] of rows) row.setAttribute('aria-pressed', String(isOn(id)));
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
  layersBtn.addEventListener('click', () => setPanel(panel.hidden));
  collapse.addEventListener('click', () => setPanel(false));

  const tour = installTour({
    viewer,
    dataManager,
    onState(state) {
      const live = state === 'running';
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
  for (const id of DEFAULT_ON) {
    if (!isOn(id))
      Promise.resolve(dataManager.setEnabled(id, true))
        .catch((error) => console.warn(`[shell] could not switch on ${id}`, error))
        .finally(refreshRows);
  }

  directorBtn.addEventListener('click', () => {
    if (tour.controller.isRunning()) tour.controller.exit('button');
    else tour.controller.start();
  });

  // ── Exercise mode ────────────────────────────────────────────────────
  const exCaption = el('div', { class: 'gev-caption gev-glass', 'aria-live': 'polite', 'data-visible': 'false' });
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
    if (event.key === 'Escape' && exercise.isLaunching()) exercise.cancelLaunch();
  });

  async function setMode(mode) {
    const ex = mode === 'exercise';
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
      await searchAndFlyTo(viewer, query, { placeSearch, signal: searchAbort.signal });
      input.blur();
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('[shell] search failed', error);
    } finally {
      form.classList.remove('is-busy');
    }
  });

  return () => {
    searchAbort?.abort();
    exercise.exit();
    exercise.destroy();
    tour.dispose();
    bar.remove();
    panel.remove();
    banner.remove();
    exCaption.remove();
    demo?.remove();
    document.body.classList.remove('gev-clean', 'gev-exercise');
  };
}
