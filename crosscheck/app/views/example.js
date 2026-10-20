/**
 * @file The worked example: God's Eye View, assessed by hand with
 * CrossCheck's method against ED-153, OWASP ASVS and ISO/IEC 42001, scored
 * with the same engine the AUDIT view in God's Eye View uses.
 * @module crosscheck/app/views/example
 */
import { api } from '../api.js';
import { h, pct, statusChip } from '../dom.js';
import { LENS_NAME, LENS_REF, headline, mustFix, rollup, severityOf } from '../../engine/scoring.js';

let example = null;
let loading = null;

export function renderExample(state, { update }) {
  if (!example) {
    loading ??= api
      .example()
      .then((e) => {
        example = e;
        update({});
      })
      .catch((error) => update({ error: error.message }));
    return h('p', {}, h('span', { class: 'spinner' }), ' Loading the worked example…');
  }
  const opts = { swal: example.swal, asvsLevel: example.asvsLevel };
  const lenses = ['saf', 'sec', 'ai'].map((lens) => ({ lens, r: rollup(example.items, lens, opts) }));
  const must = mustFix(example.items);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      {},
      h('div', { class: 'label' }, 'Worked example'),
      h('h1', {}, example.item),
      h('p', { class: 'lede' }, headline(...lenses.map((l) => l.r))),
      h(
        'p',
        { class: 'small muted' },
        `Assessed ${example.assessedAt} against ${lenses.map((l) => LENS_REF[l.lens]).join(', ')} (SWAL ${example.swal}, ASVS level ${example.asvsLevel}). A reviewer rated every item; the scores below come from the same engine God's Eye View's AUDIT view uses.`,
      ),
      // Inside God's Eye View (served under /crosscheck/), link back to it.
      location.pathname.startsWith('/crosscheck/')
        ? h('p', { class: 'small' }, h('a', { href: '/' }, "Open God's Eye View"), ' and press AUDIT to see this assessment as three rings around the globe.')
        : null,
    ),
    h(
      'div',
      { class: 'verdicts' },
      ...lenses.map(({ lens, r }) =>
        h(
          'div',
          { class: `panel verdict state-${r.state}` },
          h('strong', {}, `${LENS_NAME[lens]} · ${LENS_REF[lens]}`),
          h('div', { class: 'verdict__score' }, pct(r.readiness)),
          h('div', { class: 'bar' }, h('span', { style: { width: pct(r.readiness) } })),
          h('div', { class: 'small' }, r.verdict),
          h('div', { class: 'counts muted' }, h('span', {}, `${r.counts.C + r.counts.L} met`), h('span', {}, `${r.open} open`), r.blocking ? h('span', { class: 'error' }, `${r.blocking} must-fix`) : null),
        ),
      ),
    ),
    h(
      'section',
      { class: 'panel stack' },
      h('h2', {}, `Must-fix items (${must.length})`),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'items' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Rating'), h('th', {}, 'Item'), h('th', {}, 'Finding'), h('th', {}, 'Fix'))),
          h(
            'tbody',
            {},
            ...must.map((i) =>
              h(
                'tr',
                {},
                h('td', {}, statusChip(i.status), h('div', { class: 'small muted' }, severityOf(i))),
                h('td', {}, h('span', { class: 'mono' }, `${LENS_REF[i.lens]} ${i.id}`), h('div', { class: 'small muted' }, i.title)),
                h('td', { class: 'small' }, i.evidence || ''),
                h('td', { class: 'small' }, i.fix || ''),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
