import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_TYPES, resolveAssetType } from './assetTypes.js';
import { createReferenceImages, parseCredits, parsePageImages } from './referenceImages.js';
import { buildHud } from './hud.js';
import { hudCard } from './markup.js';
import { toIntelObject } from './objects.js';

const plane = (rec, layer = 'flights') => toIntelObject(layer, { icao24: 'abc123', lat: -27, lon: 153, ...rec });

test('aircraft resolve by ICAO designator, military variants and description', () => {
  assert.equal(resolveAssetType(plane({ typeCode: 'B744' })).id, 'b747');
  assert.equal(resolveAssetType(plane({ typeCode: 'C17' }, 'military')).id, 'c17');
  assert.equal(resolveAssetType(plane({ typeCode: 'C30J' }, 'military')).id, 'c130');
  assert.equal(resolveAssetType(plane({ typeCode: 'K35R' }, 'military')).id, 'kc135');
  assert.equal(resolveAssetType(plane({ typeCode: 'F18S' }, 'military')).id, 'fa18ef');
  assert.equal(resolveAssetType(plane({ typeCode: 'E737' }, 'military')).id, 'e7');
  // The MRTT shares the A330 designator: military → tanker, civil → airliner.
  assert.equal(resolveAssetType(plane({ typeCode: 'A332' }, 'military')).id, 'kc30');
  assert.equal(resolveAssetType(plane({ typeCode: 'A332' })).id, 'a330');
  assert.equal(resolveAssetType(plane({ typeName: 'Lockheed C-130J Hercules' })).id, 'c130');
  assert.equal(resolveAssetType(plane({ typeName: 'Sikorsky UH-60M Black Hawk' })).id, 'h60');
  assert.equal(resolveAssetType(plane({ typeCode: 'ZZZZ' })), null);
  assert.equal(resolveAssetType(plane({})), null);
  assert.match(resolveAssetType(plane({ typeCode: 'C17' }, 'military')).basis, /ICAO type C17/);
});

test('vessels resolve by AIS family or naval hull prefix; satellites by name', () => {
  const ship = (rec) => toIntelObject('ais-live-vessels', { mmsi: '1', lat: 0, lon: 0, ...rec });
  assert.equal(resolveAssetType(ship({ shipType: 'TANKER' })).id, 'ship-tanker');
  assert.equal(resolveAssetType(ship({ shipType: 'CARGO' })).id, 'ship-cargo');
  assert.equal(resolveAssetType(ship({ shipType: 'MILITARY' })).id, 'ship-naval');
  assert.equal(resolveAssetType(ship({ name: 'HMAS SYDNEY' })).id, 'ship-naval');
  assert.equal(resolveAssetType(ship({ shipType: 'LAW ENFORCE' })).id, 'ship-patrol');
  assert.equal(resolveAssetType(ship({ shipType: '' })), null);
  const sat = (name) => toIntelObject('satellites', { noradId: '1', name, lat: 0, lon: 0 });
  assert.equal(resolveAssetType(sat('ISS (ZARYA)')).id, 'sat-iss');
  assert.equal(resolveAssetType(sat('STARLINK-1234')).id, 'sat-starlink');
  assert.equal(resolveAssetType(sat('COSMOS 2251')), null);
});

test('simulated objects and quakes never get a type photo', () => {
  assert.equal(resolveAssetType({ kind: 'aircraft', typeCode: 'B744', simulated: true }), null);
  assert.equal(resolveAssetType({ kind: 'earthquake' }), null);
});

test('catalogue ids are unique and every entry names an article', () => {
  const ids = ASSET_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of ASSET_TYPES) assert.ok(t.article && t.name, t.id);
});

test('the photo sits on a feed card, labelled as a type reference with credit', () => {
  const o = plane({ typeCode: 'C17', operator: 'RAAF' }, 'military');
  const h = buildHud(o, []);
  const host = h.cards.find((c) => c.ref);
  assert.ok(host, 'a card carries the reference');
  assert.notEqual(host.source, 'sim');
  const html = hudCard(host, 0, { image: { src: 'https://upload.wikimedia.org/x.jpg', artist: 'A. Photographer', licence: 'Public domain' } });
  assert.match(html, /<img src="https:\/\/upload\.wikimedia\.org\/x\.jpg"/);
  assert.match(html, /Type reference · ICAO type C17/);
  assert.match(html, /Photo: A\. Photographer · Public domain/);
  assert.match(hudCard(host, 0), /gev-hud__ref--pending/, 'placeholder while loading');
});

test('page images resolve through normalisation and redirects; credits strip HTML', () => {
  const resolve = parsePageImages({
    query: {
      normalized: [{ from: 'boeing 747', to: 'Boeing 747' }],
      redirects: [{ from: 'EADS CASA C-295', to: 'Airbus C-295' }],
      pages: [
        { title: 'Boeing 747', thumbnail: { source: 'https://u/747.jpg' }, pageimage: 'B747_one.jpg' },
        { title: 'Airbus C-295', thumbnail: { source: 'https://u/c295.jpg' }, pageimage: 'C295.jpg' },
        { title: 'Nope', missing: true },
      ],
    },
  });
  assert.equal(resolve('boeing 747').thumb, 'https://u/747.jpg');
  assert.equal(resolve('EADS CASA C-295').file, 'C295.jpg');
  assert.equal(resolve('Nope'), null);
  const credit = parseCredits({
    query: { pages: [{ title: 'File:B747 one.jpg', imageinfo: [{ extmetadata: { Artist: { value: '<a href="x">Jane &amp; Co</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] }] },
  });
  assert.deepEqual(credit('B747_one.jpg'), { artist: 'Jane Co', licence: 'CC BY-SA 4.0' });
});

test('the whole catalogue loads in a handful of batched requests', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    calls.push(params.get('prop'));
    const titles = params.get('titles').split('|');
    if (params.get('prop') === 'pageimages')
      return Response.json({ query: { pages: titles.map((title) => ({ title, thumbnail: { source: `https://u/${encodeURIComponent(title)}.jpg` }, pageimage: `${title}.jpg` })) } });
    return Response.json({ query: { pages: titles.map((title) => ({ title, imageinfo: [{ extmetadata: { LicenseShortName: { value: 'PD' } } }] })) } });
  };
  const refs = createReferenceImages({ fetchImpl });
  let ready = 0;
  refs.onReady(() => (ready += 1));
  await refs.load();
  assert.equal(ready, 1);
  assert.ok(calls.length <= 6, `${calls.length} requests`);
  const c17 = resolveAssetType(plane({ typeCode: 'C17' }, 'military'));
  assert.match(refs.get(c17).src, /Boeing%20C-17/);
  assert.equal(refs.get(c17).licence, 'PD');
});
