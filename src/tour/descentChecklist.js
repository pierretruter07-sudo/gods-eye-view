/**
 * @file The opening-descent checklist: a slim rail at the side of the screen
 * that lists every level from geostationary orbit to the street, ticks each
 * one off as the Director arrives, and fades away when the descent ends.
 * Text comes from the descent levels and live feed values; set through
 * textContent only.
 * @module tour/descentChecklist
 */

const STATE_LABEL = Object.freeze({
  pending: 'Next',
  active: 'Now',
  done: 'Done',
  skipped: 'Nothing live',
});

/**
 * @param {{root?: HTMLElement}} [options]
 */
export function createDescentChecklist({ root = document.body } = {}) {
  let panel = null;
  let rows = [];
  let fadeTimer = 0;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function start(levels) {
    clearTimeout(fadeTimer);
    panel?.remove();
    panel = el('aside', 'gev-descent gev-glass');
    panel.setAttribute('aria-label', 'Opening descent');
    const head = el('header', 'gev-descent__head');
    const kicker = el('p', 'gev-descent__kicker', 'From orbit to street');
    const count = el('p', 'gev-descent__count', `${levels.length} levels`);
    head.append(kicker, count);
    const list = el('ol', 'gev-descent__list');
    rows = levels.map((level, i) => {
      const li = el('li', 'gev-descent__row');
      li.dataset.state = 'pending';
      const mark = el('span', 'gev-descent__mark');
      mark.setAttribute('aria-hidden', 'true');
      const num = el('span', 'gev-descent__num', String(i + 1));
      mark.append(num);
      const body = el('span', 'gev-descent__body');
      const label = el('span', 'gev-descent__label', level.label);
      const detail = el('span', 'gev-descent__detail', level.nominal);
      const sr = el('span', 'gev-descent__sr', `, ${STATE_LABEL.pending}`);
      body.append(label, detail, sr);
      li.append(mark, body);
      list.append(li);
      return { li, detail, sr, nominal: level.nominal, live: '' };
    });
    panel.append(head, list);
    root.append(panel);
    requestAnimationFrame(() => panel?.classList.add('is-in'));
  }

  /**
   * @param {string[]} states - one per level (see levelStates)
   * @param {{index?: number, detail?: string}} [live] - live detail for a level
   */
  function update(states, live = {}) {
    if (!panel) return;
    if (Number.isInteger(live.index) && rows[live.index] && live.detail)
      rows[live.index].live = live.detail;
    states.forEach((state, i) => {
      const r = rows[i];
      if (!r) return;
      r.li.dataset.state = state;
      r.detail.textContent = r.live || r.nominal;
      r.sr.textContent = `, ${STATE_LABEL[state] || state}`;
      if (state === 'active') r.li.setAttribute('aria-current', 'step');
      else r.li.removeAttribute('aria-current');
    });
    const done = states.filter((s) => s === 'done').length;
    const count = panel.querySelector('.gev-descent__count');
    if (count) count.textContent = `${done} of ${states.length} levels`;
  }

  /** Fade out and remove (after a short beat so the last tick is seen). */
  function finish({ delayMs = 1800 } = {}) {
    if (!panel) return;
    const p = panel;
    panel = null;
    fadeTimer = setTimeout(() => {
      p.classList.remove('is-in');
      p.classList.add('is-leaving');
      setTimeout(() => p.remove(), 700);
    }, delayMs);
  }

  return {
    start,
    update,
    finish,
    destroy() {
      clearTimeout(fadeTimer);
      panel?.remove();
      panel = null;
    },
  };
}
