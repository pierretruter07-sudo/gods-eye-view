/**
 * @file The CrossCheck page: a hash router over five views and the shared
 * state of the current assessment (intake, facts, chosen standards, result).
 * @module crosscheck/app/main
 */
import { api } from './api.js';
import { h, mount, store } from './dom.js';
import { renderAssess } from './views/assess.js';
import { renderReport } from './views/report.js';
import { renderPlan } from './views/plan.js';
import { renderStandards } from './views/standards.js';
import { renderExample } from './views/example.js';

/** Shared state; views read it and call `update` to change it. */
export const state = {
  status: null,
  library: null,
  facts: null,
  signals: null,
  intake: null,
  answers: store.get('cc.answers', {}),
  chosen: store.get('cc.standards', null),
  levels: store.get('cc.levels', {}),
  useAi: false,
  result: null,
  busy: null,
  error: null,
};

const VIEWS = {
  assess: renderAssess,
  report: renderReport,
  plan: renderPlan,
  standards: renderStandards,
  example: renderExample,
};

const root = document.getElementById('view');

/** Re-render the current view. */
export function render() {
  const name = currentView();
  for (const a of document.querySelectorAll('.cc-nav a')) {
    const on = a.dataset.view === name;
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    a.classList.toggle('is-disabled', (a.dataset.view === 'report' || a.dataset.view === 'plan') && !state.result);
  }
  try {
    mount(root, VIEWS[name](state, { update, go }));
  } catch (error) {
    console.error(error);
    mount(root, h('p', { class: 'error' }, `Something went wrong drawing this page: ${error.message}`));
  }
}

/** Change state and re-render. */
export function update(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  store.set('cc.answers', state.answers);
  if (state.chosen) store.set('cc.standards', state.chosen);
  store.set('cc.levels', state.levels);
  render();
}

/** Go to a view. */
export function go(name) {
  if (location.hash !== `#${name}`) location.hash = name;
  else render();
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function currentView() {
  const name = (location.hash || '#assess').slice(1);
  return VIEWS[name] ? name : 'assess';
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0 });
});

async function boot() {
  render();
  try {
    const [status, lib, facts, signals] = await Promise.all([api.status(), api.standards(), api.facts(), api.signals()]);
    update({
      status,
      library: lib.standards,
      facts: facts.facts,
      signals,
      chosen: state.chosen || lib.standards.map((s) => s.id),
    });
  } catch (error) {
    update({ error: error.message });
  }
}

boot();
