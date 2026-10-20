/**
 * @file The Director's sensor looks: a full-screen post-process that renders
 * the scene as thermal (FLIR, white-hot) or night vision (NVG, green
 * phosphor), and the small "SENSOR · …" tag under the asset title.
 * Visual only: nothing here touches data. sensors.js decides when.
 * @module tour/sensorLook
 */
import { SENSOR_LABELS, SENSOR_NOTES } from './sensors.js';

const COMMON = `
uniform sampler2D colorTexture;
uniform float time;
in vec2 v_textureCoordinates;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float vignette(vec2 uv) {
  vec2 d = uv - 0.5;
  return 1.0 - smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.85)));
}
`;

/** Thermal, white-hot: soft greyscale with lifted contrast and grain. */
export const FLIR_SHADER = `${COMMON}
void main() {
  vec2 uv = v_textureCoordinates;
  vec2 px = 1.0 / vec2(textureSize(colorTexture, 0));
  vec3 c = texture(colorTexture, uv).rgb * 0.4
    + texture(colorTexture, uv + vec2(px.x, 0.0)).rgb * 0.15
    + texture(colorTexture, uv - vec2(px.x, 0.0)).rgb * 0.15
    + texture(colorTexture, uv + vec2(0.0, px.y)).rgb * 0.15
    + texture(colorTexture, uv - vec2(0.0, px.y)).rgb * 0.15;
  float l = smoothstep(0.03, 0.95, lum(c));
  l = pow(l, 1.15);
  l += (noise(uv * 900.0 + time) - 0.5) * 0.05;
  l *= mix(0.72, 1.0, vignette(uv));
  out_FragColor = vec4(vec3(clamp(l, 0.0, 1.0)), 1.0);
}`;

/**
 * Night vision: a dark green-black scene where edges and bright features
 * (lights, roads, roofs, hulls) stand out, with grain and faint scan lines.
 * The imagery underneath is a daytime photo, so brightness alone is kept
 * low and contrast comes from the edges (Pierre, 20 Oct: the first version
 * filled the screen with bright green).
 */
export const NVG_SHADER = `${COMMON}
void main() {
  vec2 uv = v_textureCoordinates;
  vec2 px = 1.0 / vec2(textureSize(colorTexture, 0));
  float c = lum(texture(colorTexture, uv).rgb);
  float gx = lum(texture(colorTexture, uv + vec2(px.x, 0.0)).rgb) - lum(texture(colorTexture, uv - vec2(px.x, 0.0)).rgb);
  float gy = lum(texture(colorTexture, uv + vec2(0.0, px.y)).rgb) - lum(texture(colorTexture, uv - vec2(0.0, px.y)).rgb);
  float edge = clamp(length(vec2(gx, gy)) * 3.0, 0.0, 1.0);
  // Base scene kept dark; only the brightest surfaces glow.
  float l = 0.06 + 0.6 * pow(c, 1.3) + 0.3 * smoothstep(0.75, 1.0, c) + 0.5 * edge;
  l += (noise(uv * 700.0 + fract(time * 7.0)) - 0.5) * 0.06;
  l *= 0.94 + 0.06 * sin(uv.y * 900.0);
  l *= mix(0.35, 1.0, vignette(uv));
  vec3 phosphor = vec3(0.30, 0.95, 0.42);
  out_FragColor = vec4(phosphor * clamp(l, 0.0, 0.9), 1.0);
}`;

/**
 * Show the view-mode badge (or hide it): under the asset title in the intel
 * HUD, and on the Director's caption, which is on screen at every stop,
 * including views with no asset (the night side).
 */
export function showSensorTag(mode, root = globalThis.document) {
  if (!root?.body) return;
  root.body.dataset.gevSensor = mode || '';
  const label = mode ? SENSOR_LABELS[mode] || '' : '';
  const note = mode ? SENSOR_NOTES[mode] || '' : '';
  for (const tag of root.querySelectorAll(
    '.gev-hud__sensor, .gev-caption__mode',
  )) {
    tag.textContent = label;
    tag.title = note;
    tag.hidden = !mode;
    if (mode) tag.dataset.mode = mode;
    else delete tag.dataset.mode;
  }
  for (const why of root.querySelectorAll('.gev-caption__why')) {
    why.textContent = note;
    why.hidden = !mode;
  }
}

/**
 * @param {{viewer: object, Cesium: object}} options
 * @returns {{set: (mode: 'flir'|'nvg'|null) => void, mode: () => string|null,
 *   destroy: () => void}}
 */
export function createSensorLook({ viewer, Cesium }) {
  const stages = viewer.scene.postProcessStages;
  const started = performance.now();
  let stage = null;
  let current = null;

  function set(mode) {
    const next = ['flir', 'nvg', 'lights'].includes(mode) ? mode : null;
    if (next === current) return;
    if (stage) {
      stages.remove(stage); // destroys the stage
      stage = null;
    }
    current = next;
    // 'lights' is a badge only: the day/night shell already draws the city
    // lights; no screen effect.
    if (next && next !== 'lights') {
      try {
        stage = new Cesium.PostProcessStage({
          name: `gev-sensor-${next}`,
          fragmentShader: next === 'flir' ? FLIR_SHADER : NVG_SHADER,
          uniforms: { time: () => (performance.now() - started) / 1000 },
        });
        stages.add(stage);
      } catch (error) {
        console.warn('[tour] sensor look unavailable', error);
        stage = null;
        current = null;
      }
    }
    showSensorTag(current);
    viewer.scene.requestRender?.();
  }

  return {
    set,
    mode: () => current,
    destroy: () => set(null),
  };
}
