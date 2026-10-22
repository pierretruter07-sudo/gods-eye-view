import { silhouetteSvg } from './silhouettes.js';
/**
 * Pure HTML builders for the intelligence view (no DOM, no Cesium), so the
 * layout can be rendered and checked outside the app.
 */
export const KIND_LABEL = {
  aircraft: 'Aircraft',
  vessel: 'Vessel',
  satellite: 'Satellite',
  earthquake: 'Seismic event',
  airport: 'Airport',
  location: 'Location',
};
export const SEV_LABEL = {
  critical: 'Priority',
  high: 'Elevated',
  watch: 'Watch',
};
export const ACCENT = '#64d2ff';
export const AOI_KM = 100;

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

export const chip = (source) =>
  source === 'feed'
    ? '<span class="gev-prov gev-prov--feed">FEED</span>'
    : '<span class="gev-prov gev-prov--sim">SIMULATED</span>';

export const ICON = {
  follow:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  fly: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>',
  watch:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>',
  aoi: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="9"/></svg>',
  brief:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  sheet:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M9.5 9.5V20"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

// ── Constellation HUD ───────────────────────────────────────────────────
const SRC_CHIP = {
  feed: '<span class="gev-prov gev-prov--feed">FEED</span>',
  sim: '<span class="gev-prov gev-prov--sim">SIMULATED</span>',
  mixed:
    '<span class="gev-prov gev-prov--feed">FEED</span><span class="gev-prov gev-prov--sim">SIM</span>',
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
  return `<p class="gev-hud__kicker">FOCUS · ${esc(KIND_LABEL[h.kind] || h.kind).toUpperCase()} · ${esc(h.source)}</p>
    <h2 class="gev-hud__title">${esc(h.title)}</h2>
    <p class="gev-hud__status">${esc([h.subtitle, h.status].filter(Boolean).join(' · '))}</p>
    ${headline ? `<p class="gev-hud__headline">${esc(headline)}</p>` : ''}`;
}

/**
 * Type reference (never this airframe or hull): the class silhouette always
 * fills the frame, and the free-licensed photo fades in over it when one is
 * available. No photo, a failed load or an unlisted type leaves the outline.
 */
function refFigure(ref, image) {
  const credit = image
    ? [image.artist, image.licence].filter(Boolean).join(' · ') ||
      'Wikimedia Commons'
    : '';
  const label = image ? 'Type reference' : 'Class outline';
  return `<figure class="gev-hud__ref" data-ref="${esc(ref.id)}">
    <div class="gev-hud__ref-frame">${silhouetteSvg(ref.shape)}${image ? `<img src="${esc(image.src)}" alt="${esc(ref.name)} (type reference)" decoding="async" referrerpolicy="no-referrer">` : ''}</div>
    <figcaption><b>${esc(ref.name)}</b><span>${label} · ${esc(ref.basis)}</span>${credit ? `<span class="gev-hud__ref-credit">Photo: ${esc(credit)} · Wikimedia</span>` : ''}</figcaption></figure>`;
}

/** A camera's live still, relayed from its registered address (FEED). */
/**
 * A camera's live view. Video is a placeholder the intel view fills with a
 * persistent <video> element (so card refreshes never restart playback).
 */
export function frameFigure(frame, { size = 'card' } = {}) {
  const badge = `<figcaption><span class="gev-hud__live">${esc(frame.badge || 'LIVE STILL')}</span></figcaption>`;
  if (frame.video)
    return `<figure class="gev-hud__frame gev-hud__frame--${size}" data-video="${esc(frame.video)}" data-video-slot="${size}" data-video-type="${esc(frame.videoType || 'clip')}" data-poster="${esc(frame.url || '')}" aria-label="${esc(frame.alt)}">${badge}</figure>`;
  return `<figure class="gev-hud__frame gev-hud__frame--${size}">
    <img src="${esc(frame.url)}" alt="${esc(frame.alt)}" decoding="async" data-still="${size}">
    ${badge}</figure>`;
}

export function hudCard(c, index, { image = null } = {}) {
  const list = c.rows
    .map(
      (r) =>
        `<dt>${r.sim ? '<i class="gev-hud__sim" aria-label="simulated"></i>' : ''}${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`,
    )
    .join('');
  return `<header class="gev-hud__head"><span>${String(index + 1).padStart(2, '0')} · ${esc(c.title)}</span>${SRC_CHIP[c.source] || ''}</header>
    ${c.frame ? frameFigure(c.frame) : ''}
    ${c.ref ? refFigure(c.ref, image) : ''}
    ${c.route ? routeSvg(c.route) : ''}
    ${c.gauge ? gaugeSvg(c.gauge) : ''}
    ${list ? `<dl>${list}</dl>` : ''}`;
}

export function hudActions(h, state, { touring = false } = {}) {
  const btn = (act, icon, label, pressed = false, cls = '') =>
    `<button type="button" class="gev-act ${cls}" data-act="${act}" aria-pressed="${pressed}">${icon}<span>${label}</span></button>`;
  const sim = h.actions
    .map((a) =>
      btn(`sim:${esc(a.id)}`, '', esc(a.label), false, 'gev-act--sim'),
    )
    .join('');
  const object = btn(
    'sheet:overview',
    ICON.sheet,
    'Object',
    false,
    'gev-act--sheet',
  );
  if (h.kind === 'camera') {
    const cam = h.camera || {};
    return [
      object,
      sim,
      btn(
        'cam:panel',
        ICON.follow,
        cam.panel3d ? 'Panel in city: on' : 'Show panel in city',
        !!cam.panel3d,
      ),
      cam.panel3d
        ? btn(
            'cam:adjust',
            ICON.aoi,
            cam.adjusting ? 'Adjusting' : 'Adjust panel',
            !!cam.adjusting,
          )
        : '',
      cam.adjusting ? btn('cam:save', '', 'Save position') : '',
      cam.adjusting ? btn('cam:reset', '', 'Reset') : '',
      btn('cam:next', ICON.fly, 'Next camera nearby'),
      `<button type="button" class="gev-act gev-act--close" data-act="close" aria-label="Close">${ICON.close}</button>`,
    ].join('');
  }
  if (touring)
    return (
      object +
      sim +
      btn(
        'watch',
        ICON.watch,
        state.watched ? 'On watchlist' : 'Watch',
        state.watched,
      )
    );
  return [
    btn(
      'follow',
      ICON.follow,
      state.following ? 'Following' : 'Follow',
      state.following,
    ),
    object,
    sim,
    btn(
      'watch',
      ICON.watch,
      state.watched ? 'On watchlist' : 'Watch',
      state.watched,
    ),
    btn('aoi', ICON.aoi, state.aoi ? 'Area marked' : 'Mark area', state.aoi),
    btn('brief', ICON.brief, 'Brief me'),
    btn('copy', ICON.copy, state.copied ? 'Copied' : 'Copy report'),
    `<button type="button" class="gev-act gev-act--close" data-act="close" aria-label="Close">${ICON.close}</button>`,
  ].join('');
}

// ── Action result panel / analyst sheets ───────────────────────────────
const SIM_DOT = '<i class="gev-hud__sim" aria-label="simulated"></i>';
const tag = (sim) =>
  `<span class="gev-sheet__tag ${sim ? 'gev-sheet__tag--sim' : 'gev-sheet__tag--feed'}">${sim ? 'SIM' : 'FEED'}</span>`;
const csvBtn = (i) =>
  `<button type="button" class="gev-sheet__csv" data-res="csv:${i}">Copy CSV</button>`;

function resultBlock(b, i = 0) {
  if (b.type === 'rows' || b.type === 'props')
    return `${b.title ? `<div class="gev-sheet__sec"><h4>${esc(b.title)}</h4>${csvBtn(i)}</div>` : ''}<dl class="gev-res__rows">${b.rows
      .map(
        (r) =>
          `<dt>${r.sim ? SIM_DOT : ''}${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`,
      )
      .join('')}</dl>`;
  if (b.type === 'table') {
    const tagged = b.rows.some((r) => !Array.isArray(r));
    const head = [...b.head, ...(tagged ? ['Source'] : [])];
    return `<div class="gev-sheet__sec">${b.title ? `<p class="gev-res__sub">${esc(b.title)}</p>` : '<span></span>'}${csvBtn(i)}</div><div class="gev-sheet__scroll"><table class="gev-res__table"><thead><tr>${head
      .map((h) => `<th scope="col">${esc(h)}</th>`)
      .join('')}</tr></thead><tbody>${b.rows
      .map((r) =>
        Array.isArray(r)
          ? `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`
          : `<tr${r.sim ? ' class="gev-sheet__simrow"' : ''}>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}<td>${tag(r.sim)}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  }
  if (b.type === 'links')
    return `<div class="gev-sheet__sec"><h4>${esc(b.title || 'Linked objects')}</h4></div>${
      b.links.length
        ? `<ul class="gev-sheet__links">${b.links
            .map((l) => {
              const body = `<span class="gev-sheet__rel">${esc(l.rel)}</span><span class="gev-sheet__lname">${esc(l.name)}</span><span class="gev-sheet__ltype">${esc(l.type || '')}${l.detail ? ` · ${esc(l.detail)}` : ''}</span>`;
              return `<li>${
                l.key
                  ? `<button type="button" class="gev-sheet__link" data-res="link:${esc(l.key)}">${body}</button>`
                  : `<div class="gev-sheet__link gev-sheet__link--static">${body}</div>`
              }</li>`;
            })
            .join('')}</ul>`
        : '<p class="gev-res__note">No linked objects in range.</p>'
    }`;
  if (b.type === 'timeline')
    return `<div class="gev-sheet__sec"><h4>${esc(b.title || 'Timeline')}</h4></div><ol class="gev-sheet__timeline">${b.events
      .map(
        (e) =>
          `<li${e.sim ? ' class="gev-sheet__simrow"' : ''}><time>${esc(e.when)}</time><span>${esc(e.text)}</span>${tag(e.sim)}</li>`,
      )
      .join('')}</ol>`;
  if (b.type === 'message')
    return `<p class="gev-res__sub">${esc(b.label || 'Message')}</p><blockquote class="gev-res__msg">${esc(b.text)}</blockquote>`;
  if (b.type === 'imagery')
    return `<figure class="gev-res__img"><div class="gev-res__mosaic">${b.tiles
      .map((u) => `<img src="${esc(u)}" alt="" decoding="async">`)
      .join(
        '',
      )}<span class="gev-res__mark" style="left:${(b.markX * 100).toFixed(1)}%;top:${(b.markY * 100).toFixed(1)}%" aria-hidden="true"></span></div><figcaption>${esc(b.caption)}</figcaption></figure>`;
  if (b.type === 'media')
    return `${frameFigure(b.frame, { size: 'large' })}${b.caption ? `<p class="gev-res__note">${esc(b.caption)}</p>` : ''}`;
  if (b.type === 'note') return `<p class="gev-res__note">${esc(b.text)}</p>`;
  return '';
}

/**
 * The analyst-sheet drawer: object identity, lineage, one tab per sheet
 * and the active sheet's content.
 * @param {{identity: object, lineage: object[], tabs: {id:string,label:string}[],
 *   active: string, sheet: object|null, busy?: boolean}} m
 */
export function sheetDrawer({
  identity,
  lineage,
  tabs,
  active,
  sheet,
  busy = false,
}) {
  const chain = lineage
    .map(
      (s) =>
        `<span class="gev-prov ${s.feed ? 'gev-prov--feed' : 'gev-prov--sim'}">${esc(s.label)}${s.feed ? '' : ' · SIM'}</span>`,
    )
    .join('<span class="gev-sheet__arrow" aria-hidden="true">→</span>');
  const tabBar = tabs
    .map(
      (t) =>
        `<span class="gev-sheet__tabwrap${t.id === active ? ' is-active' : ''}"><button type="button" role="tab" class="gev-sheet__tab" id="gev-sheet-tab-${esc(t.id)}" aria-controls="gev-sheet-panel" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}" data-res="tab:${esc(t.id)}">${esc(t.label)}</button>${
          t.id === 'overview'
            ? ''
            : `<button type="button" class="gev-sheet__tabx" data-res="untab:${esc(t.id)}" aria-label="Close ${esc(t.label)}">×</button>`
        }</span>`,
    )
    .join('');
  const sources = (sheet?.sources || [])
    .map(
      (s) =>
        `<span class="gev-prov ${s.feed ? 'gev-prov--feed' : 'gev-prov--sim'}">${esc(s.label)}${s.feed ? '' : ' · SIM'}</span>`,
    )
    .join('');
  const body = busy
    ? '<p class="gev-res__busy"><span class="gev-res__spin" aria-hidden="true"></span>Computing from live data…</p>'
    : (sheet?.blocks || []).map((b, i) => resultBlock(b, i)).join('');
  return `<header class="gev-sheet__head">
      <div class="gev-sheet__id"><span class="gev-sheet__type">${esc(identity.type)}</span><span class="gev-sheet__key">${esc(identity.keyLabel)} ${esc(identity.keyValue)}</span></div>
      <h3>${esc(identity.title)}</h3>
      <p class="gev-sheet__rid">${esc(identity.rid)}</p>
      <button type="button" class="gev-icon-btn gev-sheet__close" data-res="close" aria-label="Close sheets">${ICON.close}</button>
    </header>
    <div class="gev-sheet__lineage" aria-label="Data lineage">${chain}</div>
    <div class="gev-sheet__tabs" role="tablist" aria-label="Sheets">${tabBar}</div>
    <div class="gev-sheet__body" role="tabpanel" id="gev-sheet-panel" aria-labelledby="gev-sheet-tab-${esc(active)}" tabindex="0">
      ${sheet && !busy && sheet.id !== 'overview' ? `<h4 class="gev-sheet__title">${esc(sheet.title)}</h4>` : ''}
      ${sources && sheet?.id !== 'overview' ? `<div class="gev-res__chips">${sources}</div>` : ''}
      ${body}
      ${sheet?.send && !busy ? `<div class="gev-res__foot"><button type="button" class="gev-act gev-act--sim" data-res="send">${esc(sheet.send.label)}</button><span>Sending is simulated.</span></div>` : ''}
    </div>`;
}

export function resultPanel(r, { busy = false } = {}) {
  const chips = (r.sources || [])
    .map(
      (s) =>
        `<span class="gev-prov ${s.feed ? 'gev-prov--feed' : 'gev-prov--sim'}">${esc(s.label)}${s.feed ? '' : ' · SIM'}</span>`,
    )
    .join('');
  return `<header class="gev-res__head"><h3>${esc(r.title)}</h3>
      <button type="button" class="gev-icon-btn" data-res="close" aria-label="Close result">${ICON.close}</button></header>
    ${chips ? `<div class="gev-res__chips">${chips}</div>` : ''}
    ${busy ? '<p class="gev-res__busy"><span class="gev-res__spin" aria-hidden="true"></span>Computing from live data…</p>' : (r.blocks || []).map(resultBlock).join('')}
    ${r.send && !busy ? `<div class="gev-res__foot"><button type="button" class="gev-act gev-act--sim" data-res="send">${esc(r.send.label)}</button><span>Sending is simulated.</span></div>` : ''}`;
}
