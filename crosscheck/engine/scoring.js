/**
 * @file CrossCheck scoring engine: status and severity names, the verdict
 * rules and the readiness roll-up for each standard (lens). Pure functions
 * with no imports, so the engine runs anywhere (node, the browser, the
 * standalone CrossCheck app) and every score is computed one way: the AUDIT
 * view in God's Eye View, the CrossCheck page and record_audit.py all use it.
 * @module crosscheck/engine/scoring
 */

export const STATUS_NAME = Object.freeze({
  C: 'Compliant',
  L: 'Largely',
  P: 'Partial',
  N: 'Non-compliant',
  NA: 'Not applicable',
});
export const SEC_STATUS_NAME = Object.freeze({
  C: 'Pass',
  L: 'Pass with note',
  P: 'Partial',
  N: 'Fail',
  NA: 'Not applicable',
});
export const AI_STATUS_NAME = Object.freeze({
  C: 'Conforms',
  L: 'Largely',
  P: 'Partial',
  N: 'Nonconformity',
  NA: 'Excluded',
});
/** Status names for an item's ring. */
export function statusNames(lens) {
  return lens === 'sec'
    ? SEC_STATUS_NAME
    : lens === 'ai'
      ? AI_STATUS_NAME
      : STATUS_NAME;
}
export const SEVERITY_NAME = Object.freeze({
  S1: 'S1',
  S2: 'S2',
  S3: 'S3',
  S4: 'S4',
  SC: 'Critical',
  SH: 'High',
  SM: 'Medium',
  SL: 'Low',
});
const SCORE = { C: 1, L: 0.75, P: 0.4, N: 0 };
const LENS_ORDER = { sec: 0, saf: 1, ai: 2 };
const RANK = { S1: 0, SC: 0, S2: 1, SH: 1, S3: 2, SM: 2, S4: 3, SL: 3 };

/** The lenses (rings), innermost first, and how the cockpit names them. */
export const LENSES = Object.freeze(['saf', 'sec', 'ai']);
export const LENS_NAME = Object.freeze({
  saf: 'Safety',
  sec: 'Security',
  ai: 'AI management',
});
export const LENS_REF = Object.freeze({
  saf: 'ED-153',
  sec: 'OWASP ASVS',
  ai: 'ISO/IEC 42001',
});

/** The finding severity CrossCheck uses when none was recorded. */
export function severityOf(item) {
  if (item.status !== 'P' && item.status !== 'N') return null;
  if (item.sev) return item.sev;
  if (item.lens !== 'saf') return item.status === 'N' ? 'SH' : 'SM';
  return item.status === 'N' ? 'S2' : 'S3';
}

/** A must-fix item blocks a claim: S1–S2 for safety, Critical–High otherwise. */
export function isBlocking(item) {
  const sev = severityOf(item);
  return sev != null && RANK[sev] <= 1;
}

function isApplicable(item) {
  return ['R', 'I', 'R (I?)'].includes(item.applicability);
}

/**
 * Roll up one lens with CrossCheck's rules.
 * @returns {{readiness:number, counts:object, open:number, blocking:number, unrated:number, verdict:string, state:string}}
 */
export function rollup(items, lens, { swal = 3, asvsLevel = 2 } = {}) {
  const scope = items.filter(
    (i) => i.lens === lens && (lens === 'saf' ? isApplicable(i) : !i.out),
  );
  const claim = {
    saf: [
      `SWAL ${swal} claim not supported`,
      'Supported with conditions',
      `SWAL ${swal} claim supported`,
    ],
    sec: [
      `ASVS L${asvsLevel} not met`,
      `L${asvsLevel} met with conditions`,
      `ASVS L${asvsLevel} met`,
    ],
    ai: ['ISO 42001 not met', 'ISO 42001 met with conditions', 'ISO 42001 met'],
  }[lens];
  const counts = { C: 0, L: 0, P: 0, N: 0, NA: 0 };
  let score = 0;
  let scored = 0;
  let unrated = 0;
  let blocking = 0;
  for (const i of scope) {
    if (!i.status) {
      unrated++;
      continue;
    }
    counts[i.status]++;
    if (i.status in SCORE) {
      score += SCORE[i.status];
      scored++;
    }
    if (isBlocking(i)) blocking++;
  }
  const open = counts.P + counts.N;
  let verdict;
  let state;
  if (counts.N || blocking) {
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
    readiness: scored ? score / scored : 0,
    counts,
    scope: scope.length,
    open,
    blocking,
    unrated,
    verdict,
    state,
  };
}

/**
 * One plain-English status line for the whole item.
 * @param {...object} lenses rollups, one per ring (missing rings are skipped)
 */
export function headline(...lenses) {
  const all = lenses.filter(Boolean);
  const n = all.reduce((sum, r) => sum + r.blocking, 0);
  if (all.every((r) => r.state === 'ok'))
    return `Cleared: claim supported on all ${all.length} standards`;
  if (n === 0) return 'Nearly there: no must-fix items left; conditions apply';
  return `Not cleared yet: ${n} item${n === 1 ? '' : 's'} block a safe, secure and accountable claim`;
}

/** The themes (shared evidence) an item takes part in. */
export function themesFor(themes, id) {
  return themes.filter((t) => lensIds(t).includes(id));
}

/** Every item id a theme names, on all rings. */
export function lensIds(theme) {
  return LENSES.flatMap((lens) => theme[lens] || []);
}

/** Items linked to `id` through any shared theme (excluding itself). */
export function linkedIds(themes, id) {
  const out = new Set();
  for (const t of themesFor(themes, id))
    for (const other of lensIds(t)) if (other !== id) out.add(other);
  return out;
}

/** Must-fix items, most severe first; on ties security, then safety, then AI. */
export function mustFix(items) {
  return items
    .filter(isBlocking)
    .sort(
      (a, b) =>
        RANK[severityOf(a)] - RANK[severityOf(b)] ||
        LENS_ORDER[a.lens] - LENS_ORDER[b.lens],
    );
}

/** Readiness as a whole percentage. */
export function pct(x) {
  return `${Math.round(x * 100)}%`;
}
