import { installShell } from '../shell/index.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';

/**
 * Attach the God's Eye View shell, the idle render governor and the
 * application debug handle. The shell (src/shell) is the entire interface.
 */
export function createApplicationTools({
  scene,
  data,
  loadingScreen,
  placeSearch,
  startChrome,
  signal,
  defer,
}) {
  const { viewer, tileset, mapStackController, operations } = scene;
  const { dataManager } = data;
  if (startChrome) defer(startChrome({ loadingScreen, signal }));

  // Idle render governor: the scene stops repainting whenever nothing
  // animates per frame. Installed after every module above has had its
  // chance to register pre-install holds.
  installRenderGovernor(viewer);

  // Following a tracked entity is a per-frame animation.
  const removeTrackingListener = viewer.trackedEntityChanged.addEventListener(() => {
    if (viewer.trackedEntity) holdContinuousRender('tracked-entity');
    else releaseContinuousRender('tracked-entity');
  });
  defer(() => {
    removeTrackingListener();
    releaseContinuousRender('tracked-entity');
  });

  // A hidden tab repaints for nobody: stop the render loop while hidden and
  // repaint once on return. Applied to the current state too.
  const syncVisibilitySuspension = () => {
    const hidden = document.hidden;
    viewer.useDefaultRenderLoop = !hidden;
    if (!hidden) {
      data.presentation.flushVisible();
      governorRequestRender('visibility-restore');
    }
  };
  document.addEventListener('visibilitychange', syncVisibilitySuspension);
  defer(() => document.removeEventListener('visibilitychange', syncVisibilitySuspension));
  syncVisibilitySuspension();

  window.__godsEyeView = {
    viewer,
    tileset,
    dataManager,
    mapStackController,
    getRenderGovernorDiagnostics,
    surfaceServices: operations.surface,
    requestRender: governorRequestRender,
  };
  const debug = window.__godsEyeView;
  defer(() => {
    if (window.__godsEyeView === debug) delete window.__godsEyeView;
  });

  defer(installShell({ viewer, dataManager, placeSearch }));
  return {};
}
