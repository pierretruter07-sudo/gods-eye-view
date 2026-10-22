import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBrowserViteConfig } from '../../build/vite.js';
import standaloneConfig, * as compatibility from '../../vite.config.js';
import * as providers from '../../server/providers/local.js';

test('explicit build inputs preserve browser-only defines, plugin order and loopback protections', () => {
  const plugin = { name: 'fixture-provider' };
  const config = createBrowserViteConfig({
    plugins: [plugin],
    googleApiKey: 'browser-fixture',
    cesiumToken: 'ion-fixture',
    buildId: 'abc1234 · 2026-10-14',
  });
  assert.equal(config.plugins[1], plugin);
  assert.equal(config.server.host, 'localhost');
  assert.equal(config.server.port, 4173);
  assert.deepEqual(config.server.allowedHosts, [
    'localhost',
    '127.0.0.1',
    '.local',
  ]);
  assert.ok(config.server.fs.deny.includes('**/ENVIRONMENT'));
  assert.ok(config.server.fs.deny.includes('.env.*'));
  assert.equal(config.server.headers['X-Frame-Options'], 'DENY');
  assert.equal(
    config.server.headers['Content-Security-Policy'],
    "frame-ancestors 'none'",
  );
  assert.equal(config.server.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(
    config.server.headers['Referrer-Policy'],
    'strict-origin-when-cross-origin',
  );
  assert.deepEqual(config.define, {
    'import.meta.env.GOOGLE_MAPS_API_KEY': '"browser-fixture"',
    'import.meta.env.CESIUM_ION_TOKEN': '"ion-fixture"',
    'import.meta.env.GEV_BUILD': '"abc1234 · 2026-10-14"',
  });
  assert.equal(
    createBrowserViteConfig({ host: '0.0.0.0', port: '4800' }).server
      .allowedHosts,
    true,
  );
  assert.equal(
    createBrowserViteConfig({ host: '::', port: '4800' }).server.port,
    4800,
  );
  const input = config.build.rollupOptions.input;
  assert.ok(input.main.endsWith('index.html'));
  assert.deepEqual(Object.keys(input), ['main']);
});

test('build helper does not discover environment values or construct local providers', () => {
  const before = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'environment-fixture';
  try {
    const config = createBrowserViteConfig();
    assert.equal(
      config.define['import.meta.env.GOOGLE_MAPS_API_KEY'],
      undefined,
    );
    // Cesium plus the static-cache policy; no local providers.
    assert.deepEqual(
      config.plugins.slice(1).map((plugin) => plugin.name),
      ['gev-static-cache'],
    );
  } finally {
    if (before === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = before;
  }
});

test('root config retains existing named exports and standalone provider order', () => {
  for (const [name, value] of Object.entries(providers))
    assert.equal(compatibility[name], value, name);
  const config = standaloneConfig({ mode: 'test' });
  assert.deepEqual(
    config.plugins.slice(1, -2).map((plugin) => plugin.name),
    providers.localProviderPlugins().map((plugin) => plugin.name),
  );
  assert.ok(config.plugins.every((plugin) => plugin.name !== 'gev-key-setup'));
  assert.equal(config.plugins.at(-2).name, 'api-not-found');
  assert.equal(config.plugins.at(-1).name, 'gev-static-cache');
});

test('build export resolves in Node and has no browser fallback', async () => {
  const exported = await import('gods-eye-view/build/vite');
  assert.equal(exported.createBrowserViteConfig, createBrowserViteConfig);
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.deepEqual(pkg.exports['./build/vite'], { node: './build/vite.js' });
});

test('the production build drops console log/info/debug chatter but keeps warnings and errors', async () => {
  const { createBrowserViteConfig } = await import('../../build/vite.js');
  const prod = createBrowserViteConfig({ command: 'build' });
  assert.deepEqual(prod.esbuild?.pure, [
    'console.log',
    'console.info',
    'console.debug',
  ]);
  assert.ok(
    !prod.esbuild.pure.includes('console.warn') &&
      !prod.esbuild.pure.includes('console.error'),
  );
  const dev = createBrowserViteConfig({ command: 'serve' });
  assert.equal(dev.esbuild, undefined, 'the dev server keeps every log');
});
