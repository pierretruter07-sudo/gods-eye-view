/** The credential each optional map stack needs, phrased as tooltip guidance. */
const MAP_KEY_REQUIREMENTS = Object.freeze({
  'google-maps': ['GOOGLE_MAPS_API_KEY'],
  'cesium-ion': ['CESIUM_ION_TOKEN'],
});

/** Tooltip guidance for a map control gated by a credential. */
export function keyRequirement(id) {
  const envVars = MAP_KEY_REQUIREMENTS[id];
  return envVars ? `Needs ${envVars.join(' + ')} — add it to .env` : '';
}
