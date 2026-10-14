/**
 * Director on-screen output: the event card and the spoken-line caption.
 * The start/stop control lives in the top bar (src/shell), which listens
 * through `onState`.
 */

const FT_PER_M = 3.28084;
const KT_PER_MPS = 1.943844;

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function factRows(event) {
  const f = event.facts;
  if (event.kind === 'aircraft') {
    return [
      ['Callsign', f.callsign],
      ['Squawk', `${f.squawk} · ${f.meaning}`],
      [
        'Altitude',
        f.onGround
          ? 'On ground'
          : f.altitudeM != null
            ? `${Math.round(f.altitudeM * FT_PER_M).toLocaleString('en-US')} ft`
            : null,
      ],
      [
        'Speed',
        f.speedMps != null ? `${Math.round(f.speedMps * KT_PER_MPS)} kt` : null,
      ],
      ['Heading', f.heading != null ? `${Math.round(f.heading)}°` : null],
      ['Operator', f.operator],
    ];
  }
  return [
    ['Where', f.place],
    ['Depth', f.depthKm != null ? `${Math.round(f.depthKm)} km` : null],
    ['Time', new Date(f.timeMs).toUTCString().slice(5, 22) + ' UTC'],
  ];
}

export function createTourUi({
  onState = () => {},
  root = document.body,
} = {}) {
  const caption = el('div', {
    class: 'gev-caption gev-glass',
    'aria-live': 'polite',
    'data-visible': 'false',
  });
  const card = el('aside', {
    class: 'gev-alert gev-glass',
    'aria-live': 'assertive',
  });
  card.hidden = true;
  root.append(caption, card);

  return {
    setState(state) {
      if (state !== 'running') {
        caption.dataset.visible = 'false';
        card.hidden = true;
      }
      onState(state);
    },
    setCaption(text) {
      caption.textContent = text;
      caption.dataset.visible = text ? 'true' : 'false';
    },
    showStop() {
      card.hidden = true;
      caption.dataset.visible = 'false';
    },
    showEvent(event) {
      card.replaceChildren();
      card.dataset.simulated = String(event.simulated);
      const head = el('div', { class: 'gev-alert__head' });
      head.append(
        el(
          'span',
          { class: 'gev-alert__badge' },
          event.simulated ? 'SIMULATED' : 'LIVE ALERT',
        ),
        el(
          'span',
          { class: 'gev-alert__source' },
          event.kind === 'aircraft' ? 'ADS-B' : 'USGS',
        ),
      );
      card.append(head, el('h2', { class: 'gev-alert__title' }, event.title));
      const facts = el('dl', { class: 'gev-alert__facts' });
      for (const [label, value] of factRows(event)) {
        if (value == null) continue;
        facts.append(el('dt', {}, label), el('dd', {}, String(value)));
      }
      card.append(
        facts,
        el(
          'p',
          { class: 'gev-alert__note' },
          event.simulated
            ? 'Staged demonstration event. Not real.'
            : 'Public feed. May lag; not an official alert.',
        ),
      );
      caption.dataset.visible = 'false';
      card.hidden = false;
    },
    destroy() {
      caption.remove();
      card.remove();
    },
  };
}
