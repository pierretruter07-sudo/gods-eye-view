/**
 * @file The Assess view: plug in code (GitHub link or zip), answer what code
 * cannot show, choose standards, run.
 * @module crosscheck/app/views/assess
 */
import { api } from '../api.js';
import { h, signalChip } from '../dom.js';

export function renderAssess(state, { update, go }) {
  const busy = (what) => update({ busy: what, error: null });

  async function runIntake(promise) {
    busy('intake');
    try {
      const intake = await promise;
      update({ intake, busy: null, result: null });
    } catch (error) {
      update({ busy: null, error: error.message });
    }
  }

  async function runAssessment() {
    busy('assess');
    try {
      const result = await api.assess({
        id: state.intake.id,
        facts: state.answers,
        standards: state.chosen,
        levels: state.levels,
        ai: state.useAi,
      });
      update({ result, busy: null });
      go('report');
    } catch (error) {
      update({ busy: null, error: error.message });
    }
  }

  // ── Step 1: the code ───────────────────────────────────────────────
  const link = h('input', {
    type: 'url',
    placeholder: 'https://github.com/owner/repository',
    'aria-label': 'GitHub repository link',
    value: state.link ?? (state.intake?.source?.startsWith('https://github.com') ? state.intake.source : ''),
    // Kept across re-renders without redrawing on every keystroke.
    oninput: (e) => {
      state.link = e.target.value;
    },
  });
  const file = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
  const takeFile = (f) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) return update({ error: 'Choose a .zip file of the codebase' });
    runIntake(api.intakeZip(f));
  };
  file.addEventListener('change', () => takeFile(file.files[0]));
  const drop = h(
    'div',
    {
      class: 'drop',
      role: 'button',
      tabindex: '0',
      onclick: () => file.click(),
      onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), file.click()),
      ondragover: (e) => {
        e.preventDefault();
        drop.classList.add('is-over');
      },
      ondragleave: () => drop.classList.remove('is-over'),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
        takeFile(e.dataTransfer.files[0]);
      },
    },
    h('strong', {}, 'Drop a .zip of the code here'),
    h('div', { class: 'small muted' }, `or click to choose one (up to ${state.status?.limits?.maxArchiveMb || 100} MB)`),
  );

  const intake = state.intake;
  const step1 = h(
    'section',
    { class: `panel step${intake ? ' is-done' : ''}` },
    h('div', { class: 'step__n' }, '1'),
    h(
      'div',
      { class: 'stack' },
      h('div', {}, h('h2', {}, 'Plug in the code'), h('p', { class: 'muted small' }, 'CrossCheck reads the files once, keeps only the evidence it finds (file paths, line numbers and short notes), and discards the code.')),
      h(
        'form',
        {
          class: 'row',
          onsubmit: (e) => {
            e.preventDefault();
            if (link.value.trim()) runIntake(api.intakeGithub(link.value.trim()));
          },
        },
        link,
        h('button', { class: 'btn btn--primary', type: 'submit', disabled: state.busy === 'intake' }, 'Fetch from GitHub'),
      ),
      state.status && !state.status.github?.token
        ? h('p', { class: 'small muted' }, 'Public repositories only on this server. A private repository needs a GitHub token set on the server.')
        : null,
      drop,
      file,
      state.busy === 'intake' ? h('p', {}, h('span', { class: 'spinner' }), ' Reading the code and gathering evidence…') : null,
      intake ? intakeSummary(intake, state) : null,
    ),
  );

  // ── Step 2: facts ──────────────────────────────────────────────────
  const facts = state.facts || [];
  const answered = facts.filter((f) => state.answers[f.id] != null && state.answers[f.id] !== '').length;
  const setAnswer = (id, value) => update((s) => ({ answers: { ...s.answers, [id]: value } }));
  const groups = [...new Set(facts.map((f) => f.group))];
  const step2 = h(
    'section',
    { class: `panel step${answered ? ' is-done' : ''}` },
    h('div', { class: 'step__n' }, '2'),
    h(
      'div',
      { class: 'stack' },
      h(
        'div',
        {},
        h('h2', {}, "Tell us what the code can't show"),
        h('p', { class: 'muted small' }, `Answered ${answered} of ${facts.length}. Items that rest on an answer are rated "Largely" at most and marked declared until a reviewer sees the record. Skip what you don't know: those items stay open as questions in the plan.`),
      ),
      ...groups.map((g) =>
        h(
          'div',
          {},
          h('div', { class: 'label' }, g),
          h('div', { class: 'facts' }, ...facts.filter((f) => f.group === g).map((f) => factRow(f, state.answers[f.id], setAnswer))),
        ),
      ),
    ),
  );

  // ── Step 3: standards ──────────────────────────────────────────────
  const lib = state.library || [];
  const chosen = new Set(state.chosen || []);
  const toggle = (id, on) => update((s) => ({ chosen: lib.map((x) => x.id).filter((x) => (x === id ? on : (s.chosen || []).includes(x))) }));
  const aiOn = state.status?.ai?.on;
  const step3 = h(
    'section',
    { class: `panel step${chosen.size ? ' is-done' : ''}` },
    h('div', { class: 'step__n' }, '3'),
    h(
      'div',
      { class: 'stack' },
      h('div', {}, h('h2', {}, 'Choose the standards'), h('p', { class: 'muted small' }, 'Each is rated separately; one fix in the plan often closes gaps in several.')),
      h(
        'div',
        { class: 'grid' },
        ...lib.map((s) =>
          h(
            'label',
            { class: 'std' },
            h('input', { type: 'checkbox', checked: chosen.has(s.id), onchange: (e) => toggle(s.id, e.target.checked) }),
            h('div', {}, h('strong', {}, s.short), h('div', { class: 'small muted' }, s.lens)),
            s.levels
              ? h(
                  'select',
                  {
                    'aria-label': `${s.short} ${s.levelName}`,
                    onchange: (e) => update((st) => ({ levels: { ...st.levels, [s.id]: e.target.value } })),
                    onclick: (e) => e.stopPropagation(),
                  },
                  ...s.levels.map((l) => h('option', { value: l, selected: (state.levels[s.id] || s.defaultLevel) === l }, `${s.levelName} ${l}`)),
                )
              : h('span'),
            h('div', { class: 'std__meta small muted' }, `${s.inScope} items in scope · ${s.licence}`),
          ),
        ),
      ),
      h(
        'label',
        { class: 'row small' },
        h('input', { type: 'checkbox', disabled: !aiOn, checked: aiOn && state.useAi, onchange: (e) => update({ useAi: e.target.checked }) }),
        aiOn
          ? h('span', {}, `Ask the open-source model (${state.status.ai.model}) to rate the items rules can't, citing the evidence. Its ratings are marked AI-rated and capped at "Largely".`)
          : h('span', { class: 'muted' }, 'AI rating is off on this server. To turn it on, point it at an open-source model with CROSSCHECK_AI_URL and CROSSCHECK_AI_MODEL.'),
      ),
    ),
  );

  const ready = intake && chosen.size;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      {},
      h('h1', {}, 'Plug in any software. See exactly where it falls short.'),
      h('p', { class: 'lede' }, 'CrossCheck reads a codebase, gathers the evidence, rates it against the standards you run on, and turns every gap into a remediation plan a team or a coding agent can act on.'),
    ),
    state.error ? h('p', { class: 'error', role: 'alert' }, state.error) : null,
    step1,
    step2,
    step3,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        { class: 'btn btn--primary', disabled: !ready || state.busy === 'assess', onclick: runAssessment },
        state.busy === 'assess' ? 'Assessing…' : 'Run the assessment',
      ),
      !intake ? h('span', { class: 'small muted' }, 'Plug in the code first.') : null,
      state.busy === 'assess' ? h('span', { class: 'spinner' }) : null,
    ),
  );
}

function intakeSummary(intake, state) {
  const inv = intake.inventory;
  const sigMeta = new Map((state.signals?.signals || []).map((s) => [s.id, s]));
  const entries = Object.entries(intake.signals);
  const counts = { pass: 0, partial: 0, fail: 0, na: 0 };
  for (const [, s] of entries) counts[s.state] = (counts[s.state] || 0) + 1;
  return h(
    'div',
    { class: 'notice stack', style: { gap: '8px' } },
    h(
      'div',
      {},
      h('strong', {}, intake.name),
      intake.source ? h('span', { class: 'small muted' }, ` · ${intake.source}`) : null,
    ),
    h(
      'div',
      { class: 'small' },
      `${inv.files.toLocaleString()} files · ${inv.codeFiles.toLocaleString()} code · ${inv.testFiles.toLocaleString()} tests · `,
      inv.languages.map((l) => `${l.name} ${l.files}`).join(', ') || 'no recognised languages',
      intake.ai?.used ? ' · uses AI' : '',
    ),
    h('div', { class: 'small' }, `Evidence checks: ${counts.pass} found, ${counts.partial} to review, ${counts.fail} missing${counts.na ? `, ${counts.na} not applicable` : ''}.`),
    h(
      'details',
      {},
      h('summary', { class: 'small' }, 'Show the evidence checks'),
      h(
        'div',
        { class: 'signals', style: { marginTop: '8px' } },
        ...entries.map(([id, s]) =>
          h('div', { class: 'signal', title: s.summary }, signalChip(s.state), h('span', {}, sigMeta.get(id)?.title || id, h('span', { class: 'muted' }, ` · ${s.summary}`))),
        ),
      ),
    ),
  );
}

function factRow(f, value, set) {
  if (f.kind === 'text')
    return h(
      'div',
      { class: 'fact fact--text' },
      h('label', { for: `fact-${f.id}` }, f.question),
      h('input', {
        type: 'text',
        id: `fact-${f.id}`,
        value: value || '',
        maxlength: 500,
        onchange: (e) => set(f.id, e.target.value.trim()),
      }),
    );
  const options = f.kind === 'yesno' ? [['yes', 'Yes'], ['no', 'No'], ['na', "Doesn't apply"]] : f.options;
  return h(
    'div',
    { class: 'fact' },
    h('span', {}, f.question),
    h(
      'div',
      { class: 'seg', role: 'group', 'aria-label': f.question },
      ...options.map(([k, label]) =>
        h('button', { type: 'button', 'aria-pressed': value === k ? 'true' : 'false', onclick: () => set(f.id, value === k ? '' : k) }, label),
      ),
    ),
  );
}
