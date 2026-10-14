import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayerCatalog } from './catalog.js';
import { createApplicationData } from './data.js';

const metadata = (layers) =>
  layers.map(({ id }) => ({ id, disposition: 'enabled-only' }));

test('catalog captures membership and metadata while preserving the supplied instances', () => {
  const first = { id: 'first' };
  const layers = [first];
  const schema = metadata(layers);
  const catalog = createLayerCatalog(layers, schema);
  layers.push({ id: 'later' });
  schema[0].disposition = 'invalid';
  assert.deepEqual(catalog.layers, [first]);
  assert.equal(catalog.get('first'), first);
  assert.equal(catalog.get('later'), undefined);
  assert.equal(catalog.metadata[0].disposition, 'enabled-only');
  assert.throws(() => catalog.layers.push({ id: 'later' }), TypeError);
});

test('duplicate, missing and extra metadata fail before application registration', () => {
  const layers = [{ id: 'first' }];
  assert.throws(
    () => createLayerCatalog([...layers, ...layers], metadata(layers)),
    /duplicate/,
  );
  assert.throws(() => createLayerCatalog(layers, []), /incomplete/);
  assert.throws(
    () => createLayerCatalog(layers, metadata([{ id: 'other' }])),
    /Unmatched/,
  );
  assert.throws(
    () =>
      createLayerCatalog(layers, [...metadata(layers), ...metadata(layers)]),
    /duplicate/,
  );
});

test('data setup seals the caller catalog and drains its exact instances', async (t) => {
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => null };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  const attached = [];
  const layers = [
    {
      id: 'one',
      attachDataManager: (manager) => attached.push([...manager.layers.keys()]),
    },
    { id: 'two' },
  ];
  const releases = [];
  let observed;
  const { dataManager } = createApplicationData({
    scene: { viewer: {} },
    catalog: createLayerCatalog(layers, metadata(layers)),
    defer: (release) => releases.push(release),
    onData: (manager) => {
      observed = manager;
    },
  });
  assert.equal(observed, dataManager);
  assert.equal(dataManager.registrationsFinalized, true);
  assert.equal(dataManager.layers.get('one').module, layers[0]);
  assert.deepEqual(attached, [['one', 'two']]);
  assert.deepEqual([...dataManager.layers.keys()], ['one', 'two']);
  assert.throws(() => dataManager.register({ id: 'late' }), /finalized/);
  for (const release of releases.reverse()) await release();
  assert.equal(dataManager.layers.size, 0);
});
