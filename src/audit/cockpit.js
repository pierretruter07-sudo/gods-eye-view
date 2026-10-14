/**
 * @file AUDIT cockpit: a calm three-column frame around the orbit.
 * Top bar (page title and actions), a left rail of collapsible sections
 * (Readiness, Must fix, Layers, Key & sources), the open centre for the
 * orbit, and a Detail column that appears only when something is selected.
 * All text goes through textContent.
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
import { PARTS, impactFor } from './impact.js';

const MARK =
  '<svg width="26" height="17" viewBox="0 0 34 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="#7aa7dc" stroke-width="2"/><circle cx="22" cy="12" r="9.5" fill="none" stroke="#a294dc" stroke-width="2"/></svg>';
const RESET_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3.2 1.8v3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  return `<svg width="52" height="30" viewBox="0 0 112 62" aria-hidden="true"><path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="rgba(150,175,205,0.16)" stroke-width="9" stroke-linecap="round"/><path d="M10 56 A46 46 0 0 1 102 56" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${on} 400"/></svg>`;
}

function statusName(item) {
  const names = item.lens === 'sec' ? SEC_STATUS_NAME : STATUS_NAME;
  return names[item.status] || 'Not rated';
}

/** A collapsible rail section. */
function section(id, title, open) {
  const d = h('details', 'gev-rail-sec');
  d.dataset.zone = id;
  d.open = open;
  const sum = h('summary');
  const meta = h('span', 'gev-rail-meta');
  sum.append(h('span', 'gev-audit-zlabel', title), meta, h('i', 'gev-chev'));
  const body = h('div', 'gev-rail-body');
  d.append(sum, body);
  return { el: d, body, meta };
}

/**
 * @param {{container: HTMLElement, data: object, saf: object, sec: object,
 *   must: object[], layers: object, onLayer: Function, onSelect: Function,
 *   onClear: Function, onTour: Function, onEvidence: Function,
 *   onReset: Function, onExit: Function, stops: object[],
 *   onStop: (index: number) => void, onPlay: Function,
 *   onStoryNext: Function, onStoryClose: Function}} o
 */
export function createCockpit(o) {
  const root = h('div', 'gev-audit-ui');
  root.dataset.visible = 'false';

  // ── Top bar ───────────────────────────────────────────────────────────
  const top = h('header', 'gev-audit-top gev-audit-glass');
  top.dataset.zone = 'top';
  const brand = h('div', 'gev-audit-brand');
  brand.innerHTML = MARK;
  brand.append(h('b', null, 'CrossCheck'), h('span', null, o.data.item));
  const status = h('p', 'gev-audit-status');
  const sq = h('i', 'gev-audit-sq');
  sq.dataset.tone = o.saf.state === 'ok' && o.sec.state === 'ok' ? 'ok' : 'bad';
  const statusText = h('span', null, headline(o.saf, o.sec));
  status.append(sq, statusText);
  status.title = statusText.textContent;
  const actions = h('div', 'gev-audit-actions');
  const resetBtn = button('gev-audit-btn is-icon', null, 'Reset camera');
  resetBtn.innerHTML = RESET_ICON;
  resetBtn.append(h('span', null, 'Reset view'));
  resetBtn.title = 'Reset camera';
  const tourBtn = button('gev-audit-btn', 'Guided tour');
  const evidenceBtn = button('gev-audit-btn', 'Evidence');
  const exitBtn = button('gev-audit-btn is-strong', 'Exit audit');
  actions.append(resetBtn, tourBtn, evidenceBtn, exitBtn);
  // The page title says what CrossCheck is in one line.
  const title = h(
    'h1',
    'gev-audit-pagetitle',
    'Find, fix and prove every gap to global safety and security standards',
  );
  title.title = title.textContent;
  top.append(brand, title, actions);
  resetBtn.addEventListener('click', () => o.onReset());
  tourBtn.addEventListener('click', () => o.onTour());
  evidenceBtn.addEventListener('click', () => o.onEvidence());
  exitBtn.addEventListener('click', () => o.onExit());

  // ── Left rail ─────────────────────────────────────────────────────────
  const rail = h('aside', 'gev-audit-rail');
  rail.setAttribute('aria-label', 'Audit controls');

  // Readiness
  const ready = section('readiness', 'Readiness', true);
  ready.body.append(status); // the overall verdict leads the section
  const readyRows = {};
  for (const [lens, color, name] of [
    ['saf', '#7aa7dc', 'Safety · ED-153'],
    ['sec', '#a294dc', `Security · ASVS L${o.data.asvsLevel}`],
  ]) {
    const row = h('div', `gev-ready is-${lens}`);
    const g = h('div', 'gev-ready-dial');
    const text = h('div', 'gev-ready-text');
    const line = h('div', 'gev-ready-line');
    const num = h('b');
    const verdict = h('span', 'gev-audit-verdict');
    const gain = h('span', 'gev-ready-gain');
    line.append(h('span', 'gev-audit-lens', name), num);
    text.append(line, verdict, gain);
    row.append(g, text);
    ready.body.append(row);
    readyRows[lens] = { g, num, verdict, gain, color };
  }
  const readyNote = h('span', 'gev-audit-muted gev-rail-note');
  ready.body.append(readyNote);

  function setReadiness(lens, r, base) {
    const row = readyRows[lens];
    row.g.innerHTML = dial(r.readiness, row.color);
    row.num.textContent = pct(r.readiness);
    const gain =
      Math.round(r.readiness * 100) - Math.round(base.readiness * 100);
    row.gain.hidden = gain <= 0;
    row.gain.textContent = `+${gain} points since the baseline`;
    row.verdict.className = `gev-audit-verdict is-${r.state}`;
    row.verdict.textContent =
      r.state === 'ok' || !r.blocking
        ? r.verdict
        : `${r.verdict} · ${r.blocking} must-fix`;
  }

  // Must fix, grouped by standard
  const must = section('mustfix', 'Must fix', true);
  must.meta.textContent = `${o.must.length} open`;
  const listRows = new Map();
  const groupMeta = [];
  for (const [lens, name] of [
    ['sec', 'Security'],
    ['saf', 'Safety'],
  ]) {
    const items = o.must.filter((i) => i.lens === lens);
    if (!items.length) continue;
    const group = h('details', 'gev-must-group');
    group.open = true;
    const gs = h('summary');
    const gm = h('span', 'gev-rail-meta', String(items.length));
    gs.append(
      h('span', `gev-must-name is-${lens}`, name),
      gm,
      h('i', 'gev-chev'),
    );
    groupMeta.push({ lens, el: gm, ids: items.map((i) => i.id) });
    const ul = h('ul', 'gev-audit-alerts');
    for (const item of items) {
      const li = h('li');
      const b = button('gev-audit-alert');
      b.setAttribute('aria-current', 'false');
      const dot = h('i', 'gev-audit-sq');
      dot.dataset.tone = item.status === 'N' ? 'bad' : 'warn';
      const title = cardFor(item).title;
      b.title = title;
      b.append(
        dot,
        h('span', `gev-audit-id is-${item.lens}`, item.id),
        h('span', 'gev-audit-alert-text', title),
      );
      b.addEventListener('click', () => o.onSelect(item.id));
      li.append(b);
      ul.append(li);
      listRows.set(item.id, b);
    }
    group.append(gs, ul);
    must.body.append(group);
  }

  // Layers
  const lay = section('layers', 'Layers', false);
  const layerBtns = new Map();
  const layerList = h('div', 'gev-audit-layers');
  for (const l of LAYERS) {
    const b = button('gev-audit-layerbtn');
    b.dataset.layer = l.id;
    b.append(h('i', 'gev-audit-swatch'), h('span', null, l.name), h('em'));
    b.addEventListener('click', () => o.onLayer(l.id));
    layerBtns.set(l.id, b);
    layerList.append(b);
  }
  lay.body.append(
    layerList,
    h(
      'span',
      'gev-audit-muted gev-rail-note',
      'Layers that are off stay faint (15%) for context.',
    ),
  );

  // Key & sources
  const key = section('key', 'Key & sources', false);
  const keyList = h('ul', 'gev-key');
  for (const [cls, text] of [
    ['core', 'Centre: the software being checked'],
    ['saf', 'Inner ring: safety objectives (ED-153)'],
    ['sec', 'Outer ring: security requirements (OWASP ASVS)'],
    ['pin', 'Raised pins: must fix before a claim'],
  ]) {
    const li = h('li');
    li.append(h('i', `gev-key-mark is-${cls}`), h('span', null, text));
    keyList.append(li);
  }
  key.body.append(keyList, h('p', 'gev-audit-attrib', o.data.attribution));

  rail.append(ready.el, must.el, lay.el, key.el);

  // ── Centre stage (empty: the orbit shows through) ─────────────────────
  const stage = h('div', 'gev-audit-stage');
  stage.setAttribute('aria-hidden', 'true');
  const hint = h(
    'p',
    'gev-audit-hint',
    'Drag to rotate · Scroll to zoom · Ctrl-drag to tilt · Double-click a pin to fly to it',
  );
  const banner = h('p', 'gev-audit-projected');
  banner.hidden = true;
  const bannerText = h('span');
  banner.append(h('b', null, 'PROJECTED'), bannerText);
  const tl = h('div', 'gev-tl gev-audit-glass');
  tl.dataset.zone = 'timeline';
  tl.setAttribute('role', 'group');
  tl.setAttribute('aria-label', 'Remediation progress');
  const play = button(
    'gev-tl-play',
    null,
    'Play the remediation from the baseline',
  );
  play.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>';
  play.addEventListener('click', () => o.onPlay());
  const stopsEl = h('ol', 'gev-tl-stops');
  const stopBtns = o.stops.map((st) => {
    const li = h('li');
    const b = button('gev-tl-stop');
    b.dataset.kind = st.kind;
    if (st.final) b.dataset.final = 'true';
    b.title =
      st.kind === 'measured'
        ? `${st.label}: measured audit ${st.audit.id}, ${st.audit.date}`
        : `${st.label} · ${st.name}: projected, if every planned fix lands`;
    b.append(h('i'), h('span', null, st.label), h('small', null, st.sub));
    b.addEventListener('click', () => o.onStop(st.index));
    li.append(b);
    stopsEl.append(li);
    return b;
  });
  tl.append(play, stopsEl);
  // Narrated playback: one short card per stop, above the timeline.
  const story = h('section', 'gev-story gev-audit-glass');
  story.hidden = true;
  story.setAttribute('aria-live', 'polite');
  story.dataset.zone = 'story';
  stage.append(banner, tl, hint);
  // A live "data line" from the card to the timeline stop it explains.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const link = document.createElementNS(SVGNS, 'svg');
  link.setAttribute('class', 'gev-story-link');
  link.setAttribute('aria-hidden', 'true');
  const linkPath = document.createElementNS(SVGNS, 'path');
  const linkFlow = document.createElementNS(SVGNS, 'path');
  linkFlow.setAttribute('class', 'is-flow');
  const linkA = document.createElementNS(SVGNS, 'circle');
  const linkB = document.createElementNS(SVGNS, 'circle');
  linkA.setAttribute('r', '3.5');
  linkB.setAttribute('r', '4.5');
  link.append(linkPath, linkFlow, linkA, linkB);
  link.setAttribute('hidden', '');
  let linkedStop = -1;
  function drawLink() {
    if (story.hidden || linkedStop < 0) {
      link.setAttribute('hidden', '');
      return;
    }
    const base = root.getBoundingClientRect();
    const card = story.getBoundingClientRect();
    const dot = stopBtns[linkedStop]
      ?.querySelector('i')
      ?.getBoundingClientRect();
    if (!dot || !card.width) return;
    link.removeAttribute('hidden');
    const ax = card.left - base.left;
    // A "data bus" just above the timeline: out of the card's left edge,
    // along the lane, then down onto the stop. It stays clear of the orbit.
    const lane = tl.getBoundingClientRect().top - base.top - 12;
    const ay = Math.min(
      Math.max(lane, card.top - base.top + 24),
      card.bottom - base.top - 24,
    );
    const bx = dot.left + dot.width / 2 - base.left;
    const by = dot.top - base.top - 2;
    const r = Math.min(10, Math.abs(by - ay) / 2);
    const d = `M ${ax} ${ay} L ${bx + r} ${ay} Q ${bx} ${ay}, ${bx} ${ay + r} L ${bx} ${by}`;
    linkPath.setAttribute('d', d);
    linkFlow.setAttribute('d', d);
    linkA.setAttribute('cx', ax);
    linkA.setAttribute('cy', ay);
    linkB.setAttribute('cx', bx);
    linkB.setAttribute('cy', by);
  }
  window.addEventListener('resize', drawLink);

  // ── Detail (right; only while something is selected) ─────────────────
  const detailZone = h('aside', 'gev-audit-detail gev-audit-glass');
  detailZone.dataset.zone = 'detail';
  detailZone.setAttribute('aria-label', 'Detail');
  detailZone.setAttribute('aria-live', 'polite');
  detailZone.hidden = true;
  const detailHead = h('div', 'gev-audit-zhead');
  const clearBtn = button('gev-audit-x', '×', 'Close detail');
  clearBtn.addEventListener('click', () => o.onClear());
  detailHead.append(h('span', 'gev-audit-zlabel', 'Detail'), clearBtn);
  const detailBody = h('div', 'gev-detail-body');
  detailZone.append(detailHead, detailBody);

  function fold(label, count, content, open = false) {
    const d = h('details', 'gev-fold');
    d.open = open;
    const s = h('summary');
    s.append(h('span', 'gev-audit-zlabel', label));
    if (count != null) s.append(h('span', 'gev-rail-meta', String(count)));
    s.append(h('i', 'gev-chev'));
    d.append(s, content);
    return d;
  }

  function setDetail(sel) {
    for (const row of listRows.values())
      row.setAttribute('aria-current', 'false');
    if (!sel) {
      detailZone.hidden = true;
      detailBody.replaceChildren();
      return;
    }
    detailZone.hidden = false;
    const { item, linked, finding } = sel;
    const card = cardFor(item);
    const sev = severityOf(item);
    const lensName = item.lens === 'sec' ? 'Security' : 'Safety';
    const blocking =
      sev === 'S1' || sev === 'S2' || sev === 'SC' || sev === 'SH';
    detailZone.dataset.tone = blocking
      ? 'bad'
      : item.status === 'P'
        ? 'warn'
        : 'ok';
    const parts = [
      h(
        'span',
        'gev-audit-tag',
        `${blocking ? 'Must fix' : statusName(item)} · ${lensName}${sev ? ` · ${SEVERITY_NAME[sev]}` : ''}`,
      ),
      h('h2', 'gev-audit-title', card.title),
      h(
        'span',
        'gev-audit-ref',
        `${item.lens === 'sec' ? 'ASVS' : 'ED-153'} ${item.id} · ${item.lens === 'sec' ? `${item.group} ${item.groupName}` : item.groupName}`,
      ),
    ];
    // First: what this gap does to God's Eye View itself.
    const impact = impactFor(item);
    const box = h('div', 'gev-impact');
    box.dataset.tone = impact.tone;
    box.append(
      h('span', 'gev-audit-zlabel', impact.heading),
      h('p', null, impact.text),
    );
    if (impact.parts.length) {
      const chips = h('ul', 'gev-impact-parts');
      chips.setAttribute('aria-label', 'Parts affected');
      for (const id of impact.parts) chips.append(h('li', null, PARTS[id]));
      box.append(chips);
    }
    parts.push(box);
    const para = (label, text) => {
      if (!text) return;
      const s = h('div', 'gev-audit-sec');
      s.append(h('span', 'gev-audit-zlabel', label), h('p', null, text));
      parts.push(s);
    };
    para(card.plain ? 'Why it matters' : 'Assessor’s finding', card.why);
    para('Fix', card.fix);
    if (linked.length) {
      const list = h('ul', 'gev-audit-linked');
      for (const l of linked) {
        const li = h('li');
        const b = button('gev-audit-linkrow');
        b.append(
          h('span', `gev-audit-id is-${l.lens}`, l.id),
          h('span', null, shorten(cardFor(l).title, 64)),
        );
        b.addEventListener('click', () => o.onSelect(l.id));
        li.append(b);
        list.append(li);
      }
      parts.push(fold('Fixing this also helps', linked.length, list));
    }
    if (finding) {
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
      parts.push(
        fold(
          `Evidence trail · ${finding.workstream} · Wave ${finding.wave}`,
          null,
          ol,
        ),
      );
    }
    detailBody.replaceChildren(...parts);
    detailBody.scrollTop = 0;
    listRows.get(item.id)?.setAttribute('aria-current', 'true');
  }

  /** Show the state at a timeline stop: dials, headline, must-fix ticks. */
  function setStop({ stop, saf, sec, baseSaf, baseSec, closed }) {
    setReadiness('saf', saf, baseSaf);
    setReadiness('sec', sec, baseSec);
    ready.meta.textContent = `${pct(saf.readiness)} · ${pct(sec.readiness)}`;
    const projected = stop.kind === 'projected';
    readyNote.textContent = projected
      ? `Projected for ${stop.label} (${stop.name}) if every planned fix lands.`
      : stop.index === 0
        ? `Baseline audit, ${stop.audit.date}.`
        : `Measured at ${stop.audit.label}, ${stop.audit.date}.`;
    statusText.textContent = `${projected ? 'Projected · ' : ''}${headline(saf, sec)}`;
    status.title = statusText.textContent;
    status.dataset.projected = String(projected);
    sq.dataset.tone =
      saf.state === 'ok' && sec.state === 'ok'
        ? 'ok'
        : saf.blocking + sec.blocking
          ? 'bad'
          : 'warn';
    banner.hidden = !projected;
    bannerText.textContent = `${stop.label} · ${stop.name}: the plan's target, not yet measured`;
    let open = 0;
    for (const [id, row] of listRows) {
      const c = closed.has(id);
      row.dataset.closed = String(c);
      if (!c) open++;
    }
    must.meta.textContent = `${open} of ${listRows.size} open`;
    for (const g of groupMeta) {
      const left = g.ids.filter((id) => !closed.has(id)).length;
      g.el.textContent =
        left === g.ids.length ? String(left) : `${left} of ${g.ids.length}`;
    }
    stopBtns.forEach((b, i) =>
      b.setAttribute('aria-current', String(i === stop.index)),
    );
  }

  /** Show what one stop of the remediation does, for `ms` milliseconds. */
  function showStory({
    story: st,
    saf,
    sec,
    prevSaf,
    prevSec,
    step,
    total,
    ms,
    last,
  }) {
    const { stop } = st;
    story.hidden = false;
    story.dataset.kind = stop.kind;
    const head = h('div', 'gev-story-head');
    head.append(
      h(
        'span',
        'gev-audit-zlabel',
        `${step} of ${total} · ${stop.kind === 'measured' ? 'Measured' : 'Projected'}`,
      ),
    );
    const next = button('gev-audit-link', last ? 'Close' : 'Next ›');
    next.addEventListener('click', () =>
      last ? o.onStoryClose() : o.onStoryNext(),
    );
    const close = button('gev-audit-x', '×', 'Stop the walkthrough');
    close.addEventListener('click', () => o.onStoryClose());
    head.append(next, close);
    const title = h(
      'h3',
      'gev-story-title',
      stop.index === 0
        ? 'Where God’s Eye View starts'
        : `${stop.label} · ${stop.name}`,
    );
    const score = h('div', 'gev-story-score');
    for (const [name, now, was, cls] of [
      ['Safety', saf, prevSaf, 'is-saf'],
      ['Security', sec, prevSec, 'is-sec'],
    ]) {
      const c = h('div', `gev-story-num ${cls}`);
      const big = h('b', null, pct(now.readiness));
      c.append(h('span', null, name));
      if (
        was &&
        Math.round(was.readiness * 100) !== Math.round(now.readiness * 100)
      )
        c.append(h('small', null, `${pct(was.readiness)} →`));
      c.append(big, h('em', `is-${now.state}`, now.verdict));
      score.append(c);
    }
    const rows = h('dl', 'gev-story-rows');
    const row = (k, v) => {
      if (!v) return;
      rows.append(h('dt', null, k), h('dd', null, v));
    };
    row(stop.index === 0 ? 'Found' : 'Fixes', st.fixes);
    if (st.closed) {
      const titles = st.mustClosed.map(
        (id) =>
          cardFor(
            o.must.find((m) => m.id === id) || { id, lens: 'saf', title: id },
          ).title,
      );
      const shown = titles.slice(0, 2).map((t) => shorten(t, 48));
      const more = titles.length - shown.length;
      row(
        'Closes',
        `${st.closed} gap${st.closed === 1 ? '' : 's'}${titles.length ? `, ${titles.length} must-fix: ${shown.join('; ')}${more > 0 ? ` and ${more} more` : ''}` : ''}.`,
      );
    }
    row(last ? 'Result' : 'Unlocks', st.unlocks);
    row('Who', st.who);
    const bar = h('i', 'gev-story-bar');
    bar.style.animationDuration = `${ms}ms`;
    story.replaceChildren(head, title, score, rows, bar);
    linkedStop = stop.index;
    link.dataset.kind = stop.kind;
    requestAnimationFrame(drawLink);
    setTimeout(drawLink, 400); // again once fonts and layout settle
  }
  function hideStory() {
    story.hidden = true;
    story.replaceChildren();
    linkedStop = -1;
    link.setAttribute('hidden', '');
  }

  function setPlaying(on) {
    play.setAttribute('aria-pressed', String(on));
    play.innerHTML = on
      ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>';
  }

  function setLayers(state) {
    let on = 0;
    for (const [id, b] of layerBtns) {
      on += state[id] ? 1 : 0;
      b.setAttribute('aria-pressed', String(!!state[id]));
      b.querySelector('em').textContent = state[id]
        ? 'on'
        : id === 'labels'
          ? 'off'
          : '15%';
    }
    lay.meta.textContent = `${on} of ${layerBtns.size} on`;
  }

  root.append(top, rail, stage, detailZone, story, link);
  o.container.append(root);
  setLayers(o.layers);

  const sections = {
    readiness: ready.el,
    mustfix: must.el,
    layers: lay.el,
    key: key.el,
  };

  return {
    el: root,
    zones: {
      top,
      rail,
      stage,
      timeline: tl,
      story,
      ...sections,
      detail: detailZone,
      evidence: evidenceBtn,
      tour: tourBtn,
      reset: resetBtn,
      layerButton: (id) => layerBtns.get(id),
    },
    /** Expand a rail section (and scroll it into view). */
    openSection(id) {
      const s = sections[id];
      if (!s) return;
      s.open = true;
      s.scrollIntoView({ block: 'nearest' });
    },
    sectionOpen: (id) => !!sections[id]?.open,
    closeSection(id) {
      if (sections[id]) sections[id].open = false;
    },
    setVisible(on) {
      root.dataset.visible = on ? 'true' : 'false';
    },
    setDetail,
    setLayers,
    setStop,
    setPlaying,
    showStory,
    hideStory,
    destroy() {
      window.removeEventListener('resize', drawLink);
      root.remove();
    },
  };
}
