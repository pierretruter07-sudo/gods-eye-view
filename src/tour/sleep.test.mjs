import test from 'node:test';
import assert from 'node:assert/strict';
import { sleep } from './controller.js';

test('the Director’s waits leave no abort listeners behind (long demos)', async () => {
  const controller = new AbortController();
  const signal = controller.signal;
  let added = 0;
  let removed = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...a) => (added++, add(...a));
  signal.removeEventListener = (...a) => (removed++, remove(...a));
  for (let i = 0; i < 20; i += 1) await sleep(1, signal);
  assert.equal(added, 20);
  assert.equal(removed, 20, 'each finished wait removes its listener');
  const pending = sleep(10_000, signal);
  controller.abort(new Error('stop'));
  await assert.rejects(pending, /stop/);
});
