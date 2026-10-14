/**
 * @file AUDIT cockpit: fixed instrument zones around the orbit.
 * Top bar (one plain status line), Status gauges (left), Detail (right,
 * empty until a selection), Must-fix list (bottom left), Layers (bottom
 * right). All text goes through textContent.
 * @module audit/cockpit
 */
import {
  LAYERS,
  SEC_STATUS_NAME,
  SEVERITY_NAME,
  STATUS_NAME,
  headline,
  pct,
  severityOf,
} from './model.js';
import { cardFor, shorten } from './plain.js';

const MARK =
  '<svg width="28" height="18" viewBox="0 0 34 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#7aa7dc" stroke-width="2"/><circle cx="22" cy="12" r="9.5" fill="none" stroke="#a294dc" stroke-width="2"/></svg>';

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function button(cls, text, label) {
  const b = h('button', cls, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

/** Semicircle dial, 0..1. Numbers only, safe for innerHTML. */
function dial(value, color) {
  const len = Math.PI * 46;
  const on = (Math.max(0, Math.min(1, value)) * len).toFixed(1);
  return `<svg width="84" height="48" viewBox="0 0 112 62" aria-hidden="true"><path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="rgba(150,175,205,0.16)" stroke-width="7" stroke-linecap="round"/><path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${on} 400"/></svg>`;
}

function statusName(item) {
  const names = item.lens === 'sec' ? SEC_STATUS_NAME : STATUS_NAME;
  return names[item.status] || 'Not rated';
}

/**
 * @param {{container: HTMLElement, data: object, saf: object, sec: object,
 *   must: object[], layers: object, onLayer: Function, onSelect: Function,
 *   onClear: Function, onTour: Function, onEvidence: Function, onExit: Function}} o
 */
export function createCockpit(o) {
  const root = h('div', 'gev-audit-ui');
  root.dataset.visible = 'false';

  // ── Top bar ───────────────────────────────────────────────────────────
  const top = h('header', 'gev-audit-top gev-audit-glass');
  const brand = h('div', 'gev-audit-brand');
  brand.innerHTML = MARK;
  brand.append(h('b', null, 'CrossCheck'), h('span', null, o.data.item));
  const status = h('p', 'gev-audit-status');
  const sq = h('i', 'gev-audit-sq');
  sq.dataset.tone = o.saf.state === 'ok' && o.sec.state === 'ok' ? 'ok' : 'bad';
  status.append(sq, document.createTextNode(headline(o.saf, o.sec)));
  const actions = h('div', 'gev-audit-actions');
  const tourBtn = button('gev-audit-btn', 'How it works');
  const evidenceBtn = button('gev-audit-btn', 'Evidence');
  const exitBtn = button('gev-audit-btn is-strong', 'Exit audit');
  actions.append(tourBtn, evidenceBtn, exitBtn);
  top.append(brand, status, actions);
  tourBtn.addEventListener('click', () => o.onTour());
  evidenceBtn.addEventListener('click', () => o.onEvidence());
  exitBtn.addEventListener('click', () => o.onExit());

  // ── Status (left) ─────────────────────────────────────────────────────
  const statusZone = h('section', 'gev-audit-zone is-status');
  statusZone.setAttribute('aria-label', 'Status');
  statusZone.append(h('span', 'gev-audit-zlabel', 'Status'));
  for (const [lens, r, color, name] of [
    ['saf', o.saf, '#7aa7dc', 'Safety · ED-153'],
    ['sec', o.sec, '#a294dc', `Security · ASVS L${o.data.asvsLevel}`],
  ]) {
    const card = h('div', `gev-audit-card is-${lens}`);
    card.append(h('span', 'gev-audit-lens', name));
    const row = h('div', 'gev-audit-gauge');
    row.innerHTML = dial(r.readiness, color);
    const num = h('div', 'gev-audit-num');
    num.append(h('b', null, pct(r.readiness)), h('span', null, 'ready'));
    row.append(num);
    card.append(
      row,
      h(
        'span',
        `gev-audit-verdict is-${r.state}`,
        r.state === 'ok' ? r.verdict : `${r.verdict} · ${r.blocking} must-fix`,
      ),
    );
    statusZone.append(card);
  }
  const key = h('div', 'gev-audit-card is-key');
  key.append(h('span', 'gev-audit-zlabel', 'What you’re looking at'));
  for (const line of [
    'Centre: the software being checked',
    'Inner ring: safety questions (ED-153)',
    'Outer ring: security questions (OWASP ASVS)',
    'Raised pins: must fix',
  ])
    key.append(h('span', null, line));
  statusZone.append(key);

  // ── Detail (right) ────────────────────────────────────────────────────
  const detailZone = h('section', 'gev-audit-zone is-detail');
  detailZone.setAttribute('aria-label', 'Detail');
  detailZone.setAttribute('aria-live', 'polite');
  const detailHead = h('div', 'gev-audit-zhead');
  const clearBtn = button('gev-audit-link', 'Clear', 'Clear selection');
  clearBtn.hidden = true;
  clearBtn.addEventListener('click', () => o.onClear());
  detailHead.append(h('span', 'gev-audit-zlabel', 'Detail'), clearBtn);
  const detailBody = h('div', 'gev-audit-card');
  detailZone.append(detailHead, detailBody);

  function emptyDetail() {
    detailBody.replaceChildren(
      h('b', 'gev-audit-empty-title', 'Select a raised pin'),
      h(
        'span',
        'gev-audit-muted',
        'You’ll see what it means in plain words, why it matters, how to fix it, and its evidence trail.',
      ),
    );
    detailBody.dataset.tone = 'empty';
    clearBtn.hidden = true;
  }

  function setDetail(sel) {
    for (const row of listRows.values())
      row.setAttribute('aria-current', 'false');
    if (!sel) return emptyDetail();
    const { item, linked, finding } = sel;
    const card = cardFor(item);
    const sev = severityOf(item);
    const lensName = item.lens === 'sec' ? 'Security' : 'Safety';
    const blocking =
      sev === 'S1' || sev === 'S2' || sev === 'SC' || sev === 'SH';
    detailBody.dataset.tone = blocking
      ? 'bad'
      : item.status === 'P'
        ? 'warn'
        : 'ok';
    const tag = h(
      'span',
      'gev-audit-tag',
      `${blocking ? 'Must fix' : statusName(item)} · ${lensName}${sev ? ` · ${SEVERITY_NAME[sev]}` : ''}`,
    );
    const title = h('h2', 'gev-audit-title', card.title);
    const ref = h(
      'span',
      'gev-audit-ref',
      `${item.lens === 'sec' ? 'ASVS' : 'ED-153'} ${item.id} · ${item.lens === 'sec' ? `${item.group} ${item.groupName}` : item.groupName}`,
    );
    const parts = [tag, title, ref];
    const section = (label, text) => {
      if (!text) return;
      const s = h('div', 'gev-audit-sec');
      s.append(h('span', 'gev-audit-zlabel', label), h('span', null, text));
      parts.push(s);
    };
    section(card.plain ? 'Why it matters' : 'Assessor’s finding', card.why);
    section('Fix', card.fix);
    if (linked.length) {
      const s = h('div', 'gev-audit-sec');
      s.append(h('span', 'gev-audit-zlabel', 'Fixing this also helps'));
      const list = h('ul', 'gev-audit-linked');
      for (const l of linked) {
        const li = h('li');
        const b = button('gev-audit-linkrow');
        b.append(
          h('span', `gev-audit-id is-${l.lens}`, l.id),
          h('span', null, shorten(cardFor(l).title, 70)),
        );
        b.addEventListener('click', () => o.onSelect(l.id));
        li.append(b);
        list.append(li);
      }
      s.append(list);
      parts.push(s);
    }
    if (finding) {
      const s = h('div', 'gev-audit-sec');
      s.append(
        h(
          'span',
          'gev-audit-zlabel',
          `Evidence trail · ${finding.workstream} · Wave ${finding.wave}`,
        ),
      );
      const ol = h('ol', 'gev-audit-hist');
      for (const e of finding.history) {
        const li = h('li');
        li.dataset.ok = String(['C', 'L', 'NA'].includes(e.status));
        li.append(
          h('span', 'gev-audit-when', e.date),
          document.createTextNode(
            `${e.event === 'rated' ? 'Baseline' : 'Re-rated'}: ${e.from ? `${statusName({ ...item, status: e.from })} → ` : ''}${statusName({ ...item, status: e.status })}${e.ref ? ` · ${e.ref}` : ''}`,
          ),
        );
        ol.append(li);
      }
      s.append(ol);
      parts.push(s);
    }
    detailBody.replaceChildren(...parts);
    clearBtn.hidden = false;
    listRows.get(item.id)?.setAttribute('aria-current', 'true');
  }

  // ── Must-fix list (bottom left) ───────────────────────────────────────
  const alertsZone = h('section', 'gev-audit-zone is-alerts gev-audit-glass');
  alertsZone.setAttribute('aria-label', 'Must-fix list');
  const alertsHead = h('div', 'gev-audit-zhead');
  alertsHead.append(
    h('span', 'gev-audit-zlabel', `Must fix · ${o.must.length}`),
    h('span', 'gev-audit-muted', 'Most severe first'),
  );
  const list = h('ul', 'gev-audit-alerts');
  const listRows = new Map();
  for (const item of o.must) {
    const li = h('li');
    const b = button('gev-audit-alert');
    b.setAttribute('aria-current', 'false');
    const dot = h('i', 'gev-audit-sq');
    dot.dataset.tone = item.status === 'N' ? 'bad' : 'warn';
    b.append(
      dot,
      h('span', `gev-audit-id is-${item.lens}`, item.id),
      h('span', 'gev-audit-alert-text', cardFor(item).title),
      h('span', 'gev-audit-muted', item.lens === 'sec' ? 'Security' : 'Safety'),
    );
    b.addEventListener('click', () => o.onSelect(item.id));
    li.append(b);
    list.append(li);
    listRows.set(item.id, b);
  }
  alertsZone.append(alertsHead, list);

  // ── Layers (bottom right) ─────────────────────────────────────────────
  const layersZone = h('section', 'gev-audit-zone is-layers gev-audit-glass');
  layersZone.setAttribute('aria-label', 'Layers');
  const layersHead = h('div', 'gev-audit-zhead');
  layersHead.append(
    h('span', 'gev-audit-zlabel', 'Layers'),
    h('span', 'gev-audit-muted', 'Faded layers stay at 15% until switched on'),
  );
  const layerRow = h('div', 'gev-audit-layers');
  const layerBtns = new Map();
  for (const l of LAYERS) {
    const b = button('gev-audit-layerbtn');
    b.dataset.layer = l.id;
    b.append(h('i', 'gev-audit-swatch'), h('span', null, l.name), h('em'));
    b.addEventListener('click', () => o.onLayer(l.id));
    layerBtns.set(l.id, b);
    layerRow.append(b);
  }
  layersZone.append(layersHead, layerRow);

  function setLayers(state) {
    for (const [id, b] of layerBtns) {
      b.setAttribute('aria-pressed', String(!!state[id]));
      b.querySelector('em').textContent = state[id]
        ? ''
        : id === 'labels'
          ? 'off'
          : '15%';
    }
  }

  const attrib = h('p', 'gev-audit-attrib', o.data.attribution);

  root.append(top, statusZone, detailZone, alertsZone, layersZone, attrib);
  o.container.append(root);
  emptyDetail();
  setLayers(o.layers);

  return {
    el: root,
    zones: {
      top,
      status: statusZone,
      detail: detailZone,
      alerts: alertsZone,
      layers: layersZone,
      evidence: evidenceBtn,
      tour: tourBtn,
    },
    setVisible(on) {
      root.dataset.visible = on ? 'true' : 'false';
    },
    setDetail,
    setLayers,
    destroy() {
      root.remove();
    },
  };
}
