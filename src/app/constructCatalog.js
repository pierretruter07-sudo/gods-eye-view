import { createCyclonesLayer } from '../layers/cyclones/index.js';
import { createLayerCatalog } from './catalog.js';
import { LAYER_STATE_REGISTRY } from '../data/layerState.js';
import { createMilitaryRegistry } from '../layers/aircraft/classification.js';
import { createApplicationFlights } from './layers/flights.js';
import { createApplicationMilitary } from './layers/militaryFlights.js';
import { createApplicationVessels } from './layers/aisLiveVessels.js';
import { createApplicationInstallations } from './layers/militaryInstallations.js';
import { createApplicationSatellites } from './layers/satellites.js';
import { createApplicationFirms } from './layers/firms.js';
import { createApplicationEarthquakes } from './layers/earthquakes.js';
import { createApplicationCables } from './layers/submarineCables.js';

/**
 * The layers God's Eye View ships. Everything the dashboard shows comes from
 * exactly these; nothing else is constructed, registered or fetched.
 */
export const APPLICATION_LAYER_IDS = Object.freeze([
  'flights',
  'military',
  'ais-live-vessels',
  'satellites',
  'earthquakes',
  'local-firms',
  'weather-cyclones',
  'military-installations',
  'telegeography-submarine-cables',
]);

const SOURCE_METHODS = Object.freeze({
  flights: ['getSnapshot'],
  military: ['getSnapshot'],
  vessels: ['getSnapshot'],
  installations: ['getMappedSites', 'searchNearby'],
  satellites: ['readGroup'],
  firms: ['getSnapshot'],
  cyclones: ['getSnapshot'],
  earthquakes: ['getSnapshot'],
  cables: ['fetch'],
});

/** Serialization metadata for exactly the layers this catalog constructs. */
export const APPLICATION_LAYER_METADATA = Object.freeze(
  LAYER_STATE_REGISTRY.filter((entry) =>
    APPLICATION_LAYER_IDS.includes(entry.id),
  ),
);

/** Construct the current catalog without choosing any source provider.
 * Scene engines remain page-owned; layers and classification have this app's lifetime.
 * The manager owns layer destruction, while abort releases classification even if startup fails.
 */
export function createApplicationCatalog({
  surface,
  sources,
  signal,
  metadata = APPLICATION_LAYER_METADATA,
  vesselOptions,
  resolveAsset,
}) {
  if (!signal?.addEventListener)
    throw new TypeError('An application lifetime signal is required');
  signal.throwIfAborted();
  if (!surface?.groundFloor || !surface?.terrain)
    throw new TypeError('Application surface services are required');

  for (const [name, methods] of Object.entries(SOURCE_METHODS)) {
    if (
      methods.some((method) => typeof sources?.[name]?.[method] !== 'function')
    )
      throw new TypeError(`Invalid catalog source: ${name}`);
  }
  const militaryRegistry = createMilitaryRegistry();
  const dispose = () => {
    signal.removeEventListener('abort', dispose);
    militaryRegistry.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    militaryRegistry.configureSource(sources.military, { signal });
    const flights = createApplicationFlights({
      surface,
      source: sources.flights,
      militaryRegistry,
      resolveAsset,
    });
    const military = createApplicationMilitary({
      surface,
      source: sources.military,
      militaryRegistry,
      resolveAsset,
    });
    const vessels = createApplicationVessels({
      source: sources.vessels,
      options: vesselOptions,
    });
    const installations = createApplicationInstallations({
      surface,
      source: sources.installations,
    });
    const satellites = createApplicationSatellites({
      source: sources.satellites,
    });
    const catalog = createLayerCatalog(
      [
        flights,
        military,
        createApplicationEarthquakes({ source: sources.earthquakes }),
        satellites,
        vessels,
        installations,
        createCyclonesLayer({ feed: sources.cyclones }),
        createApplicationCables({ source: sources.cables }),
        createApplicationFirms({
          surface,
          id: 'local-firms',
          name: 'FIRMS Active Fires',
          icon: '▲',
          source: 'NASA FIRMS · LIVE',
          feed: sources.firms,
        }),
      ],
      metadata,
    );
    return Object.freeze({
      ...catalog,
      militaryRegistry,
      surface,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
