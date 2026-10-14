/**
 * @file Guided tour of the AUDIT view, led by the camera.
 *
 * Each step flies the camera to its subject around the orbit (showing on the
 * way how the view can be rotated, zoomed, tilted and focused), dims the
 * rest of the orbit and of the screen, and lights the matching cockpit
 * section. Arrow keys step, Esc exits, input on the globe takes the camera
 * back. Shown once automatically (a large prompt), then from "Guided tour".
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

/** Movement hints shown while the camera demonstrates them. */
const MOVES = Object.freeze({
  rotate: {
    label: 'Rotate',
    how: 'drag with the left mouse button',
    icon: '<path d="M14 8a6 6 0 1 1-2-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12.6 1.2v3.2H9.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  zoomIn: {
    label: 'Zoom in',
    how: 'scroll, or drag with the right button',
    icon: '<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l4 4M5 7h4M7 5v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  zoomOut: {
    label: 'Zoom out',
    how: 'scroll the other way',
    icon: '<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l4 4M5 7h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  },
  tilt: {
    label: 'Tilt',
    how: 'Ctrl + drag, or drag with the middle button',
    icon: '<path d="M2 11c3-5 9-5 12 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 2v6M5.5 4.5L8 2l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  focus: {
    label: 'Fly to',
    how: 'double-click a pin, or pick it from a list',
    icon: '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>',
  },
});

const restoreLayer = (a, m, id) => {
  if (m[`layer:${id}`] !== undefined) {
    a.layer(id, m[`layer:${id}`]);
    delete m[`layer:${id}`];
  }
};
const setLayer = (a, m, id, on) => {
  if (m[`layer:${id}`] === undefined) m[`layer:${id}`] = a.layerState(id);
  a.layer(id, on);
};

/**
 * The tour script.
 * - `shot`: where the camera goes (degrees; `target` a point or an item id).
 * - `focus`: the orbit part left bright ('core'|'saf'|'sec'|'mustfix'|'links').
 * - `zone`: the cockpit element to light; everything else in the cockpit dims.
 * - `shade`: '3d' darkens the screen edges, 'ui' darkens the orbit too,
 *   'none' leaves the view clear (the try-it-yourself step).
 * - `move`: the movement the camera is demonstrating.
 */
export const TOUR_STEPS = Object.freeze([
  {
    title: 'Welcome to CrossCheck',
    body: 'CrossCheck checks software against three global standards: EUROCAE ED-153 for aviation software safety, OWASP ASVS for application security and ISO/IEC 42001 for managing AI responsibly. Here it is checking God’s Eye View itself.',
    shade: '3d',
    shot: (a) => ({
      az: -38,
      el: 24,
      dist: a.homeDist() * 0.9,
      seconds: 3.4,
      lift: 0.08,
      drift: 4,
    }),
    move: 'rotate',
  },
  {
    title: 'The centre is the software being checked',
    body: 'The glass globe stands for God’s Eye View. Everything around it is a question the software must answer with evidence.',
    shade: '3d',
    focus: 'core',
    shot: () => ({
      target: [0, 0, 0],
      az: 24,
      el: 16,
      dist: 7.5,
      seconds: 3,
      drift: 7,
    }),
    move: 'zoomIn',
  },
  {
    title: 'The inner ring is safety',
    body: '115 objectives from ED-153, grouped into process areas. At the safety level chosen here (SWAL 3), 104 of them apply.',
    shade: '3d',
    focus: 'saf',
    shot: () => ({
      target: [0, 0.1, 0],
      az: -55,
      el: 56,
      dist: 15,
      seconds: 3,
      lift: 0.1,
      drift: 5,
    }),
    move: 'tilt',
  },
  {
    title: 'The middle ring is security',
    body: '345 requirements from OWASP ASVS 5.0, grouped into chapters. Level 2 applies here: 253 of them.',
    shade: '3d',
    focus: 'sec',
    shot: () => ({
      target: [0, -0.4, 0],
      az: 32,
      el: 24,
      dist: 24,
      seconds: 3,
      drift: 4,
    }),
    move: 'zoomOut',
  },
  {
    title: 'The outer ring is AI management',
    body: '65 items from ISO/IEC 42001: the management-system clauses 4 to 10 and the Annex A controls. They ask whether the AI parts of God’s Eye View (the narrator and its sources) are governed, risk-assessed and monitored.',
    shade: '3d',
    focus: 'ai',
    shot: () => ({
      target: [0, -0.8, 0],
      az: -20,
      el: 30,
      dist: 31,
      seconds: 3,
      drift: 4,
    }),
    move: 'rotate',
  },
  {
    title: 'Raised pins must be fixed',
    body: 'These items block a claim on their standard. They are the only things lit on first load, and they are listed on the left, grouped by standard.',
    shade: '3d',
    focus: 'mustfix',
    zone: 'mustfix',
    open: 'mustfix',
    shot: () => ({
      target: '3.3.2',
      az: 0,
      el: 30,
      dist: 9,
      seconds: 2.8,
      drift: 3,
    }),
    move: 'focus',
  },
  {
    title: 'How ready each side is',
    body: 'Each dial shows readiness on that standard. The line under it is the verdict: red means a claim cannot be made yet.',
    shade: 'ui',
    zone: 'readiness',
    open: 'readiness',
    shot: (a) => ({
      az: -10,
      el: 34,
      dist: a.homeDist(),
      seconds: 2.4,
      drift: 2,
    }),
  },
  {
    title: 'Click any pin to read it',
    body: 'Every item explains itself in plain words: what it is, why it matters and the fix. Its evidence trail folds open underneath.',
    shade: '3d',
    zone: 'detail',
    run: (a, m) => {
      m.selected = true;
      a.select('V8.2.1');
    },
    shot: () => ({ target: 'V8.2.1', az: 0, el: 26, dist: 10, seconds: 2.6 }),
    move: 'focus',
  },
  {
    title: 'One fix can help several standards',
    body: 'Threads link safety, security and AI items that need the same evidence. Fix once and every linked ring improves.',
    shade: '3d',
    focus: 'links',
    zone: 'detail',
    run: (a, m) => setLayer(a, m, 'links', true),
    leave: (a, m) => restoreLayer(a, m, 'links'),
    shot: () => ({
      target: [0, -0.2, 0],
      az: 64,
      el: 58,
      dist: 24,
      seconds: 3,
      lift: 0.1,
      drift: 4,
    }),
    move: 'rotate',
  },
  {
    title: 'Turn layers on and off',
    body: 'Layers that are off stay faint (15%), so you keep the context without the clutter. Watch: Passing switches on to show what already meets the standards.',
    shade: '3d',
    zone: 'layers',
    open: 'layers',
    run: (a, m) => {
      m.timer = setTimeout(() => setLayer(a, m, 'passing', true), 1300);
    },
    leave: (a, m) => {
      clearTimeout(m.timer);
      restoreLayer(a, m, 'passing');
    },
    shot: (a) => ({
      az: 20,
      el: 40,
      dist: a.homeDist() * 0.95,
      seconds: 2.4,
      drift: 3,
    }),
  },
  {
    title: 'Watch the gaps close',
    body: 'The timeline runs from the baseline audit through each remediation wave. Solid stops are measured by a re-audit. Dashed stops are the plan’s target and stay labelled Projected until they are measured. Press play to run it.',
    shade: '3d',
    zone: 'timeline',
    run: (a, m) => {
      m.stop ??= a.stopIndex();
      m.timer = setTimeout(() => a.stop(a.lastStop()), 1200);
    },
    leave: (a, m) => {
      clearTimeout(m.timer);
      if (m.stop !== undefined) a.stop(m.stop);
      delete m.stop;
    },
    shot: (a) => ({
      az: -15,
      el: 42,
      dist: a.homeDist() * 0.92,
      seconds: 2.4,
      drift: 3,
    }),
  },
  {
    title: 'Now you try',
    body: 'The camera is yours. It moves just like the live globe:',
    keys: [
      ['Drag', 'Rotate'],
      ['Scroll', 'Zoom'],
      ['Ctrl + drag', 'Tilt'],
      ['Double-click', 'Fly to a pin'],
      ['Reset view', 'Back to the start'],
    ],
    shade: 'none',
    zone: 'reset',
    free: true,
  },
  {
    title: 'See how the gaps are being closed',
    body: 'Evidence opens the full record, 40,000 ft first: the pipeline, before and now, and the readiness journey, then wave by wave down to each finding’s history.',
    shade: 'ui',
    zone: 'evidence',
  },
  {
    title: 'You’re ready',
    body: 'Esc steps back. Exit audit returns to the live globe, exactly where you left it.',
    shade: '3d',
    home: true,
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
 * @param {{container: HTMLElement, shadeBefore: HTMLElement,
 *   zones: Record<string, any>, actions: object}} o
 */
export function createTour({ container, shadeBefore, zones, actions }) {
  const shade = h('div', 'gev-tour-shade');
  container.insertBefore(shade, shadeBefore);
  const root = h('div', 'gev-tour');
  root.hidden = true;
  const spot = h('div', 'gev-tour-spot');
  spot.hidden = true;
  const move = h('div', 'gev-tour-move');
  move.setAttribute('aria-live', 'polite');
  const card = h('div', 'gev-tour-card gev-audit-glass');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'gev-tour-title');
  root.append(spot, move, card);
  container.append(root);

  let index = -1;
  let mode = 'closed'; // closed | prompt | step
  const memo = {};
  let moveTimer = null;
  const opened = new Set(); // sections the tour expanded

  const dimmables = () =>
    [
      zones.top,
      zones.readiness,
      zones.mustfix,
      zones.layers,
      zones.key,
      zones.detail,
      zones.timeline,
      zones.stage?.querySelector('.gev-audit-hint'),
    ].filter(Boolean);

  function setDim(focusEl, all) {
    for (const el of dimmables()) {
      const keep =
        focusEl &&
        (el === focusEl || el.contains(focusEl) || focusEl.contains(el));
      el.dataset.dim = String(all ? !keep : false);
    }
  }
  function clearDim() {
    for (const el of dimmables()) delete el.dataset.dim;
  }

  function showMove(key, seconds) {
    clearTimeout(moveTimer);
    const m = key && MOVES[key];
    if (!m) {
      move.dataset.on = 'false';
      return;
    }
    move.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${m.icon}</svg>`;
    move.append(h('b', null, m.label), h('span', null, m.how));
    move.dataset.on = 'true';
    moveTimer = setTimeout(
      () => (move.dataset.on = 'false'),
      (seconds + 2.2) * 1000,
    );
  }

  function placeCard(rect) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cw = Math.min(344, W - 32);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight || 200;
    const clampX = (x) => Math.min(Math.max(16, x), W - cw - 16);
    const clampY = (y) => Math.min(Math.max(16, y), H - ch - 16);
    if (!rect) {
      // Bottom left, over the dimmed rail: the orbit stays in full view.
      card.style.left = `${clampX(16)}px`;
      card.style.top = `${clampY(H - ch - 16)}px`;
      return;
    }
    const cx = rect.left + rect.width / 2;
    let left;
    let top;
    if (cx < W / 3 && rect.right + 20 + cw <= W - 16) {
      left = rect.right + 20;
      top = rect.top;
    } else if (cx > (2 * W) / 3 && rect.left - 20 - cw >= 16) {
      left = rect.left - 20 - cw;
      top = rect.top;
    } else if (rect.top < H / 2) {
      left = Math.min(rect.right - cw, cx - cw / 2);
      top = rect.bottom + 18;
    } else {
      left = cx - cw / 2;
      top = rect.top - ch - 18;
    }
    card.style.left = `${clampX(left)}px`;
    card.style.top = `${clampY(top)}px`;
  }

  function placeSpot(el) {
    if (!el) {
      spot.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    spot.hidden = false;
    Object.assign(spot.style, {
      left: `${r.left - 6}px`,
      top: `${r.top - 6}px`,
      width: `${r.width + 12}px`,
      height: `${r.height + 12}px`,
    });
  }

  function renderPrompt() {
    mode = 'prompt';
    root.hidden = false;
    root.dataset.mode = 'prompt';
    container.dataset.tour = 'on';
    shade.dataset.mode = 'prompt';
    setDim(null, true);
    spot.hidden = true;
    move.dataset.on = 'false';
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
        'Take a two-minute flight around the audit: what it checks, what each display means, how it maps to the 3D space, how to switch layers, and how the gaps close wave by wave.',
      ),
      actionsRow,
    );
    const w = Math.min(640, window.innerWidth - 32);
    card.style.width = `${w}px`;
    card.style.left = `${(window.innerWidth - w) / 2}px`;
    card.style.top = `${Math.max(16, (window.innerHeight - (card.offsetHeight || 260)) / 2)}px`;
    // A slow turn behind the prompt: the view is alive and can move.
    actions.shot({
      az: 0,
      el: 34,
      dist: actions.homeDist(),
      seconds: 1.2,
      drift: 2.5,
    });
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
    row.append(back, next, dots);
    const parts = [
      h(
        'span',
        'gev-audit-zlabel',
        `Step ${index + 1} of ${TOUR_STEPS.length}`,
      ),
      title,
      h('p', null, step.body),
    ];
    if (step.keys) {
      const ul = h('ul');
      for (const [k, v] of step.keys) {
        const li = h('li');
        li.append(h('kbd', null, k));
        ul.append(li, h('li', null, v));
      }
      parts.push(ul);
    }
    parts.push(row, skip);
    card.replaceChildren(...parts);
    const zone = step.zone ? zones[step.zone] : null;
    const layout = () => {
      placeSpot(zone);
      placeCard(zone ? zone.getBoundingClientRect() : null);
    };
    layout();
    // Again once sections have opened and the card has its real height.
    requestAnimationFrame(layout);
    setTimeout(layout, 260);
    next.focus({ preventScroll: true });
  }

  function leaveStep() {
    const step = TOUR_STEPS[index];
    step?.leave?.(actions, memo);
  }

  function go(i) {
    const to = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
    if (mode === 'step') leaveStep();
    index = to;
    mode = 'step';
    root.hidden = false;
    container.dataset.tour = 'on';
    const step = TOUR_STEPS[index];
    shade.dataset.mode = step.shade || '3d';
    if (step.open && !actions.sectionOpen(step.open)) {
      actions.openSection(step.open);
      opened.add(step.open);
    }
    const zone = step.zone ? zones[step.zone] : null;
    setDim(zone, !step.free);
    actions.emphasis(step.focus || null);
    step.run?.(actions, memo);
    if (step.free) {
      actions.stopCamera();
      showMove(null);
    } else if (step.home) {
      actions.home();
      showMove(null);
    } else if (step.shot) {
      const s = step.shot(actions);
      actions.shot(s);
      showMove(step.move, s.seconds || 2.6);
    } else showMove(null);
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
      if (mode === 'closed') return;
      if (mode === 'step') {
        markSeen();
        leaveStep();
      }
      for (const id of opened) if (id === 'layers') actions.closeSection(id);
      opened.clear();
      if (zones.rail) zones.rail.scrollTop = 0;
      clearTimeout(moveTimer);
      move.dataset.on = 'false';
      if (memo.selected) actions.select(null);
      delete memo.selected;
      actions.emphasis(null);
      actions.stopCamera();
      clearDim();
      delete container.dataset.tour;
      mode = 'closed';
      index = -1;
      root.hidden = true;
      spot.hidden = true;
    },
    isOpen: () => mode !== 'closed',
    destroy() {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('resize', onResize);
      clearTimeout(moveTimer);
      root.remove();
      shade.remove();
    },
  };
  return api;
}
