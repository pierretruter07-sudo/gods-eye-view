/**
 * Strike-package panel (Exercise mode). Renders a generated package in the
 * glass style: header with risk, role cards, relative timeline, authorisation
 * checklist and a Launch button. Game UI only; every value is from the
 * fictional package object.
 */

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

const RISK_COLOR = { Low: '#30d158', Moderate: '#ff9f0a', High: '#ff453a' };

export function createPackagePanel({ onLaunch, onClose, root = document.body }) {
  const panel = el('aside', { class: 'gev-pkg gev-glass', 'aria-label': 'Strike package', role: 'region' });
  panel.hidden = true;
  root.append(panel);

  function render(pkg) {
    panel.replaceChildren();

    const head = el('div', { class: 'gev-pkg__head' });
    const title = el('div', { class: 'gev-pkg__titles' });
    title.append(
      el('span', { class: 'gev-pkg__badge' }, 'EXERCISE PACKAGE'),
      el('h2', { class: 'gev-pkg__name' }, pkg.name),
      el('p', { class: 'gev-pkg__target' }, `Target: ${pkg.target.name} (simulated)`),
    );
    const risk = el('div', { class: 'gev-pkg__risk' });
    const color = RISK_COLOR[pkg.risk.band] || '#f5f7fa';
    risk.style.setProperty('--risk', color);
    risk.append(
      el('span', { class: 'gev-pkg__risk-score' }, String(pkg.risk.score)),
      el('span', { class: 'gev-pkg__risk-band' }, `${pkg.risk.band} risk`),
    );
    const close = el('button', { type: 'button', class: 'gev-icon-btn gev-pkg__close', 'aria-label': 'Close package' });
    close.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener('click', () => onClose?.());
    head.append(title, risk, close);
    panel.append(head);

    panel.append(el('h3', { class: 'gev-pkg__h' }, 'Package'));
    const grid = el('div', { class: 'gev-pkg__roles' });
    for (const r of pkg.roles) {
      const card = el('div', { class: 'gev-pkg__role' });
      card.append(
        el('span', { class: 'gev-pkg__role-count' }, `×${r.count}`),
        el('span', { class: 'gev-pkg__role-name' }, r.role),
        el('span', { class: 'gev-pkg__role-plat' }, r.platform),
      );
      grid.append(card);
    }
    panel.append(grid);

    panel.append(el('h3', { class: 'gev-pkg__h' }, 'Timeline'));
    const tl = el('ol', { class: 'gev-pkg__timeline' });
    for (const s of pkg.timeline) {
      const li = el('li');
      li.append(el('span', { class: 'gev-pkg__t' }, s.t), el('span', { class: 'gev-pkg__ev' }, s.event));
      tl.append(li);
    }
    panel.append(tl);

    panel.append(el('h3', { class: 'gev-pkg__h' }, 'Authorisation'));
    const auth = el('ul', { class: 'gev-pkg__auth' });
    for (const a of pkg.authorisation) {
      const li = el('li', { 'data-cleared': String(a.cleared) });
      li.append(el('span', { class: 'gev-pkg__tick', 'aria-hidden': 'true' }, a.cleared ? '✓' : '○'), el('span', {}, a.label));
      auth.append(li);
    }
    panel.append(auth);

    const launch = el('button', { type: 'button', class: 'gev-pkg__launch' });
    launch.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg><span>Launch exercise</span>';
    launch.addEventListener('click', () => onLaunch?.(pkg));
    panel.append(launch);

    panel.hidden = false;
  }

  return {
    show: render,
    hide() {
      panel.hidden = true;
    },
    destroy() {
      panel.remove();
    },
  };
}
