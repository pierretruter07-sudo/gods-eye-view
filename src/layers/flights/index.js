import { createFlightSnapshotRenderer } from './snapshotRenderer.js';
import { createFlightState } from './state.js';
import { createRendering } from './rendering.js';
import { createMotion } from './motion.js';
import { createTracking } from './tracking.js';
import { createController } from './controller.js';
import { createEnrichment } from './enrichment.js';
import { createIngestion } from './ingestion.js';
import { createLifecycle } from './lifecycle.js';
import { createEvidence } from './evidence.js';
import { createTesting } from './testing.js';
import { createQueries } from './queries.js';
/** Compose one civil-flight layer with application-owned scene services. */
export function createCivilFlightLayer({
  source,
  services,
  resolveAsset = (url) => url,
} = {}) {
  const flightState = createFlightState({ source, services });
  const parts = {};
  const layer = {};
  const context = { flightState, services, parts, layer, resolveAsset };
  parts.rendering = createRendering(context);
  parts.motion = createMotion(context);
  parts.tracking = createTracking(context);
  parts.controller = createController(context);
  parts.enrichment = createEnrichment(context);
  parts.lifecycle = createLifecycle(context);
  parts.evidence = createEvidence(context);
  parts.testing = createTesting(context);
  parts.queries = createQueries(context);
  const applySnapshot = createFlightSnapshotRenderer({
    flightState,
    records: flightState.records,
    militaryRegistry: services.militaryRegistry,
    groundFloor: services.groundFloor,
    meshFloor: services.meshFloor,
    rendering: parts.rendering,
    tracking: parts.tracking,
    motion: parts.motion,
    enrichment: parts.enrichment,
    queries: parts.queries,
  });
  parts.ingestion = createIngestion({
    feed: flightState.feed,
    getQuery: (viewer) =>
      parts.controller._flightQuery(viewer || flightState._viewer),
    applySnapshot,
    setSourceLabel: (source) => {
      layer.source = source;
    },
    applyPendingTrackingRestore: () =>
      parts.tracking._applyPendingTrackingRestore(),
  });

  Object.assign(
    layer,
    parts.queries.methods,
    parts.lifecycle.methods,
    parts.ingestion.methods,
  );
  /** Load aircraft around (lat, lon) on the next refreshes, for ttlMs. */
  layer.setQueryAnchor = (latitude, longitude, ttlMs) =>
    parts.controller.setQueryAnchor(latitude, longitude, ttlMs);
  /**
   * Where this aircraft is DRAWN right now (its 3D model when one owns the
   * visual, else the fleet icon's per-frame position or the tracked entity's
   * display position), so overlays such as
   * the intel HUD's leader lines meet the icon exactly. Null when not drawn.
   */
  layer.getDisplayPosition = (icao24) =>
    parts.rendering._modelDrawnPosition(icao24) ??
    (icao24 === flightState._trackedIcao
      ? parts.motion._trackedDisplayPosition(icao24)
      : (flightState._billboards.get(icao24)?.position ?? null));
  /** The aircraft the Director or analyst is focused on (3D model look). */
  layer.setFocusModel = (icao24) => parts.rendering.setFocusModel(icao24);
  Object.defineProperty(layer, 'testing', { value: parts.testing });
  return layer;
}
export { TRACKED_MODEL_MAX_PX } from './policy.js';
