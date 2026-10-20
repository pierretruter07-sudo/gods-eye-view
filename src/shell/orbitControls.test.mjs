import test from 'node:test';
import assert from 'node:assert/strict';
import { ORBIT, metresPerPixel, radiansPerPixel, wheelStep } from './orbitControls.js';

const FOV = (60 * Math.PI) / 180;

test('a drag turns the globe so the ground follows the cursor, at any height', () => {
  // Close in, one screen of drag crosses about one screen of ground.
  const h = 10_000;
  const groundAcrossScreen = 2 * h * Math.tan(FOV / 2);
  const rad = radiansPerPixel(h, FOV, 800) * 800;
  assert.ok(Math.abs(rad * 6_371_000 - groundAcrossScreen) < 1, 'ground follows the cursor');
  // From far away a full-screen drag turns the globe about half way round, no more.
  assert.ok(radiansPerPixel(40_000_000, FOV, 800) * 800 <= Math.PI * 1.1 + 1e-9);
  // Closer means slower.
  assert.ok(radiansPerPixel(1_000, FOV, 800) < radiansPerPixel(100_000, FOV, 800));
  assert.ok(Math.abs(metresPerPixel(h, FOV, 800) * 800 - groundAcrossScreen) < 1e-6);
});

test('the wheel zooms by a share of the height, never through the 3D city or out past the limit', () => {
  // Scrolling up (negative deltaY) zooms in, as on a map.
  const inStep = wheelStep(-100, 10_000, 0);
  assert.ok(inStep > 1000 && inStep < 3000, `one notch in: ${inStep} m`);
  assert.ok(wheelStep(100, 10_000, 0) < 0, 'scrolling down zooms out');
  // Never below the floor (roofs + margin).
  assert.equal(wheelStep(-2000, 500, 450), 50);
  assert.equal(wheelStep(-100, 450, 450), 0);
  // Never beyond the far limit.
  assert.equal(wheelStep(5000, ORBIT.maxHeightM - 10, 0), -10);
  assert.equal(wheelStep(0, 10_000, 0), 0);
});
