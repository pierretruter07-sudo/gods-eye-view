import { START_LEVEL, nextQuality, qualityLevels } from './qualityPolicy.js';

const WINDOW_MS = 1500;

/**
 * Keeps the globe crisp AND smooth: always renders at the display's native
 * pixel density with multisample anti-aliasing, and walks a quality ladder
 * (see qualityPolicy.js) when the measured frame rate sags: shadows first,
 * then effects, then MSAA, then tile detail. Only measures while the scene renders
 * continuously — idle request-render frames are sparse by design and say
 * nothing about smoothness.
 * @param {object} viewer
 * @param {{setEffects?: (on: boolean) => void,
 *   setShadows?: (on: boolean) => void}} [options] the scene look's effects
 *   switch (graphics.js) and the sun shadows' (visuals/sun.js)
 */
export function installAdaptiveQuality(
  viewer,
  { setEffects = null, setShadows = null } = {},
) {
  const scene = viewer.scene;
  const dpr = window.devicePixelRatio || 1;
  const levels = qualityLevels(dpr);
  let state = {
    level: Math.min(START_LEVEL, levels.length - 1),
    good: 0,
    bad: 0,
  };

  function apply() {
    const { ratio, msaa, sse, effects, shadows } = levels[state.level];
    try {
      // With browser-recommended resolution OFF, Cesium renders at
      // devicePixelRatio × resolutionScale — so divide the DPR back out.
      viewer.useBrowserRecommendedResolution = false;
      viewer.resolutionScale = ratio / dpr;
    } catch (error) {
      console.warn('[quality] resolution unavailable', error);
    }
    try {
      if (scene.msaaSamples !== msaa) scene.msaaSamples = msaa;
    } catch {
      /* MSAA unsupported (WebGL1) */
    }
    // No FXAA at any level: it blurs the whole frame. The sharpening pass
    // (graphics.js) keeps detail; MSAA handles edges while it is on.
    try {
      setEffects?.(effects !== false);
    } catch {
      /* effects unavailable */
    }
    try {
      setShadows?.(shadows === true);
    } catch {
      /* shadows unavailable */
    }
    // Photorealistic 3D tiles: coarser detail on the bottom rungs.
    const primitives = scene.primitives;
    for (let i = 0; i < (primitives?.length || 0); i += 1) {
      const p = primitives.get(i);
      if (p?.isCesium3DTileset && sse) p.maximumScreenSpaceError = sse;
    }
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
    const next = nextQuality(state, fps, levels.length, now);
    const changed = next.level !== state.level;
    state = next;
    if (changed) {
      apply();
      console.info(
        `[quality] ${fps.toFixed(0)} fps → level ${state.level}`,
        levels[state.level],
      );
    }
    window.__gevQuality = {
      fps: Math.round(fps),
      level: state.level,
      ...levels[state.level],
      dpr,
    };
  });

  return () => remove();
}
