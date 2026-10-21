/**
 * @file The real Sun: one light for the whole scene, placed where the Sun is
 * right now (wall clock), with real-time shadows on the 3D city.
 *
 * - The scene light (3D models, the sky, the haze) comes from the Sun's true
 *   direction, refreshed every few seconds, so the sky turns dusky at sunset
 *   and dark at night over the place the camera is looking at.
 * - Buildings and terrain in the Google 3D city cast shadows for the time of
 *   day. Shadows are only drawn where they show and are affordable: a close
 *   view (below 20 km), the Sun above the horizon there, and the quality
 *   ladder at one of its top rungs (`setAllowed`). `?shadows=0` turns them
 *   off.
 * - The Google tiles are photographs with the light of the day they were
 *   captured baked in, so the real-time shadows are kept soft and fairly
 *   light rather than black.
 *
 * The viewer's clock is left alone (aircraft motion runs on it), so the Sun's
 * position here is computed from the wall clock (visuals/dayNight.js), the
 * same as the day/night line.
 * @module visuals/sun
 */
import { DAY_NIGHT, sunDirectionEcef } from './dayNight.js';

export const SUN = Object.freeze({
  /** Light strength, as Cesium's own SunLight. */
  intensity: 2.0,
  /** How often the Sun's direction is recomputed (it moves 0.25° a minute). */
  sunEveryMs: 10_000,
  /** How often shadows are switched on or off. */
  checkEveryMs: 1_000,
  /** Shadows only for views closer than this (camera height, metres). */
  shadowMaxHeightM: 20_000,
  /** ...and only while the Sun is at least this high there (degrees). */
  shadowMinSunDeg: 2,
  /** How far from the camera shadows are drawn (metres). */
  shadowDistanceM: 4_000,
  /** Shadow map size (texels per side). */
  shadowSize: 2048,
  /** 0 draws shadows black, 1 hides them; tiles already hold some shade. */
  shadowDarkness: 0.42,
  /**
   * Depth bias for 3D-tile shadows. Cesium's default (2e-5) suits detailed
   * models; on the wide, normal-less Google tile meshes it leaves moiré
   * rings ("shadow acne") on flat ground (harness, 21 Oct).
   */
  shadowDepthBias: 3e-4,
  /** Hide Cesium's Sun disc once the viewer's clock is this far behind. */
  sunDiscMaxDriftMs: 12 * 60_000,
});

const RAD = Math.PI / 180;

/** The Sun's elevation (degrees) at a place, from its Earth-fixed direction. */
export function sunElevationDeg(sun, latDeg, lonDeg) {
  const la = latDeg * RAD;
  const lo = lonDeg * RAD;
  const up = [
    Math.cos(la) * Math.cos(lo),
    Math.cos(la) * Math.sin(lo),
    Math.sin(la),
  ];
  const s = up[0] * sun.x + up[1] * sun.y + up[2] * sun.z;
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/** Whether shadows should be drawn now. */
export function wantShadows(
  { heightM, sunDeg, allowed = true, enabled = true },
  rules = SUN,
) {
  return (
    Boolean(enabled && allowed) &&
    Number.isFinite(heightM) &&
    heightM <= rules.shadowMaxHeightM &&
    Number.isFinite(sunDeg) &&
    sunDeg >= rules.shadowMinSunDeg
  );
}

/**
 * Shadow depth bias for a Sun elevation: a grazing Sun needs more, as the
 * ground is nearly edge-on to it (up to 7× the base at the horizon).
 */
export function shadowBias(sunDeg, rules = SUN) {
  const t = Math.min(1, Math.max(0, (sunDeg - 2) / 18));
  return rules.shadowDepthBias * (1 + 6 * (1 - t) * (1 - t));
}

/**
 * The light's colour for a Sun elevation: white by day, warmer as the Sun
 * gets low (golden hour), never fully orange.
 * @returns {{red: number, green: number, blue: number}}
 */
export function sunColor(sunDeg) {
  const t = Math.min(1, Math.max(0, (sunDeg - 1) / 14));
  const warm = 1 - t * t * (3 - 2 * t);
  return { red: 1, green: 1 - 0.18 * warm, blue: 1 - 0.36 * warm };
}

/**
 * Install the Sun.
 * @param {{viewer: object, Cesium: object, shadows?: boolean,
 *   now?: () => Date, rules?: typeof SUN}} options
 */
export function createSun({
  viewer,
  Cesium,
  shadows = true,
  now = () => new Date(),
  rules = SUN,
}) {
  const scene = viewer.scene;
  const globe = scene.globe;
  const before = {
    light: scene.light,
    sunShow: scene.sun?.show,
    lighting: globe && {
      enableLighting: globe.enableLighting,
      dynamicAtmosphereLighting: globe.dynamicAtmosphereLighting,
      dynamicAtmosphereLightingFromSun: globe.dynamicAtmosphereLightingFromSun,
    },
  };
  const light = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(-1, 0, 0),
    intensity: rules.intensity,
  });
  scene.light = light;
  // The sky, haze and (keyless map) globe follow the scene light: the sky
  // darkens over the night side and the globe has a real night side.
  // Cesium only lights the sky when globe lighting is on, even with the
  // globe hidden under the Google tiles.
  if (globe) {
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = false;
  }
  /**
   * The keyless map's own globe, when shown, is lit only below the
   * planet-scale day/night layer: lit from orbit, its tile seams showed as
   * dark arcs (harness, 21 Oct), and up there the day/night layer already
   * draws the night side.
   */
  function lightGlobe(heightM) {
    if (!globe) return;
    const on =
      !globe.show ||
      !Number.isFinite(heightM) ||
      heightM < DAY_NIGHT.fadeStartM;
    if (globe.enableLighting !== on) globe.enableLighting = on;
  }
  const map = scene.shadowMap;
  if (map) {
    map.softShadows = true;
    map.size = rules.shadowSize;
    map.maximumDistance = rules.shadowDistanceM;
    map.darkness = rules.shadowDarkness;
    map.fadingEnabled = true;
  }
  /** Not public API: guarded, and harmless if a Cesium release renames it. */
  function setBias(sunDeg) {
    const bias = map?._primitiveBias;
    if (bias && typeof bias === 'object')
      bias.depthBias = shadowBias(sunDeg, rules);
  }

  let enabled = shadows;
  let allowed = true;
  let sun = sunDirectionEcef(now());
  let sunAt = 0;
  let checkAt = 0;
  let last = { heightM: NaN, sunDeg: NaN, shadows: false };

  function aim(t) {
    sun = sunDirectionEcef(now());
    sunAt = t;
    Cesium.Cartesian3.fromElements(-sun.x, -sun.y, -sun.z, light.direction);
  }
  aim(0);

  function setShadows(on) {
    if (viewer.shadows === on) return;
    try {
      viewer.shadows = on;
    } catch (error) {
      console.warn('[visuals] shadows unavailable', error);
    }
    scene.requestRender?.();
  }

  function update() {
    const t = Date.now();
    if (t - sunAt >= rules.sunEveryMs) aim(t);
    if (t - checkAt < rules.checkEveryMs) return;
    checkAt = t;
    const c = scene.camera.positionCartographic;
    const heightM = c?.height;
    const sunDeg = c
      ? sunElevationDeg(sun, c.latitude / RAD, c.longitude / RAD)
      : NaN;
    lightGlobe(heightM);
    const colour = sunColor(Number.isFinite(sunDeg) ? sunDeg : 90);
    light.color = new Cesium.Color(colour.red, colour.green, colour.blue, 1);
    const on = wantShadows({ heightM, sunDeg, allowed, enabled }, rules);
    if (on) setBias(sunDeg);
    setShadows(on);
    // Cesium draws its Sun disc from the viewer's clock, which does not
    // run; hide the disc once it has drifted from the real Sun.
    if (scene.sun) {
      const clockMs = Cesium.JulianDate.toDate(
        viewer.clock.currentTime,
      ).getTime();
      scene.sun.show =
        before.sunShow !== false &&
        Math.abs(now().getTime() - clockMs) <= rules.sunDiscMaxDriftMs;
    }
    last = { heightM, sunDeg, shadows: on };
  }
  const removeHook = scene.preRender.addEventListener(update);

  return {
    /** The shadows switch (URL flag, diagnostics). */
    setEnabled(value) {
      enabled = Boolean(value);
      checkAt = 0;
      scene.requestRender?.();
    },
    enabled: () => enabled,
    /** The quality ladder's say: false on its lower rungs. */
    setAllowed(value) {
      allowed = Boolean(value);
      checkAt = 0;
      if (!allowed) setShadows(false);
    },
    /** The Sun's Earth-fixed unit direction. */
    direction: () => sun,
    state: () => ({
      enabled,
      allowed,
      shadows: last.shadows,
      sunElevationDeg: Number.isFinite(last.sunDeg)
        ? Math.round(last.sunDeg * 10) / 10
        : null,
      cameraHeightM: Number.isFinite(last.heightM)
        ? Math.round(last.heightM)
        : null,
    }),
    destroy() {
      removeHook();
      setShadows(false);
      scene.light = before.light;
      if (scene.sun && before.sunShow !== undefined)
        scene.sun.show = before.sunShow;
      if (globe && before.lighting) Object.assign(globe, before.lighting);
    },
  };
}
