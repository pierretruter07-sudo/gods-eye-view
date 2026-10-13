import { QUALITY, initialRatio, nextQuality } from './qualityPolicy.js';

const WINDOW_MS = 1500;

/**
 * Keeps the globe smooth by adapting render resolution to the measured frame
 * rate. Replaces fixed supersampling + MSAA (which multiplied the pixel count
 * several times over on high-DPI screens) with: FXAA for edges, MSAA off,
 * and a pixel ratio that drops under load and recovers when there's headroom.
 * Only measures while the scene renders continuously (in idle request-render
 * mode frames are sparse by design and say nothing about smoothness).
 */
export function installAdaptiveQuality(viewer) {
  const scene = viewer.scene;
  const dpr = window.devicePixelRatio || 1;
  let state = { ratio: initialRatio(dpr), good: 0, ceiling: initialRatio(dpr) };

  function apply() {
    try {
      // With browser-recommended resolution OFF, Cesium renders at
      // devicePixelRatio × resolutionScale — so divide out the DPR.
      viewer.useBrowserRecommendedResolution = false;
      viewer.resolutionScale = state.ratio / dpr;
    } catch (error) {
      console.warn('[quality] resolution unavailable', error);
    }
  }
  try {
    scene.msaaSamples = 1;
  } catch {
    /* MSAA unsupported */
  }
  try {
    const fxaa = scene.postProcessStages?.fxaa;
    if (fxaa) fxaa.enabled = true;
  } catch {
    /* no FXAA */
  }
  apply();

  let frames = 0;
  let windowStart = performance.now();
  const remove = scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (scene.requestRenderMode || document.hidden) {
      frames = 0;
      windowStart = now;
      return;
    }
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed < WINDOW_MS) return;
    const fps = (frames * 1000) / elapsed;
    frames = 0;
    windowStart = now;
    const next = nextQuality(state, fps);
    if (next.ratio !== state.ratio) {
      state = next;
      apply();
      console.info(`[quality] ${fps.toFixed(0)} fps → render ratio ${state.ratio}`);
    } else state = next;
    window.__gevQuality = { fps: Math.round(fps), ratio: state.ratio, dpr, limits: QUALITY };
  });

  return () => remove();
}
