/** Capture the ordered application instances and their serialization metadata. */
export function createLayerCatalog(layers, metadata) {
  if (!Array.isArray(layers) || !Array.isArray(metadata))
    throw new TypeError(
      'Layer instances and serialization metadata are required',
    );
  const byId = new Map();
  for (const layer of layers) {
    if (typeof layer?.id !== 'string' || !layer.id || byId.has(layer.id))
      throw new TypeError(`Invalid or duplicate catalog layer: ${layer?.id}`);
    byId.set(layer.id, layer);
  }
  const ids = new Set();
  for (const entry of metadata) {
    if (!byId.has(entry?.id) || ids.has(entry.id))
      throw new TypeError(
        `Unmatched or duplicate catalog metadata: ${entry?.id}`,
      );
    ids.add(entry.id);
  }
  if (ids.size !== byId.size)
    throw new TypeError('Catalog metadata is incomplete');
  return Object.freeze({
    layers: Object.freeze([...layers]),
    metadata: Object.freeze(
      metadata.map((entry) => Object.freeze({ ...entry })),
    ),
    get: (id) => byId.get(id),
  });
}
