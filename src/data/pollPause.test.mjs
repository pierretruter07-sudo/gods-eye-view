import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerLifecycle } from './lifecycle.js';

test('paused polling skips periodic updates and catches up once on resume', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const manager = new LayerLifecycle(null);
  const runs = [];
  manager._runPeriodicUpdate = async (id) => runs.push(id);
  const entry = { module: { refreshInterval: 1000 }, enabled: true };
  manager.layers.set('flights', entry);
  manager._armUpdateLoop('flights', entry);
  t.mock.timers.tick(1000);
  assert.deepEqual(runs, ['flights']);
  manager.pausePolling('hidden');
  manager.pausePolling('audit');
  t.mock.timers.tick(3000);
  assert.equal(runs.length, 1);
  manager.resumePolling('hidden');
  assert.equal(runs.length, 1, 'still paused by AUDIT');
  assert.deepEqual(manager.pollingPausedFor(), ['audit']);
  manager.resumePolling('audit');
  assert.equal(runs.length, 2, 'one catch-up poll');
  t.mock.timers.tick(1000);
  assert.equal(runs.length, 3);
  clearInterval(entry.intervalId);
});
