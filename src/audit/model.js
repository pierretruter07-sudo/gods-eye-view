/**
 * @file AUDIT view model: ring layout and layer logic behind the AUDIT view.
 * The verdict rules and scoring live in CrossCheck's engine
 * (crosscheck/engine/scoring.js) and are re-exported here. Pure functions (no DOM, no three.js, no Cesium) so they run
 * under node:test and match CrossCheck's own verdict rules exactly.
 *
 * Coordinates are "orbit-local": y is north (the Earth's axis), z points at
 * the viewer's longitude, x points east. One unit is one Earth radius.
 * cameraMath.js maps orbit-local to Earth-fixed (ECEF) coordinates.
 * @module audit/model
 */

import { LENSES, isBlocking } from '../../crosscheck/engine/scoring.js';

export {
  STATUS_NAME,
  SEC_STATUS_NAME,
  AI_STATUS_NAME,
  statusNames,
  SEVERITY_NAME,
  LENSES,
  LENS_NAME,
  LENS_REF,
  severityOf,
  isBlocking,
  rollup,
  headline,
  themesFor,
  lensIds,
  linkedIds,
  mustFix,
  pct,
} from '../../crosscheck/engine/scoring.js';

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
