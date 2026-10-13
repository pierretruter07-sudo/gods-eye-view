import { buildDossier } from './enrichment.js';

/**
 * Pure HTML builders for the intelligence view (no DOM, no Cesium), so the
 * layout can be rendered and checked outside the app.
 */
export const KIND_LABEL = { aircraft: 'Aircraft', vessel: 'Vessel', satellite: 'Satellite', earthquake: 'Seismic event' };
export const SEV_LABEL = { critical: 'Priority', high: 'Elevated', watch: 'Watch' };
export const ACCENT = '#64d2ff';
export const AOI_KM = 100;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);


export const chip = (source) =>
  source === 'feed'
    ? '<span class="gev-prov gev-prov--feed">FEED</span>'
    : '<span class="gev-prov gev-prov--sim">SIMULATED</span>';

export const ICON = {
  follow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  fly: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>',
  watch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>',
  aoi: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="9"/></svg>',
  brief: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/** Radial link graph: the object in the centre, its links around it. */
function linkGraph(title, links) {
  const W = 320;
  const H = 128;
  const cx = W / 2;
  const cy = H / 2;
  const n = Math.max(links.length, 1);
  let edges = '';
  let nodes = '';
  links.forEach((link, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 2 ? 0 : 0);
    const x = cx + Math.cos(a) * 120;
    const y = cy + Math.sin(a) * 44;
    const sim = link.source !== 'feed';
    const col = sim ? '#ff9f0a' : '#30d158';
    edges += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${col}" stroke-opacity=".75" stroke-width="1.3"${sim ? ' stroke-dasharray="4 3"' : ''}/>`;
    nodes += `<circle cx="${x}" cy="${y}" r="4.5" fill="${col}"/><text x="${x}" y="${y + (y < cy ? -8 : 15)}" text-anchor="middle">${esc(link.name).slice(0, 22)}</text>`;
  });
  return `<svg class="gev-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Link graph">${edges}${nodes}<circle cx="${cx}" cy="${cy}" r="7" fill="${ACCENT}"/><text x="${cx}" y="${cy + 20}" text-anchor="middle" class="gev-graph__centre">${esc(title).slice(0, 24)}</text></svg>`;
}

function rows(list) {
  return list.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('');
}

export function leftCard(d, nearby) {
  const near = nearby.items
    .map(
      ({ object, km }, i) =>
        `<li><button type="button" data-near="${i}"><span class="gev-iv__k">${esc(KIND_LABEL[object.kind])}</span><span class="gev-iv__n">${esc(buildDossier(object).title)}</span><span class="gev-iv__d">${km < 10 ? km.toFixed(1) : Math.round(km)} km</span></button></li>`,
    )
    .join('');
  return `
    <div class="gev-iv__kind">${esc(KIND_LABEL[d.kind] || d.kind)} <span class="gev-iv__src">${esc(d.source)}</span></div>
    <h2 class="gev-iv__title">${esc(d.title)}</h2>
    <p class="gev-iv__sub">${esc(d.subtitle || '')}</p>
    <section><h3>Observed ${chip('feed')}</h3><dl>${rows(d.feed) || '<dd>No feed fields</dd>'}</dl></section>
    <section><h3>Nearby contacts ${chip('feed')}<span class="gev-iv__meta">${nearby.total} within ${nearby.radiusKm} km</span></h3>
      ${near ? `<ol class="gev-iv__near">${near}</ol>` : '<p class="gev-iv__empty">No other contacts in the enabled layers.</p>'}</section>`;
}

export function rightCard(d) {
  const links = d.links
    .map((l) => `<li><span class="gev-iv__rel">${esc(l.rel)}</span><span class="gev-iv__n">${esc(l.name)}</span>${chip(l.source)}</li>`)
    .join('');
  const pol = d.pol.map((p) => `<li><span class="gev-iv__t">${esc(p.t)}</span>${esc(p.text)}</li>`).join('');
  return `
    ${d.analysis.length ? `<section class="gev-iv__first"><h3>Assessment ${chip('sim')}</h3><dl>${rows(d.analysis)}</dl></section>` : ''}
    ${d.links.length ? `<section><h3>Links</h3>${linkGraph(d.title, d.links)}<ul class="gev-iv__links">${links}</ul></section>` : ''}
    ${d.pol.length ? `<section><h3>Pattern of life ${chip('sim')}</h3><ol class="gev-iv__pol">${pol}</ol></section>` : ''}`;
}

export function actionBar(o, state) {
  const canFollow = o.kind === 'aircraft' || o.kind === 'satellite';
  const btn = (act, icon, label, pressed = false) =>
    `<button type="button" class="gev-act" data-act="${act}" aria-pressed="${pressed}">${icon}<span>${label}</span></button>`;
  return [
    canFollow ? btn('follow', ICON.follow, state.following ? 'Following' : 'Follow', state.following) : '',
    btn('fly', ICON.fly, 'Fly to'),
    btn('watch', ICON.watch, state.watched ? 'On watchlist' : 'Watch', state.watched),
    btn('aoi', ICON.aoi, state.aoi ? 'Area marked' : `Mark ${AOI_KM} km area`, state.aoi),
    btn('brief', ICON.brief, 'Brief me'),
    btn('copy', ICON.copy, state.copied ? 'Copied' : 'Copy report'),
    `<button type="button" class="gev-act gev-act--close" data-act="close" aria-label="Close">${ICON.close}</button>`,
  ].join('');
}

