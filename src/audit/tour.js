/**
 * @file Guided tour of the AUDIT view for first-time viewers.
 * Each step lights one cockpit zone and the matching part of the orbit
 * together. Arrow keys step, Esc exits. Shown once automatically (a large
 * prompt), then always available from "How it works".
 * @module audit/tour
 */

const SEEN_KEY = 'gev-audit-tour-seen';

/** Whether this viewer has seen or dismissed the tour (per browser). */
export function tourSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage blocked: the prompt shows again next time */
  }
}

/** The tour script. `zone` names a cockpit zone; `run` drives the orbit. */
export const TOUR_STEPS = Object.freeze([
  {
    title: 'Welcome to CrossCheck',
    body: 'CrossCheck checks software against two global standards: EUROCAE ED-153 for aviation software safety, and OWASP ASVS for application security. Here it is checking God’s Eye View itself.',
  },
  {
    title: 'The centre is the software being checked',
    body: 'The glass globe stands for God’s Eye View. Everything around it is a question the software must answer with evidence.',
    run: (a) => a.pulse('core'),
  },
  {
    title: 'The inner ring is safety',
    body: '115 objectives from ED-153, grouped into process areas. At the safety level chosen here (SWAL 3), 104 of them apply.',
    run: (a) => a.pulse('saf'),
  },
  {
    title: 'The outer ring is security',
    body: '345 requirements from OWASP ASVS 5.0, grouped into chapters. Level 2 applies here: 253 of them.',
    run: (a) => a.pulse('sec'),
  },
  {
    title: 'How ready each side is',
    body: 'Each dial shows readiness. The line under it is the verdict. Red means a claim cannot be made yet.',
    zone: 'status',
  },
  {
    title: 'Raised pins must be fixed',
    body: 'These items block a safe-and-secure claim. On first load they are the only things lit, and they are listed here, most severe first.',
    zone: 'alerts',
    run: (a) => a.pulse('mustfix', 4000),
  },
  {
    title: 'Click any pin to read it',
    body: 'Every item explains itself in plain words: what it is, why it matters, the fix, and its evidence trail. Double-click a pin to fly to it.',
    zone: 'detail',
    run: (a) => a.select('V8.2.1'),
  },
  {
    title: 'Some fixes help both standards',
    body: 'Threads link safety and security items that need the same evidence. Fix once and both sides improve.',
    zone: 'detail',
    run: (a, t) => {
      t.restoreLinks ??= a.layerState('links');
      a.layer('links', true);
    },
  },
  {
    title: 'Turn layers on and off',
    body: 'Layers you have not switched on stay at 15%, so you keep the context without the clutter. Try it: switch on Passing to see what already meets the standards.',
    zone: 'layers',
  },
  {
    title: 'See how the gaps are being closed',
    body: 'Evidence opens the full record, 40,000 ft first: the pipeline, before and now, and the readiness journey, then wave by wave down to each finding’s history.',
    zone: 'evidence',
  },
  {
    title: 'You’re ready',
    body: 'Drag to rotate, scroll to zoom, double-click a pin to fly to it. Esc steps back. Exit audit returns to the live globe.',
  },
]);

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function button(cls, text) {
  const b = h('button', cls, text);
  b.type = 'button';
  return b;
}

/**
 * @param {{container: HTMLElement, zones: Record<string, HTMLElement>, actions: object}} o
 */
export function createTour({ container, zones, actions }) {
  const root = h('div', 'gev-tour');
  root.hidden = true;
  const spot = h('div', 'gev-tour-spot');
  const card = h('div', 'gev-tour-card gev-audit-glass');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'gev-tour-title');
  root.append(spot, card);
  container.append(root);

  let index = -1;
  let mode = 'closed'; // closed | prompt | step
  const memo = {};

  function placeCard(rect) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cw = Math.min(380, W - 32);
    card.style.width = `${cw}px`;
    if (!rect) {
      card.style.left = `${(W - cw) / 2}px`;
      card.style.top = '';
      card.style.bottom = '32px';
      spot.hidden = true;
      return;
    }
    spot.hidden = false;
    Object.assign(spot.style, {
      left: `${rect.left - 8}px`,
      top: `${rect.top - 8}px`,
      width: `${rect.width + 16}px`,
      height: `${rect.height + 16}px`,
    });
    const ch = card.offsetHeight || 220;
    let left = rect.right + 16;
    if (left + cw > W - 16) left = rect.left - cw - 16;
    if (left < 16) left = Math.min(Math.max(16, rect.left), W - cw - 16);
    let top = rect.top;
    if (left === Math.min(Math.max(16, rect.left), W - cw - 16))
      top = rect.top > H / 2 ? rect.top - ch - 16 : rect.bottom + 16;
    top = Math.min(Math.max(16, top), H - ch - 16);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.bottom = '';
  }

  function renderPrompt() {
    mode = 'prompt';
    root.hidden = false;
    root.dataset.mode = 'prompt';
    spot.hidden = true;
    const start = button(
      'gev-audit-btn is-strong is-big',
      'Take the guided tour',
    );
    const skip = button('gev-audit-btn is-big', 'Explore on my own');
    start.addEventListener('click', () => api.start());
    skip.addEventListener('click', () => {
      markSeen();
      api.close();
    });
    const actionsRow = h('div', 'gev-tour-actions');
    actionsRow.append(start, skip);
    const title = h('h2', 'gev-tour-big', 'First time here?');
    title.id = 'gev-tour-title';
    card.replaceChildren(
      h('span', 'gev-audit-zlabel', 'CrossCheck · audit view'),
      title,
      h(
        'p',
        null,
        'Take a two-minute tour of what this view checks, what each display means, how it maps to the 3D space, and how to switch layers on and off.',
      ),
      actionsRow,
    );
    const w = Math.min(680, window.innerWidth - 32);
    card.style.width = `${w}px`;
    card.style.left = `${(window.innerWidth - w) / 2}px`;
    card.style.top = `${Math.max(16, window.innerHeight * 0.26)}px`;
    card.style.bottom = '';
    start.focus();
  }

  function renderStep() {
    const step = TOUR_STEPS[index];
    root.dataset.mode = 'step';
    const title = h('h2', 'gev-tour-title', step.title);
    title.id = 'gev-tour-title';
    const back = button('gev-audit-btn', 'Back');
    back.disabled = index === 0;
    const last = index === TOUR_STEPS.length - 1;
    const next = button('gev-audit-btn is-strong', last ? 'Finish' : 'Next');
    const skip = button('gev-audit-link', 'Skip tour');
    back.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => (last ? api.close() : go(index + 1)));
    skip.addEventListener('click', () => api.close());
    const dots = h('span', 'gev-tour-dots');
    TOUR_STEPS.forEach((_, i) => {
      const d = h('i');
      d.dataset.on = String(i <= index);
      dots.append(d);
    });
    const row = h('div', 'gev-tour-actions');
    row.append(back, next, dots, skip);
    card.replaceChildren(
      h(
        'span',
        'gev-audit-zlabel',
        `Step ${index + 1} of ${TOUR_STEPS.length}`,
      ),
      title,
      h('p', null, step.body),
      row,
    );
    const zone = step.zone ? zones[step.zone] : null;
    placeCard(zone ? zone.getBoundingClientRect() : null);
    // Second pass once the card has its real height.
    requestAnimationFrame(() =>
      placeCard(zone ? zone.getBoundingClientRect() : null),
    );
    next.focus();
  }

  function go(i) {
    index = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
    mode = 'step';
    root.hidden = false;
    TOUR_STEPS[index].run?.(actions, memo);
    renderStep();
  }

  function onKey(e) {
    if (mode === 'closed') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (mode === 'prompt') markSeen();
      api.close();
    } else if (mode === 'step' && e.key === 'ArrowRight') {
      e.preventDefault();
      if (index < TOUR_STEPS.length - 1) go(index + 1);
    } else if (mode === 'step' && e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  }
  window.addEventListener('keydown', onKey, { capture: true });
  const onResize = () => {
    if (mode === 'step') renderStep();
    else if (mode === 'prompt') renderPrompt();
  };
  window.addEventListener('resize', onResize);

  const api = {
    prompt: renderPrompt,
    start() {
      actions.closeEvidence?.();
      go(0);
    },
    close() {
      if (mode === 'step') markSeen();
      if (memo.restoreLinks !== undefined) {
        actions.layer('links', memo.restoreLinks);
        delete memo.restoreLinks;
      }
      mode = 'closed';
      index = -1;
      root.hidden = true;
    },
    isOpen: () => mode !== 'closed',
    destroy() {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
  return api;
}
