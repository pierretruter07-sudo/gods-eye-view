/**
 * Opening card: a light glass panel over the turning globe that explains the
 * dashboard, counts down, then hands over to the Director. The countdown is
 * also the time the default layers use to load.
 *
 * Browsers only allow speech after the viewer has interacted with the page,
 * so "Start now" (a click) gives the Director its voice; if the countdown
 * simply runs out with no click at all, the Director may start with
 * captions only on some browsers.
 */
export const WELCOME_SECONDS = 30;

/** Commit and build date stamped by the Vite config (configuration index). */
export const BUILD_ID = String(import.meta.env?.GEV_BUILD || 'development');

const COPY = {
  kicker: "God's Eye View",
  title: 'The planet, live',
  by: 'Developed by Digital Dynamics Group',
  lead: 'One live picture of the world, built from public data.',
};

/**
 * Picture tiles: a small drawing and one short sentence each. The drawings
 * are decorative (aria-hidden); the sentence carries the meaning.
 */
export const WELCOME_TILES = Object.freeze([
  {
    title: 'Live data',
    text: 'Aircraft, ships, satellites, quakes and fires from open feeds.',
    art: `<circle cx="32" cy="22" r="15" class="w-line"/>
      <path d="M17 22h30M32 7c-6 5-6 25 0 30M32 7c6 5 6 25 0 30" class="w-faint"/>
      <path d="M12 9l5 2-5 2z" class="w-fill"/><rect x="47" y="31" width="8" height="3" rx="1.2" class="w-fill"/>
      <rect x="49" y="6" width="5" height="5" class="w-accent"/><path d="M45 8.5h3M55 8.5h3" class="w-line"/>`,
  },
  {
    title: 'Orbit to street',
    text: 'Seven levels, from GEO orbit down to a street camera.',
    art: `<path d="M18 6h28M14 15h36M10 24h44M6 33h52" class="w-faint"/>
      <circle r="3" class="w-accent w-drop"/>
      <path d="M32 6v27" class="w-dash"/>`,
  },
  {
    title: 'Every asset, in depth',
    text: 'Click anything for its data, links, history and source.',
    art: `<rect x="12" y="5" width="40" height="32" rx="4" class="w-line"/>
      <path d="M12 13h40" class="w-line"/><path d="M17 19h14M17 24h20M17 29h11" class="w-faint"/>
      <circle cx="44" cy="22" r="2.4" class="w-accent"/><circle cx="44" cy="30" r="2.4" class="w-fill"/>`,
  },
  {
    title: 'AI Director',
    text: 'Tours the planet on its own and narrates what matters.',
    art: `<path d="M8 32c8-16 16 4 24-10s14-8 22-14" class="w-dash"/>
      <circle cx="8" cy="32" r="2.4" class="w-fill"/><circle cx="32" cy="22" r="2.4" class="w-fill"/>
      <circle cx="54" cy="8" r="3" class="w-accent"/>
      <path d="M42 30c2 2 2 6 0 8M46 27c4 4 4 10 0 14" class="w-line"/>`,
  },
  {
    title: 'Real-time alerts',
    text: 'Emergencies and big quakes, flagged as they happen.',
    art: `<circle cx="32" cy="21" r="4" class="w-alert"/>
      <circle cx="32" cy="21" r="10" class="w-ring"/><circle cx="32" cy="21" r="16" class="w-ring w-ring2"/>`,
  },
]);
const TILES = WELCOME_TILES;

export function showWelcome({ onDone, seconds = WELCOME_SECONDS }) {
  const root = document.createElement('div');
  root.className = 'gev-welcome';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'gev-welcome-title');
  const R = 22;
  const C = 2 * Math.PI * R;
  root.innerHTML = `
    <div class="gev-welcome__card gev-glass">
      <p class="gev-welcome__kicker">${COPY.kicker}</p>
      <h1 id="gev-welcome-title" class="gev-welcome__title">${COPY.title}</h1>
      <p class="gev-welcome__by">${COPY.by}</p>
      <p class="gev-welcome__lead">${COPY.lead}</p>
      <ul class="gev-welcome__tiles">
        ${TILES.map(
          (t) =>
            `<li class="gev-welcome__tile"><svg viewBox="0 0 64 42" width="64" height="42" aria-hidden="true" class="gev-welcome__art">${t.art}</svg><b>${t.title}</b><span>${t.text}</span></li>`,
        ).join('')}
      </ul>
      <footer class="gev-welcome__foot">
        <div class="gev-welcome__count" aria-live="polite">
          <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
            <circle cx="26" cy="26" r="${R}" class="gev-welcome__track"/>
            <circle cx="26" cy="26" r="${R}" class="gev-welcome__arc" stroke-dasharray="${C}" stroke-dashoffset="0"/>
          </svg>
          <span class="gev-welcome__num">${seconds}</span>
        </div>
        <p class="gev-welcome__hint">Tour starts in <b class="gev-welcome__secs">${seconds}</b> s</p>
        <div class="gev-welcome__btns">
          <button type="button" class="gev-btn" data-act="explore">Explore on my own</button>
          <button type="button" class="gev-btn gev-btn--primary" data-act="start">Start now</button>
        </div>
      </footer>
      <p class="gev-welcome__build">Build ${BUILD_ID}</p>
    </div>`;
  document.body.append(root);

  const arc = root.querySelector('.gev-welcome__arc');
  const num = root.querySelector('.gev-welcome__num');
  const secs = root.querySelector('.gev-welcome__secs');
  const started = performance.now();
  let raf = 0;
  let done = false;

  function finish(action) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    root.classList.add('is-leaving');
    setTimeout(() => root.remove(), 450);
    onDone?.(action);
  }

  function tick() {
    const elapsed = (performance.now() - started) / 1000;
    const left = Math.max(0, seconds - elapsed);
    const whole = Math.ceil(left);
    if (num.textContent !== String(whole)) {
      num.textContent = String(whole);
      secs.textContent = String(whole);
    }
    arc.setAttribute('stroke-dashoffset', String(C * (1 - left / seconds)));
    if (left <= 0) return finish('auto');
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  root.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') finish('start');
    if (act === 'explore') finish('explore');
  });
  const onKey = (event) => {
    if (event.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      finish('explore');
    }
  };
  window.addEventListener('keydown', onKey);
  root.querySelector('[data-act="start"]').focus();

  return () => finish('dismissed');
}

/** Skip the card with ?nointro (handy while developing). */
export function welcomeEnabled() {
  try {
    return !new URLSearchParams(window.location.search).has('nointro');
  } catch {
    return true;
  }
}
