#!/usr/bin/env node
/**
 * Director stop-load benchmark.
 *
 * Opens the app (Director starts immediately with ?nointro), follows the real
 * tour for N stops and measures, per stop:
 *   - flyMs            camera flight time (depart → arrive)
 *   - tilesReadyMs     arrive → globe (and 3D tileset) fully loaded
 *   - flightsFresh     a flights refresh had completed BEFORE arrival
 *   - flightsReadyMs   arrive → first flights refresh completed after departure
 * and over the whole run: frame-time percentiles, long tasks (main-thread
 * blocking ≥ 50 ms), request counts by host, and the active map stack.
 *
 * Usage:
 *   node scripts/bench/director-stops.mjs --url http://localhost:23999/?nointro \
 *     [--stops 6] [--chromium /path/to/chrome] [--out bench.json]
 * Needs `puppeteer` or `puppeteer-core` resolvable (not a project dependency).
 * Headless software rendering makes absolute FPS pessimistic; compare runs
 * on the same machine, before vs after a change.
 */
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg('url', 'http://localhost:4173/?nointro');
const STOPS = Number(arg('stops', 6));
const OUT = arg('out', null);
const CHROMIUM = arg('chromium', process.env.CHROMIUM_PATH || undefined);
const TIMEOUT_MS = Number(arg('timeout', 240000));

async function loadPuppeteer() {
  for (const name of ['puppeteer', 'puppeteer-core']) {
    try {
      return (await import(name)).default;
    } catch {
      /* try the next */
    }
  }
  throw new Error('Install puppeteer or puppeteer-core to run this benchmark');
}

/** Runs inside the page before any app code. */
function instrument() {
  const b = (window.__bench = { frames: [], longTasks: [], events: [], stops: [], t0: performance.now() });
  let last = performance.now();
  const tick = (t) => {
    b.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) b.longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* unsupported */
  }
  const flights = () => {
    const all = window.__godsEyeView?.dataManager?.getAll?.() || [];
    const f = all.find((x) => x.id === 'flights');
    return { count: f?.stats?.count ?? 0, lastUpdate: f?.stats?.lastUpdate ?? 0 };
  };
  const tilesLoaded = () => {
    const g = window.__godsEyeView;
    const scene = g?.viewer?.scene;
    if (!scene) return false;
    const globeOk = !scene.globe?.show || scene.globe.tilesLoaded;
    const ts = g.tileset;
    const tilesetOk = !ts || !ts.show || ts.tilesLoaded;
    return globeOk && tilesetOk;
  };
  let open = null;
  window.addEventListener('gev:tour', (event) => {
    const d = event.detail || {};
    b.events.push(d);
    if (d.phase === 'depart') {
      open = { kind: d.layerId || 'view', rangeM: d.rangeM, departAt: d.at, departWall: Date.now() };
    } else if (d.phase === 'arrive' && open) {
      const stop = open;
      open = null;
      stop.flyMs = Math.round(d.at - stop.departAt);
      const f = flights();
      stop.flightsFresh = f.lastUpdate >= stop.departWall;
      stop.aircraftAtArrival = f.count;
      const arriveAt = performance.now();
      const poll = setInterval(() => {
        const dt = performance.now() - arriveAt;
        if (stop.tilesReadyMs == null && tilesLoaded()) stop.tilesReadyMs = Math.round(dt);
        if (stop.flightsReadyMs == null && flights().lastUpdate >= stop.departWall) stop.flightsReadyMs = stop.flightsFresh ? 0 : Math.round(dt);
        if ((stop.tilesReadyMs != null && stop.flightsReadyMs != null) || dt > 20000) {
          clearInterval(poll);
          stop.tilesReadyMs ??= null;
          stop.flightsReadyMs ??= null;
        }
      }, 100);
      b.stops.push(stop);
    }
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return +sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(1);
}

const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const consoleErrors = new Map();
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const key = m.text().replace(/\d{2,}/g, '#').slice(0, 140);
    consoleErrors.set(key, (consoleErrors.get(key) || 0) + 1);
  });
  page.on('pageerror', (e) => consoleErrors.set(`PAGE: ${e.message}`.slice(0, 140), 1));
  await page.evaluateOnNewDocument(instrument);
  const started = Date.now();
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction((n) => (window.__bench?.stops?.length || 0) >= n + 1, { timeout: TIMEOUT_MS, polling: 500 }, STOPS);
  await new Promise((r) => setTimeout(r, 3000)); // let the last stop's poll finish
  const result = await page.evaluate(() => {
    const b = window.__bench;
    const g = window.__godsEyeView;
    const scene = g?.viewer?.scene;
    const hosts = {};
    for (const e of performance.getEntriesByType('resource')) {
      let host = 'other';
      try {
        host = new URL(e.name).host;
      } catch {
        /* keep other */
      }
      hosts[host] = (hosts[host] || 0) + 1;
    }
    return {
      build: g?.build,
      mapStack: {
        tileset: Boolean(g?.tileset),
        globeShown: scene?.globe?.show ?? null,
        terrain: scene?.terrainProvider?.constructor?.name ?? null,
        imagery: scene?.imageryLayers?.get?.(0)?.imageryProvider?.constructor?.name ?? null,
      },
      frames: b.frames.slice(30),
      longTasks: b.longTasks,
      stops: b.stops.slice(1), // the first stop starts before instrumentation settles
      hosts,
    };
  });
  const frames = result.frames.slice().sort((a, z) => a - z);
  const summary = {
    url: URL_,
    build: result.build,
    durationS: Math.round((Date.now() - started) / 1000),
    mapStack: result.mapStack,
    frameMs: { p50: percentile(frames, 50), p95: percentile(frames, 95), p99: percentile(frames, 99), max: percentile(frames, 100) },
    fpsMedian: frames.length ? +(1000 / percentile(frames, 50)).toFixed(1) : null,
    longTasks: { count: result.longTasks.length, totalMs: result.longTasks.reduce((a, b) => a + b, 0), max: Math.max(0, ...result.longTasks) },
    stops: result.stops,
    medians: {
      tilesReadyMs: median(result.stops.map((s) => s.tilesReadyMs)),
      flightsReadyMs: median(result.stops.map((s) => s.flightsReadyMs)),
      flightsFreshAtArrival: `${result.stops.filter((s) => s.flightsFresh).length}/${result.stops.length}`,
    },
    requestsByHost: Object.fromEntries(Object.entries(result.hosts).sort((a, z) => z[1] - a[1]).slice(0, 12)),
    consoleErrors: Object.fromEntries(consoleErrors),
  };
  const json = JSON.stringify(summary, null, 2);
  if (OUT) writeFileSync(OUT, json);
  console.log(json);
} finally {
  await browser.close();
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, z) => a - z);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}
