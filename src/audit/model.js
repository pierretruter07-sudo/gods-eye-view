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
});

/** Layers in the order the cockpit lists them; `on` is the first-load state. */
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'mustfix', name: 'Must fix', on: true }),
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
  if (item.lens === 'sec') return item.status === 'N' ? 'SH' : 'SM';
  return item.status === 'N' ? 'S2' : 'S3';
}

/** A must-fix item blocks a claim: S1–S2 for safety, Critical–High for security. */
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
    (i) => i.lens === lens && (lens === 'sec' ? !i.out : isApplicable(i)),
  );
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
    verdict =
      lens === 'saf'
        ? `SWAL ${swal} claim not supported`
        : `ASVS L${asvsLevel} not met`;
  } else if (unrated) {
    state = 'incomplete';
    verdict = `Incomplete · ${scope.length - unrated} of ${scope.length} rated`;
  } else if (counts.P) {
    state = 'conditions';
    verdict =
      lens === 'saf'
        ? 'Supported with conditions'
        : `L${asvsLevel} met with conditions`;
  } else {
    state = 'ok';
    verdict =
      lens === 'saf'
        ? `SWAL ${swal} claim supported`
        : `ASVS L${asvsLevel} met`;
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

/** One plain-English status line for the whole item. */
export function headline(saf, sec) {
  const n = saf.blocking + sec.blocking;
  if (saf.state === 'ok' && sec.state === 'ok')
    return 'Cleared: safe-and-secure claim supported on both standards';
  if (n === 0) return 'Nearly there: no must-fix items left; conditions apply';
  return `Not cleared yet: ${n} item${n === 1 ? '' : 's'} block a safe-and-secure claim`;
}

/**
 * Lay every item out on its ring in orbit-local coordinates.
 * Groups (process areas, ASVS chapters) are separated by `gap` empty slots.
 * @returns {{nodes: object[], groups: object[]}}
 */
export function layout(items) {
  const nodes = [];
  const groups = [];
  for (const lens of ['saf', 'sec']) {
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
  return themes.filter((t) => t.saf.includes(id) || t.sec.includes(id));
}

/** Items linked to `id` through any shared theme (excluding itself). */
export function linkedIds(themes, id) {
  const out = new Set();
  for (const t of themesFor(themes, id))
    for (const other of [...t.saf, ...t.sec]) if (other !== id) out.add(other);
  return out;
}

/** Must-fix items, most severe first, security before safety on ties. */
export function mustFix(items) {
  return items
    .filter(isBlocking)
    .sort(
      (a, b) =>
        RANK[severityOf(a)] - RANK[severityOf(b)] ||
        (a.lens === b.lens ? 0 : a.lens === 'sec' ? -1 : 1),
    );
}

/** Readiness as a whole percentage. */
export function pct(x) {
  return `${Math.round(x * 100)}%`;
}
