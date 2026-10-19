import test from 'node:test';
import assert from 'node:assert/strict';
import { WELCOME_SECONDS, WELCOME_TILES } from './welcome.js';

test('the welcome card shows the five key components for 30 s', () => {
  assert.equal(WELCOME_SECONDS, 30);
  assert.deepEqual(
    WELCOME_TILES.map((t) => t.title),
    ['Live data', 'Orbit to street', 'Every asset, in depth', 'AI Director', 'Real-time alerts'],
  );
  for (const t of WELCOME_TILES) {
    assert.ok(t.text.split(' ').length <= 12, `${t.title}: one short sentence`);
    assert.ok(t.art.length > 0);
  }
});
