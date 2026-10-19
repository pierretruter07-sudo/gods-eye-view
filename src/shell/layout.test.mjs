import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYERS,
  OVERLAYS,
  OWNER_PRIORITY,
  ZONES,
  reservedSpace,
  resolveOwners,
} from './layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STYLES = path.join(here, '..', 'ui', 'styles');

/** Selectors of every rule that declares position: fixed. */
function fixedSelectors(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(clean); m; m = rule.exec(clean)) {
    if (!/position\s*:\s*fixed/.test(m[2])) continue;
    for (const sel of m[1].split(',')) {
      const s = sel.trim().replace(/\s+/g, ' ');
      if (s && !s.startsWith('@')) out.push(s);
    }
  }
  return out;
}

test('every fixed overlay in the style sheets is on the screen map', () => {
  const known = new Set(OVERLAYS.map((o) => o.selector));
  const missing = [];
  for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8');
    for (const sel of fixedSelectors(css))
      if (!known.has(sel)) missing.push(`${file}: ${sel}`);
  }
  assert.deepEqual(missing, [], 'add these to OVERLAYS in src/shell/layout.js');
  for (const o of OVERLAYS) {
    assert.ok(ZONES[o.zone], `${o.selector}: unknown zone ${o.zone}`);
    assert.ok(LAYERS[o.layer] != null, `${o.selector}: unknown layer ${o.layer}`);
  }
});

test('the viewer’s own panels win a column; the asset cards give way to anything', () => {
  assert.deepEqual(resolveOwners({ hud: true }), { left: 'cards', right: 'cards' });
  // The descent checklist is a band under the top bar, never a column
  // owner: the asset cards keep the left column while it runs.
  assert.deepEqual(resolveOwners({ hud: true, descent: true, sheets: true }), {
    left: 'cards',
    right: 'sheets',
  });
  assert.equal(resolveOwners({ hud: true, layers: true }).left, 'layers');
  assert.equal(resolveOwners({ alert: true, sheets: true }).right, 'sheets');
  assert.deepEqual(resolveOwners({}), { left: '', right: '' });
  assert.equal(OWNER_PRIORITY.left.at(-1), 'cards');
  assert.equal(OWNER_PRIORITY.right.at(-1), 'cards');
});

test('the descent band pushes the asset view down instead of hiding cards', () => {
  const plain = reservedSpace({ barBottom: 64 });
  const banded = reservedSpace({ barBottom: 64, bandH: 38 });
  assert.equal(banded.top - plain.top, 48);
  assert.equal(banded.bottom, plain.bottom);
});

test('the bottom reserve stacks credits, then caption, so neither covers the other', () => {
  const s = reservedSpace({ barBottom: 64, creditsH: 26, captionH: 50 });
  assert.equal(s.top, 74);
  assert.equal(s.credits, 34);
  assert.equal(s.caption, 60);
  assert.equal(s.bottom, 8 + 34 + 60 + 10);
  // No caption: the asset view reaches down to just above the credits.
  assert.equal(reservedSpace({ barBottom: 64, creditsH: 26 }).bottom, 8 + 34 + 10);
});

test('stacking layers are strictly ordered from the globe to modals', () => {
  const order = ['world', 'credits', 'stage', 'panel', 'drawer', 'chrome', 'toast', 'modal'];
  const values = order.map((k) => LAYERS[k]);
  for (let i = 1; i < values.length; i += 1) assert.ok(values[i] > values[i - 1], order[i]);
});
