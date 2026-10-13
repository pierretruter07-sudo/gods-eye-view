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
export const WELCOME_SECONDS = 10;

const COPY = {
  kicker: "God's Eye View",
  title: "Welcome to the God's Eye View dashboard",
  by: 'Developed by Digital Dynamics Group',
  lead:
    'A live, real-time picture of the planet built entirely from public data — and an intelligence layer on top of it, in the style of the analytic platforms used by defence and security organisations.',
  points: [
    ['Live feeds', 'Aircraft (ADS-B), military flights, ships (AIS), satellites (orbital data) and earthquakes (USGS), updated continuously.'],
    ['The Director', 'An AI narrator tours the globe on its own, flying to emergencies, airports, naval and military traffic, ships and satellites, and explaining what it sees.'],
    ['Object dossiers', 'Click any contact for its live data, nearby contacts, links, pattern of life and analyst actions. Live data is tagged FEED; illustrative analysis is tagged SIMULATED.'],
    ['Triage', 'A ranked queue of what needs attention right now — emergency squawks, significant earthquakes and state assets — plus your own watchlist and areas of interest.'],
  ],
};

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
      <ul class="gev-welcome__points">
        ${COPY.points.map(([h, t]) => `<li><b>${h}</b><span>${t}</span></li>`).join('')}
      </ul>
      <footer class="gev-welcome__foot">
        <div class="gev-welcome__count" aria-live="polite">
          <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
            <circle cx="26" cy="26" r="${R}" class="gev-welcome__track"/>
            <circle cx="26" cy="26" r="${R}" class="gev-welcome__arc" stroke-dasharray="${C}" stroke-dashoffset="0"/>
          </svg>
          <span class="gev-welcome__num">${seconds}</span>
        </div>
        <p class="gev-welcome__hint">The Director starts in <b class="gev-welcome__secs">${seconds}</b> seconds while live data loads.</p>
        <div class="gev-welcome__btns">
          <button type="button" class="gev-btn" data-act="explore">Explore on my own</button>
          <button type="button" class="gev-btn gev-btn--primary" data-act="start">Start now</button>
        </div>
      </footer>
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
