import test from 'node:test';
import assert from 'node:assert/strict';
import { tileCacheBudget } from './google3d.js';

test('the 3D tile cache is sized to the device memory', () => {
  const mb = 1024 * 1024;
  assert.equal(tileCacheBudget(2).cacheBytes, 384 * mb);
  assert.equal(tileCacheBudget(4).cacheBytes, 384 * mb);
  assert.equal(tileCacheBudget(6).cacheBytes, 768 * mb);
  assert.equal(tileCacheBudget(8).cacheBytes, 1024 * mb);
  assert.equal(tileCacheBudget(undefined).cacheBytes, 1024 * mb);
  assert.ok(tileCacheBudget(8).maximumCacheOverflowBytes < 1024 * mb);
});

test('Google tiles may load many requests in parallel (HTTP/2), so warm-up and the view share', async () => {
  const {
    allowParallelGoogleTiles,
    GOOGLE_TILE_HOST,
    GOOGLE_TILE_MAX_REQUESTS,
  } = await import('./google3d.js');
  const RequestScheduler = {
    requestsByServer: { 'other:443': 6 },
    maximumRequests: 50,
  };
  allowParallelGoogleTiles({ RequestScheduler });
  assert.equal(
    RequestScheduler.requestsByServer[GOOGLE_TILE_HOST],
    GOOGLE_TILE_MAX_REQUESTS,
  );
  assert.equal(RequestScheduler.requestsByServer['other:443'], 6);
  assert.ok(RequestScheduler.maximumRequests >= GOOGLE_TILE_MAX_REQUESTS);
});
