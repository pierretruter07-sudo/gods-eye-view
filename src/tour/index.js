import { createTourController } from './controller.js';
import { createTourUi } from './ui.js';

/** Demo buttons show in development builds or with ?demo in the URL. */
function demoEnabled() {
  try {
    return (
      import.meta.env?.DEV === true ||
      new URLSearchParams(window.location.search).has('demo')
    );
  } catch {
    return false;
  }
}

/** Mount the Director for this application lifetime. Returns a disposer. */
export function installTour({ viewer, dataManager }) {
  let controller = null;
  const ui = createTourUi({
    demo: demoEnabled(),
    onStart: () => controller.start(),
    onResume: () => controller.start(),
    onSimulate: (kind) => controller.simulate(kind),
  });
  controller = createTourController({ viewer, dataManager, ui });
  window.__gevTour = controller;
  return () => {
    controller.destroy();
    ui.destroy();
    if (window.__gevTour === controller) delete window.__gevTour;
  };
}
