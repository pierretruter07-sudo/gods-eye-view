import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS,
  clampFrame,
  dragFrame,
  easeFrame,
  turnBetween,
  wheelFrame,
} from './focusCamera.js';
import { NAV_HELP } from './navHelp.js';

const f = { headingDeg: 10, pitchDeg: -30, rangeM: 1000 };

test('focused: a left drag orbits the asset, the tilt stays between overhead and the horizon', () => {
  const right = dragFrame(f, 100, 0);
  assert.equal(right.headingDeg, 40, 'drag right turns the view right');
  assert.equal(right.rangeM, 1000, 'orbiting never changes the distance');
  assert.equal(dragFrame(f, 0, -1000).pitchDeg, FOCUS.maxPitchDeg);
  assert.equal(dragFrame(f, 0, 1000).pitchDeg, FOCUS.minPitchDeg);
  assert.equal(clampFrame({ ...f, headingDeg: -90 }).headingDeg, 270);
});

test('focused: the wheel moves closer or further, within limits', () => {
  assert.ok(wheelFrame(f, -100).rangeM < 1000);
  assert.ok(wheelFrame(f, 100).rangeM > 1000);
  assert.equal(wheelFrame(f, -1e6).rangeM, FOCUS.minRangeM);
  assert.equal(wheelFrame(f, 1e6).rangeM, FOCUS.maxRangeM);
});

test('the camera eases onto the framing, the short way round, never overshooting', () => {
  assert.equal(turnBetween(350, 10), 20);
  assert.equal(turnBetween(10, 350), -20);
  const want = { headingDeg: 20, pitchDeg: -60, rangeM: 100 };
  const step = easeFrame(
    { headingDeg: 350, pitchDeg: -30, rangeM: 1000 },
    want,
    0.1,
  );
  assert.ok(step.headingDeg > 350 && step.headingDeg < 380);
  assert.ok(step.pitchDeg < -30 && step.pitchDeg > -60);
  assert.ok(step.rangeM < 1000 && step.rangeM > 100);
  let now = { headingDeg: 350, pitchDeg: -30, rangeM: 1000 };
  for (let i = 0; i < 200; i += 1) now = easeFrame(now, want, 0.05);
  assert.ok(Math.abs(turnBetween(now.headingDeg, 20)) < 0.01);
  assert.ok(Math.abs(now.rangeM - 100) < 0.1);
});

test('the controls panel says how to move, focus and get back', () => {
  const rows = NAV_HELP.flatMap((g) => g.rows.map(([k]) => k));
  for (const key of ['Left drag', 'Right drag', 'Wheel', 'F', 'Esc', 'N', 'H'])
    assert.ok(rows.includes(key), key);
});
