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
  title: 'The planet, <em>live.</em>',
  by: 'Developed by Digital Dynamics',
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
  const svgNS = 'http://www.w3.org/2000/svg';

  // Helper: create an element in the SVG namespace with given attributes.
  function svgEl(tag, attrs) {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    return node;
  }

  // Build the card using DOM APIs so no variable data flows through innerHTML.
  const card = document.createElement('div');
  card.className = 'gev-welcome__card gev-glass';

  const kicker = document.createElement('p');
  kicker.className = 'gev-welcome__kicker';
  kicker.textContent = COPY.kicker;

  const h1 = document.createElement('h1');
  h1.id = 'gev-welcome-title';
  h1.className = 'gev-welcome__title';
  h1.append(document.createTextNode('The planet, '));
  const titleEm = document.createElement('em');
  titleEm.textContent = 'live.';
  h1.append(titleEm);

  const byLine = document.createElement('p');
  byLine.className = 'gev-welcome__by';
  byLine.textContent = COPY.by;

  const leadP = document.createElement('p');
  leadP.className = 'gev-welcome__lead';
  leadP.textContent = COPY.lead;

  // Tiles list – SVG art fragments are hardcoded constants; parse them safely.
  const ul = document.createElement('ul');
  ul.className = 'gev-welcome__tiles';
  const svgParser = new DOMParser();
  for (const t of TILES) {
    const li = document.createElement('li');
    li.className = 'gev-welcome__tile';

    const artSvg = svgEl('svg', {
      viewBox: '0 0 64 42',
      width: '64',
      height: '42',
      'aria-hidden': 'true',
      class: 'gev-welcome__art',
    });
    const artDoc = svgParser.parseFromString(
      `<svg xmlns="${svgNS}">${t.art}</svg>`,
      'image/svg+xml',
    );
    for (const child of artDoc.documentElement.childNodes) {
      artSvg.append(document.importNode(child, true));
    }

    const b = document.createElement('b');
    b.textContent = t.title;
    const tileSpan = document.createElement('span');
    tileSpan.textContent = t.text;
    li.append(artSvg, b, tileSpan);
    ul.append(li);
  }

  // Footer – countdown ring + buttons.
  const footer = document.createElement('footer');
  footer.className = 'gev-welcome__foot';

  const countDiv = document.createElement('div');
  countDiv.className = 'gev-welcome__count';
  countDiv.setAttribute('aria-hidden', 'true');

  const countSvg = svgEl('svg', {
    viewBox: '0 0 52 52',
    width: '52',
    height: '52',
    'aria-hidden': 'true',
  });
  const track = svgEl('circle', {
    cx: '26', cy: '26', r: String(R), class: 'gev-welcome__track',
  });
  const arc = svgEl('circle', {
    cx: '26', cy: '26', r: String(R), class: 'gev-welcome__arc',
    'stroke-dasharray': String(C), 'stroke-dashoffset': '0',
  });
  countSvg.append(track, arc);

  const num = document.createElement('span');
  num.className = 'gev-welcome__num';
  num.textContent = String(seconds);
  countDiv.append(countSvg, num);

  const hint = document.createElement('p');
  hint.className = 'gev-welcome__hint';
  const secs = document.createElement('b');
  secs.className = 'gev-welcome__secs';
  secs.textContent = String(seconds);
  hint.append('Tour starts in ', secs, ' s');

  const btns = document.createElement('div');
  btns.className = 'gev-welcome__btns';
  const exploreBtn = document.createElement('button');
  exploreBtn.type = 'button';
  exploreBtn.className = 'gev-btn';
  exploreBtn.dataset.act = 'explore';
  exploreBtn.textContent = 'Explore on my own';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'gev-btn gev-btn--primary';
  startBtn.dataset.act = 'start';
  startBtn.textContent = 'Start now';
  btns.append(exploreBtn, startBtn);

  footer.append(countDiv, hint, btns);

  const buildP = document.createElement('p');
  buildP.className = 'gev-welcome__build';
  buildP.textContent = 'Build ' + BUILD_ID;

  card.append(kicker, h1, byLine, leadP, ul, footer, buildP);
  root.append(card);
  document.body.append(root);
  // A modal for keyboard and screen-reader users too: everything behind the
  // card is inert (unfocusable, unread) until it closes.
  const behind = [...document.body.children].filter(
    (node) => node !== root && !node.inert,
  );
  for (const node of behind) node.inert = true;

  // arc, num, secs are already defined above as direct DOM references.
  const started = performance.now();
  let raf = 0;
  let done = false;

  function finish(action) {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const node of behind) node.inert = false;
    window.removeEventListener('keydown', onKey);
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
  function onKey(event) {
    if (event.key === 'Escape') {
      finish('explore');
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep Tab inside the card: wrap from the last button to the first.
    const stops = [...root.querySelectorAll('button')];
    if (!stops.length) return;
    const first = stops[0];
    const last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
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
