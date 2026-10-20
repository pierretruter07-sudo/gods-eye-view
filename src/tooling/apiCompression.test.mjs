import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createApiCompression, createGzipCache } from '../../server/providers/common/compress.js';

async function serve(handler) {
  const mw = createApiCompression();
  const srv = http.createServer((req, res) => mw(req, res, () => handler(req, res)));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const get = (url, encoding) =>
  new Promise((resolve, reject) => {
    http
      .get(url, { headers: encoding ? { 'Accept-Encoding': encoding } : {} }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });

test('large /api JSON is gzipped for clients that accept it; small, non-JSON and errors are not', async () => {
  const big = JSON.stringify({ states: Array.from({ length: 2000 }, (_, i) => ['abc' + i, 1.5, 2.5]) });
  const { base, close } = await serve((req, res) => {
    if (req.url === '/api/big') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(big)) });
      return res.end(big);
    }
    if (req.url === '/api/small') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"ok":true}');
    }
    if (req.url === '/api/error') {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(big);
    }
    if (req.url === '/api/implicit') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(big);
    }
    if (req.url === '/api/text') {
      res.setHeader('Content-Type', 'text/plain');
      return res.end('x'.repeat(10_000));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(big);
  });
  try {
    const gz = await get(base + '/api/big', 'gzip, deflate, br');
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.match(gz.headers.vary, /Accept-Encoding/);
    assert.ok(gz.body.length < Buffer.byteLength(big) / 3, `${gz.body.length} bytes`);
    assert.equal(gunzipSync(gz.body).toString(), big);
    const plain = await get(base + '/api/big');
    assert.equal(plain.headers['content-encoding'], undefined, 'no gzip unless asked');
    assert.equal(plain.body.toString(), big);
    const implicit = await get(base + '/api/implicit', 'gzip');
    assert.equal(implicit.headers['content-encoding'], 'gzip', 'headers set with setHeader');
    assert.equal(gunzipSync(implicit.body).toString(), big);
    assert.equal((await get(base + '/api/small', 'gzip')).headers['content-encoding'], undefined);
    assert.equal((await get(base + '/api/error', 'gzip')).headers['content-encoding'], undefined);
    assert.equal((await get(base + '/api/text', 'gzip')).headers['content-encoding'], undefined);
    assert.equal((await get(base + '/not-api', 'gzip')).headers['content-encoding'], undefined);
  } finally {
    close();
  }
});

test('the same cached body is compressed once', () => {
  const gzip = createGzipCache();
  const body = JSON.stringify({ a: 'x'.repeat(5000) });
  assert.equal(gzip(body), gzip(body));
});

test('the plugin hooks return nothing, so Vite never runs connect as a post hook', () => {
  return import('../../server/providers/common/compress.js').then(({ apiCompressionPlugin }) => {
    const plugin = apiCompressionPlugin();
    const server = { middlewares: { use: () => function connectApp() {} } };
    assert.equal(plugin.configureServer(server), undefined);
    assert.equal(plugin.configurePreviewServer(server), undefined);
  });
});
