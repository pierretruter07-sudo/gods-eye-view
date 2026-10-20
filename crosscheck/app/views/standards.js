/**
 * @file The Standards view: the library CrossCheck rates against, with what
 * each covers, its licence, and how many items code evidence can rate.
 * @module crosscheck/app/views/standards
 */
import { api } from '../api.js';
import { h } from '../dom.js';

const cache = new Map();
let openId = null;

export function renderStandards(state, { update }) {
  const lib = state.library;
  if (!lib) return h('p', {}, h('span', { class: 'spinner' }), ' Loading the standards…');
  const open = openId ? cache.get(openId) : null;
  const show = async (id) => {
    openId = openId === id ? null : id;
    if (openId && !cache.has(id)) {
      try {
        cache.set(id, await api.standard(id));
      } catch (error) {
        cache.set(id, { error: error.message });
      }
    }
    update({});
  };
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      {},
      h('h1', {}, 'Standards library'),
      h(
        'p',
        { class: 'lede' },
        `${lib.length} standards, ${lib.reduce((n, s) => n + s.inScope, 0).toLocaleString()} items in scope. Each item is tied to the evidence checks and intake questions that rate it; items nothing in code can show go to a reviewer.`,
      ),
    ),
    h(
      'div',
      { class: 'grid' },
      ...lib.map((s) =>
        h(
          'article',
          { class: 'panel stack', style: { gap: '8px' } },
          h('div', { class: 'label' }, s.lens),
          h('h3', {}, s.name),
          h('div', { class: 'small' }, `${s.inScope} items in scope (of ${s.items}) · ${s.mapped} rated from evidence or answers`),
          s.levels ? h('div', { class: 'small muted' }, `${s.levelName}s ${s.levels.join(', ')} (default ${s.defaultLevel})`) : null,
          s.applies === 'ai' ? h('div', { class: 'small muted' }, 'Applies when the software uses AI or machine learning.') : null,
          h('div', { class: 'small muted' }, s.licence),
          s.note ? h('div', { class: 'small muted' }, s.note) : null,
          h('div', {}, h('button', { class: 'btn small', 'aria-expanded': openId === s.id ? 'true' : 'false', onclick: () => show(s.id) }, openId === s.id ? 'Hide items' : 'Show items')),
        ),
      ),
    ),
    open
      ? h(
          'section',
          { class: 'panel stack' },
          open.error
            ? h('p', { class: 'error' }, open.error)
            : [
                h('h2', {}, open.name),
                open.attribution ? h('p', { class: 'small muted' }, open.attribution) : null,
                h(
                  'div',
                  { class: 'table-wrap' },
                  h(
                    'table',
                    { class: 'items' },
                    h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Title'), h('th', {}, 'Rated from'))),
                    h(
                      'tbody',
                      {},
                      ...open.itemsList.map((i) =>
                        h(
                          'tr',
                          {},
                          h('td', { class: 'mono' }, i.id),
                          h('td', {}, i.title, h('div', { class: 'small muted' }, i.groupName)),
                          h(
                            'td',
                            { class: 'small' },
                            i.out
                              ? h('span', { class: 'muted' }, i.outWhy)
                              : [
                                  ...(i.checks || []).map((c) => h('span', { class: 'tag', style: { margin: '1px' } }, typeof c === 'string' ? c : c.id)),
                                  ...(i.facts || []).map((f) => h('span', { class: 'tag', style: { margin: '1px' } }, `ask: ${f}`)),
                                  !(i.checks || []).length && !(i.facts || []).length ? h('span', { class: 'muted' }, 'Reviewer') : null,
                                ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
        )
      : null,
  );
}
