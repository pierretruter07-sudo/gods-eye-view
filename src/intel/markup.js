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

// ── Constellation HUD ───────────────────────────────────────────────────
const SRC_CHIP = {
  feed: '<span class="gev-prov gev-prov--feed">FEED</span>',
  sim: '<span class="gev-prov gev-prov--sim">SIMULATED</span>',
  mixed: '<span class="gev-prov gev-prov--feed">FEED</span><span class="gev-prov gev-prov--sim">SIM</span>',
};
const TONE = { ok: '#5ee27f', warn: '#ffbe55', alert: '#ff8a3d' };

function gaugeSvg(g) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, g.value));
  return `<div class="gev-hud__gauge"><svg viewBox="0 0 56 56" width="56" height="56" role="img" aria-label="${esc(g.label)} ${esc(g.text)}">
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="5"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="${TONE[g.tone] || TONE.ok}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>
    <div><b>${esc(g.text)}</b><span>${esc(g.label)}</span></div></div>`;
}

function routeSvg(rt) {
  return `<svg class="gev-hud__route" viewBox="0 0 240 46" role="img" aria-label="Route ${esc(rt.from)} to ${esc(rt.to)}">
    <path d="M14 34 C 80 4, 160 4, 226 34" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-dasharray="4 4"/>
    <circle cx="14" cy="34" r="3.5" fill="#fff"/><circle cx="226" cy="34" r="3.5" fill="#64d2ff"/>
    <text x="14" y="45" text-anchor="start">${esc(String(rt.from ?? '').slice(0, 14))}</text>
    <text x="226" y="45" text-anchor="end">${esc(String(rt.to ?? '').slice(0, 18))}</text></svg>`;
}

export function hudHeader(h, headline = '') {
  return `<p class="gev-hud__kicker">LOCKED · ${esc(KIND_LABEL[h.kind] || h.kind).toUpperCase()} · ${esc(h.source)}</p>
    <h2 class="gev-hud__title">${esc(h.title)}</h2>
    <p class="gev-hud__status">${esc([h.subtitle, h.status].filter(Boolean).join(' · '))}</p>
    ${headline ? `<p class="gev-hud__headline">${esc(headline)}</p>` : ''}`;
}

export function hudCard(c, index) {
  const list = c.rows
    .map((r) => `<dt>${r.sim ? '<i class="gev-hud__sim" aria-label="simulated"></i>' : ''}${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`)
    .join('');
  return `<header class="gev-hud__head"><span>${String(index + 1).padStart(2, '0')} · ${esc(c.title)}</span>${SRC_CHIP[c.source] || ''}</header>
    ${c.route ? routeSvg(c.route) : ''}
    ${c.gauge ? gaugeSvg(c.gauge) : ''}
    ${list ? `<dl>${list}</dl>` : ''}`;
}

export function hudActions(h, state, { touring = false } = {}) {
  const btn = (act, icon, label, pressed = false, cls = '') =>
    `<button type="button" class="gev-act ${cls}" data-act="${act}" aria-pressed="${pressed}">${icon}<span>${label}</span></button>`;
  const sim = h.actions.map((a) => btn(`sim:${esc(a.id)}`, '', esc(a.label), false, 'gev-act--sim')).join('');
  if (touring) return sim + btn('watch', ICON.watch, state.watched ? 'On watchlist' : 'Watch', state.watched);
  return [
    btn('follow', ICON.follow, state.following ? 'Following' : 'Follow', state.following),
    sim,
    btn('watch', ICON.watch, state.watched ? 'On watchlist' : 'Watch', state.watched),
    btn('aoi', ICON.aoi, state.aoi ? 'Area marked' : 'Mark area', state.aoi),
    btn('brief', ICON.brief, 'Brief me'),
    btn('copy', ICON.copy, state.copied ? 'Copied' : 'Copy report'),
    `<button type="button" class="gev-act gev-act--close" data-act="close" aria-label="Close">${ICON.close}</button>`,
  ].join('');
}

// ── Action result panel ────────────────────────────────────────────────
function resultBlock(b) {
  if (b.type === 'rows')
    return `<dl class="gev-res__rows">${b.rows
      .map((r) => `<dt>${r.sim ? '<i class="gev-hud__sim" aria-label="simulated"></i>' : ''}${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`)
      .join('')}</dl>`;
  if (b.type === 'table')
    return `${b.title ? `<p class="gev-res__sub">${esc(b.title)}</p>` : ''}<table class="gev-res__table"><thead><tr>${b.head
      .map((h) => `<th scope="col">${esc(h)}</th>`)
      .join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if (b.type === 'message')
    return `<p class="gev-res__sub">${esc(b.label || 'Message')}</p><blockquote class="gev-res__msg">${esc(b.text)}</blockquote>`;
  if (b.type === 'imagery')
    return `<figure class="gev-res__img"><div class="gev-res__mosaic">${b.tiles
      .map((u) => `<img src="${esc(u)}" alt="" decoding="async">`)
      .join('')}<span class="gev-res__mark" style="left:${(b.markX * 100).toFixed(1)}%;top:${(b.markY * 100).toFixed(1)}%" aria-hidden="true"></span></div><figcaption>${esc(b.caption)}</figcaption></figure>`;
  if (b.type === 'note') return `<p class="gev-res__note">${esc(b.text)}</p>`;
  return '';
}

export function resultPanel(r, { busy = false } = {}) {
  const chips = (r.sources || [])
    .map((s) => `<span class="gev-prov ${s.feed ? 'gev-prov--feed' : 'gev-prov--sim'}">${esc(s.label)}${s.feed ? '' : ' · SIM'}</span>`)
    .join('');
  return `<header class="gev-res__head"><h3>${esc(r.title)}</h3>
      <button type="button" class="gev-icon-btn" data-res="close" aria-label="Close result">${ICON.close}</button></header>
    ${chips ? `<div class="gev-res__chips">${chips}</div>` : ''}
    ${busy ? '<p class="gev-res__busy"><span class="gev-res__spin" aria-hidden="true"></span>Computing from live data…</p>' : (r.blocks || []).map(resultBlock).join('')}
    ${r.send && !busy ? `<div class="gev-res__foot"><button type="button" class="gev-act gev-act--sim" data-res="send">${esc(r.send.label)}</button><span>Sending is simulated.</span></div>` : ''}`;
}
