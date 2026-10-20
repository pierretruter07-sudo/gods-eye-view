/**
 * @file Tiny DOM helpers for the CrossCheck page. Every string goes in as
 * text (never HTML), so file paths and notes from an uploaded codebase can
 * never inject markup.
 * @module crosscheck/app/dom
 */

/**
 * Create an element. `attrs` keys starting with "on" are listeners; the
 * rest are attributes (false/null skip). Children: nodes or strings.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replace an element's children. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** A whole percentage. */
export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

/** Status chip for an item rating. */
export function statusChip(status, text) {
  const key = status || 'unrated';
  const name = text || { C: 'Compliant', L: 'Largely', P: 'Partial', N: 'Non-compliant', NA: 'Not applicable' }[status] || 'Unrated';
  return h('span', { class: `chip s-${key}` }, name);
}

/** Chip for an evidence signal result. */
export function signalChip(state) {
  return h('span', { class: `chip s-${state}` }, { pass: 'Found', partial: 'Review', fail: 'Missing', na: 'N/A' }[state] || state);
}

/** Offer a file to save, from text. */
export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Copy text, falling back to a selected textarea. */
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

/** Safe storage (private windows can throw). */
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};
