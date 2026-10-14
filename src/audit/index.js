/**
 * @file AUDIT entry point for the God's Eye View shell.
 *
 * Deliberately small: three.js, the assessment data and the cockpit load
 * only on the first press of AUDIT (a separate chunk), so the platform's
 * start-up is unchanged.
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
  let active = false;

  function load() {
    loading ??= import('./runtime.js')
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
    isActive: () => active,
    /** For diagnostics and the browser harness. */
    runtime: () => runtime,
    destroy() {
      runtime?.destroy();
    },
  };
}
