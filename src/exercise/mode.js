import * as Cesium from 'cesium';
import { interruptCameraMotion } from '../cameraVerbs.js';
import { getScenario } from './scenario.js';
import { generatePackage } from './package.js';
import { createExerciseOverlay } from './overlay.js';
import { createPackagePanel } from './panel.js';
import { createSwarmCinematic } from './swarm.js';
import { createNarrator } from '../tour/narrator.js';

/**
 * Exercise mode controller. Disconnects the live layers, lays the fictional
 * theatre over the real globe, drives the strike-package panel, and plays the
 * launch cinematic. Nothing here reads a live feed.
 */
export function createExerciseMode({ viewer, dataManager, liveLayerIds, onBanner, onCaption }) {
  let overlay = null;
  let panel = null;
  let swarm = null;
  let active = false;
  let launching = false;
  let restore = [];
  let currentPackage = null;
  const scenario = getScenario();
  const narrator = createNarrator();

  function flyTo({ lat, lon, rangeM, pitchDeg, duration = 3 }) {
    interruptCameraMotion('exercise');
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 0),
      {
        offset: new Cesium.HeadingPitchRange(
          viewer.camera.heading,
          Cesium.Math.toRadians(pitchDeg),
          rangeM,
        ),
        duration,
      },
    );
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** A point `de` m east and `dn` m north of (lat,lon). */
  function offsetGeo(lat, lon, de, dn) {
    const dLat = dn / 111_320;
    const dLon = de / (111_320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lon: lon + dLon };
  }

  /** Project a spread of points around the target to canvas pixels. */
  function targetAnchors() {
    const t = scenario.target;
    const offsets = [
      [0, 0], [380, 220], [-320, 160], [220, -260], [-260, -200],
      [460, -40], [-460, 60], [140, 340], [-160, -340],
    ];
    const anchors = [];
    for (const [de, dn] of offsets) {
      const p = offsetGeo(t.lat, t.lon, de, dn);
      const world = Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
      const win = viewer.scene.cartesianToCanvasCoordinates(world);
      if (win && Number.isFinite(win.x) && Number.isFinite(win.y)) {
        anchors.push({ x: win.x, y: win.y });
      }
    }
    return anchors;
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
    swarm = createSwarmCinematic({ viewer });
    panel = createPackagePanel({
      onLaunch: () => launch(),
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

  async function launch() {
    if (!active || launching) return;
    if (!currentPackage) generate();
    launching = true;
    const t = scenario.target;
    panel?.hide();
    // Dive to a dramatic oblique framing of the fictional airfield and settle.
    flyTo({ lat: t.lat, lon: t.lon, rangeM: 5000, pitchDeg: -28, duration: 3.5 });
    onCaption?.(`Exercise. Simulated strike: ${currentPackage.name} on ${t.name}.`);
    narrator.speak(`Exercise. Simulated strike. ${currentPackage.name} inbound on ${t.name}.`);
    await wait(3800);
    if (!launching) return;
    const anchors = targetAnchors();
    try {
      await swarm.play({ anchors, durationMs: 16_000 });
    } catch (error) {
      console.warn('[exercise] cinematic error', error);
    }
    if (!launching) return;
    launching = false;
    onCaption?.('Exercise complete. Simulated battle-damage assessment underway.');
    narrator.speak('Exercise complete. This was a simulated engagement.');
    if (currentPackage) panel?.show(currentPackage);
  }

  function cancelLaunch() {
    if (!launching) return;
    launching = false;
    swarm?.stop();
    narrator.stop();
    onCaption?.(null);
  }

  async function exit() {
    if (!active) return;
    active = false;
    cancelLaunch();
    onBanner?.(false);
    onCaption?.(null);
    panel?.hide();
    overlay?.clear();
    await reconnectLive();
  }

  function destroy() {
    cancelLaunch();
    overlay?.destroy();
    panel?.destroy();
    swarm?.destroy();
    overlay = null;
    panel = null;
    swarm = null;
  }

  return {
    enter,
    exit,
    generate,
    launch,
    cancelLaunch,
    destroy,
    isActive: () => active,
    isLaunching: () => launching,
    scenario,
    getPackage: () => currentPackage,
  };
}
