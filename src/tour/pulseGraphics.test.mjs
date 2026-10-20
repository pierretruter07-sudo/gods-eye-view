import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_PULSE, pulseFrame } from './pulseGraphics.js';

test('the alert is one sphere that starts fully opaque and fades to nothing as it grows', () => {
  const start = pulseFrame(0);
  assert.equal(start.alpha, 1);
  assert.equal(start.sizePx, ALERT_PULSE.fromPx);
  let lastSize = 0;
  let lastAlpha = 2;
  for (let t = 0; t < ALERT_PULSE.periodS - 0.01; t += 0.1) {
    const f = pulseFrame(t);
    assert.ok(f.sizePx >= lastSize, 'it only grows');
    assert.ok(f.alpha <= lastAlpha, 'it only fades');
    lastSize = f.sizePx;
    lastAlpha = f.alpha;
  }
  const end = pulseFrame(ALERT_PULSE.periodS - 0.001);
  assert.ok(end.alpha < 0.001, 'gone by full size');
  assert.ok(Math.abs(end.sizePx - ALERT_PULSE.toPx) < 1);
  // Then it starts again.
  assert.equal(pulseFrame(ALERT_PULSE.periodS).alpha, 1);
});
