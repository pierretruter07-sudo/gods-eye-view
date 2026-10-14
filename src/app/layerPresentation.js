import { governorRequestRender } from '../renderGovernor.js';

/**
 * Application reactions to layer lifecycle activity. The render loop idles
 * when nothing animates (see renderGovernor.js), so every data tick,
 * visibility change or parameter change must request its one frame here or
 * it would never reach the screen.
 */
export class LayerPresentation {
  constructor(manager, { requestRender = governorRequestRender } = {}) {
    this.manager = manager;
    this._unsubscribe = manager.subscribeActivity((change) => {
      if (change.type === 'destroy-all') return this.destroy();
      const reason =
        change.type === 'data-updated'
          ? `layer-tick:${change.layerId}`
          : change.type === 'visibility-settled'
            ? 'layer-visibility'
            : change.type === 'params-settled'
              ? `layer-params:${change.layerId}`
              : null;
      if (reason) requestRender(reason);
    });
  }

  /** Repaint after the tab becomes visible again. */
  flushVisible() {
    governorRequestRender('presentation-visible');
  }

  destroy() {
    this._unsubscribe?.();
    this._unsubscribe = null;
  }
}
