/** Fade the loading screen out once the scene and layers are in place. */
export function startApplicationChrome({ loadingScreen, signal, delayMs = 1000 }) {
  const timer = setTimeout(() => {
    if (!signal?.aborted) loadingScreen?.classList.add('hidden');
  }, delayMs);
  return () => clearTimeout(timer);
}
