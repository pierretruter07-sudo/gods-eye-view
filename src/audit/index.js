/**
 * @file AUDIT entry point for the God's Eye View shell.
 *
 * Deliberately small: three.js, the assessment data and the cockpit load in
 * a separate chunk, prepared when the browser is idle after start-up or when
 * the pointer reaches the AUDIT button, so start-up is unchanged and a press
 * opens the view without waiting on the network or on scene building.
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

  /**
   * Get the AUDIT view ready before a press: fetch its code and data and
   * build the (hidden) orbit, so pressing AUDIT starts the flight at once.
   * A failure here is retried by the press itself.
   */
  function prefetch() {
    return load().catch(() => {
      loading = null;
      module = null;
    });
  }

  /**
   * Download the AUDIT code and data only, without building its scene (a
   * second full-screen WebGL context that would stay in GPU memory all
   * session for visitors who never press AUDIT). Used for the idle warm-up;
   * hover and focus still prepare the whole view.
   */
  function warm() {
    module ??= import('./runtime.js');
    return module.catch(() => {
      module = null;
    });
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
    warm,
    isActive: () => active,
    /** For diagnostics and the browser harness. */
    runtime: () => runtime,
    destroy() {
      runtime?.destroy();
    },
  };
}
