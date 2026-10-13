import * as Cesium from 'cesium';
import { buildDossier } from './enrichment.js';
import { INTEL_LAYERS, toIntelObject, buildTriage, nearestHit } from './objects.js';
import { reticleSprite } from '../tour/pulseGraphics.js';

/**
 * Live-mode intelligence layer: click any aircraft, ship, satellite or quake
 * for a dossier (real feed fields + clearly-labelled simulated analysis), and
 * a triage queue ranked from real feed signals. Live mode only.
 */
const KIND_LABEL = { aircraft: 'Aircraft', vessel: 'Vessel', satellite: 'Satellite', earthquake: 'Seismic event' };
const SEV_LABEL = { critical: 'Priority', high: 'Elevated', watch: 'Watch' };
const ACCENT = '#64d2ff';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

const chip = (source) =>
  source === 'feed'
    ? '<span class="gev-prov gev-prov--feed">FEED</span>'
    : '<span class="gev-prov gev-prov--sim">SIMULATED</span>';

/** A small radial link graph: the object in the centre, links around it. */
function linkGraph(title, links) {
  const W = 300;
  const H = 150;
  const cx = W / 2;
  const cy = H / 2;
  const n = Math.max(links.length, 1);
  let edges = '';
  let nodes = '';
  links.forEach((link, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 1 ? Math.PI / 2 : 0);
    const x = cx + Math.cos(a) * 110;
    const y = cy + Math.sin(a) * 52;
    const sim = link.source !== 'feed';
    const col = sim ? '#ff9f0a' : '#30d158';
    edges += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${col}" stroke-opacity=".7" stroke-width="1.2"${sim ? ' stroke-dasharray="4 3"' : ''}/>`;
    nodes += `<circle cx="${x}" cy="${y}" r="5" fill="${col}"/><text x="${x}" y="${y + (y < cy ? -9 : 16)}" text-anchor="middle">${esc(link.name).slice(0, 22)}</text>`;
  });
  return `<svg class="gev-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Link graph">${edges}${nodes}<circle cx="${cx}" cy="${cy}" r="8" fill="${ACCENT}"/><text x="${cx}" y="${cy + 22}" text-anchor="middle" class="gev-graph__centre">${esc(title).slice(0, 24)}</text></svg>`;
}

function dossierHtml(d) {
  const feedRows = d.feed.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('');
  const links = d.links
    .map((l) => `<li><span class="gev-dos__rel">${esc(l.rel)}</span><span>${esc(l.name)}</span>${chip(l.source)}</li>`)
    .join('');
  const analysis = d.analysis.map((a) => `<dt>${esc(a.label)}</dt><dd>${esc(a.value)}</dd>`).join('');
  const pol = d.pol.map((p) => `<li><span class="gev-dos__t">${esc(p.t)}</span>${esc(p.text)}</li>`).join('');
  return `
    <header class="gev-dos__head">
      <span class="gev-dos__kind">${esc(KIND_LABEL[d.kind] || d.kind)}</span>
      <button type="button" class="gev-icon-btn" data-act="close" aria-label="Close dossier">✕</button>
    </header>
    <h2 class="gev-dos__title">${esc(d.title)}</h2>
    <p class="gev-dos__sub">${esc(d.subtitle || '')}</p>
    <section><h3>Observed ${chip('feed')}<span class="gev-dos__src">${esc(d.source)}</span></h3><dl>${feedRows || '<dd>No feed fields</dd>'}</dl></section>
    ${d.links.length ? `<section><h3>Links</h3>${linkGraph(d.title, d.links)}<ul class="gev-dos__links">${links}</ul></section>` : ''}
    ${d.analysis.length ? `<section><h3>Assessment ${chip('sim')}</h3><dl>${analysis}</dl></section>` : ''}
    ${d.pol.length ? `<section><h3>Pattern of life ${chip('sim')}</h3><ol class="gev-dos__pol">${pol}</ol></section>` : ''}
    <footer class="gev-dos__foot">
      <button type="button" class="gev-btn" data-act="fly">Fly to</button>
      <span class="gev-dos__note">Feed values are live public data. Simulated sections are illustrative.</span>
    </footer>`;
}

export function installIntel({ viewer, dataManager, isLive = () => true }) {
  const scene = viewer.scene;

  // ── Panels ───────────────────────────────────────────────────────────
  const dossier = el('aside', 'gev-dos gev-glass');
  dossier.setAttribute('aria-label', 'Object dossier');
  dossier.hidden = true;
  const triage = el('section', 'gev-triage gev-glass');
  triage.setAttribute('aria-label', 'Triage queue');
  triage.hidden = true;
  document.body.append(dossier, triage);

  // ── Selection reticle ────────────────────────────────────────────────
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

  let selected = null;
  let followTimer = null;

  function layerOn(id) {
    try {
      return dataManager.isEnabled(id) === true;
    } catch {
      return false;
    }
  }
  function layerRecords(id, cap = 30000) {
    try {
      return dataManager.layers.get(id)?.module?.getAnalystRecords?.(cap) || [];
    } catch {
      return [];
    }
  }
  function collect() {
    const out = [];
    for (const id of Object.keys(INTEL_LAYERS)) {
      if (!layerOn(id)) continue;
      for (const r of layerRecords(id)) {
        const o = toIntelObject(id, r);
        if (o) out.push(o);
      }
    }
    return out;
  }
  const cartesianOf = (o) => Cesium.Cartesian3.fromDegrees(o.lon, o.lat, o.heightM || 0);

  function placeMarker(o) {
    marker.position = cartesianOf(o);
    marker.show = true;
    scene.requestRender();
  }

  function open(o) {
    selected = o;
    dossier.innerHTML = dossierHtml(buildDossier(o));
    dossier.hidden = false;
    placeMarker(o);
    clearInterval(followTimer);
    // Keep the reticle on a moving contact by re-reading its own layer.
    if (o.kind === 'aircraft' || o.kind === 'vessel' || o.kind === 'satellite') {
      followTimer = setInterval(() => {
        if (!selected) return;
        const fresh = layerRecords(selected.layerId)
          .map((r) => toIntelObject(selected.layerId, r))
          .find((x) => x && x.key === selected.key);
        if (fresh) {
          selected = fresh;
          placeMarker(fresh);
        }
      }, 3000);
    }
  }
  function close() {
    selected = null;
    clearInterval(followTimer);
    dossier.hidden = true;
    marker.show = false;
    scene.requestRender();
  }
  function flyTo(o) {
    const range = o.kind === 'satellite' ? 2_500_000 : o.kind === 'earthquake' ? 400_000 : o.kind === 'vessel' ? 40_000 : 60_000;
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(cartesianOf(o), 1), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), range),
      duration: 2.2,
    });
  }

  dossier.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') close();
    if (act === 'fly' && selected) flyTo(selected);
  });

  // ── Click to inspect ─────────────────────────────────────────────────
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((click) => {
    if (!isLive()) return;
    const objects = collect();
    if (!objects.length) return;
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
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // ── Triage queue ─────────────────────────────────────────────────────
  let triageTimer = null;
  let lastItems = [];
  function renderTriage() {
    lastItems = buildTriage(collect());
    const rows = lastItems
      .map(
        (item, i) => `<li><button type="button" data-i="${i}" class="gev-tri gev-tri--${item.severity}">
          <span class="gev-tri__sev">${SEV_LABEL[item.severity]}</span>
          <span class="gev-tri__title">${esc(buildDossier(item.object).title)}</span>
          <span class="gev-tri__why">${esc(item.reason)}</span></button></li>`,
      )
      .join('');
    triage.innerHTML = `<header class="gev-dos__head"><span class="gev-dos__kind">Triage queue ${chip('feed')}</span>
      <button type="button" class="gev-icon-btn" data-act="close" aria-label="Close triage">✕</button></header>
      ${rows ? `<ol class="gev-tri__list">${rows}</ol>` : '<p class="gev-dos__note">Nothing flagged in the enabled layers. Switch on Flights, Military, Ships or Earthquakes.</p>'}
      <p class="gev-dos__note">Ranked from live feed signals: emergency squawks, military ICAO blocks, AIS state vessels, USGS magnitude.</p>`;
    return lastItems.length;
  }
  triage.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="close"]')) return setTriage(false);
    const i = event.target.closest('[data-i]')?.dataset.i;
    if (i == null) return;
    const item = lastItems[Number(i)];
    if (item) {
      open(item.object);
      flyTo(item.object);
    }
  });
  function setTriage(on) {
    triage.hidden = !on;
    clearInterval(triageTimer);
    if (on) {
      renderTriage();
      triageTimer = setInterval(renderTriage, 15000);
    }
    onTriageChange?.(on);
  }
  let onTriageChange = null;

  /** Count of flagged objects right now (for the top-bar badge). */
  const flaggedCount = () => buildTriage(collect(), { limit: 99 }).length;

  return {
    open,
    close,
    setTriage,
    isTriageOpen: () => !triage.hidden,
    flaggedCount,
    onTriage(fn) {
      onTriageChange = fn;
    },
    /** Hide everything (used when switching to Exercise mode). */
    suspend() {
      close();
      setTriage(false);
    },
    destroy() {
      close();
      setTriage(false);
      handler.destroy();
      viewer.entities.remove(marker);
      dossier.remove();
      triage.remove();
    },
  };
}
