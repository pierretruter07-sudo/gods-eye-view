/**
 * @file CrossCheck's rating engine: rates every item of every selected
 * standard from the evidence signals and the declared facts, then rolls each
 * standard up to a readiness score and a verdict.
 *
 * Rules (deterministic; the same inputs always give the same ratings):
 * - An item lists the signals that evidence it (`checks`) and the facts it
 *   rests on (`facts`). A check is `direct` (the signal is the control
 *   itself) or `indicative` (the signal shows the control exists, not that
 *   every detail of the requirement is met).
 * - All inputs pass: Compliant when every input is a direct check, otherwise
 *   Largely (a declaration or an indicative check is not proof).
 * - Mixed: Partial. Nothing passes: Non-compliant.
 * - Nothing known (facts unanswered, no checks): unrated, with the reason
 *   (facts needed, or a reviewer must assess it). Unrated items keep a
 *   standard's verdict "incomplete": CrossCheck never fills a gap by guessing.
 * - Items out of scope (wrong level, organisation-wide controls, AI
 *   standards when no AI is used) are excluded and listed as such.
 * Pure: no imports outside the engine, no I/O.
 * @module crosscheck/engine/assess
 */
import { FACTS } from './facts.js';
import { FAIL, PARTIAL, PASS, SIGNALS } from './signals.js';

const SCORE = { C: 1, L: 0.75, P: 0.4, N: 0 };
const VALUE = { [PASS]: 1, [PARTIAL]: 0.5, [FAIL]: 0 };
const BLOCKING = new Set(['S1', 'S2', 'SC', 'SH']);

/** Status names, by the kind of standard. */
export const STATUS_TEXT = Object.freeze({
  C: 'Compliant',
  L: 'Largely',
  P: 'Partial',
  N: 'Non-compliant',
  NA: 'Not applicable',
});

/** Why an item has no rating. */
export const UNRATED_REASON = Object.freeze({
  facts: 'Needs facts from the submitter',
  reviewer: 'Needs a reviewer: not visible in code',
});

/**
 * The severity of an open item, on the standard's scale: safety standards
 * use S1–S4 (S1 worst), the others Critical, High, Medium, Low.
 */
export function severityFor(status, weight, scale) {
  if (status !== 'P' && status !== 'N') return null;
  if (scale === 'safety') {
    if (status === 'N') return weight === 'critical' ? 'S1' : weight === 'high' ? 'S2' : weight === 'low' ? 'S4' : 'S3';
    return weight === 'critical' || weight === 'high' ? 'S3' : 'S4';
  }
  if (status === 'N')
    return weight === 'critical' ? 'SC' : weight === 'high' ? 'SH' : weight === 'low' ? 'SL' : 'SM';
  return weight === 'critical' ? 'SH' : weight === 'high' ? 'SM' : 'SL';
}

/** Whether an open item blocks the standard's claim (must fix). */
export const isBlocking = (item) => BLOCKING.has(item.sev);

/** Facts in effect, with derived answers filled in (AI use from the code). */
export function effectiveFacts(facts, evidence) {
  const out = { ...facts };
  if (!out.ai_use || out.ai_use === 'auto')
    out.ai_use = evidence?.ai?.used ? 'yes' : 'no';
  return out;
}

/** One fact as a rating input: pass / fail / na / unknown. */
function factInput(id, facts) {
  const def = FACTS.find((f) => f.id === id);
  const v = facts[id];
  if (v == null) return { kind: 'fact', id, state: null };
  if (v === 'na') return { kind: 'fact', id, state: 'na' };
  if (def?.kind === 'yesno')
    return { kind: 'fact', id, state: v === 'yes' ? PASS : FAIL };
  return { kind: 'fact', id, state: PASS }; // a text answer is a declaration
}

/**
 * Rate one catalogue item.
 * @param {object} item catalogue item
 * @param {{signals: object}} evidence from gatherEvidence
 * @param {object} facts effective facts
 */
export function rateItem(item, evidence, facts) {
  const inputs = [];
  for (const c of item.checks || []) {
    const id = typeof c === 'string' ? c : c.id;
    const strength = (typeof c === 'object' && c.strength) || item.strength || 'indicative';
    const s = evidence.signals?.[id];
    if (!s) continue;
    inputs.push({ kind: 'check', id, strength, state: s.state });
  }
  for (const f of item.facts || []) inputs.push(factInput(f, facts));
  const known = inputs.filter((i) => i.state && i.state !== 'na');
  const cites = [];
  for (const i of inputs) {
    if (i.kind === 'check')
      cites.push(...(evidence.signals[i.id]?.evidence || []).map((e) => e.id), `signal:${i.id}`);
    else if (i.state) cites.push(`fact:${i.id}`);
  }
  if (!known.length) {
    if (inputs.some((i) => i.state === 'na'))
      return { status: 'NA', inputs, cites, basis: 'facts' };
    const needsFacts = inputs.some((i) => i.kind === 'fact');
    return {
      status: null,
      inputs,
      cites,
      unrated: needsFacts ? 'facts' : 'reviewer',
      basis: null,
    };
  }
  const avg = known.reduce((n, i) => n + (VALUE[i.state] ?? 0), 0) / known.length;
  const unknown = inputs.some((i) => i.state === null);
  let status;
  if (avg === 1) {
    const proof = known.every((i) => i.kind === 'check' && i.strength === 'direct');
    status = proof && !unknown ? 'C' : 'L';
  } else if (avg >= 0.5) status = 'P';
  else status = known.some((i) => i.state === PARTIAL) ? 'P' : 'N';
  const basis = known.some((i) => i.kind === 'fact')
    ? known.some((i) => i.kind === 'check')
      ? 'code+declared'
      : 'declared'
    : 'code';
  return { status, inputs, cites, basis };
}

/**
 * How much an open item matters: the item's own weight when the catalogue
 * sets one, otherwise the highest weight among the checks that did NOT pass
 * (a passing secrets check must not make a data-protection gap critical).
 */
function weightOf(item, inputs = []) {
  if (item.weight) return item.weight;
  const order = ['low', 'medium', 'high', 'critical'];
  let w = 'medium';
  for (const i of inputs) {
    if (i.kind !== 'check' || i.state === PASS || i.state === 'na') continue;
    const sw = SIGNALS.find((s) => s.id === i.id)?.weight;
    if (sw && order.indexOf(sw) > order.indexOf(w)) w = sw;
  }
  return w;
}

/** Whether a catalogue applies, and why not when it doesn't. */
export function applicability(catalogue, facts) {
  if (catalogue.applies === 'ai' && facts.ai_use === 'no')
    return { applies: false, why: 'No AI or machine learning in use (declared or found in the code)' };
  return { applies: true, why: null };
}

/**
 * Rate a catalogue's items.
 * @param {object} catalogue normalised catalogue
 * @param {object} evidence gatherEvidence output
 * @param {object} facts effective facts
 * @param {{level?: number|string}} [options] e.g. ASVS level, SWAL
 */
export function rateCatalogue(catalogue, evidence, facts, options = {}) {
  const { applies, why } = applicability(catalogue, facts);
  const level = options.level ?? catalogue.defaultLevel ?? null;
  return catalogue.items.map((item) => {
    const base = {
      id: item.id,
      standard: catalogue.id,
      group: item.group,
      groupName: item.groupName,
      title: item.title,
    };
    if (!applies) return { ...base, status: 'NA', out: true, outWhy: why };
    if (item.out) return { ...base, status: null, out: true, outWhy: item.outWhy || 'Out of scope' };
    if (level != null && item.levels && !item.levels.includes(String(level)))
      return { ...base, status: null, out: true, outWhy: `Not required at ${catalogue.levelName || 'level'} ${level}` };
    let r = rateItem(item, evidence, facts);
    // An accepted AI rating fills an item rules could not rate (never
    // overrides a rule-based rating); it stays marked as AI-rated.
    const ai = options.ai?.get?.(`${catalogue.id}|${item.id}`);
    if (!r.status && r.status !== 'NA' && ai)
      r = { ...r, status: ai.status, basis: 'ai', unrated: null, cites: ai.cites, aiWhy: ai.why };
    const weight = weightOf(item, r.inputs);
    return {
      ...base,
      status: r.status,
      basis: r.basis,
      unrated: r.unrated || null,
      sev: severityFor(r.status, weight, catalogue.scale),
      weight,
      inputs: r.inputs,
      cites: r.cites,
      aiWhy: r.aiWhy || null,
      fix: item.fix || null,
    };
  });
}

/**
 * Roll a standard up: readiness (C 1, L 0.75, P 0.4, N 0, over rated
 * items), counts, open and must-fix items, and the verdict.
 */
export function rollupStandard(catalogue, items) {
  const scope = items.filter((i) => !i.out);
  const counts = { C: 0, L: 0, P: 0, N: 0, NA: 0 };
  let score = 0;
  let scored = 0;
  let unrated = 0;
  let blocking = 0;
  const unratedWhy = { facts: 0, reviewer: 0 };
  for (const i of scope) {
    if (!i.status) {
      unrated += 1;
      if (i.unrated) unratedWhy[i.unrated] += 1;
      continue;
    }
    counts[i.status] += 1;
    if (i.status in SCORE) {
      score += SCORE[i.status];
      scored += 1;
    }
    if (isBlocking(i)) blocking += 1;
  }
  const claim = catalogue.claim || [
    `${catalogue.short} not met`,
    `${catalogue.short} met with conditions`,
    `${catalogue.short} met`,
  ];
  let state;
  let verdict;
  if (!scope.length || (scope.length && counts.NA === scope.length)) {
    state = 'na';
    verdict = items[0]?.outWhy ? `Not applicable: ${items[0].outWhy}` : 'Not applicable';
  } else if (counts.N || blocking) {
    state = 'blocked';
    verdict = claim[0];
  } else if (unrated) {
    state = 'incomplete';
    verdict = `Incomplete · ${scope.length - unrated} of ${scope.length} rated`;
  } else if (counts.P) {
    state = 'conditions';
    verdict = claim[1];
  } else {
    state = 'ok';
    verdict = claim[2];
  }
  return {
    standard: catalogue.id,
    name: catalogue.name,
    short: catalogue.short,
    readiness: scored ? score / scored : 0,
    rated: scored,
    scope: scope.length,
    counts,
    open: counts.P + counts.N,
    blocking,
    unrated,
    unratedWhy,
    state,
    verdict,
  };
}

/**
 * Assess a codebase against the chosen standards.
 * @param {{evidence: object, facts: object, catalogues: object[], levels?: Record<string, number|string>, aiRatings?: object[]}} input
 */
export function assess({ evidence, facts = {}, catalogues, levels = {}, aiRatings = [] }) {
  const eff = effectiveFacts(facts, evidence);
  const ai = new Map(aiRatings.map((a) => [`${a.standard}|${a.id}`, a]));
  const standards = catalogues.map((c) => {
    const items = rateCatalogue(c, evidence, eff, { level: levels[c.id], ai });
    return { catalogue: c, items, rollup: rollupStandard(c, items) };
  });
  const all = standards.flatMap((s) => s.items);
  const blocking = all.filter((i) => !i.out && isBlocking(i)).length;
  return {
    facts: eff,
    standards: standards.map((s) => ({ ...s.rollup, items: s.items, scale: s.catalogue.scale, level: levels[s.catalogue.id] ?? s.catalogue.defaultLevel ?? null })),
    summary: {
      standards: standards.length,
      items: all.filter((i) => !i.out).length,
      open: all.filter((i) => !i.out && (i.status === 'P' || i.status === 'N')).length,
      blocking,
      unrated: all.filter((i) => !i.out && !i.status).length,
      headline: headlineFor(standards.map((s) => s.rollup)),
    },
  };
}

/** One plain-English line for the whole assessment. */
export function headlineFor(rollups) {
  const live = rollups.filter((r) => r.state !== 'na');
  if (!live.length) return 'Nothing to assess: no selected standard applies';
  const must = live.reduce((n, r) => n + r.blocking, 0);
  if (live.every((r) => r.state === 'ok')) return `Cleared on all ${live.length} standards`;
  if (must)
    return `Not ready: ${must} must-fix item${must === 1 ? '' : 's'} across ${live.filter((r) => r.blocking).length} standard${live.filter((r) => r.blocking).length === 1 ? '' : 's'}`;
  if (live.some((r) => r.state === 'blocked')) return 'Not ready: non-compliant items remain';
  if (live.some((r) => r.state === 'incomplete'))
    return 'No must-fix items found so far; some items still need facts or a reviewer';
  return 'Nearly there: no must-fix items; conditions apply';
}
