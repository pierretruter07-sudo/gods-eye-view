/**
 * @file AUDIT entry point for the God's Eye View shell.
 *
 * Deliberately small: three.js, the assessment data and the cockpit load in
 * a separate chunk, fetched when the browser is idle after start-up or when
 * the pointer reaches the AUDIT button, so start-up is unchanged and a press
 * opens the view without waiting on the network.
 * @module audit
 */

/**
 * @param {{viewer: object, onEnter?: () => void, onExit?: () => void}} options
 *   onEnter pauses the live platform (Director, intel, panels); onExit runs
 *   once the camera is back where it started.
 */
export function installAudit({ viewer, onEnter, onExit }) {
  let runtime = null;
  let loading = null;
  let module = null;
  let active = false;

  /** Fetch the AUDIT code and data ahead of a press (no GPU work yet). */
  function prefetch() {
    module ??= import('./runtime.js').catch((error) => {
      module = null;
      throw error;
    });
    return module.then((m) => m.preloadAuditData()).catch(() => {});
  }

  function load() {
    module ??= import('./runtime.js');
    loading ??= module
      .then((m) =>
        m.createAuditRuntime({
          viewer,
          onExited: () => {
            active = false;
            onExit?.();
          },
        }),
      )
      .then((r) => (runtime = r));
    return loading;
  }

  return {
    async enter() {
      if (active) return;
      active = true;
      onEnter?.();
      try {
        const r = await load();
        await r.enter();
      } catch (error) {
        active = false;
        loading = null;
        console.warn('[audit] could not start', error);
        onExit?.();
      }
    },
    async exit() {
      await runtime?.exit();
    },
    prefetch,
    isActive: () => active,
    /** For diagnostics and the browser harness. */
    runtime: () => runtime,
    destroy() {
      runtime?.destroy();
    },
  };
}
