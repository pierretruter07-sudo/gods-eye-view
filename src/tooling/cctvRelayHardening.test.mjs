import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCctvMediaUpstream,
  isRelayableMediaType,
  proxyMediaResponse,
} from '../../server/providers/cctv/media.js';
import { CCTV_CAMERA_ID_MAX } from '../../server/providers/cctv.js';

function fakeRes() {
  const out = { status: 0, headers: null, body: '', ended: false };
  return {
    out,
    writableEnded: false,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers;
    },
    end(body) {
      out.body = body ? String(body) : '';
      out.ended = true;
      this.writableEnded = true;
    },
    on() {},
    once() {},
  };
}
function fakeUpstream(status, headers, body = '') {
  const map = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => map.get(k.toLowerCase()) ?? null },
    body: null,
    arrayBuffer: async () => Buffer.from(body),
  };
}

test('only media types are relayed', () => {
  assert.equal(isRelayableMediaType('image/jpeg'), true);
  assert.equal(isRelayableMediaType('video/mp4; codecs=avc1'), true);
  assert.equal(isRelayableMediaType('application/vnd.apple.mpegurl'), true);
  assert.equal(
    isRelayableMediaType('multipart/x-mixed-replace; boundary=f'),
    true,
  );
  assert.equal(isRelayableMediaType('text/html; charset=utf-8'), false);
  assert.equal(isRelayableMediaType('image/svg+xml'), false);
  assert.equal(isRelayableMediaType('application/javascript'), false);
  assert.equal(isRelayableMediaType(''), false);
});

test('an HTML upstream is answered with 502 and never piped', async () => {
  const res = fakeRes();
  await proxyMediaResponse(
    res,
    fakeUpstream(200, { 'content-type': 'text/html' }, '<script>1</script>'),
  );
  assert.equal(res.out.status, 502);
  assert.equal(res.out.headers['X-Content-Type-Options'], 'nosniff');
  assert.doesNotMatch(res.out.body, /<script>/);
});

test('relayed media carries nosniff', async () => {
  const res = fakeRes();
  await proxyMediaResponse(
    res,
    fakeUpstream(200, { 'content-type': 'image/jpeg' }, 'jpegbytes'),
  );
  assert.equal(res.out.status, 200);
  assert.equal(res.out.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.out.headers['Content-Type'], 'image/jpeg');
});

test('the media relay refuses a redirect off the camera host', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    return {
      status: 302,
      headers: {
        get: (k) => (k === 'location' ? 'http://169.254.169.254/latest' : null),
      },
      body: { cancel: async () => {} },
    };
  };
  await assert.rejects(
    fetchCctvMediaUpstream('https://cams.example.gov/cam1.mjpg', { fetchImpl }),
    /registered host/,
  );
  assert.equal(calls[0].redirect, 'manual');
});

test('camera IDs are bounded', () => {
  assert.equal(CCTV_CAMERA_ID_MAX, 64);
});

import {
  capMap,
  makeFanOutRateLimiter,
} from '../../server/providers/common/rate-limit.js';
import { CELESTRAK_GROUPS } from '../../server/providers/space/celestrak.js';

test('fan-out proxies share a bounded per-client limiter', () => {
  const allow = makeFanOutRateLimiter(3);
  assert.deepEqual(
    [allow('a'), allow('a'), allow('a'), allow('a')],
    [true, true, true, false],
  );
  assert.equal(allow('b'), true);
});

test('capMap drops the oldest entries first', () => {
  const m = new Map([
    ['one', 1],
    ['two', 2],
    ['three', 3],
  ]);
  capMap(m, 2);
  assert.deepEqual([...m.keys()], ['two', 'three']);
});

test('CelesTrak groups are the ones the satellite layer uses', () => {
  for (const g of [
    'stations',
    'visual',
    'gps-ops',
    'glo-ops',
    'galileo',
    'geo',
    'starlink',
  ])
    assert.ok(CELESTRAK_GROUPS.has(g), g);
  assert.equal(CELESTRAK_GROUPS.has('cosmos-2251-debris'), false);
});
