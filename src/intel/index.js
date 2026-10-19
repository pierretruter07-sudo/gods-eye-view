import * as Cesium from 'cesium';
import { buildDossier, composeBrief } from './enrichment.js';
import {
  INTEL_LAYERS,
  toIntelObject,
  buildTriage,
  nearestHit,
  nearbyObjects,
  insideArea,
  distanceKm,
} from './objects.js';
import {
  KIND_LABEL,
  SEV_LABEL,
  ACCENT,
  AOI_KM,
  esc,
  chip,
  ICON,
  hudHeader,
  hudCard,
  hudActions,
  sheetDrawer,
} from './markup.js';
import { runAction } from './actions.js';
import {
  blockCsv,
  objectIdentity,
  objectLineage,
  overviewSheet,
} from './sheets.js';
import { buildHud, MAX_CARDS } from './hud.js';
import { buildPlaceHud } from './place.js';
import { buildCameraHud, CAMERA_FRAME_REFRESH_MS } from './camera.js';
import { registerCctvFocusRequestListener } from '../cctvFocusRequest.js';
import { resolveAssetType } from './assetTypes.js';
import { createReferenceImages } from './referenceImages.js';
import { reticleSprite } from '../tour/pulseGraphics.js';
import { createNarrator } from '../tour/narrator.js';
import { createSubjectVisual } from './subjectVisual.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';

/**
 * Live-mode intelligence view — the Constellation HUD. Click any aircraft,
 * ship, satellite or quake (or let the Director focus one): a header names
 * it, up to four glass cards sit in the screen corners joined to the asset
 * by leader lines, and analyst actions run along the bottom. Nothing
 * scrolls. Real feed values are tagged FEED; illustrative content SIMULATED.
 */
const CACHE_MS = 4000;

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

export function installIntel({ viewer, dataManager, isLive = () => true }) {
  const scene = viewer.scene;
  const narrator = createNarrator();

  // ── Console (three glass pieces around a clear centre) ───────────────
  const view = el('div', 'gev-hud');
  view.hidden = true;
  // A type photo that fails to load is removed, leaving the class outline.
  view.addEventListener(
    'error',
    (event) => {
      if (
        event.target?.tagName === 'IMG' &&
        event.target.closest('.gev-hud__ref')
      )
        event.target.remove();
    },
    true,
  );
  const header = el('div', 'gev-hud__header');
  // Four card slots around the asset: top-left, top-right, bottom-left, bottom-right.
  const SLOTS = ['tl', 'tr', 'bl', 'br'];
  const cards = SLOTS.slice(0, MAX_CARDS).map((slot) =>
    el('section', `gev-hud__card gev-hud__card--${slot} gev-glass`),
  );
  const bottom = el('div', 'gev-hud__bottom');
  const brief = el('p', 'gev-iv__brief gev-glass');
  brief.hidden = true;
  const actions = el('nav', 'gev-iv__actions gev-glass');
  actions.setAttribute('aria-label', 'Analyst actions');
  // Analyst sheets: a drawer on the right so the asset stays in view.
  const drawer = el('aside', 'gev-sheet gev-glass');
  drawer.setAttribute('aria-label', 'Analyst sheets');
  drawer.hidden = true;
  bottom.append(brief, actions);
  // Leader lines from the asset to each card (decorative).
  const svgNS = 'http://www.w3.org/2000/svg';
  const leaders = document.createElementNS(svgNS, 'svg');
  leaders.setAttribute('class', 'gev-hud__leaders');
  leaders.setAttribute('aria-hidden', 'true');
  leaders.setAttribute('shape-rendering', 'geometricPrecision');
  const defs = document.createElementNS(svgNS, 'defs');
  leaders.append(defs);
  // Per leader: a soft halo, the line itself (fading in from the asset), a
  // light-blue data pulse travelling asset → card, and an end dot that
  // brightens as each pulse arrives. Pulses are staggered per card.
  const mk = (tag, attrs) => {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const leaderEls = cards.map((_, i) => {
    const gradId = `gev-lead-grad-${i}`;
    const grad = mk('linearGradient', {
      id: gradId,
      gradientUnits: 'userSpaceOnUse',
    });
    const stopA = mk('stop', { offset: '0', 'stop-opacity': '0.1' });
    const stopB = mk('stop', { offset: '1', 'stop-opacity': '0.6' });
    grad.append(stopA, stopB);
    defs.append(grad);
    const g = mk('g', { style: `--gev-delay:${(i * 0.65).toFixed(2)}s` });
    const halo = mk('path', { class: 'gev-lead__halo' });
    const line = mk('path', {
      class: 'gev-lead__line',
      stroke: `url(#${gradId})`,
    });
    const pulse = mk('path', { class: 'gev-lead__pulse', pathLength: '100' });
    const dot = mk('circle', { class: 'gev-lead__dot', r: '2.25' });
    g.append(halo, line, pulse, dot);
    leaders.append(g);
    return { g, grad, stopA, stopB, halo, line, pulse, dot };
  });
  const toast = el('div', 'gev-hud__toast gev-glass');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  view.append(leaders, header, ...cards, bottom, drawer);
  document.body.append(toast);

  const triage = el('section', 'gev-triage gev-glass');
  triage.setAttribute('aria-label', 'Triage queue');
  triage.hidden = true;
  document.body.append(view, triage);

  // ── Globe graphics: reticle + areas of interest ──────────────────────
  const marker = viewer.entities.add({
    show: false,
    position: Cesium.Cartesian3.fromDegrees(0, 0),
    billboard: {
      image: reticleSprite(ACCENT),
      width: 46,
      height: 46,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  const areas = []; // { key, title, lat, lon, radiusKm, entity }
  const watchlist = new Map(); // key -> object snapshot

  // ── Data (cached so clicks and the badge never rescan every layer) ───
  let cache = { at: 0, objects: [] };
  function layerOn(id) {
    try {
      return dataManager.isEnabled(id) === true;
    } catch {
      return false;
    }
  }
  function layerModule(id) {
    try {
      return dataManager.layers.get(id)?.module || null;
    } catch {
      return null;
    }
  }
  function collect({ fresh = false } = {}) {
    const now = performance.now();
    if (!fresh && now - cache.at < CACHE_MS) return cache.objects;
    const out = [];
    for (const id of Object.keys(INTEL_LAYERS)) {
      if (!layerOn(id)) continue;
      let records = [];
      try {
        records = layerModule(id)?.getAnalystRecords?.(20000) || [];
      } catch (error) {
        console.warn(`[intel] ${id} records unavailable`, error);
      }
      for (const r of records) {
        const o = toIntelObject(id, r);
        if (o) out.push(o);
      }
    }
    cache = { at: now, objects: out };
    return out;
  }
  const cartesianOf = (o) =>
    Cesium.Cartesian3.fromDegrees(o.lon, o.lat, o.heightM || 0);

  // ── Selection state ──────────────────────────────────────────────────
  let selected = null;
  let state = {};
  let nearby = { total: 0, radiusKm: 0, items: [] };
  let followTimer = null;

  function placeMarker(o) {
    // Aircraft and satellites use their layer's own smooth follow camera and
    // highlight; the reticle marks ships and quakes.
    marker.show = o.kind === 'vessel' || o.kind === 'earthquake';
    scene.requestRender();
  }
  let hud = null;
  let headline = '';
  const touring = () => document.body.classList.contains('gev-touring');
  function renderActions() {
    if (!hud) return;
    // A place has no analyst actions (watching a place is not a thing yet).
    actions.innerHTML =
      selected?.kind === 'place'
        ? ''
        : hudActions(hud, state, { touring: touring() });
  }
  // Only touch the DOM when a card's markup actually changed: rebuilding it
  // every refresh re-lays out the page and would reload the type photo.
  const lastHtml = new WeakMap();
  function setHtml(node, html) {
    if (lastHtml.get(node) === html) return false;
    lastHtml.set(node, html);
    node.innerHTML = html;
    return true;
  }
  // ── Places (Director airport and city stops) ─────────────────────────
  // Weather per station, fetched once per 10 minutes and re-rendered when it
  // arrives; the counts and incidents refresh from the live layers.
  const metars = new Map(); // station → { report, at } | 'loading'
  function metarFor(icao) {
    if (!icao) return null;
    const hit = metars.get(icao);
    if (hit === 'loading') return 'loading';
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.report;
    metars.set(icao, 'loading');
    fetch(`/api/metar?ids=${encodeURIComponent(icao)}`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        metars.set(icao, {
          report: body?.reports?.[0] || null,
          at: Date.now(),
        });
      })
      .catch(() => metars.set(icao, { report: null, at: Date.now() }))
      .finally(() => {
        if (selected?.kind === 'place') render();
      });
    return 'loading';
  }
  /** Nearest street camera within 10 km of a place, with its current still. */
  function nearestCamera(place) {
    const cams = layerOn('cctv') ? layerModule('cctv') : null;
    let best = null;
    for (const record of cams?.getAnalystRecords?.() || []) {
      const km = distanceKm(
        { lat: place.lat, lon: place.lon, heightM: 0 },
        { lat: record.lat, lon: record.lon, heightM: 0 },
      );
      if (km <= 10 && (!best || km < best.km)) best = { record, km };
    }
    return best ? { ...best, frameUrl: cams.frameUrl?.(best.record.id) } : null;
  }

  function placeContext(o) {
    const objects = collect();
    const of = (layerId) => objects.filter((x) => x.layerId === layerId);
    const plain = (id) => {
      try {
        return layerOn(id)
          ? layerModule(id)?.getAnalystRecords?.(5000) || []
          : [];
      } catch {
        return [];
      }
    };
    // Aircraft loaded ahead by the Director count until the live layer
    // covers the place (they never replace a live record).
    let flights = of('flights');
    const staged = Date.now() - (o.stagedAt || 0) < 60_000 ? o.staged : [];
    if (staged?.length) {
      const seen = new Set(flights.map((f) => f.icao24).filter(Boolean));
      flights = [...flights, ...staged.filter((f) => !seen.has(f.icao24))];
    }
    return {
      flights,
      military: of('military'),
      vessels: of('ais-live-vessels'),
      satellites: of('satellites'),
      quakes: of('earthquakes'),
      fires: plain('local-firms'),
      storms: plain('weather-cyclones'),
      metar: metarFor(o.place.icao),
      camera: nearestCamera(o.place),
      layersOn: {
        flights: layerOn('flights'),
        military: layerOn('military'),
        vessels: layerOn('ais-live-vessels'),
        satellites: layerOn('satellites'),
        earthquakes: layerOn('earthquakes'),
        fires: layerOn('local-firms'),
        storms: layerOn('weather-cyclones'),
      },
    };
  }

  function render() {
    if (!selected) return;
    if (selected.kind === 'place')
      hud = buildPlaceHud(selected.place, placeContext(selected));
    else if (selected.kind === 'camera') {
      const cams = layerModule('cctv');
      const all = nearbyObjects(collect(), selected, { limit: Infinity });
      hud = buildCameraHud(selected, {
        frameUrl: cams?.frameUrl?.(selected.id) || null,
        refreshedAt: Date.now(),
        nearby: all.items,
        radiusKm: all.radiusKm,
        panel3d: cams?.getActiveCameraId?.() === selected.id,
        adjusting: !!cams?.getParams?.().calibrationMode,
      });
    } else {
      const all = nearbyObjects(collect(), selected, { limit: Infinity });
      hud = buildHud(selected, all.items);
    }
    setHtml(header, hudHeader(hud, headline));
    let changed = false;
    cards.forEach((node, i) => {
      const c = hud.cards[i];
      if (node.hidden !== !c) {
        node.hidden = !c;
        changed = true;
      }
      node.dataset.source = c?.source || '';
      changed =
        setHtml(
          node,
          c ? hudCard(c, i, { image: c.ref ? refs.get(c.ref) : null }) : '',
        ) || changed;
    });
    renderActions();
    if (changed) measureCards();
    requestAnimationFrame(updateLeaders);
  }
  const refs = createReferenceImages();
  refs.onReady(() => {
    if (selected && !view.hidden) render();
  });

  // Leader lines: from the asset's screen position to each card's inner corner.
  const scratchWin = new Cesium.Cartesian2();
  const scratchPos = new Cesium.Cartesian3();
  function assetScreen() {
    const p =
      (NATIVE_FOLLOW.has(selected?.kind) &&
        viewer.trackedEntity?.position?.getValue(
          viewer.clock.currentTime,
          scratchPos,
        )) ||
      trackedPosition(scratchPos);
    if (!p) return null;
    occluder.cameraPosition = viewer.camera.positionWC;
    if (!occluder.isPointVisible(p)) return null;
    return Cesium.SceneTransforms.worldToWindowCoordinates(
      scene,
      p,
      scratchWin,
    );
  }
  const occluder = new Cesium.EllipsoidalOccluder(
    Cesium.Ellipsoid.WGS84,
    Cesium.Cartesian3.ZERO,
  );
  // Card anchor points, measured only when a card changes size or the window
  // resizes — never per frame (a layout read every frame stalls rendering).
  const anchors = cards.map(() => null);
  function measureCards() {
    cards.forEach((node, i) => {
      if (node.hidden) {
        anchors[i] = null;
        return;
      }
      const r = node.getBoundingClientRect();
      const slot = SLOTS[i];
      anchors[i] = {
        x: (slot.endsWith('l') ? r.right : r.left).toFixed(1),
        y: (slot.startsWith('t') ? r.bottom - 18 : r.top + 18).toFixed(1),
      };
    });
  }
  const cardObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => measureCards())
      : null;
  for (const node of cards) cardObserver?.observe(node);
  const lastD = cards.map(() => '');
  function updateLeaders() {
    if (view.hidden || !selected) return;
    const at = assetScreen();
    leaderEls.forEach(
      ({ g, grad, stopA, stopB, halo, line, pulse, dot }, i) => {
        const node = cards[i];
        const anchor = anchors[i];
        if (!at || node.hidden || !anchor) {
          if (g.style.display !== 'none') g.style.display = 'none';
          lastD[i] = '';
          return;
        }
        const { x, y } = anchor;
        const ax = at.x.toFixed(1);
        const ay = at.y.toFixed(1);
        const d = `M${ax} ${ay}L${x} ${y}`;
        if (d === lastD[i]) return; // nothing moved since the last frame
        lastD[i] = d;
        const source = node.dataset.source || 'feed';
        if (g.dataset.source !== source) {
          g.dataset.source = source;
          g.setAttribute('class', `gev-lead gev-lead--${source}`);
          const color = source === 'feed' ? '#64d2ff' : '#ffbe55';
          stopA.setAttribute('stop-color', color);
          stopB.setAttribute('stop-color', color);
        }
        g.style.display = '';
        grad.setAttribute('x1', ax);
        grad.setAttribute('y1', ay);
        grad.setAttribute('x2', x);
        grad.setAttribute('y2', y);
        halo.setAttribute('d', d);
        line.setAttribute('d', d);
        pulse.setAttribute('d', d);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
      },
    );
  }
  const removeLeaderHook = scene.postRender.addEventListener(updateLeaders);
  const onResize = () => {
    measureCards();
    updateLeaders();
  };
  window.addEventListener('resize', onResize);

  let toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }
  let briefing = false;
  function stopBrief() {
    // Only cancel speech we started — never cut off the Director's narration.
    if (briefing) narrator.stop();
    briefing = false;
  }
  function open(o, { quiet = false, headline: line = '' } = {}) {
    stopFollow();
    stopOrbit();
    selected = o;
    headline = line;
    nearby = nearbyObjects(collect(), o);
    state = {
      watched: watchlist.has(o.key),
      aoi: areas.some((a) => a.key === o.key),
    };
    brief.hidden = true;
    stopBrief();
    render();
    observe(o);
    syncSheets(o);
    setTriage(false);
    view.hidden = false;
    measureCards();
    document.body.classList.add('gev-intel-open');
    onOpen?.();
    clearInterval(followTimer);
    track.fix = null;
    setFix(o);
    visual.show(o);
    if (o.kind === 'place') {
      // Live counts, incidents and weather age refresh while the stop lasts.
      followTimer = setInterval(() => selected && render(), 5000);
    }
    if (o.kind === 'camera') {
      // Show the camera's panel in the city and refresh its still. The
      // adjust tool belongs to one camera, so it ends when another opens.
      const cams = layerModule('cctv');
      if (cams?.getParams?.().calibrationMode)
        cams.setParams?.({ calibrationMode: false });
      cams?.selectCamera?.(o.id);
      render();
      followTimer = setInterval(
        () => selected && render(),
        CAMERA_FRAME_REFRESH_MS,
      );
      if (!quiet) {
        marker.show = false;
        layerModule('cctv')?.focusCamera?.(o.id, 1.8);
        state.following = false;
        renderActions();
      }
      return;
    }
    if (o.kind === 'satellite') {
      // Satellites move ~7 km/s: re-fix every second from the layer itself.
      followTimer = setInterval(() => {
        if (!selected) return;
        const fresh = layerModule('satellites')
          ?.getAnalystRecords?.(20000)
          ?.map((r) => toIntelObject('satellites', r))
          .find((x) => x && x.key === selected.key);
        if (fresh) {
          selected = { ...fresh, simulated: selected.simulated };
          setFix(fresh);
        }
      }, 1000);
    }
    // From the Director: its own pulse marks the target and the camera is
    // already orbiting it, so no reticle and no camera moves.
    if (quiet) {
      marker.show = false;
      return;
    }
    placeMarker(o);
    // Focus the camera on it, Director-style.
    if (NATIVE_FOLLOW.has(o.kind)) {
      state.following = follow(o);
      if (state.following) spinTracked();
    } else {
      orbit(o);
      state.following = true;
    }
    renderActions();
    if (o.kind === 'aircraft' || o.kind === 'vessel') {
      followTimer = setInterval(() => {
        if (!selected) return;
        const fresh = collect().find((x) => x.key === selected.key);
        if (fresh) {
          selected = fresh;
          setFix(fresh);
          visual.update(fresh);
          render();
        }
      }, CACHE_MS);
    }
  }
  // ── Analyst sheets ─────────────────────────────────────────────────
  // One tab per sheet; "overview" (the object view) is always first. The
  // drawer follows the focused object: on a new focus it re-runs the tabs
  // that exist for the new kind.
  let sheetTabs = [];
  let sheetActive = null;
  const sheetResults = new Map();
  let sheetToken = 0;
  // Positions seen this session for moving contacts (track-history sheet).
  const observations = new Map();
  function observe(o) {
    if (!o || (o.kind !== 'aircraft' && o.kind !== 'vessel')) return;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return;
    const list = observations.get(o.key) || [];
    const last = list[list.length - 1];
    if (last && last.lat === o.lat && last.lon === o.lon) return;
    list.push({
      t: Date.now(),
      lat: o.lat,
      lon: o.lon,
      altitudeM: o.altitudeM,
    });
    if (list.length > 40) list.shift();
    observations.set(o.key, list);
    if (observations.size > 200)
      observations.delete(observations.keys().next().value);
  }
  const observeTimer = setInterval(() => {
    if (
      !selected ||
      (selected.kind !== 'aircraft' && selected.kind !== 'vessel')
    )
      return;
    observe(collect().find((x) => x.key === selected.key));
  }, 15_000);

  function sheetCtx() {
    return {
      now: Date.now(),
      objects: collect(),
      observations: (key) => observations.get(key) || [],
      flagged: () => buildTriage(collect(), { limit: 999 }),
      cameraHealth: async () => {
        try {
          const r = await fetch('/api/cctv/health', {
            headers: { Accept: 'application/json' },
          });
          if (!r.ok) return [];
          const body = await r.json();
          return Array.isArray(body?.cameras) ? body.cameras : [];
        } catch {
          return [];
        }
      },
      satrecs: () => {
        try {
          return layerModule('satellites')?.getCatalogSatrecs?.() || [];
        } catch {
          return [];
        }
      },
      installations: () => {
        if (!layerOn('military-installations')) return [];
        try {
          return (
            layerModule('military-installations')?.getAnalystRecords?.(20000) ||
            []
          );
        } catch {
          return [];
        }
      },
    };
  }
  function renderSheets() {
    if (!selected || !sheetTabs.length) return;
    drawer.innerHTML = sheetDrawer({
      identity: objectIdentity(selected),
      lineage: objectLineage(selected),
      tabs: sheetTabs,
      active: sheetActive,
      sheet: sheetResults.get(sheetActive) || null,
      busy: !sheetResults.has(sheetActive),
    });
  }
  async function runSheet(id, o) {
    const token = sheetToken;
    if (id === 'overview') {
      const ctx = sheetCtx();
      const satrec =
        o.kind === 'satellite'
          ? ctx.satrecs().find((x) => x.noradId === String(o.noradId))?.satrec
          : null;
      sheetResults.set(
        id,
        overviewSheet(o, {
          now: ctx.now,
          nearby: nearbyObjects(ctx.objects, o, { limit: 6 }).items,
          observations: ctx.observations(o.key),
          satrec,
        }),
      );
      renderSheets();
      return;
    }
    const r = await runAction(id, o, sheetCtx());
    if (token !== sheetToken || selected?.key !== o.key) return;
    sheetResults.set(id, { id, ...r });
    renderSheets();
  }
  function openSheet(id, label) {
    if (!selected) return;
    if (!sheetTabs.length) sheetTabs = [{ id: 'overview', label: 'Object' }];
    if (!sheetTabs.some((t) => t.id === id)) sheetTabs.push({ id, label });
    sheetActive = id;
    drawer.hidden = false;
    document.body.classList.add('gev-sheets-open');
    renderSheets();
    if (!sheetResults.has('overview')) runSheet('overview', selected);
    if (!sheetResults.has(id)) runSheet(id, selected);
  }
  // Tabs parked while the Director moves between subjects (it closes the
  // view between stops); they come back on the next subject.
  let parked = null;
  function hideResult({ keep = false } = {}) {
    parked =
      keep && sheetTabs.length
        ? { tabs: sheetTabs, active: sheetActive }
        : null;
    sheetToken += 1;
    sheetTabs = [];
    sheetActive = null;
    sheetResults.clear();
    drawer.hidden = true;
    drawer.innerHTML = '';
    document.body.classList.remove('gev-sheets-open');
  }
  /** A new object is in focus: keep the drawer, re-run what still applies. */
  function syncSheets(o) {
    if (!sheetTabs.length && parked && o.kind !== 'place') {
      sheetTabs = parked.tabs;
      sheetActive = parked.active;
      parked = null;
      drawer.hidden = false;
      document.body.classList.add('gev-sheets-open');
    }
    if (!sheetTabs.length) return;
    sheetToken += 1;
    sheetResults.clear();
    const available = new Set([
      'overview',
      ...(hud?.actions || []).map((a) => a.id),
    ]);
    if (o.kind === 'place') return hideResult({ keep: true });
    sheetTabs = sheetTabs.filter((t) => available.has(t.id));
    if (!sheetTabs.some((t) => t.id === sheetActive)) sheetActive = 'overview';
    renderSheets();
    for (const t of sheetTabs) runSheet(t.id, o);
  }
  drawer.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-res]')?.dataset.res;
    if (!act || !selected) return;
    if (act === 'close') return hideResult();
    if (act.startsWith('tab:')) {
      sheetActive = act.slice(4);
      return renderSheets();
    }
    if (act.startsWith('untab:')) {
      const id = act.slice(6);
      sheetTabs = sheetTabs.filter((t) => t.id !== id);
      sheetResults.delete(id);
      if (sheetActive === id) sheetActive = 'overview';
      return renderSheets();
    }
    if (act.startsWith('link:')) {
      const target = collect().find((x) => x.key === act.slice(5));
      if (target) open(target);
      return;
    }
    const sheet = sheetResults.get(sheetActive);
    if (act.startsWith('csv:')) {
      const block = sheet?.blocks?.[Number(act.slice(4))];
      const text = block ? blockCsv(block) : '';
      const button = event.target.closest('button');
      try {
        await navigator.clipboard.writeText(text);
        if (button) button.textContent = 'Copied';
      } catch {
        if (button) button.textContent = 'Copy unavailable';
      }
      return;
    }
    if (act === 'send' && sheet?.send) showToast(sheet.send.toast);
  });

  function close({ keepSheets = false } = {}) {
    if (selected?.kind === 'camera') {
      const cams = layerModule('cctv');
      if (cams?.getParams?.().calibrationMode)
        cams.setParams?.({ calibrationMode: false });
      cams?.deactivateActiveCamera?.();
    }
    hideResult({ keep: keepSheets });
    stopFollow();
    stopOrbit();
    stopBrief();
    selected = null;
    clearInterval(followTimer);
    view.hidden = true;
    document.body.classList.remove('gev-intel-open');
    marker.show = false;
    visual.hide();
    track.fix = null;
    scene.requestRender();
  }

  // ── Smooth track: dead-reckon between feed fixes ─────────────────────
  // Feed fixes arrive every few seconds; the camera and reticle move every
  // frame along the contact's reported heading and speed, and blend out any
  // correction over a second when the next fix lands — smooth, never a jump.
  const track = {
    fix: null,
    vel: new Cesium.Cartesian3(),
    at: 0,
    err: new Cesium.Cartesian3(),
    errAt: 0,
  };
  const scratch = new Cesium.Cartesian3();
  function velocityOf(o, at) {
    const mps =
      o.kind === 'aircraft'
        ? Number(o.speedMps)
        : o.kind === 'vessel'
          ? Number(o.speedKts) / 1.943844
          : 0;
    const hdg = o.kind === 'aircraft' ? Number(o.heading) : Number(o.courseDeg);
    if (!(mps > 0) || !Number.isFinite(hdg) || o.onGround)
      return new Cesium.Cartesian3();
    const h = Cesium.Math.toRadians(hdg);
    const enu = new Cesium.Cartesian3(Math.sin(h) * mps, Math.cos(h) * mps, 0);
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(at);
    return Cesium.Matrix4.multiplyByPointAsVector(
      frame,
      enu,
      new Cesium.Cartesian3(),
    );
  }
  function trackedPosition(result = new Cesium.Cartesian3()) {
    if (!track.fix) return undefined;
    // An aircraft the layer is drawing: use exactly where its icon is, so the
    // leader lines, reticle and camera meet it (the HUD's own extrapolation
    // can drift from the layer's by kilometres between fixes).
    const drawn = track.drawn?.();
    if (drawn) return Cesium.Cartesian3.clone(drawn, result);
    const now = performance.now();
    const dt = (now - track.at) / 1000;
    Cesium.Cartesian3.multiplyByScalar(track.vel, dt, scratch);
    Cesium.Cartesian3.add(track.fix, scratch, result);
    const blend = Math.max(0, 1 - (now - track.errAt) / 1000);
    if (blend > 0)
      Cesium.Cartesian3.add(
        result,
        Cesium.Cartesian3.multiplyByScalar(track.err, blend, scratch),
        result,
      );
    return result;
  }
  function setFix(o) {
    const before = track.fix ? trackedPosition() : null;
    const prevFix = track.fix;
    const prevAt = track.at;
    track.fix = cartesianOf(o);
    track.at = performance.now();
    track.drawn =
      o.kind === 'aircraft' && o.icao24
        ? () =>
            dataManager
              .getLayerModule?.(o.layerId)
              ?.getDisplayPosition?.(o.icao24) ?? null
        : null;
    // Satellites have no heading/speed fields: derive velocity from fixes.
    if (
      o.kind === 'satellite' &&
      prevFix &&
      track.key === o.key &&
      track.at > prevAt
    ) {
      track.vel = Cesium.Cartesian3.multiplyByScalar(
        Cesium.Cartesian3.subtract(track.fix, prevFix, new Cesium.Cartesian3()),
        1000 / (track.at - prevAt),
        new Cesium.Cartesian3(),
      );
    } else track.vel = velocityOf(o, track.fix);
    track.key = o.key;
    if (before) {
      Cesium.Cartesian3.subtract(before, track.fix, track.err);
      track.errAt = track.at;
    } else {
      track.err = new Cesium.Cartesian3();
      track.errAt = 0;
    }
  }
  marker.position = new Cesium.CallbackProperty(
    (time, result) => trackedPosition(result),
    false,
  );
  const visual = createSubjectVisual(viewer, {
    position: (result) => trackedPosition(result),
    dataManager,
  });

  const ORBIT = {
    aircraft: { rangeM: 22_000, pitchDeg: -25 },
    vessel: { rangeM: 6_000, pitchDeg: -30 },
    earthquake: { rangeM: 320_000, pitchDeg: -50 },
  };
  let removeOrbit = null;
  let orbitToken = 0;
  let orbitFlying = false;
  function stopOrbit() {
    orbitToken += 1;
    if (orbitFlying) {
      orbitFlying = false;
      viewer.camera.cancelFlight();
    }
    if (!removeOrbit) return;
    const native = removeOrbit.native === true;
    removeOrbit();
    removeOrbit = null;
    releaseContinuousRender('intel-orbit');
    if (!native) viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
  const NATIVE_FOLLOW = new Set(['aircraft', 'satellite']);
  /** While a layer's follow camera tracks the contact, circle it slowly. */
  function spinTracked() {
    stopOrbit();
    let last = performance.now();
    holdContinuousRender('intel-orbit');
    removeOrbit = scene.preRender.addEventListener(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (viewer.trackedEntity)
        viewer.camera.rotateRight(Cesium.Math.toRadians(3) * dt);
    });
    removeOrbit.native = true;
  }
  /** Fly in, then circle the contact slowly while it moves — like the Director. */
  function orbit(o) {
    stopOrbit();
    const frame = ORBIT[o.kind];
    if (!frame) return;
    const token = orbitToken;
    const pitch = Cesium.Math.toRadians(frame.pitchDeg);
    let heading = viewer.camera.heading;
    orbitFlying = true;
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(trackedPosition() || cartesianOf(o), 1),
      {
        offset: new Cesium.HeadingPitchRange(heading, pitch, frame.rangeM),
        duration: 2.0,
        complete: () => {
          orbitFlying = false;
          if (token !== orbitToken || !selected) return;
          let last = performance.now();
          const target = new Cesium.Cartesian3();
          holdContinuousRender('intel-orbit');
          removeOrbit = scene.preRender.addEventListener(() => {
            const now = performance.now();
            heading +=
              Cesium.Math.toRadians(3) * Math.min(0.25, (now - last) / 1000);
            last = now;
            if (!trackedPosition(target)) return;
            viewer.camera.lookAt(
              target,
              new Cesium.HeadingPitchRange(heading, pitch, frame.rangeM),
            );
          });
        },
      },
    );
  }
  // The viewer takes the camera back the moment they touch it.
  const releaseCamera = () => {
    if (!removeOrbit && !orbitFlying) return;
    stopOrbit();
    if (selected && state.following && !NATIVE_FOLLOW.has(selected.kind)) {
      state.following = false;
      renderActions();
    }
  };
  scene.canvas.addEventListener('pointerdown', releaseCamera, {
    passive: true,
  });
  scene.canvas.addEventListener('wheel', releaseCamera, { passive: true });

  // ── Actions ──────────────────────────────────────────────────────────
  function flyTo(o) {
    const range =
      o.kind === 'satellite'
        ? 2_500_000
        : o.kind === 'earthquake'
          ? 400_000
          : o.kind === 'vessel'
            ? 40_000
            : 60_000;
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(cartesianOf(o), 1),
      {
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-45),
          range,
        ),
        duration: 2.2,
      },
    );
  }
  function follow(o) {
    const mod = layerModule(o.layerId);
    const id = o.kind === 'satellite' ? o.noradId : o.icao24;
    let ok = false;
    try {
      ok = !!mod?.trackById?.(id, { origin: 'user' });
    } catch (error) {
      console.warn('[intel] follow failed', error);
    }
    if (!ok) flyTo(o);
    return ok;
  }
  function stopFollow() {
    if (!state.following || !selected || !NATIVE_FOLLOW.has(selected.kind))
      return;
    try {
      layerModule(selected.layerId)?.stopTracking?.({ origin: 'user' });
    } catch {
      /* layer has no follow */
    }
    state.following = false;
  }
  function toggleArea(o) {
    const i = areas.findIndex((a) => a.key === o.key);
    if (i >= 0) {
      viewer.entities.remove(areas[i].entity);
      areas.splice(i, 1);
      scene.requestRender();
      return false;
    }
    const col = Cesium.Color.fromCssColorString(ACCENT);
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(o.lon, o.lat),
      ellipse: {
        semiMajorAxis: AOI_KM * 1000,
        semiMinorAxis: AOI_KM * 1000,
        material: col.withAlpha(0.07),
        outline: true,
        outlineColor: col.withAlpha(0.55),
        height: 0,
      },
    });
    areas.push({
      key: o.key,
      title: buildDossier(o).title,
      lat: o.lat,
      lon: o.lon,
      radiusKm: AOI_KM,
      entity,
    });
    scene.requestRender();
    return true;
  }
  function reportText(o) {
    const d = buildDossier(o);
    const lines = [
      `${d.title} — ${KIND_LABEL[d.kind]} (${d.subtitle || ''})`,
      `Source: ${d.source} [FEED]`,
    ];
    for (const f of d.feed) lines.push(`  ${f.label}: ${f.value}`);
    lines.push(`Position: ${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}`);
    lines.push(
      `Nearby: ${nearby.total} contacts within ${nearby.radiusKm} km [FEED]`,
    );
    lines.push('Assessment [SIMULATED]');
    for (const a of d.analysis) lines.push(`  ${a.label}: ${a.value}`);
    lines.push('Links');
    for (const l of d.links)
      lines.push(
        `  ${l.rel}: ${l.name} [${l.source === 'feed' ? 'FEED' : 'SIMULATED'}]`,
      );
    lines.push(`Generated ${new Date().toUTCString()} by God's Eye View`);
    return lines.join('\n');
  }

  actions.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act || !selected) return;
    const o = selected;
    if (act === 'close') return close();
    if (act.startsWith('sim:')) {
      const a = hud?.actions.find((x) => `sim:${x.id}` === act);
      if (a) openSheet(a.id, a.label);
      return;
    }
    if (act === 'sheet:overview') {
      openSheet('overview', 'Object');
      return;
    }
    if (act.startsWith('cam:') && o.kind === 'camera') {
      const cams = layerModule('cctv');
      if (act === 'cam:panel') {
        if (cams?.getActiveCameraId?.() === o.id) {
          if (cams.getParams?.().calibrationMode)
            cams.setParams?.({ calibrationMode: false });
          cams.deactivateActiveCamera?.();
        } else {
          cams?.selectCamera?.(o.id);
          cams?.focusCamera?.(o.id, 1.4);
        }
      }
      if (act === 'cam:adjust')
        cams?.setParams?.({
          calibrationMode: !cams.getParams?.().calibrationMode,
        });
      if (act === 'cam:save')
        cams?.setParams?.({ calibration: { cameraId: o.id, save: true } });
      if (act === 'cam:reset')
        cams?.setParams?.({ calibration: { cameraId: o.id, reset: true } });
      if (act === 'cam:next') {
        const next = nearbyObjects(collect(), o, { limit: 20 }).items.find(
          (n) => n.object.kind === 'camera',
        );
        if (next) return open(next.object);
      }
      render();
      return;
    }
    if (act === 'fly') flyTo(o);
    if (act === 'follow') {
      if (NATIVE_FOLLOW.has(o.kind)) {
        if (state.following) {
          stopOrbit();
          stopFollow();
        } else {
          state.following = follow(o);
          if (state.following) spinTracked();
        }
      } else if (removeOrbit) {
        stopOrbit();
        state.following = false;
      } else {
        orbit(o);
        state.following = true;
      }
    }
    if (act === 'watch') {
      if (watchlist.has(o.key)) watchlist.delete(o.key);
      else watchlist.set(o.key, o);
      state.watched = watchlist.has(o.key);
      onWatchChange?.();
    }
    if (act === 'aoi') state.aoi = toggleArea(o);
    if (act === 'brief') {
      const text = composeBrief(buildDossier(o), nearby);
      brief.textContent = text;
      brief.hidden = false;
      briefing = true;
      narrator.speak(text).then(() => {
        briefing = false;
      });
    }
    if (act === 'copy') {
      try {
        await navigator.clipboard.writeText(reportText(o));
        state.copied = true;
        setTimeout(() => {
          state.copied = false;
          if (selected === o) renderActions();
        }, 1800);
      } catch (error) {
        console.warn('[intel] clipboard unavailable', error);
      }
    }
    renderActions();
  });

  // ── Click to inspect ─────────────────────────────────────────────────
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((click) => {
    if (!isLive()) return;
    const objects = collect({ fresh: true });
    const occluder = new Cesium.EllipsoidalOccluder(
      Cesium.Ellipsoid.WGS84,
      viewer.camera.positionWC,
    );
    const points = [];
    for (const o of objects) {
      const c = cartesianOf(o);
      if (!occluder.isPointVisible(c)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(scene, c);
      if (w) points.push({ x: w.x, y: w.y, o });
    }
    const hit = nearestHit(points, click.position.x, click.position.y, 22);
    if (hit) open(hit.o);
    else if (selected) close();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // A camera clicked in the city (its own pick, which can win over the
  // ground-level hit test above) opens the same camera card.
  const disposeCameraClicks = registerCctvFocusRequestListener(
    window,
    (event) => {
      const id = event?.detail?.cameraId;
      if (!id || !isLive()) return;
      if (selected?.kind === 'camera' && selected.id === id) return;
      const record = layerModule('cctv')
        ?.getAnalystRecords?.()
        ?.find((r) => r.id === id);
      const o = record && toIntelObject('cctv', record);
      if (o) open(o);
    },
  );

  // ── Triage queue (+ watchlist and areas of interest) ─────────────────
  let triageTimer = null;
  let lastItems = [];
  let onWatchChange = null;
  function renderTriage() {
    const objects = collect();
    const watched = [...watchlist.values()].map((w) => ({
      severity: 'watch',
      reason: 'Analyst watchlist',
      object: objects.find((x) => x.key === w.key) || w,
      pinned: true,
    }));
    const ranked = buildTriage(objects).filter(
      (i) => !watchlist.has(i.object.key),
    );
    lastItems = [...watched, ...ranked];
    const list = lastItems
      .map(
        (
          item,
          i,
        ) => `<li><button type="button" data-i="${i}" class="gev-tri gev-tri--${item.severity}${item.pinned ? ' gev-tri--pinned' : ''}">
          <span class="gev-tri__sev">${item.pinned ? 'Pinned' : SEV_LABEL[item.severity]}</span>
          <span class="gev-tri__title">${esc(buildDossier(item.object).title)}</span>
          <span class="gev-tri__why">${esc(item.reason)}</span></button></li>`,
      )
      .join('');
    const aoiRows = areas
      .map(
        (a, i) =>
          `<li class="gev-aoi"><span>Area · ${esc(a.title)}</span><b>${insideArea(objects, a).length}</b><span class="gev-aoi__unit">contacts</span><button type="button" class="gev-aoi__x" data-aoi="${i}" aria-label="Remove area">${ICON.close}</button></li>`,
      )
      .join('');
    triage.innerHTML = `<header class="gev-tri__head"><span>Triage queue ${chip('feed')}</span>
      <button type="button" class="gev-icon-btn" data-act="close" aria-label="Close triage">${ICON.close}</button></header>
      ${aoiRows ? `<ul class="gev-aoi__list">${aoiRows}</ul>` : ''}
      ${list ? `<ol class="gev-tri__list">${list}</ol>` : '<p class="gev-iv__empty">Nothing flagged in the enabled layers.</p>'}
      <p class="gev-iv__note">Ranked from live feed signals: emergency squawks, military ICAO blocks, AIS state vessels, USGS magnitude.</p>`;
  }
  triage.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="close"]')) return setTriage(false);
    const a = event.target.closest('[data-aoi]')?.dataset.aoi;
    if (a != null) {
      const area = areas[Number(a)];
      if (area) {
        viewer.entities.remove(area.entity);
        areas.splice(Number(a), 1);
        scene.requestRender();
      }
      return renderTriage();
    }
    const i = event.target.closest('[data-i]')?.dataset.i;
    const item = i == null ? null : lastItems[Number(i)];
    if (item) {
      open(item.object);
      flyTo(item.object);
    }
  });
  let onTriageChange = null;
  function setTriage(on) {
    triage.hidden = !on;
    clearInterval(triageTimer);
    if (on) {
      if (selected) close();
      renderTriage();
      triageTimer = setInterval(renderTriage, 15000);
    }
    onTriageChange?.(on);
  }

  /** Priority + elevated items right now, plus the watchlist (top-bar badge).
   * Routine 'watch' items (e.g. every military airframe) stay in the list but
   * don't inflate the badge. Uses the cache. */
  const flaggedCount = () =>
    buildTriage(collect(), { limit: 999 }).filter((i) => i.severity !== 'watch')
      .length + watchlist.size;

  /**
   * Show the dossier for what the Director is looking at ({layerId, record}),
   * or close it (null). Prefers the layer's live record for the same object.
   */
  function showFocus(focus) {
    if (!focus) return close({ keepSheets: true });
    if (focus.place) {
      const p = focus.place;
      open(
        {
          kind: 'place',
          key: `place:${p.id}`,
          lat: p.lat,
          lon: p.lon,
          heightM: 0,
          place: p,
          staged: focus.staged || [],
          stagedAt: focus.stagedAt || Date.now(),
        },
        { quiet: true, headline: focus.headline || '' },
      );
      return;
    }
    const o = toIntelObject(focus.layerId, focus.record);
    if (!o) return close({ keepSheets: true });
    const live = collect().find((x) => x.key === o.key);
    open(live ? { ...live, simulated: o.simulated } : o, {
      quiet: true,
      headline: focus.headline || '',
    });
  }
  let onOpen = null;

  return {
    open,
    close,
    showFocus,
    /** Warm the type photo for an upcoming Director subject while the camera flies. */
    prefetch(focus) {
      // A place: fetch its weather during the flight so it is there on arrival.
      if (focus?.place?.icao) metarFor(focus.place.icao);
      const o = focus && toIntelObject(focus.layerId, focus.record);
      const type = o && resolveAssetType(o);
      if (type) refs.prefetch(type);
    },
    /** Start the (two-request) type-photo catalogue lookup. */
    warmReferenceImages: () => refs.load(),
    /** Re-render the action dock (Director started/stopped). */
    refresh: renderActions,
    onOpen(fn) {
      onOpen = fn;
    },
    isOpen: () => !!selected,
    setTriage,
    isTriageOpen: () => !triage.hidden,
    flaggedCount,
    onTriage(fn) {
      onTriageChange = fn;
    },
    onWatch(fn) {
      onWatchChange = fn;
    },
    /** Hide everything (used when switching to Exercise mode). */
    suspend() {
      close();
      setTriage(false);
      for (const a of areas) a.entity.show = false;
    },
    resume() {
      for (const a of areas) a.entity.show = true;
    },
    destroy() {
      close();
      clearInterval(observeTimer);
      setTriage(false);
      handler.destroy();
      disposeCameraClicks();
      removeLeaderHook();
      window.removeEventListener('resize', onResize);
      cardObserver?.disconnect();
      toast.remove();
      scene.canvas.removeEventListener('pointerdown', releaseCamera);
      scene.canvas.removeEventListener('wheel', releaseCamera);
      viewer.entities.remove(marker);
      visual.destroy();
      for (const a of areas) viewer.entities.remove(a.entity);
      view.remove();
      triage.remove();
    },
  };
}
