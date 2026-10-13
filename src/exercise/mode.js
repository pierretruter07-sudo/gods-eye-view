import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import { getScenario } from './scenario.js';
import { generatePackage } from './package.js';
import { createExerciseOverlay } from './overlay.js';
import { createPackagePanel } from './panel.js';

/**
 * Exercise mode controller. Disconnects the live layers, lays the fictional
 * theatre over the real globe, and drives the strike-package panel. Nothing
 * here reads a live feed. The launch cinematic is plugged in via `onLaunch`.
 */
export function createExerciseMode({ viewer, dataManager, liveLayerIds, onLaunch, onBanner }) {
  let overlay = null;
  let panel = null;
  let active = false;
  let restore = [];
  let currentPackage = null;
  const scenario = getScenario();

  function flyTo({ lat, lon, rangeM, pitchDeg }) {
    interruptCameraMotion('exercise');
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 0),
      {
        offset: new Cesium.HeadingPitchRange(
          viewer.camera.heading,
          Cesium.Math.toRadians(pitchDeg),
          rangeM,
        ),
        duration: 3,
      },
    );
  }

  async function disconnectLive() {
    restore = [];
    for (const id of liveLayerIds) {
      try {
        if (dataManager.isEnabled(id)) {
          restore.push(id);
          await dataManager.setEnabled(id, false);
        }
      } catch (error) {
        console.warn(`[exercise] could not disconnect ${id}`, error);
      }
    }
  }

  async function reconnectLive() {
    for (const id of restore) {
      try {
        await dataManager.setEnabled(id, true);
      } catch (error) {
        console.warn(`[exercise] could not reconnect ${id}`, error);
      }
    }
    restore = [];
  }

  async function enter() {
    if (active) return;
    active = true;
    onBanner?.(true);
    overlay = createExerciseOverlay(viewer);
    panel = createPackagePanel({
      onLaunch: (pkg) => onLaunch?.({ scenario, package: pkg, viewer, flyTo }),
      onClose: () => panel.hide(),
    });
    await disconnectLive();
    overlay.show(scenario);
    flyTo(scenario.overview);
  }

  function generate() {
    if (!active) return null;
    currentPackage = generatePackage(scenario);
    panel.show(currentPackage);
    flyTo({ ...scenario.target, rangeM: 120_000, pitchDeg: -45 });
    return currentPackage;
  }

  async function exit() {
    if (!active) return;
    active = false;
    onBanner?.(false);
    panel?.hide();
    overlay?.clear();
    await reconnectLive();
  }

  function destroy() {
    overlay?.destroy();
    panel?.destroy();
    overlay = null;
    panel = null;
  }

  return {
    enter,
    exit,
    generate,
    destroy,
    isActive: () => active,
    scenario,
    getPackage: () => currentPackage,
  };
}
