/**
 * The DDG intro: the brand animation on a dark-grey ground, played once per
 * browser session over the start-up loading screen while the globe loads
 * underneath. It hands over after INTRO_SECONDS (the composition is complete
 * by then) to the loading screen's DDG mark and progress bar, which keep
 * going until the app is ready. The transparent VP9 render sits on the
 * ground; browsers without VP9 alpha (Safari) get an H.264 render made on
 * the same ground. Skip ends it at once; ?nointro, reduced motion or a
 * repeat visit in the same session skip it entirely.
 */
export const INTRO_SECONDS = 3.4;
/** The longest the intro may hold the screen, whatever the video does. */
export const INTRO_LIMIT_MS = 4200;
export const INTRO_FADE_MS = 700;
export const INTRO_SEEN_KEY = 'gev:intro-played';
export const INTRO_SOURCES = Object.freeze([
  { src: '/brand/intro.webm', type: 'video/webm; codecs=vp9' },
  { src: '/brand/intro.mp4', type: 'video/mp4' },
]);

/** Whether the intro plays on this load. */
export function shouldPlayIntro({
  search = '',
  seen = false,
  reducedMotion = false,
} = {}) {
  if (seen || reducedMotion) return false;
  return !new URLSearchParams(search).has('nointro');
}

/** Show the intro if this load should, and remove it when it ends. */
export function mountIntro(doc = document, win = window) {
  let seen = false;
  try {
    seen = win.sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
    win.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    seen = true; // storage blocked: no way to show it only once
  }
  const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')
    .matches;
  if (!shouldPlayIntro({ search: win.location.search, seen, reducedMotion }))
    return null;

  const root = doc.createElement('div');
  root.id = 'ddg-intro';
  root.setAttribute('aria-hidden', 'true');
  const video = doc.createElement('video');
  video.className = 'ddg-intro-video';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  for (const { src, type } of INTRO_SOURCES) {
    const source = doc.createElement('source');
    source.src = src;
    source.type = type;
    video.append(source);
  }
  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.className = 'ddg-intro-skip';
  skip.textContent = 'Skip';
  skip.setAttribute('aria-label', 'Skip intro');
  root.append(video, skip);
  doc.body.append(root);

  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    win.clearTimeout(limit);
    win.clearTimeout(handover);
    root.classList.add('is-fading');
    win.setTimeout(() => root.remove(), INTRO_FADE_MS);
  };
  const limit = win.setTimeout(end, INTRO_LIMIT_MS);
  // Hand over once the composition is complete, before the video's own fade.
  const handover = win.setTimeout(end, INTRO_SECONDS * 1000);
  video.addEventListener('ended', end);
  // A failed source reports on the <source>, not the video: give up on the last one.
  video.lastElementChild?.addEventListener('error', end);
  skip.addEventListener('click', end);
  // Autoplay refused (some power-saving modes): skip straight to the app.
  video.play?.()?.catch?.(end);
  return { end };
}
