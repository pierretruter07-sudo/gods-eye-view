import * as Cesium from 'cesium';
import { buildDossier, composeBrief } from './enrichment.js';
import {
  INTEL_LAYERS,
  toIntelObject,
  buildTriage,
  nearestHit,
  nearbyObjects,
  insideArea,
} from './objects.js';
import { KIND_LABEL, SEV_LABEL, ACCENT, AOI_KM, esc, chip, ICON, leftCard, rightCard, actionBar } from './markup.js';
import { reticleSprite } from '../tour/pulseGraphics.js';
import { createNarrator } from '../tour/narrator.js';

/**
 * Live-mode intelligence view. Click any aircraft, ship, satellite or quake:
 * the whole screen becomes a glass analyst console around it — identity and
 * live feed fields on the left, assessment, links and pattern of life on the
 * right, actions along the bottom. Nothing scrolls. Real feed values are
 * tagged FEED; illustrative content is tagged SIMULATED.
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
  const view = el('div', 'gev-iv');
  view.hidden = true;
  const left = el('aside', 'gev-iv__card gev-iv__left gev-glass');
  const right = el('aside', 'gev-iv__card gev-iv__right gev-glass');
  const bottom = el('div', 'gev-iv__bottom');
  const brief = el('p', 'gev-iv__brief gev-glass');
  brief.hidden = true;
  const actions = el('nav', 'gev-iv__actions gev-glass');
  actions.setAttribute('aria-label', 'Actions');
  bottom.append(brief, actions);
  view.append(left, right, bottom);

  const triage = el('section', 'gev-triage gev-glass');
  triage.setAttribute('aria-label', 'Triage queue');
  triage.hidden = true;
  document.body.append(view, triage);

  // ── Globe graphics: reticle + areas of interest ──────────────────────
  const marker = viewer.entities.add({
    show: false,
    position: Cesium.Cartesian3.fromDegrees(0, 0),
    billboard: { image: reticleSprite(ACCENT), width: 46, height: 46, disableDepthTestDistance: Number.POSITIVE_INFINITY },
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
  const cartesianOf = (o) => Cesium.Cartesian3.fromDegrees(o.lon, o.lat, o.heightM || 0);

  // ── Selection state ──────────────────────────────────────────────────
  let selected = null;
  let state = {};
  let nearby = { total: 0, radiusKm: 0, items: [] };
  let followTimer = null;

  function placeMarker(o) {
    marker.position = cartesianOf(o);
    marker.show = true;
    scene.requestRender();
  }
  function render() {
    if (!selected) return;
    const d = buildDossier(selected);
    left.innerHTML = leftCard(d, nearby);
    right.innerHTML = rightCard(d);
    actions.innerHTML = actionBar(selected, state);
  }
  let briefing = false;
  function stopBrief() {
    // Only cancel speech we started — never cut off the Director's narration.
    if (briefing) narrator.stop();
    briefing = false;
  }
  function open(o, { quiet = false } = {}) {
    stopFollow();
    selected = o;
    nearby = nearbyObjects(collect(), o);
    state = { watched: watchlist.has(o.key), aoi: areas.some((a) => a.key === o.key) };
    brief.hidden = true;
    stopBrief();
    render();
    setTriage(false);
    view.hidden = false;
    document.body.classList.add('gev-intel-open');
    onOpen?.();
    clearInterval(followTimer);
    // From the Director: its own pulse marks the target and the camera is
    // already orbiting it, so no reticle and no follow polling.
    if (quiet) {
      marker.show = false;
      return;
    }
    placeMarker(o);
    if (o.kind !== 'earthquake') {
      followTimer = setInterval(() => {
        if (!selected) return;
        const fresh = collect().find((x) => x.key === selected.key);
        if (fresh) {
          selected = fresh;
          placeMarker(fresh);
        }
      }, CACHE_MS);
    }
  }
  function close() {
    stopFollow();
    stopBrief();
    selected = null;
    clearInterval(followTimer);
    view.hidden = true;
    document.body.classList.remove('gev-intel-open');
    marker.show = false;
    scene.requestRender();
  }

  // ── Actions ──────────────────────────────────────────────────────────
  function flyTo(o) {
    const range = o.kind === 'satellite' ? 2_500_000 : o.kind === 'earthquake' ? 400_000 : o.kind === 'vessel' ? 40_000 : 60_000;
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(cartesianOf(o), 1), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), range),
      duration: 2.2,
    });
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
    if (!state.following || !selected) return;
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
    areas.push({ key: o.key, title: buildDossier(o).title, lat: o.lat, lon: o.lon, radiusKm: AOI_KM, entity });
    scene.requestRender();
    return true;
  }
  function reportText(o) {
    const d = buildDossier(o);
    const lines = [`${d.title} — ${KIND_LABEL[d.kind]} (${d.subtitle || ''})`, `Source: ${d.source} [FEED]`];
    for (const f of d.feed) lines.push(`  ${f.label}: ${f.value}`);
    lines.push(`Position: ${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}`);
    lines.push(`Nearby: ${nearby.total} contacts within ${nearby.radiusKm} km [FEED]`);
    lines.push('Assessment [SIMULATED]');
    for (const a of d.analysis) lines.push(`  ${a.label}: ${a.value}`);
    lines.push('Links');
    for (const l of d.links) lines.push(`  ${l.rel}: ${l.name} [${l.source === 'feed' ? 'FEED' : 'SIMULATED'}]`);
    lines.push(`Generated ${new Date().toUTCString()} by God's Eye View`);
    return lines.join('\n');
  }

  actions.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act || !selected) return;
    const o = selected;
    if (act === 'close') return close();
    if (act === 'fly') flyTo(o);
    if (act === 'follow') {
      if (state.following) stopFollow();
      else state.following = follow(o);
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
          if (selected === o) actions.innerHTML = actionBar(o, state);
        }, 1800);
      } catch (error) {
        console.warn('[intel] clipboard unavailable', error);
      }
    }
    actions.innerHTML = actionBar(o, state);
  });
  left.addEventListener('click', (event) => {
    const i = event.target.closest('[data-near]')?.dataset.near;
    const item = i == null ? null : nearby.items[Number(i)];
    if (item) open(item.object);
  });

  // ── Click to inspect ─────────────────────────────────────────────────
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((click) => {
    if (!isLive()) return;
    const objects = collect({ fresh: true });
    const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, viewer.camera.positionWC);
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
    const ranked = buildTriage(objects).filter((i) => !watchlist.has(i.object.key));
    lastItems = [...watched, ...ranked];
    const list = lastItems
      .map(
        (item, i) => `<li><button type="button" data-i="${i}" class="gev-tri gev-tri--${item.severity}${item.pinned ? ' gev-tri--pinned' : ''}">
          <span class="gev-tri__sev">${item.pinned ? 'Pinned' : SEV_LABEL[item.severity]}</span>
          <span class="gev-tri__title">${esc(buildDossier(item.object).title)}</span>
          <span class="gev-tri__why">${esc(item.reason)}</span></button></li>`,
      )
      .join('');
    const aoiRows = areas
      .map((a, i) => `<li class="gev-aoi"><span>Area · ${esc(a.title)}</span><b>${insideArea(objects, a).length}</b><span class="gev-aoi__unit">contacts</span><button type="button" class="gev-aoi__x" data-aoi="${i}" aria-label="Remove area">${ICON.close}</button></li>`)
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
    buildTriage(collect(), { limit: 999 }).filter((i) => i.severity !== 'watch').length + watchlist.size;

  /**
   * Show the dossier for what the Director is looking at ({layerId, record}),
   * or close it (null). Prefers the layer's live record for the same object.
   */
  function showFocus(focus) {
    if (!focus) return close();
    const o = toIntelObject(focus.layerId, focus.record);
    if (!o) return close();
    const live = collect().find((x) => x.key === o.key);
    open(live ? { ...live, simulated: o.simulated } : o, { quiet: true });
  }
  let onOpen = null;

  return {
    open,
    close,
    showFocus,
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
      setTriage(false);
      handler.destroy();
      viewer.entities.remove(marker);
      for (const a of areas) viewer.entities.remove(a.entity);
      view.remove();
      triage.remove();
    },
  };
}
