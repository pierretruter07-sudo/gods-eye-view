import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installRenderGovernor,
  holdContinuousRender,
  holdRenderCadence,
  releaseContinuousRender,
  governorRequestRender,
  getRenderGovernorDiagnostics,
  _resetRenderGovernorForTest,
} from './renderGovernor.js';

function makeViewer() {
  const calls = { requestRender: 0 };
  const scene = {
    requestRenderMode: false,
    maximumRenderTimeChange: 0,
    requestRender() { calls.requestRender += 1; },
  };
  return { viewer: { scene }, scene, calls };
}

beforeEach(() => _resetRenderGovernorForTest());

test('install with zero holds enters idle mode and pins maximumRenderTimeChange', () => {
  const { viewer, scene } = makeViewer();
  installRenderGovernor(viewer);
  assert.equal(scene.requestRenderMode, true);
  assert.equal(scene.maximumRenderTimeChange, Infinity);
  assert.equal(getRenderGovernorDiagnostics().mode, 'idle');
});

test('a hold flips to continuous; releasing the last hold returns to idle with a settling frame', () => {
  const { viewer, scene, calls } = makeViewer();
  installRenderGovernor(viewer);
  const settleBaseline = calls.requestRender;
  holdContinuousRender('flights');
  assert.equal(scene.requestRenderMode, false);
  assert.equal(getRenderGovernorDiagnostics().mode, 'continuous');
  releaseContinuousRender('flights');
  assert.equal(scene.requestRenderMode, true);
  // Entering idle renders one settling frame.
  assert.equal(calls.requestRender, settleBaseline + 1);
});

test('holds are identity-keyed: double-hold cannot leak, double-release cannot corrupt', () => {
  const { viewer, scene } = makeViewer();
  installRenderGovernor(viewer);
  holdContinuousRender('traffic');
  holdContinuousRender('traffic');
  releaseContinuousRender('traffic');
  assert.equal(scene.requestRenderMode, true, 'single release clears an idempotent double-hold');
  releaseContinuousRender('traffic');
  releaseContinuousRender('never-held');
  assert.equal(scene.requestRenderMode, true);
});

test('mode stays continuous until the LAST holder releases', () => {
  const { viewer, scene } = makeViewer();
  installRenderGovernor(viewer);
  holdContinuousRender('flights');
  holdContinuousRender('satellites');
  releaseContinuousRender('flights');
  assert.equal(scene.requestRenderMode, false);
  assert.deepEqual(getRenderGovernorDiagnostics().holds, ['satellites']);
  releaseContinuousRender('satellites');
  assert.equal(scene.requestRenderMode, true);
});

test('governorRequestRender forwards to the scene and records reasons only in idle mode', () => {
  const { viewer, calls } = makeViewer();
  installRenderGovernor(viewer);
  const baseline = calls.requestRender;
  governorRequestRender('layer-tick:earthquakes');
  assert.equal(calls.requestRender, baseline + 1);
  assert.equal(getRenderGovernorDiagnostics().recentRequests.at(-1).reason, 'layer-tick:earthquakes');
  holdContinuousRender('flights');
  const idleRequests = getRenderGovernorDiagnostics().recentRequests.length;
  governorRequestRender('slider');
  assert.equal(
    getRenderGovernorDiagnostics().recentRequests.length,
    idleRequests,
    'continuous-mode requests are not recorded as idle diagnostics',
  );
});

test('hold/release/request are safe no-ops before install (test environments without a viewer)', () => {
  holdContinuousRender('flights');
  releaseContinuousRender('flights');
  governorRequestRender('noop');
  assert.equal(getRenderGovernorDiagnostics().installed, false);
});

test('holds registered before install apply at install time', () => {
  holdContinuousRender('flights');
  const { viewer, scene } = makeViewer();
  installRenderGovernor(viewer);
  assert.equal(scene.requestRenderMode, false, 'pre-install hold keeps continuous mode');
  releaseContinuousRender('flights');
  assert.equal(scene.requestRenderMode, true);
});

test('a cadence hold keeps render-on-demand and requests frames at the fastest cadence', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { viewer, scene, calls } = makeViewer();
  installRenderGovernor(viewer);
  holdRenderCadence('ais-vessels', 160);
  holdRenderCadence('flights', 80);
  assert.equal(scene.requestRenderMode, true);
  const d = getRenderGovernorDiagnostics();
  assert.equal(d.mode, 'cadence');
  assert.equal(d.cadenceMs, 80);
  const before = calls.requestRender;
  t.mock.timers.tick(800);
  assert.equal(calls.requestRender - before, 10);
  // A continuous hold takes over; the cadence timer stops.
  holdContinuousRender('tracked-entity');
  assert.equal(scene.requestRenderMode, false);
  assert.equal(getRenderGovernorDiagnostics().cadenceMs, 0);
  releaseContinuousRender('tracked-entity');
  assert.equal(getRenderGovernorDiagnostics().cadenceMs, 80);
  // Releasing the owners ends the cadence.
  releaseContinuousRender('flights');
  assert.equal(getRenderGovernorDiagnostics().cadenceMs, 160);
  releaseContinuousRender('ais-vessels');
  assert.equal(getRenderGovernorDiagnostics().mode, 'idle');
  const idle = calls.requestRender;
  t.mock.timers.tick(1000);
  assert.equal(calls.requestRender, idle);
});
