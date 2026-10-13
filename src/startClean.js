/**
 * Every launch starts the same way: whole-globe view and the default layer
 * set. The app otherwise restores the last camera (URL hash) and the last
 * layer switches (localStorage), which also means a layer combination that
 * overloaded the browser would come straight back on reload.
 * Add ?restore to the URL to keep the old restore-last-session behaviour.
 * Runs before anything else is imported (first import in main.js).
 */
try {
  if (!new URLSearchParams(window.location.search).has('restore')) {
    if (window.location.hash)
      history.replaceState(null, '', window.location.pathname + window.location.search);
    window.localStorage?.removeItem('gev:layer-state:v2');
  }
} catch {
  /* storage blocked: nothing to clear */
}
