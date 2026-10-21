import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUN,
  createSun,
  shadowBias,
  sunColor,
  sunElevationDeg,
  wantShadows,
} from './sun.js';
import {
  NIGHT_SHADER,
  createNightTiles,
  nightAmount,
} from './nightTiles.js';
import { STAR_FACES, createStarfield, starFaceUrls } from './starfield.js';
import { subsolarPoint, sunDirectionEcef } from './dayNight.js';

// ── A small stand-in for the Cesium pieces these modules touch ──────────
class Cartesian3 {
  constructor(x = 0, y = 0, z = 0) {
    Object.assign(this, { x, y, z });
  }
  static fromElements(x, y, z, out = new Cartesian3()) {
    return Object.assign(out, { x, y, z });
  }
}
class Color {
  constructor(red, green, blue, alpha) {
    Object.assign(this, { red, green, blue, alpha });
  }
}
class DirectionalLight {
  constructor({ direction, intensity }) {
    this.direction = direction;
    this.intensity = intensity;
  }
}
class CustomShader {
  constructor({ uniforms, fragmentShaderText }) {
    this.uniforms = uniforms;
    this.fragmentShaderText = fragmentShaderText;
  }
  setUniform(name, value) {
    this.uniforms[name].value = value;
  }
}
class TextureUniform {
  constructor(options) {
    this.options = options;
  }
}
class SkyBox {
  constructor({ sources }) {
    this.sources = sources;
  }
  destroy() {
    this.destroyed = true;
  }
}

function fakeViewer({ lat = 40.7, lon = -74, heightM = 700 } = {}) {
  const hooks = [];
  const tileset = { isCesium3DTileset: true, isDestroyed: () => false };
  const items = [tileset, { isCesium3DTileset: false }];
  const scene = {
    light: 'cesium-sun',
    sun: { show: true },
    skyBox: 'default-sky',
    globe: {
      enableLighting: false,
      dynamicAtmosphereLighting: true,
      dynamicAtmosphereLightingFromSun: false,
    },
    shadowMap: { _primitiveBias: { depthBias: 2e-5 } },
    camera: {
      positionCartographic: {
        latitude: (lat * Math.PI) / 180,
        longitude: (lon * Math.PI) / 180,
        height: heightM,
      },
    },
    primitives: { length: items.length, get: (i) => items[i] },
    preRender: {
      addEventListener: (fn) => (hooks.push(fn), () => hooks.splice(hooks.indexOf(fn), 1)),
    },
    requestRender() {},
  };
  const viewer = {
    scene,
    shadows: false,
    clock: { currentTime: 'clock' },
  };
  return { viewer, scene, tileset, frame: () => hooks.forEach((h) => h()) };
}
const at = (iso) => () => new Date(iso);
const CesiumFor = (clockIso) => ({
  Cartesian3,
  Color,
  DirectionalLight,
  CustomShader,
  TextureUniform,
  SkyBox,
  UniformType: { VEC3: 'vec3', FLOAT: 'float', SAMPLER_2D: 'sampler2D' },
  PixelFormat: { LUMINANCE: 'luminance' },
  JulianDate: { toDate: () => new Date(clockIso) },
  Resource: { fetchImage: async ({ url }) => ({ url }) },
});

// ── The Sun ─────────────────────────────────────────────────────────────

test('the scene is lit by the real Sun: noon over the subsolar point, night on the far side', () => {
  const when = new Date(Date.UTC(2026, 9, 21, 15, 0));
  const sun = sunDirectionEcef(when);
  const p = subsolarPoint(when);
  assert.ok(Math.abs(sunElevationDeg(sun, p.lat, p.lon) - 90) < 1e-6);
  assert.ok(Math.abs(sunElevationDeg(sun, -p.lat, p.lon + 180) + 90) < 1e-6);
  // New York at 11:00 EDT on 21 Oct: the Sun about a third of the way up.
  const nyc = sunElevationDeg(sun, 40.7, -74);
  assert.ok(nyc > 28 && nyc < 38, `NYC ${nyc}`);
});

test('shadows only for close views in daylight, and never on the quality ladder’s lower rungs', () => {
  const base = { heightM: 700, sunDeg: 30, allowed: true, enabled: true };
  assert.equal(wantShadows(base), true);
  assert.equal(wantShadows({ ...base, heightM: SUN.shadowOnBelowM + 1 }), false);
  // Once on, they stay on up to the higher limit (no flip on every hop)...
  assert.equal(wantShadows({ ...base, heightM: SUN.shadowOnBelowM + 1, was: true }), true);
  assert.equal(wantShadows({ ...base, heightM: SUN.shadowOffAboveM + 1, was: true }), false);
  // ...and a cruise-altitude stop (about 13 km up) never pays for them.
  assert.equal(wantShadows({ ...base, heightM: 13_000 }), false);
  assert.equal(wantShadows({ ...base, sunDeg: SUN.shadowMinSunDeg - 0.5 }), false);
  assert.equal(wantShadows({ ...base, allowed: false }), false);
  assert.equal(wantShadows({ ...base, enabled: false }), false);
  assert.equal(wantShadows({ ...base, heightM: NaN }), false);
  // A grazing Sun gets more depth bias (no shadow acne), a high Sun the base.
  assert.equal(shadowBias(40), SUN.shadowDepthBias);
  assert.ok(shadowBias(3) > 4 * SUN.shadowDepthBias);
  // Golden hour warms the light; midday is white.
  assert.deepEqual(sunColor(60), { red: 1, green: 1, blue: 1 });
  assert.ok(sunColor(2).blue < 0.7 && sunColor(2).green < 0.85);
});

test('the Sun module drives the scene light, the sky and the shadows, and restores them', () => {
  const { viewer, scene, frame } = fakeViewer();
  const iso = '2026-10-21T15:00:00Z';
  const sunPart = createSun({ viewer, Cesium: CesiumFor(iso), now: at(iso) });
  assert.ok(scene.light instanceof DirectionalLight);
  const s = sunDirectionEcef(new Date(iso));
  assert.ok(Math.abs(scene.light.direction.x + s.x) < 1e-12, 'light travels away from the Sun');
  assert.equal(scene.globe.enableLighting, true, 'sky and haze follow the light');
  frame();
  assert.equal(viewer.shadows, true, 'NYC at 11:00 from 700 m: shadows on');
  assert.ok(scene.shadowMap._primitiveBias.depthBias > 2e-5);
  sunPart.setAllowed(false);
  assert.equal(viewer.shadows, false, 'the quality ladder can take them away');
  sunPart.setAllowed(true);
  frame();
  assert.equal(viewer.shadows, true);
  assert.equal(scene.sun.show, true, 'clock and wall time agree: Sun disc shown');
  sunPart.destroy();
  assert.equal(scene.light, 'cesium-sun');
  assert.equal(scene.globe.enableLighting, false);
  assert.equal(viewer.shadows, false);
});

test('no shadows at night, and the Sun disc hides once the viewer clock has drifted', () => {
  const { viewer, scene, frame } = fakeViewer();
  const iso = '2026-10-22T03:00:00Z';
  createSun({ viewer, Cesium: CesiumFor('2026-10-21T22:00:00Z'), now: at(iso) });
  frame();
  assert.equal(viewer.shadows, false);
  assert.equal(scene.sun.show, false);
});

// ── The night side of the city ─────────────────────────────────────────

test('the city darkens through twilight to night by the Sun’s height there', () => {
  assert.equal(nightAmount(30), 0);
  assert.equal(nightAmount(2.1), 0);
  assert.ok(nightAmount(-3) > 0.2 && nightAmount(-3) < 0.8);
  assert.equal(nightAmount(-12), 1);
  assert.equal(nightAmount(-60), 1);
  for (const part of ['positionWC', 'u_sunWC', 'u_lights', 'u_strength']) {
    assert.ok(NIGHT_SHADER.includes(part), part);
  }
});

test('every 3D tileset gets the night shading; thermal and night vision see the raw picture', () => {
  const { viewer, tileset, frame } = fakeViewer();
  const events = new EventTarget();
  const iso = '2026-10-22T03:00:00Z';
  const night = createNightTiles({
    viewer,
    Cesium: CesiumFor(iso),
    sunDirection: () => sunDirectionEcef(new Date(iso)),
    events,
  });
  frame();
  assert.ok(tileset.customShader instanceof CustomShader);
  assert.equal(night.state().tilesets, 1);
  assert.equal(tileset.customShader.uniforms.u_strength.value, 1);
  events.dispatchEvent(Object.assign(new Event('gev:sensor'), { detail: { mode: 'nvg' } }));
  frame();
  assert.equal(tileset.customShader.uniforms.u_strength.value, 0);
  events.dispatchEvent(Object.assign(new Event('gev:sensor'), { detail: { mode: null } }));
  frame();
  assert.equal(tileset.customShader.uniforms.u_strength.value, 1);
  night.setEnabled(false);
  assert.equal(tileset.customShader.uniforms.u_strength.value, 0);
  night.destroy();
  assert.equal(tileset.customShader, undefined);
});

// ── The Milky Way sky ───────────────────────────────────────────────────

test('the Milky Way sky box replaces the default once all six faces load, and keeps it on failure', async () => {
  assert.equal(Object.keys(STAR_FACES).length, 6);
  assert.equal(starFaceUrls('/app').positiveZ, '/app/sky/stars_pz.jpg');
  const { viewer, scene } = fakeViewer();
  const stars = createStarfield({ viewer, Cesium: CesiumFor('2026-10-21T00:00:00Z'), delayMs: 0 });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(scene.skyBox instanceof SkyBox);
  assert.equal(scene.skyBox.sources.negativeY.url, '/sky/stars_my.jpg');
  stars.setEnabled(false);
  assert.equal(scene.skyBox, 'default-sky');
  stars.destroy();

  const broken = fakeViewer();
  const Cesium = { ...CesiumFor('x'), Resource: { fetchImage: async () => Promise.reject(new Error('404')) } };
  const warn = console.warn;
  console.warn = () => {};
  const failed = createStarfield({ viewer: broken.viewer, Cesium, delayMs: 0 });
  await new Promise((r) => setTimeout(r, 0));
  console.warn = warn;
  assert.equal(broken.scene.skyBox, 'default-sky');
  assert.equal(failed.state().failed, true);
});

test('with the Milky Way switched off nothing is downloaded until it is switched on', async () => {
  const { viewer, scene } = fakeViewer();
  let fetched = 0;
  const Cesium = { ...CesiumFor('x'), Resource: { fetchImage: async ({ url }) => (fetched++, { url }) } };
  const stars = createStarfield({ viewer, Cesium, enabled: false, delayMs: 0 });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetched, 0);
  assert.equal(scene.skyBox, 'default-sky');
  stars.setEnabled(true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetched, 6);
  assert.ok(scene.skyBox instanceof SkyBox);
});
