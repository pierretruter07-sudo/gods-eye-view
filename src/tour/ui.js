/**
 * Director on-screen controls: start/resume, live indicator, event card,
 * spoken-line caption and (demo builds only) staged-event buttons.
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
      ['ICAO', f.icao24],
      ['Squawk', `${f.squawk} (${f.meaning})`],
      ['Altitude', f.onGround ? 'On ground' : f.altitudeM != null ? `${Math.round(f.altitudeM * FT_PER_M).toLocaleString('en-US')} ft` : null],
      ['Speed', f.speedMps != null ? `${Math.round(f.speedMps * KT_PER_MPS)} kt` : null],
      ['Heading', f.heading != null ? `${Math.round(f.heading)}°` : null],
      ['Operator', f.operator],
    ];
  }
  return [
    ['Magnitude', f.magnitude.toFixed(1)],
    ['Where', f.place],
    ['Depth', f.depthKm != null ? `${Math.round(f.depthKm)} km` : null],
    ['Time', new Date(f.timeMs).toUTCString().replace(' GMT', ' UTC')],
  ];
}

export function createTourUi({ onStart, onResume, onSimulate, demo = false, root = document.body }) {
  const dock = el('div', { class: 'tour-dock', 'data-state': 'idle' });
  const start = el('button', { class: 'tour-btn tour-btn--primary', type: 'button', 'data-role': 'start' }, 'DIRECTOR');
  const resume = el('button', { class: 'tour-btn tour-btn--primary', type: 'button', 'data-role': 'resume' }, 'RESUME DIRECTOR');
  const live = el('div', { class: 'tour-live', role: 'status' }, 'DIRECTOR LIVE · ESC OR DRAG TO TAKE CONTROL');
  start.addEventListener('click', () => onStart());
  resume.addEventListener('click', () => onResume());
  dock.append(start, resume, live);
  if (demo) {
    const sim = el('button', { class: 'tour-btn tour-btn--demo', type: 'button' }, 'SIMULATE 7700');
    const quake = el('button', { class: 'tour-btn tour-btn--demo', type: 'button' }, 'SIMULATE QUAKE');
    sim.addEventListener('click', () => onSimulate('aircraft'));
    quake.addEventListener('click', () => onSimulate('earthquake'));
    dock.append(sim, quake);
  }

  const caption = el('div', { class: 'tour-caption', 'aria-live': 'polite', 'data-visible': 'false' });
  const card = el('aside', { class: 'tour-card', 'aria-live': 'assertive' });
  card.hidden = true;
  root.append(dock, caption, card);

  return {
    setState(state) {
      dock.dataset.state = state;
      if (state !== 'running') {
        caption.dataset.visible = 'false';
        card.hidden = true;
      }
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
      card.append(
        el('span', { class: 'tour-card__badge' }, event.simulated ? 'SIMULATED' : 'LIVE ALERT'),
        el('h2', { class: 'tour-card__title' }, event.title),
      );
      const facts = el('dl', { class: 'tour-card__facts' });
      for (const [label, value] of factRows(event)) {
        if (value == null) continue;
        facts.append(el('dt', {}, label), el('dd', {}, String(value)));
      }
      card.append(
        facts,
        el(
          'p',
          { class: 'tour-card__note' },
          event.simulated
            ? 'Staged demonstration event. Not real.'
            : 'Public feed data. May lag; not an official alert.',
        ),
      );
      caption.dataset.visible = 'false';
      card.hidden = false;
    },
    destroy() {
      dock.remove();
      caption.remove();
      card.remove();
    },
  };
}
