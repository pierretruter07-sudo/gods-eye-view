import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHud } from './hud.js';
import { toIntelObject } from './objects.js';
import { hudHeader, hudCard, hudActions, resultPanel, esc } from './markup.js';

// AIS names, destinations and ADS-B callsigns are broadcast by anyone, so
// every feed string is untrusted input that must render as text.
const PAYLOAD = '<img src=x onerror=alert(1)><script>alert(2)</script>"\'&';

function assertInert(html) {
  assert.doesNotMatch(html, /<img src=x/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /&(?![a-z]+;|#\d+;)/i, 'every ampersand is an entity');
}

test('esc neutralises every HTML metacharacter', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('hostile feed strings render as inert text in every HUD surface', () => {
  const objects = [
    toIntelObject('ais-live-vessels', { mmsi: '9', name: PAYLOAD, lat: 1, lon: 1, speedKts: 12, courseDeg: 10, destination: PAYLOAD }),
    toIntelObject('flights', { icao24: 'f00', callsign: PAYLOAD, lat: 1, lon: 1, altitudeM: 9000, speedMps: 230, heading: 10, operator: PAYLOAD, routeOrigin: PAYLOAD, routeDestination: PAYLOAD }),
    toIntelObject('earthquakes', { id: 'q', magnitude: 5, depthKm: 10, lat: 1, lon: 1, place: PAYLOAD, timeMs: Date.UTC(2026, 9, 14) }),
  ];
  for (const o of objects) {
    assert.ok(o, 'fixture is placeable');
    const h = buildHud(o, objects.map((object) => ({ object, km: 1 })));
    assertInert(hudHeader(h, PAYLOAD));
    h.cards.forEach((c, i) => assertInert(hudCard(c, i)));
    assertInert(hudActions(h, {}));
  }
});

test('action result panels escape titles, rows, tables, messages and captions', () => {
  const html = resultPanel({
    title: PAYLOAD,
    sources: [{ label: PAYLOAD, feed: true }],
    blocks: [
      { type: 'rows', rows: [{ label: PAYLOAD, value: PAYLOAD, sim: true }] },
      { type: 'table', title: PAYLOAD, head: [PAYLOAD], rows: [[PAYLOAD]] },
      { type: 'message', label: PAYLOAD, text: PAYLOAD },
      { type: 'imagery', tiles: ['https://x/"onload="alert(3)'], markX: 0.5, markY: 0.5, caption: PAYLOAD },
      { type: 'note', text: PAYLOAD },
    ],
    send: { label: PAYLOAD },
  });
  assertInert(html);
  assert.doesNotMatch(html, /"onload="/);
});
