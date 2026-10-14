import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheControlFor,
  deferInjectedScripts,
  staticCachePlugin,
} from '../../build/cacheHeaders.js';

test('hashed assets are cached for a year, the page always revalidates, APIs are left alone', () => {
  assert.equal(
    cacheControlFor('/assets/index-3f9a.js'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(cacheControlFor('/cesium/Cesium.js'), 'public, max-age=3600');
  assert.match(cacheControlFor('/models/a320.glb'), /max-age=86400/);
  assert.equal(cacheControlFor('/'), 'no-cache');
  assert.equal(cacheControlFor('/index.html'), 'no-cache');
  assert.equal(cacheControlFor('/api/flights'), null);
  assert.equal(cacheControlFor('/logo.svg'), null);
});

test('the preview middleware sets the policy before files are served', () => {
  let use;
  staticCachePlugin().configurePreviewServer({
    middlewares: { use: (fn) => (use = fn) },
  });
  const headers = {};
  let called = false;
  use(
    { url: '/assets/a-1.js?v=1' },
    { setHeader: (k, v) => (headers[k] = v) },
    () => (called = true),
  );
  assert.equal(headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.ok(called);
});

test('injected classic scripts are deferred; module scripts and other tags are untouched', async () => {
  const plugin = deferInjectedScripts({
    name: 'fixture',
    transformIndexHtml: () => [
      { tag: 'script', attrs: { src: '/cesium/Cesium.js' } },
      { tag: 'script', attrs: { type: 'module', src: '/x.js' } },
      { tag: 'link', attrs: { rel: 'stylesheet', href: '/a.css' } },
    ],
  });
  const tags = await plugin.transformIndexHtml('');
  assert.equal(tags[0].attrs.defer, true);
  assert.equal(tags[1].attrs.defer, undefined);
  assert.equal(tags[2].attrs.defer, undefined);
  const object = deferInjectedScripts({
    name: 'fixture2',
    transformIndexHtml: {
      order: 'pre',
      handler: () => ({
        html: '',
        tags: [{ tag: 'script', attrs: { src: '/c.js' } }],
      }),
    },
  });
  assert.equal(object.transformIndexHtml.order, 'pre');
  const out = await object.transformIndexHtml.handler('');
  assert.equal(out.tags[0].attrs.defer, true);
});
