/**
 * @file CrossCheck audit model: the rules, layout and layer logic behind the
 * AUDIT view. Pure functions (no DOM, no three.js, no Cesium) so they run
 * under node:test and match CrossCheck's own verdict rules exactly.
 *
 * Coordinates are "orbit-local": y is north (the Earth's axis), z points at
 * the viewer's longitude, x points east. One unit is one Earth radius.
 * cameraMath.js maps orbit-local to Earth-fixed (ECEF) coordinates.
 * @module audit/model
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

/** Ring geometry, in Earth radii (the design's proportions). */
export const RINGS = Object.freeze({
  saf: Object.freeze({
    radius: 3.73,
    base: 0,
    lift: 0.47,
    size: 0.057,
    gap: 2.4,
    start: Math.PI * 0.62,
  }),
  sec: Object.freeze({
    radius: 6.53,
    base: -0.4,
    lift: 0.6,
    size: 0.05,
    gap: 5,
    start: Math.PI * 0.3,
    anchor: 'V8.2.1',
  }),
  ai: Object.freeze({
    radius: 9.2,
    base: -0.8,
    lift: 0.7,
    size: 0.06,
    gap: 3,
    start: Math.PI * 0.45,
  }),
});

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

/** Layers in the order the cockpit lists them; `on` is the first-load state. */
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'mustfix', name: 'Must fix', on: true }),
  Object.freeze({ id: 'fixed', name: 'Fixed since baseline', on: true }),
  Object.freeze({ id: 'gaps', name: 'Other gaps', on: false }),
  Object.freeze({ id: 'links', name: 'Links', on: false }),
  Object.freeze({ id: 'passing', name: 'Passing', on: false }),
  Object.freeze({ id: 'na', name: 'Not applicable', on: false }),
  Object.freeze({ id: 'labels', name: 'Labels', on: false }),
]);
/** Opacity of a layer that is switched off but still shown as context. */
export const FADED = 0.15;

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

/**
 * Lay every item out on its ring in orbit-local coordinates.
 * Groups (process areas, ASVS chapters) are separated by `gap` empty slots.
 * @returns {{nodes: object[], groups: object[]}}
 */
export function layout(items) {
  const nodes = [];
  const groups = [];
  for (const lens of LENSES) {
    const ring = RINGS[lens];
    const list = items.filter((i) => i.lens === lens);
    const runs = [];
    for (const item of list) {
      const last = runs[runs.length - 1];
      if (!last || last.key !== item.group)
        runs.push({ key: item.group, name: item.groupName, items: [item] });
      else last.items.push(item);
    }
    const total = list.length + runs.length * ring.gap;
    const step = (Math.PI * 2) / total;
    let start = ring.start;
    if (ring.anchor) {
      let k = 0;
      for (const run of runs) {
        k += ring.gap / 2;
        for (const item of run.items) {
          if (item.id === ring.anchor) start = ring.start - k * step;
          k++;
        }
        k += ring.gap / 2;
      }
    }
    let slot = 0;
    for (const run of runs) {
      slot += ring.gap / 2;
      const a0 = start + slot * step;
      for (const item of run.items) {
        const angle = start + slot * step;
        slot++;
        const blocking = isBlocking(item);
        nodes.push({
          id: item.id,
          lens,
          item,
          angle,
          blocking,
          kind: nodeKind(item),
          base: [
            Math.cos(angle) * ring.radius,
            ring.base,
            Math.sin(angle) * ring.radius,
          ],
          position: [
            Math.cos(angle) * ring.radius,
            ring.base + (blocking ? ring.lift : 0),
            Math.sin(angle) * ring.radius,
          ],
          size: ring.size,
        });
      }
      const a1 = start + (slot - 1) * step;
      groups.push({
        lens,
        key: run.key,
        name: run.name,
        from: a0,
        to: a1,
        count: run.items.length,
        label: [
          Math.cos((a0 + a1) / 2) * (ring.radius + 0.45),
          ring.base,
          Math.sin((a0 + a1) / 2) * (ring.radius + 0.45),
        ],
      });
      slot += ring.gap / 2;
    }
  }
  return { nodes, groups };
}

/** Which layer a node belongs to. */
export function nodeKind(item) {
  if (item.fixed) return 'fixed';
  if (isBlocking(item)) return 'mustfix';
  if (item.status === 'P' || item.status === 'N') return 'gaps';
  if (item.status === 'C' || item.status === 'L') return 'passing';
  if (!item.status && !item.out) return 'gaps';
  return 'na';
}

/**
 * Opacity of a node: full when its layer is on, faded when off.
 * A selected node and its linked nodes are always shown.
 */
export function nodeOpacity(
  node,
  layers,
  { selected = null, linked = new Set() } = {},
) {
  if (node.id === selected || linked.has(node.id)) return 1;
  const on = layers[node.kind];
  if (node.kind === 'na') return on ? 0.75 : FADED * 0.6;
  return on ? 1 : FADED;
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
