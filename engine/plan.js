/**
 * @file CrossCheck's remediation plan. Every open or unrated item is traced
 * back to what would close it: a failing evidence signal (a fix in the
 * code or repository), a "no" or missing fact (a process to put in place or
 * a question to answer), or a reviewer's judgement. One fix usually closes
 * items in several standards at once, so the plan is built from fixes, not
 * from items:
 *
 * - Wave 1: fixes that close a must-fix item.
 * - Wave 2: fixes that close a non-compliant item.
 * - Wave 3: the remaining code and process fixes (partial items).
 * - Wave 4: facts to supply and items for a reviewer.
 *
 * After each wave the plan re-rates the codebase as if that wave's fixes had
 * landed and reports the readiness it would reach, marked projected. Each
 * fix becomes a work package a team or a coding agent can act on.
 * Pure: no I/O.
 * @module crosscheck/engine/plan
 */
import { assess, isBlocking } from './assess.js';
import { FACTS } from './facts.js';
import { PASS, SIGNALS, THEMES } from './signals.js';

export const WAVES = Object.freeze([
  { n: 1, name: 'Must-fix', why: 'Closes items that block a claim on at least one standard.' },
  { n: 2, name: 'Non-compliant', why: 'Closes items rated non-compliant.' },
  { n: 3, name: 'Conditions', why: 'Lifts partial items to compliance.' },
  { n: 4, name: 'Facts and review', why: 'Answers the questions code cannot, and the items a reviewer must judge.' },
]);

const open = (i) => !i.out && (i.status === 'P' || i.status === 'N');

/** Every fix the assessment points to, with the items each would close. */
export function fixesFor(assessment, evidence) {
  const fixes = new Map();
  const add = (key, make, item) => {
    if (!fixes.has(key)) fixes.set(key, { ...make(), items: [] });
    fixes.get(key).items.push(item);
  };
  for (const std of assessment.standards) {
    for (const item of std.items) {
      if (item.out) continue;
      const ref = {
        standard: std.standard,
        short: std.short,
        id: item.id,
        title: item.title,
        status: item.status,
        sev: item.sev,
        blocking: isBlocking(item),
      };
      if (open(item)) {
        for (const input of item.inputs || []) {
          if (input.kind === 'check' && input.state !== PASS && input.state !== 'na') {
            add(`signal:${input.id}`, () => signalFix(input.id, evidence), ref);
          } else if (input.kind === 'fact' && input.state && input.state !== PASS) {
            add(`fact:${input.id}`, () => factFix(input.id), ref);
          }
        }
        // Open on a declaration alone (no failing input): a reviewer looks.
        if (!(item.inputs || []).some((i) => i.state && i.state !== PASS && i.state !== 'na'))
          add(`review:${std.standard}`, () => reviewFix(std), ref);
      } else if (!item.status) {
        if (item.unrated === 'facts') {
          for (const input of item.inputs || [])
            if (input.kind === 'fact' && input.state === null)
              add(`ask:${input.id}`, () => askFix(input.id), ref);
        } else add(`review:${std.standard}`, () => reviewFix(std), ref);
      }
    }
  }
  return [...fixes.values()].map((f) => ({
    ...f,
    standards: [...new Set(f.items.map((i) => i.short))],
    blocking: f.items.filter((i) => i.blocking).length,
    nonCompliant: f.items.filter((i) => i.status === 'N').length,
  }));
}

function signalFix(id, evidence) {
  const s = SIGNALS.find((x) => x.id === id);
  const now = evidence?.signals?.[id];
  return {
    key: `signal:${id}`,
    kind: 'code',
    signal: id,
    title: s?.fix || id,
    theme: s?.theme || 'governance',
    acceptance: `CrossCheck's "${s?.title || id}" check passes on a fresh assessment.`,
    found: now?.summary || null,
    where: (now?.evidence || []).slice(0, 8),
  };
}

function factFix(id) {
  const f = FACTS.find((x) => x.id === id);
  return {
    key: `fact:${id}`,
    kind: 'process',
    fact: id,
    title: f?.fix || `Put in place: ${f?.question || id}`,
    theme: f?.theme || 'governance',
    acceptance: `The answer to "${f?.question || id}" is yes, with a record a reviewer can check.`,
  };
}

function askFix(id) {
  const f = FACTS.find((x) => x.id === id);
  return {
    key: `ask:${id}`,
    kind: 'question',
    fact: id,
    title: `Answer: ${f?.question || id}`,
    theme: f?.theme || 'governance',
    acceptance: 'Answered at intake (the item is then rated).',
  };
}

function reviewFix(std) {
  return {
    key: `review:${std.standard}`,
    kind: 'review',
    title: `Reviewer assessment of the ${std.short} items code cannot show`,
    theme: 'governance',
    acceptance: 'Each item rated by a reviewer, with the document or record that shows it.',
  };
}

/** Which wave a fix belongs to. */
export function waveOf(fix) {
  if (fix.kind === 'question' || fix.kind === 'review') return 4;
  if (fix.blocking) return 1;
  if (fix.nonCompliant) return 2;
  return 3;
}

/**
 * Re-rate as if fixes had landed: their signals pass, their facts are yes.
 * Used for the projected readiness after each wave.
 */
export function project(input, fixes) {
  const signals = { ...input.evidence.signals };
  const facts = { ...input.facts };
  for (const f of fixes) {
    if (f.signal) signals[f.signal] = { ...signals[f.signal], state: PASS };
    if (f.fact && f.kind !== 'question') facts[f.fact] = 'yes';
  }
  return assess({ ...input, evidence: { ...input.evidence, signals }, facts });
}

/**
 * Build the remediation plan.
 * @param {{evidence: object, facts: object, catalogues: object[], levels?: object}} input the assessment input
 * @param {object} assessment its result (assess(input))
 */
export function buildPlan(input, assessment) {
  const fixes = fixesFor(assessment, input.evidence).sort(
    (a, b) =>
      waveOf(a) - waveOf(b) ||
      b.blocking - a.blocking ||
      b.items.length - a.items.length ||
      b.standards.length - a.standards.length,
  );
  const done = [];
  const waves = WAVES.map((w) => {
    const these = fixes.filter((f) => waveOf(f) === w.n);
    done.push(...these);
    const after = w.n < 4 && these.length ? project(input, done) : null;
    return {
      ...w,
      fixes: these.map((f, i) => ({ ...f, wp: `W${w.n}.${i + 1}` })),
      projected: after
        ? Object.fromEntries(after.standards.map((s) => [s.standard, { readiness: s.readiness, state: s.state, verdict: s.verdict }]))
        : null,
    };
  });
  const workstreams = Object.entries(THEMES)
    .map(([theme, name]) => ({
      theme,
      name,
      fixes: waves.flatMap((w) => w.fixes.filter((f) => f.theme === theme).map((f) => f.wp)),
    }))
    .filter((ws) => ws.fixes.length);
  return {
    baseline: Object.fromEntries(assessment.standards.map((s) => [s.standard, { readiness: s.readiness, state: s.state, verdict: s.verdict }])),
    waves,
    workstreams,
    totals: {
      fixes: fixes.length,
      code: fixes.filter((f) => f.kind === 'code').length,
      process: fixes.filter((f) => f.kind === 'process').length,
      questions: fixes.filter((f) => f.kind === 'question').length,
      multiStandard: fixes.filter((f) => f.standards.length > 1).length,
    },
  };
}

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

/** One work package as Markdown, for a team or a coding agent. */
export function workPackageMarkdown(fix, { project: name = 'the project' } = {}) {
  const lines = [
    `# ${fix.wp} · ${fix.title}`,
    '',
    `**Kind:** ${fix.kind === 'code' ? 'Code or repository change' : fix.kind === 'process' ? 'Process to put in place' : fix.kind === 'question' ? 'Question to answer' : 'Reviewer assessment'}  `,
    `**Closes:** ${fix.items.length} item${fix.items.length === 1 ? '' : 's'} in ${fix.standards.join(', ')}${fix.blocking ? ` (${fix.blocking} must-fix)` : ''}`,
    '',
  ];
  if (fix.found) lines.push(`**Found now:** ${fix.found}`, '');
  if (fix.where?.length) {
    lines.push('**Where:**', '');
    for (const w of fix.where) lines.push(`- \`${w.path}${w.line ? `:${w.line}` : ''}\`${w.note ? ` · ${w.note}` : ''}`);
    lines.push('');
  }
  lines.push('**Items this closes:**', '');
  for (const i of fix.items.slice(0, 40))
    lines.push(`- ${i.short} ${i.id} · ${i.title}${i.sev ? ` (${i.sev})` : ''}`);
  if (fix.items.length > 40) lines.push(`- …and ${fix.items.length - 40} more`);
  lines.push('', `**Done when:** ${fix.acceptance}`, '');
  if (fix.kind === 'code')
    lines.push(
      '**Brief for a coding agent:**',
      '',
      `> In ${name}, ${lowerFirst(fix.title)} Keep the change small and reviewable, add or update tests, and do not commit secrets. When finished, list the files changed and how the "Done when" condition is now met.`,
      '',
    );
  return lines.join('\n');
}

const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** The whole plan as Markdown. */
export function planMarkdown(plan, assessment, { project: name = 'the project', date = '' } = {}) {
  const lines = [
    `# Remediation plan · ${name}`,
    '',
    date ? `Assessed ${date} by CrossCheck. Projected figures assume each wave's fixes land and are re-assessed.` : "Projected figures assume each wave's fixes land and are re-assessed.",
    '',
    '## Where it stands',
    '',
    '| Standard | Readiness | Verdict |',
    '|---|---|---|',
    ...assessment.standards.map((s) => `| ${s.short} | ${s.state === 'na' ? 'n/a' : pct(s.readiness)} | ${s.verdict} |`),
    '',
  ];
  for (const w of plan.waves) {
    if (!w.fixes.length) continue;
    lines.push(`## Wave ${w.n} · ${w.name}`, '', w.why, '');
    for (const f of w.fixes)
      lines.push(`- **${f.wp}** ${f.title} (closes ${f.items.length} in ${f.standards.join(', ')}${f.blocking ? `; ${f.blocking} must-fix` : ''})`);
    if (w.projected) {
      lines.push(
        '',
        `Projected after wave ${w.n}: ${assessment.standards
          .filter((s) => s.state !== 'na')
          .map((s) => `${s.short} ${pct(w.projected[s.standard]?.readiness)}`)
          .join(' · ')} (projected)`,
      );
    }
    lines.push('');
  }
  lines.push('## Work packages', '');
  for (const w of plan.waves) for (const f of w.fixes) lines.push(workPackageMarkdown(f, { project: name }), '');
  return lines.join('\n');
}
