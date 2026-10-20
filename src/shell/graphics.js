/**
 * @file The look of the 3D scene, in one place (graphics pass, Pierre 21
 * Oct): high dynamic range with a neutral tone map, a gentle bloom on the
 * brightest light only, and a contrast-adaptive sharpening pass in place of
 * FXAA (FXAA smooths edges by blurring the whole frame).
 *
 * The quality ladder (quality.js) turns the effects off before it gives up
 * anti-aliasing or detail, and never lowers the resolution below native.
 *
 * URL switches for comparison: `?hdr=0`, `?bloom=0`, `?sharpen=0`.
 * @module shell/graphics
 */

/** Tuning, in one place. */
export const GRAPHICS = Object.freeze({
  /** Exposure under the neutral (Khronos PBR) tone map. */
  exposure: 1.0,
  bloom: Object.freeze({
    /** Only light brighter than this (0–1 luminance) blooms. */
    threshold: 0.86,
    /** How much of the blurred light is added back. */
    strength: 0.32,
    /** Blur radius, in pixels at native resolution. */
    sigma: 3.0,
  }),
  /** Sharpening: 0 (none) to 1 (strong). Contrast-adaptive, so flat areas
   * and already-sharp edges are left alone and noise is not amplified. */
  sharpness: 0.45,
});

/** Which effects are on, from the page URL. */
export function graphicsFlags(search = '') {
  const off = (name) => new RegExp(`[?&]${name}=0\\b`).test(search);
  return { hdr: !off('hdr'), bloom: !off('bloom'), sharpen: !off('sharpen') };
}

/** Keeps the bright part of the frame (soft knee above the threshold). */
export const BRIGHT_PASS_SHADER = `
uniform sampler2D colorTexture;
uniform float threshold;
in vec2 v_textureCoordinates;
void main() {
  vec3 c = texture(colorTexture, v_textureCoordinates).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(threshold, threshold + 0.12, l);
  out_FragColor = vec4(c * k, 1.0);
}`;

/** Separable Gaussian blur (9 taps); `direction` is (1,0) or (0,1). */
export const BLUR_SHADER = `
uniform sampler2D colorTexture;
uniform vec2 direction;
uniform float sigma;
in vec2 v_textureCoordinates;
void main() {
  vec2 texel = direction / czm_viewport.zw;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -4; i <= 4; i++) {
    float x = float(i);
    float w = exp(-0.5 * x * x / (sigma * sigma / 4.0));
    sum += texture(colorTexture, v_textureCoordinates + texel * x * (sigma / 2.0)).rgb * w;
    total += w;
  }
  out_FragColor = vec4(sum / total, 1.0);
}`;

/** Adds the blurred bright light back over the scene. */
export const BLOOM_COMBINE_SHADER = `
uniform sampler2D colorTexture;
uniform sampler2D sceneTexture;
uniform float strength;
in vec2 v_textureCoordinates;
void main() {
  vec4 scene = texture(sceneTexture, v_textureCoordinates);
  vec3 glow = texture(colorTexture, v_textureCoordinates).rgb;
  out_FragColor = vec4(scene.rgb + glow * strength, scene.a);
}`;

/** Copies the frame (so the bloom's last step can read the original). */
export const COPY_SHADER = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
void main() { out_FragColor = texture(colorTexture, v_textureCoordinates); }`;

/**
 * Contrast-adaptive sharpening (after AMD FidelityFX CAS): sharpens in
 * proportion to how much local contrast is left, so it crisps soft detail
 * without halos or amplifying noise.
 */
export const SHARPEN_SHADER = `
uniform sampler2D colorTexture;
uniform float sharpness;
in vec2 v_textureCoordinates;
vec3 at(vec2 o) { return texture(colorTexture, v_textureCoordinates + o / czm_viewport.zw).rgb; }
void main() {
  vec4 centre = texture(colorTexture, v_textureCoordinates);
  vec3 a = at(vec2(-1.0, -1.0)), b = at(vec2(0.0, -1.0)), c = at(vec2(1.0, -1.0));
  vec3 d = at(vec2(-1.0, 0.0)), e = centre.rgb, f = at(vec2(1.0, 0.0));
  vec3 g = at(vec2(-1.0, 1.0)), h = at(vec2(0.0, 1.0)), i = at(vec2(1.0, 1.0));
  vec3 mn = min(min(min(d, e), min(f, b)), h);
  mn += min(mn, min(min(a, c), min(g, i)));
  vec3 mx = max(max(max(d, e), max(f, b)), h);
  mx += max(mx, max(max(a, c), max(g, i)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, sharpness));
  vec3 outc = (b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w);
  out_FragColor = vec4(clamp(outc, 0.0, 1.0), centre.a);
}`;

/**
 * Install the scene look. Returns `setEffects(on)` for the quality ladder
 * (bloom is the effect it sheds first; HDR and sharpening are cheap and
 * stay on) and `destroy()`.
 * @param {object} viewer a Cesium Viewer
 * @param {object} Cesium the Cesium namespace
 * @param {{flags?: {hdr: boolean, bloom: boolean, sharpen: boolean}}} [options]
 */
export function installGraphics(
  viewer,
  Cesium,
  { flags = graphicsFlags() } = {},
) {
  const scene = viewer.scene;
  const stages = scene.postProcessStages;
  const added = [];

  // FXAA blurs the whole frame to hide jagged edges; MSAA does that job
  // and the sharpening pass keeps the detail.
  try {
    if (stages.fxaa) stages.fxaa.enabled = false;
  } catch {
    /* no FXAA */
  }

  if (flags.hdr) {
    try {
      if (scene.highDynamicRangeSupported !== false) {
        scene.highDynamicRange = true;
        if (Cesium.Tonemapper?.PBR_NEUTRAL && 'tonemapper' in stages)
          stages.tonemapper = Cesium.Tonemapper.PBR_NEUTRAL;
        if ('exposure' in stages) stages.exposure = GRAPHICS.exposure;
      }
    } catch (error) {
      console.warn('[graphics] HDR unavailable', error);
    }
  }

  let bloom = null;
  if (flags.bloom) {
    try {
      const b = GRAPHICS.bloom;
      bloom = new Cesium.PostProcessStageComposite({
        name: 'gev-bloom',
        inputPreviousStageTexture: true,
        stages: [
          new Cesium.PostProcessStage({
            name: 'gev-bloom-scene',
            fragmentShader: COPY_SHADER,
          }),
          new Cesium.PostProcessStage({
            name: 'gev-bloom-bright',
            fragmentShader: BRIGHT_PASS_SHADER,
            uniforms: { threshold: b.threshold },
            textureScale: 0.5,
          }),
          new Cesium.PostProcessStage({
            name: 'gev-bloom-blur-x',
            fragmentShader: BLUR_SHADER,
            uniforms: {
              direction: new Cesium.Cartesian2(1, 0),
              sigma: b.sigma,
            },
            textureScale: 0.5,
          }),
          new Cesium.PostProcessStage({
            name: 'gev-bloom-blur-y',
            fragmentShader: BLUR_SHADER,
            uniforms: {
              direction: new Cesium.Cartesian2(0, 1),
              sigma: b.sigma,
            },
            textureScale: 0.5,
          }),
          new Cesium.PostProcessStage({
            name: 'gev-bloom-combine',
            fragmentShader: BLOOM_COMBINE_SHADER,
            uniforms: { sceneTexture: 'gev-bloom-scene', strength: b.strength },
          }),
        ],
      });
      stages.add(bloom);
      added.push(bloom);
    } catch (error) {
      console.warn('[graphics] bloom unavailable', error);
      bloom = null;
    }
  }

  let sharpen = null;
  if (flags.sharpen) {
    try {
      sharpen = new Cesium.PostProcessStage({
        name: 'gev-sharpen',
        fragmentShader: SHARPEN_SHADER,
        uniforms: { sharpness: GRAPHICS.sharpness },
      });
      stages.add(sharpen);
      added.push(sharpen);
    } catch (error) {
      console.warn('[graphics] sharpening unavailable', error);
      sharpen = null;
    }
  }

  const api = {
    /** The quality ladder's switch: bloom off on slow frames. */
    setEffects(on) {
      if (bloom) bloom.enabled = Boolean(on);
    },
    state: () => ({
      hdr: Boolean(scene.highDynamicRange),
      bloom: Boolean(bloom?.enabled),
      sharpen: Boolean(sharpen?.enabled),
    }),
    destroy() {
      for (const stage of added) {
        try {
          stages.remove(stage);
        } catch {
          /* viewer torn down */
        }
      }
      added.length = 0;
    },
  };
  return api;
}
