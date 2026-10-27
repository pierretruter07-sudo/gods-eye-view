/**
 * @file The screen map: one place that decides where every overlay lives.
 *
 * The screen is divided into zones (top bar, title, left column, right
 * column, button bar, caption, credits, centre). Every fixed overlay is
 * assigned to exactly one zone in OVERLAYS, and when two overlays want the
 * same column, OWNER_PRIORITY decides who keeps it; the other gives way.
 * The DOM part measures the top bar, caption and credits and publishes the
 * free space as CSS variables (--gev-top, --gev-bottom, --gev-credits-h,
 * --gev-caption-h, --gev-header-h) plus the column owners as body
 * attributes (data-gev-left, data-gev-right). The CSS in shell.css reads
 * only those, so panels never position themselves against each other.
 *
 * Stacking order lives in LAYERS (published as --z-* variables) instead of
 * numbers scattered across style sheets.
 * @module shell/layout
 */

/** Screen zones, top to bottom, left to right. */
export const ZONES = Object.freeze({
  top: 'Top bar',
  header: 'Title (below the top bar, centre)',
  band: 'Band (a slim strip directly under the top bar)',
  left: 'Left column',
  right: 'Right column',
  stage: 'Asset view (cards around a clear centre, button bar along its foot)',
  caption: 'Caption (above the credits, centre)',
  credits: 'Credits (bottom-left corner, always visible)',
  centre: 'Centre (modal: welcome card, loading screen)',
  world: 'Behind everything (globe, world labels)',
});

/** Stacking order, lowest first. Published as --z-<name>. */
export const LAYERS = Object.freeze({
  world: 0,
  credits: 90,
  stage: 190,
  panel: 200,
  drawer: 210,
  chrome: 220,
  toast: 260,
  modal: 400,
});

/**
 * Every fixed overlay in the app, by selector. `zone` is where it lives;
 * `layer` its stacking layer; `transient` overlays (a two-second toast) are
 * excluded from the overlap check. Legacy selectors are styles with no
 * element any more.
 */
export const OVERLAYS = Object.freeze(
  [
    { selector: '.gev-bar', zone: 'top', layer: 'chrome' },
    { selector: '.gev-hud', zone: 'stage', layer: 'stage' },
    { selector: '.gev-hud .gev-hud__leaders', zone: 'stage', layer: 'stage' },
    { selector: '.gev-hud__leaders', zone: 'stage', layer: 'stage' },
    {
      selector: '.gev-hud__toast',
      zone: 'header',
      layer: 'toast',
      transient: true,
    },
    { selector: '.gev-caption', zone: 'caption', layer: 'chrome' },
    { selector: '.gev-alert', zone: 'right', layer: 'panel' },
    { selector: '.gev-sheet', zone: 'right', layer: 'drawer' },
    { selector: '.gev-descent', zone: 'band', layer: 'panel' },
    { selector: '.gev-layers', zone: 'left', layer: 'panel' },
    { selector: '.gev-navhelp', zone: 'left', layer: 'panel' },
    { selector: '.gev-triage', zone: 'left', layer: 'panel' },
    { selector: '.gev-welcome', zone: 'centre', layer: 'modal' },
    { selector: '#loading-screen', zone: 'centre', layer: 'modal' },
    { selector: '#ddg-intro', zone: 'centre', layer: 'modal', transient: true },
    { selector: '#cesium-credits', zone: 'credits', layer: 'credits' },
    { selector: '.world-overlay-accessibility', zone: 'world', layer: 'world' },
    { selector: '#cockpit-cloud-effects', zone: 'world', layer: 'world' },
    { selector: '.gev-tour-spot', zone: 'stage', layer: 'toast' },
    { selector: '.gev-tour-card', zone: 'right', layer: 'toast' },
    { selector: '.gev-wall', zone: 'right', layer: 'toast', transient: true },
    { selector: '.gev-tour-move', zone: 'stage', layer: 'toast' },
    { selector: '.gev-iv', zone: 'stage', layer: 'stage', legacy: true },
    {
      selector: '#gev-voice-control',
      zone: 'right',
      layer: 'panel',
      legacy: true,
    },
    { selector: '#title-bar', zone: 'top', layer: 'chrome', legacy: true },
    {
      selector: '#style-indicator',
      zone: 'top',
      layer: 'chrome',
      legacy: true,
    },
  ].map((o) => Object.freeze(o)),
);

/**
 * Who may hold each column, highest first. Panels the viewer opened beat
 * the Director's own panels; the asset view's cards ('cards') give way to
 * anything else in their column.
 */
export const OWNER_PRIORITY = Object.freeze({
  left: Object.freeze(['triage', 'layers', 'cards']),
  right: Object.freeze(['sheets', 'alert', 'cards']),
});

/**
 * The owner of each column for what is on screen.
 * @param {{triage?: boolean, layers?: boolean,
 *   sheets?: boolean, alert?: boolean, hud?: boolean}} open
 * @returns {{left: string, right: string}} '' when nothing claims a column
 */
export function resolveOwners(open = {}) {
  const pick = (order) =>
    order.find((name) => (name === 'cards' ? open.hud : open[name])) || '';
  return { left: pick(OWNER_PRIORITY.left), right: pick(OWNER_PRIORITY.right) };
}

/** The reserved heights, from measured sizes (px). */
export function reservedSpace({
  barBottom = 0,
  bandH = 0,
  creditsH = 0,
  captionH = 0,
  gap = 10,
  edge = 8,
}) {
  // The band (descent checklist) sits under the top bar and pushes
  // everything below it down; nothing is hidden to make room for it.
  const band = Math.ceil(bandH > 0 ? bandH + gap : 0);
  const top = Math.ceil(barBottom > 0 ? barBottom + gap : edge * 2) + band;
  const credits = Math.ceil(creditsH > 0 ? creditsH + edge : 0);
  const caption = Math.ceil(captionH > 0 ? captionH + gap : 0);
  return { top, credits, caption, bottom: edge + credits + caption + gap };
}

// ── DOM ─────────────────────────────────────────────────────────────────

const shown = (el) => {
  if (!el || el.hidden || !el.isConnected) return false;
  const style = getComputedStyle(el);
  // Opacity is ignored on purpose: a panel fading in already owns its space.
  return style.display !== 'none' && style.visibility !== 'hidden';
};

/**
 * Keep the screen map current: measure, publish CSS variables and column
 * owners, and re-run whenever an overlay appears, hides or resizes.
 * @param {{root?: Document}} [options]
 * @returns {{update: () => void, destroy: () => void}}
 */
export function installLayout({ root = document } = {}) {
  const html = root.documentElement;
  const body = root.body;
  for (const [name, z] of Object.entries(LAYERS))
    html.style.setProperty(`--z-${name}`, String(z));

  let frame = 0;
  function update() {
    frame = 0;
    const q = (sel) => root.querySelector(sel);
    const bar = q('.gev-bar');
    const credits = q('#cesium-credits');
    const captions = [...root.querySelectorAll('.gev-caption')].filter(
      (c) => c.dataset.visible === 'true' && shown(c),
    );
    const header = q('.gev-hud__header');
    const band = q('.gev-descent.is-in');
    const barBottom = shown(bar) ? bar.getBoundingClientRect().bottom : 0;
    html.style.setProperty('--gev-bar-bottom', `${Math.ceil(barBottom)}px`);
    const space = reservedSpace({
      barBottom,
      bandH: shown(band) ? band.getBoundingClientRect().height : 0,
      creditsH: shown(credits) ? credits.getBoundingClientRect().height : 0,
      captionH: Math.max(
        0,
        ...captions.map((c) => c.getBoundingClientRect().height),
      ),
    });
    html.style.setProperty('--gev-top', `${space.top}px`);
    html.style.setProperty('--gev-credits-h', `${space.credits}px`);
    html.style.setProperty('--gev-caption-h', `${space.caption}px`);
    html.style.setProperty('--gev-bottom', `${space.bottom}px`);
    html.style.setProperty(
      '--gev-header-h',
      `${shown(header) ? Math.ceil(header.getBoundingClientRect().height) : 0}px`,
    );
    const hud = q('.gev-hud');
    const owners = resolveOwners({
      triage: shown(q('.gev-triage')),
      layers: shown(q('.gev-layers')),
      sheets: shown(q('.gev-sheet')),
      alert: shown(q('.gev-alert')),
      hud: shown(hud),
    });
    if (body.dataset.gevLeft !== owners.left)
      body.dataset.gevLeft = owners.left;
    if (body.dataset.gevRight !== owners.right)
      body.dataset.gevRight = owners.right;
  }
  // A timer, not an animation frame: layout must not wait on the globe's
  // render loop (slow frames would leave panels overlapping meanwhile).
  const schedule = () => {
    if (!frame) frame = setTimeout(update, 0);
  };

  const mutations = new MutationObserver(schedule);
  mutations.observe(body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'data-visible'],
  });
  const sizes = new ResizeObserver(schedule);
  const watchSizes = () => {
    for (const sel of [
      '.gev-descent',
      '.gev-bar',
      '#cesium-credits',
      '.gev-caption',
      '.gev-hud__header',
    ])
      for (const el of root.querySelectorAll(sel)) sizes.observe(el);
  };
  watchSizes();
  const rewatch = setInterval(watchSizes, 2000);
  window.addEventListener('resize', schedule);
  // Panels that slide or fade settle after their animation.
  body.addEventListener('animationend', schedule);
  body.addEventListener('transitionend', schedule);
  update();

  return {
    update,
    destroy() {
      clearTimeout(frame);
      clearInterval(rewatch);
      mutations.disconnect();
      sizes.disconnect();
      window.removeEventListener('resize', schedule);
      body.removeEventListener('animationend', schedule);
      body.removeEventListener('transitionend', schedule);
    },
  };
}
