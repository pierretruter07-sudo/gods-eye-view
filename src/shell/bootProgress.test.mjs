import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOT_CEILING, BOOT_CREEP, advance, stageFor } from './bootProgress.js';

test('each boot status line maps to a rising share of the bar', () => {
  const lines = ['Configuring viewer...', 'Loading Google 3D Tiles...', 'Initializing systems...', 'Loading planet...'];
  const shares = lines.map(stageFor);
  assert.deepEqual(shares, [12, 30, 58, 78]);
  assert.equal(stageFor('Loading the keyless globe...'), 30);
  assert.equal(stageFor('Google 3D Tiles unavailable (401). Loading the keyless globe...'), 42);
  assert.equal(stageFor('Something else'), null);
  assert.equal(stageFor(undefined), null);
});

test('the bar eases to the stage, creeps a little, never passes the ceiling and never goes back', () => {
  let v = 0;
  for (let i = 0; i < 60; i++) v = advance(v, 30, 50);   // 3 s at 20 fps towards 30
  assert.ok(v > 28 && v <= 30 + BOOT_CREEP, `eased to ${v}`);
  const before = v;
  for (let i = 0; i < 400; i++) v = advance(v, 30, 50);  // 20 s waiting on the same stage
  assert.ok(v >= before, 'never backwards');
  assert.ok(v <= 30 + BOOT_CREEP, `creep capped at ${v}`);
  for (let i = 0; i < 2000; i++) v = advance(v, 95, 50);
  assert.ok(v <= BOOT_CEILING, `ceiling held at ${v}`);
  assert.equal(advance(50, 10, 1000) >= 50, true);
});
