import { createTourController } from './controller.js';
import { createTourUi } from './ui.js';
import { createDescentChecklist } from './descentChecklist.js';

/** Mount the Director for this application lifetime. */
export function installTour({
  viewer,
  dataManager,
  onState,
  onFocus = null,
  onTravel = null,
  stage = null,
  openingDescent = false,
}) {
  const ui = createTourUi({ onState });
  const checklist = createDescentChecklist();
  const controller = createTourController({
    viewer,
    dataManager,
    ui,
    onFocus,
    onTravel,
    stage,
    openingDescent,
    checklist,
  });
  window.__gevTour = controller;
  return {
    controller,
    dispose() {
      controller.destroy();
      checklist.destroy();
      ui.destroy();
      if (window.__gevTour === controller) delete window.__gevTour;
    },
  };
}
