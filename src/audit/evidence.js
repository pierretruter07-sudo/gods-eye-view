/**
 * @file Evidence drawer: how God's Eye View is being taken to compliance.
 * Reads the ledger top down: Level 0 (40,000 ft: pipeline, before/now,
 * progress, readiness journey), Level 1 (waves and re-audits), Level 2
 * (workstreams), Level 3 (each finding's dated history).
 * @module audit/evidence
 */
import { pct, statusNames } from './model.js';

const LEDGER_LENS = { ASVS: 'sec', ISO42001: 'ai' };
const lensOf = (f) => LEDGER_LENS[f.lens] || 'saf';
const SCORES = [
  ['safety', 'is-saf', 'Safety'],
  ['security', 'is-sec', 'Security'],
  ['ai', 'is-ai', 'AI'],
];
import {
  drillDown,
  ledgerProgress,
  readinessJourney,
  stages,
} from './evidenceModel.js';
import { cardFor } from './plain.js';

const REPO = 'https://github.com/pierretruter07-sudo/gods-eye-view/blob/main/';

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function levelHead(tag, title) {
  const d = h('div', 'gev-ev-level');
  d.append(h('span', 'gev-ev-tag', tag), h('h3', null, title));
  return d;
}

function bar(n, d) {
  const b = h('span', 'gev-ev-bar');
  const i = h('i');
  i.style.width = `${d ? ((100 * n) / d).toFixed(1) : 0}%`;
  b.append(i);
  return b;
}

/** Readiness journey chart: numbers only, safe for innerHTML. */
function journeySvg(j) {
  const P = j.points;
  if (!P.length) return '';
  const W = 300;
  const H = 150;
  const l = 30;
  const r = 40;
  const t = 10;
  const b = 22;
  const xs = P.map((_, i) => l + (i * (W - l - r)) / Math.max(1, P.length - 1));
  const y = (v) => t + (1 - v) * (H - t - b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Readiness journey">`;
  for (const v of [0, 0.5, 1])
    s += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(150,175,205,0.18)"/><text x="${l - 5}" y="${y(v) + 3}" text-anchor="end" class="ax">${v * 100}%</text>`;
  P.forEach((p, i) => {
    s += `<text x="${xs[i]}" y="${H - 6}" text-anchor="middle" class="ax">${i === 0 ? 'Base' : `W${i}`}</text>`;
  });
  const B = j.scenarios[1];
  // End labels: stacked top-down by value so close lines do not collide.
  const ends = [
    ['safety', 'targetSafety'],
    ['security', 'targetSecurity'],
    ['ai', 'targetAi'],
  ]
    .filter(([, tk]) => typeof P[P.length - 1][tk] === 'number')
    .map(([k, tk]) => ({ k, y: y(P[P.length - 1][tk]) + 3 }))
    .sort((p, q) => p.y - q.y);
  ends.forEach((e, i) => {
    if (i) e.y = Math.max(e.y, ends[i - 1].y + 11);
  });
  const endY = Object.fromEntries(ends.map((e) => [e.k, e.y]));
  for (const [k, tk, col] of [
    ['safety', 'targetSafety', '#7aa7dc'],
    ['security', 'targetSecurity', '#a294dc'],
    ['ai', 'targetAi', '#d890c0'],
  ]) {
    if (typeof P[0][tk] !== 'number') continue;
    s += `<polyline points="${P.map((p, i) => `${xs[i]},${y(p[tk])}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
    P.forEach((p, i) => {
      if (p.kind === 'actual')
        s += `<circle cx="${xs[i]}" cy="${y(p[k])}" r="3.6" fill="${col}"/>`;
    });
    const last = P[P.length - 1][tk];
    s += `<text x="${xs[xs.length - 1] + 6}" y="${endY[k]}" class="end" fill="${col}">${Math.round(last * 100)}%</text>`;
    if (B && typeof B[k] === 'number')
      s += `<circle cx="${xs[xs.length - 1]}" cy="${y(B[k])}" r="3" fill="none" stroke="${col}" stroke-width="1.3"/>`;
  }
  return `${s}</svg>`;
}

/**
 * @param {{container: HTMLElement, ledger: object, items: object[], onShow: (id: string) => void, onClose?: () => void}} o
 */
export function createEvidenceDrawer({
  container,
  ledger,
  items,
  onShow,
  onClose,
}) {
  const drawer = h('aside', 'gev-ev gev-audit-glass');
  drawer.setAttribute('aria-label', 'Evidence');
  drawer.hidden = true;
  const head = h('div', 'gev-ev-head');
  const close = h('button', 'gev-audit-btn', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => api.close());
  head.append(h('h2', null, 'From audit to compliance'), close);
  const body = h('div', 'gev-ev-body');
  drawer.append(head, body);
  container.append(drawer);
  const itemById = new Map(items.map((i) => [i.id, i]));

  function render() {
    const parts = [];
    // Level 0
    parts.push(
      levelHead('LEVEL 0 · 40,000 FT', 'What was done and what changed'),
    );
    const pipe = h('ol', 'gev-ev-pipe');
    for (const s of stages(ledger)) {
      const li = h('li');
      li.dataset.state = s.state;
      li.append(
        h('b', null, s.name),
        h(
          'span',
          null,
          s.state === 'done' ? s.date : s.state === 'next' ? 'next' : 'planned',
        ),
      );
      if (s.ref) li.title = s.ref;
      pipe.append(li);
    }
    parts.push(pipe);
    const base = ledger.audits[0];
    const last = ledger.audits[ledger.audits.length - 1];
    const grid = h('div', 'gev-ev-grid');
    for (const [label, a] of [
      ['Baseline', base],
      ['Latest audit', last],
    ]) {
      const c = h('div', 'gev-ev-card');
      c.append(h('span', 'gev-audit-zlabel', `${label} · ${a.date}`));
      for (const [lens, cls, name] of SCORES) {
        if (!a[lens]) continue;
        const r = h('div', `gev-ev-score ${cls}`);
        r.append(
          h('span', null, name),
          h('b', null, pct(a[lens].readiness)),
          h('span', 'gev-audit-muted', a[lens].verdict),
        );
        c.append(r);
      }
      grid.append(c);
    }
    const p = ledgerProgress(ledger, items);
    const prog = h('div', 'gev-ev-card');
    prog.append(
      h('span', 'gev-audit-zlabel', 'Progress'),
      h('span', null, `${p.closed} of ${p.total} findings closed`),
      bar(p.closed, p.total),
      h('span', null, `${p.blockClosed} of ${p.blockTotal} must-fix closed`),
      bar(p.blockClosed, p.blockTotal),
    );
    grid.append(prog);
    parts.push(grid);
    const j = readinessJourney(ledger);
    const jc = h('div', 'gev-ev-card gev-ev-journey');
    jc.append(h('span', 'gev-audit-zlabel', 'Readiness journey'));
    const svgHost = h('div');
    svgHost.innerHTML = journeySvg(j);
    jc.append(
      svgHost,
      h(
        'span',
        'gev-audit-muted',
        'Dots: measured audits. Dashed: target with Claude + Replit. Rings: with the customer and an independent reviewer.',
      ),
    );
    const human = j.scenarios[0]?.human_only || [];
    if (human.length) {
      jc.append(h('span', 'gev-audit-zlabel', 'Needs people, not code'));
      const ul = h('ul', 'gev-ev-human');
      for (const x of human) ul.append(h('li', null, `${x.id}: ${x.why}`));
      jc.append(ul);
    }
    parts.push(jc);

    // Level 1
    parts.push(levelHead('LEVEL 1', 'Waves and re-audits'));
    const table = h('table', 'gev-ev-table');
    const thead = h('tr');
    for (const c of ['Audit', 'Date', 'Commit', 'Safety', 'Security', 'AI'])
      thead.append(h('th', null, c));
    table.append(thead);
    for (const a of ledger.audits) {
      const tr = h('tr');
      tr.append(
        h('td', null, a.label),
        h('td', null, a.date),
        h('td', 'gev-ev-mono', a.commit || '—'),
        h('td', null, `${pct(a.safety.readiness)} · ${a.safety.verdict}`),
        h('td', null, `${pct(a.security.readiness)} · ${a.security.verdict}`),
        h('td', null, a.ai ? `${pct(a.ai.readiness)} · ${a.ai.verdict}` : '—'),
      );
      table.append(tr);
    }
    parts.push(table);

    // Levels 2 and 3
    for (const w of drillDown(ledger, items)) {
      const wave = h('details', 'gev-ev-wave');
      const sum = h('summary');
      sum.append(
        h('b', null, `Wave ${w.id} · ${w.name}`),
        bar(w.closed, w.total),
        h('span', 'gev-ev-mono', `${w.closed}/${w.total}`),
      );
      wave.append(sum);
      const inner = h('div', 'gev-ev-inner');
      inner.append(
        h('p', 'gev-audit-muted', `${w.who} · ${w.effort} · Exit: ${w.exit}`),
        levelHead('LEVEL 2', 'Workstreams'),
      );
      for (const x of w.workstreams) {
        const ws = h('details', 'gev-ev-ws');
        const s2 = h('summary');
        s2.append(
          h('b', null, `${x.id} ${x.name}`),
          bar(x.closed, x.findings.length),
          h('span', 'gev-ev-mono', `${x.closed}/${x.findings.length}`),
        );
        ws.append(s2);
        const wi = h('div', 'gev-ev-inner');
        const ul = h('ul', 'gev-ev-deliv');
        for (const d of x.deliverables) ul.append(h('li', null, d));
        wi.append(ul, h('p', 'gev-audit-muted', `Evidence: ${x.evidence}`));
        wi.append(levelHead('LEVEL 3', 'Line by line'));
        for (const f of x.findings) {
          const row = h('details', 'gev-ev-finding');
          const s3 = h('summary');
          const item = itemById.get(f.id);
          s3.append(
            h('span', `gev-audit-id is-${lensOf(f)}`, f.id),
            h('span', 'gev-ev-ftitle', item ? cardFor(item).title : f.title),
            h(
              'span',
              `gev-ev-st is-${f.now || 'un'}`,
              f.closed ? 'Closed' : 'Open',
            ),
          );
          row.append(s3);
          const hist = h('ol', 'gev-audit-hist');
          const names = statusNames(lensOf(f));
          for (const e of f.history) {
            const li = h('li');
            li.dataset.ok = String(['C', 'L', 'NA'].includes(e.status));
            li.append(
              h('span', 'gev-audit-when', e.date),
              document.createTextNode(
                `${e.event === 'rated' ? 'Baseline' : 'Re-rated'}: ${e.from ? `${names[e.from] || e.from} → ` : ''}${names[e.status] || 'Not rated'}${e.ref ? ` · ${e.ref}` : ''}`,
              ),
            );
            if (e.note) li.append(h('div', 'gev-audit-muted', e.note));
            hist.append(li);
          }
          const show = h('button', 'gev-audit-btn is-small', 'Show in orbit');
          show.type = 'button';
          show.addEventListener('click', () => onShow(f.id));
          const fx = h('div', 'gev-ev-inner');
          fx.append(h('p', null, `Fix: ${f.fix}`), hist, show);
          row.append(fx);
          wi.append(row);
        }
        ws.append(wi);
        inner.append(ws);
      }
      wave.append(inner);
      parts.push(wave);
    }
    const foot = h('p', 'gev-audit-muted gev-ev-foot');
    const a = h('a', null, 'remediation plan (PDF)');
    a.href = `${REPO}docs/evidence/remediation-plan-v0.3.pdf`;
    a.target = '_blank';
    a.rel = 'noopener';
    const a2 = h('a', null, 'ledger.json');
    a2.href = `${REPO}docs/evidence/ledger.json`;
    a2.target = '_blank';
    a2.rel = 'noopener';
    foot.append(
      document.createTextNode('Full record in the repository: '),
      a,
      document.createTextNode(', '),
      a2,
      document.createTextNode('. History is append-only.'),
    );
    parts.push(foot);
    body.replaceChildren(...parts);
  }

  const api = {
    open() {
      render();
      drawer.hidden = false;
      close.focus();
    },
    close() {
      if (drawer.hidden) return;
      drawer.hidden = true;
      onClose?.();
    },
    isOpen: () => !drawer.hidden,
    el: drawer,
    destroy() {
      drawer.remove();
    },
  };
  return api;
}
