import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePicks } from './sharePicks.js';

test('one click is picked once per frame, however many layers ask', () => {
  let picks = 0;
  const scene = { frameState: { frameNumber: 7 }, pick: () => ({ id: ++picks }) };
  sharePicks(scene);
  const at = { x: 10, y: 20 };
  const first = scene.pick(at);
  for (let i = 0; i < 8; i += 1) assert.equal(scene.pick({ x: 10, y: 20 }), first);
  assert.equal(picks, 1);
  scene.pick({ x: 11, y: 20 });
  assert.equal(picks, 2, 'another pixel is picked again');
  scene.frameState.frameNumber = 8;
  scene.pick({ x: 11, y: 20 });
  assert.equal(picks, 3, 'a new frame is picked again');
  scene.pick({ x: 11, y: 20 }, 5, 5);
  assert.equal(picks, 4, 'a different pick size is picked again');
});
