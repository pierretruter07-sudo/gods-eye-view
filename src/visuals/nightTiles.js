/**
 * @file A true night side on the 3D city: Google's photorealistic tiles are
 * daytime photographs, so without help a street at 2 am looks like noon.
 *
 * A custom shader on every 3D tileset shades each point of the city by the
 * Sun's real elevation there: full daylight, a warm golden hour as the Sun
 * gets low, a blue dusk through twilight, then night. At night the surfaces
 * keep a little moonlight and, where NASA's Black Marble image shows city
 * lights, a warm streetlight glow. The globe's own lighting does the same for
 * the keyless map (visuals/sun.js).
 *
 * While the Director shows a sensor look (thermal or night vision), the scene
 * is left at full brightness: those looks are built for the camera's raw
 * picture (tour/sensorLook.js announces them with a `gev:sensor` event).
 * `?nightcity=0` turns it off.
 * @module visuals/nightTiles
 */

export const NIGHT_TILES = Object.freeze({
  /** How often the tilesets are checked for one without the shader. */
  scanEveryMs: 2_000,
  /** Night-lights texture size (luminance only). */
  lightsWidth: 2048,
  lightsHeight: 1024,
});

/**
 * How dark a place is for a Sun elevation, 0 (day) to 1 (night): the
 * shading the shader applies, here for tests and diagnostics. Night is full
 * once the Sun is 11.5° below the horizon (between nautical and
 * astronomical twilight); day from 2° above.
 */
export function nightAmount(sunDeg) {
  const s = Math.sin((sunDeg * Math.PI) / 180);
  const t = Math.min(1, Math.max(0, (s + 0.2) / (0.035 + 0.2)));
  return 1 - t * t * (3 - 2 * t);
}

export const NIGHT_SHADER = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 up = normalize(fsInput.attributes.positionWC);
  float s = dot(up, u_sunWC);
  float night = (1.0 - smoothstep(-0.20, 0.035, s)) * u_strength;
  // Golden hour while the Sun is low but up; a blue cast through dusk.
  float golden = smoothstep(-0.02, 0.05, s) * (1.0 - smoothstep(0.05, 0.24, s)) * u_strength;
  float dusk = smoothstep(-0.20, -0.02, s) * (1.0 - smoothstep(-0.02, 0.05, s)) * u_strength;
  vec2 uv = vec2(atan(up.y, up.x) / czm_twoPi + 0.5,
                 asin(clamp(up.z, -1.0, 1.0)) / czm_pi + 0.5);
  float lum = texture(u_lights, uv).r * u_hasLights;
  float city = smoothstep(0.06, 0.75, lum);
  vec3 c = material.diffuse;
  vec3 day = c * mix(vec3(1.0), vec3(1.08, 0.93, 0.80), golden);
  day = mix(day, c * vec3(0.55, 0.62, 0.85), dusk * 0.6);
  // Linear light: 0.02 shows as about 15% grey, 0.09 as about 33%.
  vec3 dark = c * vec3(0.02, 0.027, 0.05)
    + c * city * vec3(0.075, 0.048, 0.022)
    + vec3(1.0, 0.68, 0.36) * city * city * 0.012;
  material.diffuse = mix(day, dark, night);
}`;

/**
 * Night-lights luminance (red channel) from an image, downsampled.
 * @returns {Uint8Array|null}
 */
export function lightsLuminance(
  image,
  width,
  height,
  doc = globalThis.document,
) {
  try {
    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // The image is north-up; texture row 0 is the south edge (v = 0).
    ctx.translate(0, height);
    ctx.scale(1, -1);
    ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i += 1) out[i] = rgba[i * 4];
    return out;
  } catch (error) {
    console.warn('[visuals] night lights unreadable', error);
    return null;
  }
}

/**
 * Mount the night-side shading.
 * @param {{viewer: object, Cesium: object, enabled?: boolean,
 *   sunDirection: () => {x: number, y: number, z: number},
 *   lightsImage?: () => (object|null), events?: EventTarget}} options
 */
export function createNightTiles({
  viewer,
  Cesium,
  enabled = true,
  sunDirection,
  lightsImage = () => null,
  events = globalThis.window,
  rules = NIGHT_TILES,
}) {
  const scene = viewer.scene;
  const black = () =>
    new Cesium.TextureUniform({
      typedArray: new Uint8Array([0]),
      width: 1,
      height: 1,
      pixelFormat: Cesium.PixelFormat.LUMINANCE,
    });
  const shader = new Cesium.CustomShader({
    uniforms: {
      u_sunWC: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(1, 0, 0),
      },
      u_strength: { type: Cesium.UniformType.FLOAT, value: enabled ? 1 : 0 },
      u_hasLights: { type: Cesium.UniformType.FLOAT, value: 0 },
      u_lights: { type: Cesium.UniformType.SAMPLER_2D, value: black() },
    },
    fragmentShaderText: NIGHT_SHADER,
  });

  let on = enabled;
  let destroyed = false;
  let sensor = null;
  let lightsLoaded = false;
  let scanAt = 0;
  const shaded = new Set();
  const sun = new Cesium.Cartesian3();

  function strength() {
    return on && !(sensor === 'flir' || sensor === 'nvg') ? 1 : 0;
  }

  function scan() {
    const primitives = scene.primitives;
    for (let i = 0; i < (primitives?.length || 0); i += 1) {
      const p = primitives.get(i);
      if (!p?.isCesium3DTileset || shaded.has(p)) continue;
      // Leave a tileset that already has its own shader alone.
      if (p.customShader && p.customShader !== shader) continue;
      p.customShader = shader;
      shaded.add(p);
    }
    for (const p of shaded) if (p.isDestroyed?.()) shaded.delete(p);
  }

  // Reading the 2048 × 1024 image back is a few tens of milliseconds, so
  // it runs once, off the render loop, when the browser is idle.
  const idle = (fn) =>
    typeof globalThis.requestIdleCallback === 'function'
      ? globalThis.requestIdleCallback(fn, { timeout: 2000 })
      : setTimeout(fn, 0);
  let lightsQueued = false;
  function queueLights() {
    if (lightsLoaded || lightsQueued || !lightsImage()) return;
    lightsQueued = true;
    idle(loadLights);
  }
  function loadLights() {
    if (lightsLoaded || destroyed) return;
    const image = lightsImage();
    if (!image) return;
    lightsLoaded = true;
    const lum = lightsLuminance(image, rules.lightsWidth, rules.lightsHeight);
    if (!lum) return;
    shader.setUniform(
      'u_lights',
      new Cesium.TextureUniform({
        typedArray: lum,
        width: rules.lightsWidth,
        height: rules.lightsHeight,
        pixelFormat: Cesium.PixelFormat.LUMINANCE,
        repeat: false,
      }),
    );
    shader.setUniform('u_hasLights', 1);
  }

  function update() {
    const t = Date.now();
    if (t - scanAt >= rules.scanEveryMs) {
      scanAt = t;
      scan();
      queueLights();
    }
    const s = sunDirection();
    shader.setUniform(
      'u_sunWC',
      Cesium.Cartesian3.fromElements(s.x, s.y, s.z, sun),
    );
    shader.setUniform('u_strength', strength());
  }
  const removeHook = scene.preRender.addEventListener(update);
  const onSensor = (event) => {
    sensor = event?.detail?.mode || null;
    scene.requestRender?.();
  };
  events?.addEventListener?.('gev:sensor', onSensor);

  return {
    setEnabled(value) {
      on = Boolean(value);
      shader.setUniform('u_strength', strength());
      scene.requestRender?.();
    },
    enabled: () => on,
    state: () => ({
      enabled: on,
      sensor,
      tilesets: shaded.size,
      lights: lightsLoaded,
      strength: strength(),
    }),
    destroy() {
      destroyed = true;
      removeHook();
      events?.removeEventListener?.('gev:sensor', onSensor);
      for (const p of shaded) {
        if (!p.isDestroyed?.() && p.customShader === shader)
          p.customShader = undefined;
      }
      shaded.clear();
    },
  };
}
