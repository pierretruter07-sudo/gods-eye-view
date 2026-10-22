import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOW_END_START_LEVEL,
  START_LEVEL,
  qualityLevels,
  startLevel,
} from '../shell/qualityPolicy.js';
import {
  TILESET_STARTUP_TIMEOUT_MS,
  withinStartupBudget,
} from '../maps/google3d.js';
import { sheetDrawer } from '../intel/markup.js';
import { PAGE_HEADERS } from '../../build/vite.js';

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('low-end devices start without bloom at native resolution', () => {
  assert.equal(
    startLevel({ deviceMemory: 8, hardwareConcurrency: 8 }),
    START_LEVEL,
  );
  assert.equal(
    startLevel({}),
    START_LEVEL,
    'unknown hardware starts as before',
  );
  assert.equal(
    startLevel({ deviceMemory: 4, hardwareConcurrency: 8 }),
    LOW_END_START_LEVEL,
  );
  assert.equal(
    startLevel({ deviceMemory: 8, hardwareConcurrency: 4 }),
    LOW_END_START_LEVEL,
  );
  const levels = qualityLevels(2);
  assert.equal(levels[LOW_END_START_LEVEL].effects, false);
  assert.equal(levels[LOW_END_START_LEVEL].ratio, 2, 'still native');
});

test('a tileset route that never answers is skipped after the budget, and a late tileset is destroyed', async () => {
  assert.equal(TILESET_STARTUP_TIMEOUT_MS, 15_000);
  let resolveLate;
  const pending = new Promise((resolve) => {
    resolveLate = resolve;
  });
  await assert.rejects(
    withinStartupBudget(pending, 'google-direct', 20),
    /google-direct: no tileset/,
  );
  let destroyed = false;
  resolveLate({ isDestroyed: () => false, destroy: () => (destroyed = true) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(destroyed, true);
  const quick = { id: 'tiles' };
  assert.equal(
    await withinStartupBudget(Promise.resolve(quick), 'x', 1000),
    quick,
  );
});

test('sheet tabs follow the ARIA tabs pattern', () => {
  const html = sheetDrawer({
    identity: {
      type: 'Aircraft',
      keyLabel: 'ICAO',
      keyValue: '7c1234',
      title: 'QFA12',
      rid: 'r',
    },
    lineage: [],
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'route', label: 'Route' },
    ],
    active: 'route',
    sheet: null,
  });
  assert.match(html, /role="tablist" aria-label="Sheets"/);
  assert.match(
    html,
    /id="gev-sheet-tab-overview" aria-controls="gev-sheet-panel" aria-selected="false" tabindex="-1"/,
  );
  assert.match(
    html,
    /id="gev-sheet-tab-route" aria-controls="gev-sheet-panel" aria-selected="true" tabindex="0"/,
  );
  assert.match(
    html,
    /role="tabpanel" id="gev-sheet-panel" aria-labelledby="gev-sheet-tab-route"/,
  );
  const index = read('src/intel/index.js');
  assert.match(index, /ArrowRight: at \+ 1/, 'arrow keys move between tabs');
  assert.match(
    index,
    /if \(!triage\.contains\(document\.activeElement\)\) renderTriage\(\)/,
    'no rebuild under focus',
  );
});

test('the welcome dialog traps focus and the Director announces with roles', () => {
  const welcome = read('src/shell/welcome.js');
  assert.match(welcome, /node\.inert = true/);
  assert.match(welcome, /event\.key === 'Escape'/);
  assert.doesNotMatch(
    welcome,
    /aria-live/,
    'the counter is not announced every second',
  );
  const ui = read('src/tour/ui.js');
  assert.match(ui, /role: 'status'/);
  assert.match(ui, /role: 'alert'/);
});

test('server errors reach the client as fixed strings', () => {
  const places = read('server/providers/places/google.js');
  assert.doesNotMatch(places, /error: error\?\.message/);
  assert.doesNotMatch(places, /: data\.error\?\.message \|\|/);
  const ais = read('server/providers/vessels/ais-live.js');
  assert.match(ais, /error: 'AIS live stream unavailable'/);
});

test('page headers carry a CSP that cannot break Cesium, on the preview server too', () => {
  const csp = PAGE_HEADERS['Content-Security-Policy'];
  for (const directive of [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ])
    assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(
    csp,
    /script-src|worker-src|connect-src/,
    'no directive that could block tiles or workers',
  );
  assert.match(read('build/vite.js'), /preview: \{ headers: PAGE_HEADERS \}/);
});

test('models are pre-warmed with prefetch hints, and dead styles are gone', () => {
  const shell = read('src/shell/index.js');
  assert.match(shell, /link\.rel = 'prefetch'/);
  assert.doesNotMatch(shell, /\.then\(\(r\) => r\.arrayBuffer\(\)\)/);
  const css = read('src/ui/styles/shell.css') + read('src/ui/styles/brand.css');
  for (const dead of [
    '.gev-chip',
    '.gev-seg button',
    '@keyframes gev-blink',
    '.gev-dot--',
  ])
    assert.ok(!css.includes(dead), dead);
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /npm audit --omit=dev/);
  assert.match(ci, /scripts\/preview-smoke\.mjs/);
});
