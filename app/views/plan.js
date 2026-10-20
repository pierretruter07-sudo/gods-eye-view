/**
 * @file The Plan view: the remediation plan in waves, with the readiness
 * each wave should reach (projected) and a work package per fix.
 * @module crosscheck/app/views/plan
 */
import { copy, download, h, pct } from '../dom.js';
import { workPackageMarkdown } from '../../engine/plan.js';

const KIND = { code: 'Code change', process: 'Process', question: 'Question', review: 'Review' };
const openPackages = new Set();

export function renderPlan(state, { update, go }) {
  const r = state.result;
  if (!r)
    return h(
      'div',
      { class: 'stack' },
      h('h1', {}, 'Remediation plan'),
      h('p', { class: 'lede' }, 'No assessment yet.'),
      h('button', { class: 'btn btn--primary', onclick: () => go('assess') }, 'Start an assessment'),
    );
  const { plan, assessment } = r;
  const live = assessment.standards.filter((s) => s.state !== 'na');
  const t = plan.totals;

  const waveBlocks = plan.waves
    .filter((w) => w.fixes.length)
    .map((w) =>
      h(
        'section',
        { class: 'panel wave' },
        h('div', { class: 'wave__head' }, h('span', { class: 'label' }, `Wave ${w.n}`), h('h2', {}, w.name), h('span', { class: 'muted small' }, w.why)),
        w.projected
          ? h(
              'div',
              { class: 'stack', style: { gap: '6px' } },
              h('div', { class: 'small muted' }, `Readiness after this wave (projected: assumes the fixes land and pass a fresh assessment)`),
              ...live.map((s) => {
                const before = plan.baseline[s.standard]?.readiness || 0;
                const after = w.projected[s.standard]?.readiness ?? before;
                return h(
                  'div',
                  { class: 'proj' },
                  h('span', {}, s.short),
                  h('div', { class: 'bar' }, h('span', { class: 'bar__proj', style: { width: pct(after) } }), h('span', { style: { width: pct(before) } })),
                  h('span', { class: 'mono small' }, pct(after)),
                );
              }),
            )
          : null,
        ...w.fixes.map((f) => fixCard(f, r, update)),
      ),
    );

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      {},
      h('div', { class: 'label' }, `Remediation plan · ${r.project.name}`),
      h('h1', {}, `${t.fixes} fixes close every open item`),
      h(
        'p',
        { class: 'lede' },
        `${t.code} code or repository changes, ${t.process} processes to put in place, and ${t.questions} questions to answer. ${t.multiStandard} fixes close items in more than one standard.`,
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn--primary', onclick: () => download(`remediation-plan-${slug(r.project.name)}.md`, r.planMarkdown, 'text/markdown') }, 'Download the plan (Markdown)'),
        h('button', { class: 'btn', onclick: () => download(`remediation-plan-${slug(r.project.name)}.json`, JSON.stringify(plan, null, 1)) }, 'Download as JSON'),
        h('button', { class: 'btn', onclick: () => go('report') }, 'Back to the report'),
      ),
    ),
    plan.workstreams.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', {}, 'Workstreams'),
          h('div', { class: 'grid' }, ...plan.workstreams.map((ws) => h('div', {}, h('strong', {}, ws.name), h('div', { class: 'small mono muted' }, ws.fixes.join(' · '))))),
        )
      : null,
    ...waveBlocks,
  );
}

function fixCard(f, r, update) {
  const isOpen = openPackages.has(f.wp);
  const md = workPackageMarkdown(f, { project: r.project.name });
  return h(
    'div',
    { class: 'fix' },
    h('div', { class: 'row' }, h('span', { class: 'fix__wp' }, f.wp), h('span', { class: 'tag' }, KIND[f.kind] || f.kind), f.blocking ? h('span', { class: 'tag tag--warn' }, `${f.blocking} must-fix`) : null),
    h('strong', {}, f.title),
    h('div', { class: 'small muted' }, `Closes ${f.items.length} item${f.items.length === 1 ? '' : 's'} in ${f.standards.join(', ')}${f.found ? ` · now: ${f.found}` : ''}`),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn small',
          'aria-expanded': isOpen ? 'true' : 'false',
          onclick: () => {
            if (isOpen) openPackages.delete(f.wp);
            else openPackages.add(f.wp);
            update({});
          },
        },
        isOpen ? 'Hide work package' : 'Show work package',
      ),
      h(
        'button',
        {
          class: 'btn small',
          onclick: async (e) => {
            const ok = await copy(md);
            e.target.textContent = ok ? 'Copied' : 'Copy failed';
          },
        },
        'Copy for a coding agent',
      ),
    ),
    isOpen ? h('pre', { class: 'md' }, md) : null,
  );
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
