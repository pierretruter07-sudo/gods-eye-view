/**
 * The start-up progress bar under the DDG mark. The boot writes plain status
 * lines into `.loader-status` ("Configuring viewer...", "Loading Google 3D
 * Tiles...", "Initializing systems...", "Loading planet..."); each line maps
 * to a stage, the bar eases towards that stage's share and creeps a little
 * while a stage lasts, so a slow network still reads as progress. It reaches
 * 100 only when the loading screen is dismissed. Pure helpers are exported
 * for the tests; `mountBootProgress` wires them to the DOM.
 */
export const BOOT_STAGES = Object.freeze([
  { match: /configuring viewer/i, pct: 12 },
  { match: /3d tiles unavailable/i, pct: 42 },   // before the generic 'loading the keyless globe'
  { match: /loading (google 3d tiles|the keyless globe)/i, pct: 30 },
  { match: /initializing systems/i, pct: 58 },
  { match: /loading planet/i, pct: 78 },
]);
/** The bar never passes this on its own; only the hand-over completes it. */
export const BOOT_CEILING = 96;
/** How far past the stage share the bar may creep while waiting (points). */
export const BOOT_CREEP = 9;
/** Creep speed while a stage lasts (points per second). */
export const BOOT_CREEP_RATE = 0.9;

/** The share of the boot a status line stands for, or null if unknown. */
export function stageFor(status) {
  const line = String(status ?? '');
  for (const stage of BOOT_STAGES) if (stage.match.test(line)) return stage.pct;
  return null;
}

/**
 * One tick of the bar: ease towards the target, then creep slowly past it,
 * never beyond target + BOOT_CREEP, never beyond the ceiling, never backwards.
 */
export function advance(current, target, dtMs) {
  const dt = Math.max(0, dtMs) / 1000;
  let next = current;
  if (current < target) next = current + (target - current) * Math.min(1, dt * 2.2);
  else next = current + BOOT_CREEP_RATE * dt;
  next = Math.min(next, target + BOOT_CREEP, BOOT_CEILING);
  return Math.max(current, next);
}

/** Drive the bar from the status line and the screen's `hidden` class. */
export function mountBootProgress(doc = document, win = window) {
  const screen = doc.getElementById('loading-screen');
  if (!screen) return null;
  const bar = screen.querySelector('.loader-bar');
  const fill = screen.querySelector('.loader-bar > i');
  const pctEl = screen.querySelector('.loader-pct');
  const status = screen.querySelector('.loader-status');
  if (!bar || !fill || !pctEl || !status) return null;

  let current = 0;
  let target = 6;
  let done = false;
  let last = win.performance?.now?.() ?? Date.now();
  const paint = () => {
    const shown = Math.round(current);
    fill.style.width = `${shown}%`;
    pctEl.textContent = `${shown}%`;
    bar.setAttribute('aria-valuenow', String(shown));
  };
  const onStatus = () => {
    const stage = stageFor(status.textContent);
    if (stage != null && stage > target) target = stage;
    if (/^error/i.test(status.textContent ?? '')) screen.classList.add('is-error');
  };
  const statusObserver = new win.MutationObserver(onStatus);
  statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
  onStatus();

  const finish = () => {
    if (done) return;
    done = true;
    current = 100;
    paint();
    statusObserver.disconnect();
    screenObserver.disconnect();
  };
  const screenObserver = new win.MutationObserver(() => {
    if (screen.classList.contains('hidden')) finish();
  });
  screenObserver.observe(screen, { attributes: true, attributeFilter: ['class'] });

  const tick = (now) => {
    if (done) return;
    const dt = now - last;
    last = now;
    current = advance(current, target, dt);
    paint();
    win.requestAnimationFrame(tick);
  };
  paint();
  win.requestAnimationFrame(tick);
  return { finish, get value() { return current; } };
}
