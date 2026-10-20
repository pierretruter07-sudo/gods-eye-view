/**
 * @file The Report view: a verdict per standard, then every item with its
 * rating, severity, basis and the evidence it rests on.
 * @module crosscheck/app/views/report
 */
import { download, h, pct, statusChip } from '../dom.js';

const SEV_NAME = { S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', SC: 'Critical', SH: 'High', SM: 'Medium', SL: 'Low' };
const SEV_RANK = { S1: 0, SC: 0, S2: 1, SH: 1, S3: 2, SM: 2, S4: 3, SL: 3 };
const BASIS = {
  code: 'From the code',
  declared: 'Declared at intake',
  'code+declared': 'Code and declaration',
  ai: 'AI-rated',
  facts: 'Declared at intake',
};

/** View-local filter state (kept between renders). */
const filter = { standard: 'all', status: 'open', q: '', open: new Set() };

export function renderReport(state, { update, go }) {
  const r = state.result;
  if (!r)
    return h(
      'div',
      { class: 'stack' },
      h('h1', {}, 'Report'),
      h('p', { class: 'lede' }, 'No assessment yet.'),
      h('button', { class: 'btn btn--primary', onclick: () => go('assess') }, 'Start an assessment'),
    );
  const a = r.assessment;
  const signals = new Map((state.signals?.signals || []).map((s) => [s.id, s]));
  const evidenceBy = state.intake?.signals || {};

  const verdicts = h(
    'div',
    { class: 'verdicts' },
    ...a.standards.map((s) =>
      h(
        'div',
        { class: `panel verdict state-${s.state}` },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('strong', {}, s.short), s.level ? h('span', { class: 'tag' }, `${levelName(state, s.standard)} ${s.level}`) : null),
        s.state === 'na'
          ? h('div', { class: 'verdict__score muted' }, 'n/a')
          : h('div', { class: 'verdict__score' }, pct(s.readiness)),
        s.state !== 'na' ? h('div', { class: 'bar' }, h('span', { style: { width: pct(s.readiness) } })) : null,
        h('div', { class: 'small' }, s.verdict),
        s.state !== 'na'
          ? h(
              'div',
              { class: 'counts muted' },
              h('span', {}, `${s.counts.C + s.counts.L} met`),
              h('span', {}, `${s.open} open`),
              s.blocking ? h('span', { class: 'error' }, `${s.blocking} must-fix`) : null,
              s.unrated ? h('span', {}, `${s.unrated} need facts or review`) : null,
            )
          : null,
        s.state !== 'na'
          ? h('button', { class: 'btn small', onclick: () => ((filter.standard = s.standard), (filter.status = 'all'), update({})) }, 'Show items')
          : null,
      ),
    ),
  );

  // Items table
  const all = a.standards.flatMap((s) => s.items.map((i) => ({ ...i, short: s.short })));
  const rows = all
    .filter((i) => !i.out)
    .filter((i) => filter.standard === 'all' || i.standard === filter.standard)
    .filter((i) =>
      filter.status === 'all'
        ? true
        : filter.status === 'open'
          ? i.status === 'P' || i.status === 'N'
          : filter.status === 'must'
            ? ['S1', 'S2', 'SC', 'SH'].includes(i.sev)
            : filter.status === 'unrated'
              ? !i.status
              : filter.status === 'met'
                ? i.status === 'C' || i.status === 'L'
                : true,
    )
    .filter((i) => !filter.q || `${i.id} ${i.title} ${i.groupName}`.toLowerCase().includes(filter.q.toLowerCase()))
    .sort((x, y) => (SEV_RANK[x.sev] ?? 9) - (SEV_RANK[y.sev] ?? 9));

  const search = h('input', {
    type: 'search',
    placeholder: 'Search items',
    value: filter.q,
    'aria-label': 'Search items',
    onchange: (e) => {
      filter.q = e.target.value;
      update({});
    },
  });

  const body = h('tbody');
  for (const i of rows.slice(0, 400)) {
    const key = `${i.standard}|${i.id}`;
    const isOpen = filter.open.has(key);
    body.append(
      h(
        'tr',
        {
          class: 'is-row',
          tabindex: '0',
          'aria-expanded': isOpen ? 'true' : 'false',
          onclick: () => {
            if (isOpen) filter.open.delete(key);
            else filter.open.add(key);
            update({});
          },
          onkeydown: (e) => e.key === 'Enter' && e.currentTarget.click(),
        },
        h('td', {}, statusChip(i.status, i.status ? null : i.unrated === 'facts' ? 'Needs facts' : 'Needs review')),
        h('td', { class: 'mono' }, `${i.short} ${i.id}`),
        h('td', {}, i.title, h('div', { class: 'small muted' }, i.groupName)),
        h('td', {}, i.sev ? h('span', { class: `tag${SEV_RANK[i.sev] <= 1 ? ' tag--warn' : ''}` }, SEV_NAME[i.sev]) : ''),
        h('td', { class: 'small' }, i.basis ? h('span', { class: `tag${i.basis === 'ai' ? ' tag--ai' : ''}` }, BASIS[i.basis] || i.basis) : ''),
      ),
    );
    if (isOpen) body.append(h('tr', { class: 'detail' }, h('td', { colspan: '5' }, itemDetail(i, signals, evidenceBy, state))));
  }

  const select = (value, opts, onchange, label) =>
    h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) }, ...opts.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      {},
      h('div', { class: 'label' }, `Report · ${r.project.name}`),
      h('h1', {}, a.summary.headline),
      h(
        'p',
        { class: 'lede' },
        `${a.summary.items} items across ${a.summary.standards} standards: ${a.summary.open} open, ${a.summary.blocking} must-fix, ${a.summary.unrated} awaiting facts or a reviewer.`,
      ),
      r.ai
        ? h('p', { class: 'small' }, h('span', { class: 'tag tag--ai' }, 'AI'), ` ${r.ai.model} rated ${r.ai.accepted} items; ${r.ai.rejected.length} ratings were rejected for weak or missing citations.`)
        : null,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn--primary', onclick: () => go('plan') }, 'See the remediation plan'),
        h('button', { class: 'btn', onclick: () => download(`crosscheck-${slug(r.project.name)}.json`, JSON.stringify(r, null, 1)) }, 'Download the report (JSON)'),
      ),
    ),
    verdicts,
    h(
      'section',
      { class: 'panel stack' },
      h('h2', {}, 'Items'),
      h(
        'div',
        { class: 'filters' },
        select(filter.standard, [['all', 'All standards'], ...a.standards.map((s) => [s.standard, s.short])], (v) => ((filter.standard = v), update({})), 'Standard'),
        select(
          filter.status,
          [
            ['open', 'Open (partial or non-compliant)'],
            ['must', 'Must-fix'],
            ['unrated', 'Needs facts or review'],
            ['met', 'Met'],
            ['all', 'All in scope'],
          ],
          (v) => ((filter.status = v), update({})),
          'Status',
        ),
        search,
        h('span', { class: 'small muted' }, `${rows.length} item${rows.length === 1 ? '' : 's'}${rows.length > 400 ? ' (first 400 shown)' : ''}`),
      ),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'items' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Rating'), h('th', {}, 'Item'), h('th', {}, 'Requirement'), h('th', {}, 'Severity'), h('th', {}, 'Basis'))),
          body,
        ),
      ),
    ),
  );
}

function itemDetail(i, signals, evidenceBy, state) {
  const facts = new Map((state.facts || []).map((f) => [f.id, f]));
  const parts = [];
  if (i.aiWhy) parts.push(h('p', { class: 'small' }, h('span', { class: 'tag tag--ai' }, 'AI'), ` ${i.aiWhy}`));
  const inputs = i.inputs || [];
  if (!inputs.length && !i.aiWhy)
    parts.push(h('p', { class: 'small muted' }, 'Nothing in code shows this item. A reviewer rates it from the organisation’s records.'));
  for (const input of inputs) {
    if (input.kind === 'check') {
      const s = evidenceBy[input.id];
      const meta = signals.get(input.id);
      parts.push(
        h(
          'div',
          { class: 'small' },
          h('strong', {}, meta?.title || input.id),
          ` · ${s?.summary || input.state}${input.state === 'pass' && input.strength !== 'direct' ? ' (indicates the control; detail not verified)' : ''}`,
          s?.evidence?.length
            ? h('ul', { class: 'evidence mono' }, ...s.evidence.slice(0, 6).map((e) => h('li', {}, `${e.path}${e.line ? `:${e.line}` : ''}`, e.note ? h('span', { class: 'muted' }, ` · ${e.note}`) : null)))
            : null,
          input.state !== 'pass' && meta?.fix ? h('div', { class: 'muted' }, `Fix: ${meta.fix}`) : null,
        ),
      );
    } else {
      const f = facts.get(input.id);
      parts.push(
        h('div', { class: 'small' }, h('strong', {}, 'Declared: '), f?.question || input.id, ' · ', input.state === null ? h('em', {}, 'not answered') : input.state === 'pass' ? 'yes' : input.state === 'fail' ? 'no' : "doesn't apply"),
      );
    }
  }
  if (i.out) parts.push(h('p', { class: 'small muted' }, i.outWhy));
  return h('div', { class: 'stack', style: { gap: '8px' } }, ...parts);
}

function levelName(state, id) {
  return state.library?.find((s) => s.id === id)?.levelName || 'Level';
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
