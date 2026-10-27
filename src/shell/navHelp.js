/**
 * @file The camera controls panel: a slim strip down the left edge of the
 * screen that says how to move, how to focus on an asset and how to get
 * back (Pierre, 28 Oct: "a display on the left-hand side ... that tells the
 * user how to reset the camera, how to navigate"). A compass at its top
 * shows which way is north and turns the view north when pressed.
 *
 * It folds to a small tab (the ? key or its own button; remembered per
 * browser), steps aside while another panel holds the left column, and is
 * hidden while the Director runs. All text is set with textContent.
 * @module shell/navHelp
 */

/** The rows of the panel: [keys, what they do]. Pure data, tested. */
export const NAV_HELP = Object.freeze([
  Object.freeze({
    title: 'Mouse',
    rows: Object.freeze([
      ['Left drag', 'Rotate and tilt'],
      ['Right drag', 'Pan (or middle drag, Shift + drag)'],
      ['Wheel', 'Zoom to the cursor'],
      ['Double-click', 'Fly in to that spot'],
      ['Click an asset', 'Focus on it; drag to orbit it'],
    ]),
  }),
  Object.freeze({
    title: 'Keys',
    rows: Object.freeze([
      ['W A S D', 'Move (or the arrow keys)'],
      ['Q  E', 'Turn left, right'],
      ['Z  X', 'Tilt up, down (or Shift + ↑ ↓)'],
      ['+  −', 'Zoom in, out'],
    ]),
  }),
  Object.freeze({
    title: 'Get your bearings',
    rows: Object.freeze([
      ['F', 'Frame the selected asset'],
      ['Esc', 'Let go of the asset'],
      ['N', 'Face north'],
      ['U', 'Look straight down'],
      ['H', 'Whole planet'],
      ['?', 'Hide or show this panel'],
    ]),
  }),
]);

const STORE_KEY = 'gev.navHelp.folded';

function readFolded() {
  try {
    return globalThis.localStorage?.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeFolded(folded) {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, folded ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts this visit */
  }
}

/**
 * @param {{viewer: object, command: (name: string) => boolean,
 *   doc?: Document}} options
 */
export function installNavHelp({ viewer, command, doc = document }) {
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const root = el('aside', 'gev-navhelp gev-glass');
  root.setAttribute('aria-label', 'Camera controls');

  const head = el('div', 'gev-navhelp__head');
  const compass = el('button', 'gev-navhelp__compass');
  compass.type = 'button';
  compass.setAttribute('aria-label', 'Face north (N)');
  compass.title = 'Face north (N)';
  const needle = el('span', 'gev-navhelp__needle', 'N');
  needle.setAttribute('aria-hidden', 'true');
  compass.append(needle);
  const title = el('span', 'gev-navhelp__title', 'Controls');
  const fold = el('button', 'gev-navhelp__fold');
  fold.type = 'button';
  head.append(compass, title, fold);

  const focusRow = el('p', 'gev-navhelp__focus');
  focusRow.hidden = true;

  const body = el('div', 'gev-navhelp__body');
  for (const group of NAV_HELP) {
    body.append(el('h3', 'gev-navhelp__group', group.title));
    const dl = el('dl', 'gev-navhelp__rows');
    for (const [keys, what] of group.rows) {
      dl.append(el('dt', null, keys), el('dd', null, what));
    }
    body.append(dl);
  }
  const buttons = el('div', 'gev-navhelp__buttons');
  const homeBtn = el('button', 'gev-btn gev-navhelp__btn', 'Whole planet');
  homeBtn.type = 'button';
  homeBtn.title = 'H';
  const northBtn = el('button', 'gev-btn gev-navhelp__btn', 'North up');
  northBtn.type = 'button';
  northBtn.title = 'N';
  buttons.append(homeBtn, northBtn);
  body.append(buttons);

  root.append(head, focusRow, body);
  doc.body.append(root);

  let folded = readFolded();
  function setFolded(value) {
    folded = Boolean(value);
    root.classList.toggle('is-folded', folded);
    body.hidden = folded;
    fold.textContent = folded ? '?' : '‹';
    fold.setAttribute(
      'aria-label',
      folded ? 'Show the camera controls (?)' : 'Hide the camera controls (?)',
    );
    fold.setAttribute('aria-expanded', String(!folded));
    writeFolded(folded);
  }
  setFolded(folded);

  fold.addEventListener('click', () => setFolded(!folded));
  compass.addEventListener('click', () => command('north'));
  homeBtn.addEventListener('click', () => command('home'));
  northBtn.addEventListener('click', () => command('north'));
  const onKey = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== '?') return;
    const t = event.target;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]'))
      return;
    event.preventDefault();
    setFolded(!folded);
  };
  doc.addEventListener('keydown', onKey);

  // The needle points at north on screen.
  let lastDeg = null;
  const turn = () => {
    const deg = Math.round((viewer.camera.heading * 180) / Math.PI);
    if (deg === lastDeg) return;
    lastDeg = deg;
    needle.style.transform = `rotate(${-deg}deg)`;
  };
  const removeTurn = viewer.scene.postRender.addEventListener(turn);
  turn();

  return {
    /** The focus camera took or let go of an asset. */
    setFocus({ active, label }) {
      focusRow.hidden = !active;
      focusRow.textContent = active
        ? `Focused on ${label || 'the asset'} · drag to orbit · Esc to let go`
        : '';
    },
    setFolded,
    destroy() {
      removeTurn();
      doc.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
