/**
 * @file Comet trails behind aircraft and ships: a short glowing tail through
 * the positions the feeds have reported this session, fading out with age.
 *
 * Only observed fixes are drawn (the feed's own reported positions, as they
 * arrive). Nothing is extrapolated ahead of the asset, so a trail never
 * claims where something will be. To stay cheap, every feed fix is kept for
 * a few minutes in a small ring per asset, but tails are drawn only for the
 * assets nearest the camera (and the one the Director is showing), capped,
 * and only below a set camera height. The drawing is rebuilt every few
 * seconds, not every frame.
 * @module visuals/trails
 */

export const TRAIL_RULES = Object.freeze({
  /** How long a tail reaches back, per kind (ms). Ships move slowly. */
  maxAgeMs: Object.freeze({ aircraft: 180_000, vessel: 600_000 }),
  /** Fixes kept per asset. */
  maxPoints: 40,
  /** Assets tracked at all (oldest dropped first). */
  maxAssets: 12_000,
  /** Tails drawn at once. */
  maxTrails: 40,
  /** No tails above this camera height (planet view). */
  maxCameraM: 2_500_000,
  /** Sampling and redraw period (ms). */
  sampleMs: 5000,
  /** Ship tails sit this far above the ellipsoid (sea surface ≈ geoid). */
  vesselLiftM: 40,
});

/** Radius around the camera's ground point that gets tails (km). */
export function trailRadiusKm(heightM) {
  if (!Number.isFinite(heightM)) return 0;
  return Math.min(1500, Math.max(25, (heightM / 1000) * 1.5));
}

const RAD = Math.PI / 180;
/** Great-circle distance (km). */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Observed fixes per asset. `observe` keeps a fix only when the reported
 * position changed; `points` returns the fixes still within the age limit,
 * oldest first, each with a fade alpha (0 at the tail end, bright at the
 * newest fix).
 */
export function createTrailStore(rules = TRAIL_RULES) {
  const tracks = new Map(); // key -> { kind, fixes: [{t, lat, lon, altM}] }
  return {
    observe(key, kind, fix) {
      if (!key || !Number.isFinite(fix?.lat) || !Number.isFinite(fix?.lon))
        return false;
      let track = tracks.get(key);
      if (!track) {
        track = { kind, fixes: [] };
        tracks.set(key, track);
        if (tracks.size > rules.maxAssets)
          tracks.delete(tracks.keys().next().value);
      }
      const last = track.fixes[track.fixes.length - 1];
      if (last && last.lat === fix.lat && last.lon === fix.lon) return false;
      track.fixes.push({
        t: fix.t,
        lat: fix.lat,
        lon: fix.lon,
        altM: Number.isFinite(fix.altM) ? fix.altM : 0,
      });
      if (track.fixes.length > rules.maxPoints) track.fixes.shift();
      return true;
    },
    points(key, now) {
      const track = tracks.get(key);
      if (!track) return [];
      const maxAge = rules.maxAgeMs[track.kind] ?? 180_000;
      const fresh = track.fixes.filter((f) => now - f.t <= maxAge);
      return fresh.map((f) => {
        const age = Math.min(1, Math.max(0, (now - f.t) / maxAge));
        return { ...f, alpha: 0.9 * (1 - age) ** 1.5 };
      });
    },
    /** Forget assets with no fix inside their age limit. */
    prune(now) {
      for (const [key, track] of tracks) {
        const maxAge = rules.maxAgeMs[track.kind] ?? 180_000;
        const last = track.fixes[track.fixes.length - 1];
        if (!last || now - last.t > maxAge) tracks.delete(key);
      }
    },
    kind: (key) => tracks.get(key)?.kind ?? null,
    size: () => tracks.size,
  };
}

/**
 * Which assets get a tail: the focused one first, then the nearest within
 * the radius, up to `max`.
 * @param {Array<{key: string, lat: number, lon: number}>} candidates
 * @param {{lat: number, lon: number}} center
 */
export function pickTrails(
  candidates,
  center,
  { radiusKm, max, focusKey = null },
) {
  const near = [];
  let focus = null;
  for (const c of candidates) {
    if (c.key === focusKey) {
      focus = c;
      continue;
    }
    const d = distanceKm(center, c);
    if (d <= radiusKm) near.push({ c, d });
  }
  near.sort((a, b) => a.d - b.d);
  const out = focus ? [focus.key] : [];
  for (const { c } of near) {
    if (out.length >= max) break;
    out.push(c.key);
  }
  return out;
}

/** Layers that feed tails: id, kind, and the record's identity field. */
const SOURCES = [
  { id: 'flights', kind: 'aircraft', idField: 'icao24' },
  { id: 'military', kind: 'aircraft', idField: 'icao24' },
  { id: 'ais-live-vessels', kind: 'vessel', idField: 'mmsi' },
];

const COLORS = { aircraft: [0.39, 0.85, 1.0], vessel: [0.45, 1.0, 0.85] };

/**
 * Mount the trails.
 * @param {{viewer: object, Cesium: object, dataManager: object,
 *   enabled?: boolean, rules?: object}} options
 */
export function createTrails({
  viewer,
  Cesium,
  dataManager,
  enabled = true,
  rules = TRAIL_RULES,
}) {
  const scene = viewer.scene;
  const store = createTrailStore(rules);
  let on = enabled;
  let focusKey = null;
  let primitives = [];
  let drawn = 0;

  function records(source) {
    try {
      if (!dataManager.isEnabled(source.id)) return [];
      const mod = dataManager.layers.get(source.id)?.module;
      return mod?.getAnalystRecords?.(20_000) || [];
    } catch {
      return [];
    }
  }

  function sample() {
    const t = Date.now();
    const candidates = [];
    for (const source of SOURCES) {
      for (const r of records(source)) {
        const id = r?.[source.idField];
        if (!id || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
        // Taxiing aircraft would drape under the 3D city; skip them.
        if (source.kind === 'aircraft' && r.onGround) continue;
        const key = `${source.kind}:${id}`;
        store.observe(key, source.kind, {
          t,
          lat: r.lat,
          lon: r.lon,
          altM: source.kind === 'aircraft' ? r.altitudeM : rules.vesselLiftM,
        });
        candidates.push({ key, lat: r.lat, lon: r.lon });
      }
    }
    store.prune(t);
    return candidates;
  }

  function clear() {
    for (const p of primitives)
      if (!p.isDestroyed()) scene.primitives.remove(p);
    primitives = [];
    drawn = 0;
  }

  function redraw(candidates) {
    const cam = scene.camera.positionCartographic;
    const height = cam?.height;
    if (!on || !(height <= rules.maxCameraM)) return clear();
    const center = { lat: cam.latitude / RAD, lon: cam.longitude / RAD };
    const keys = pickTrails(candidates, center, {
      radiusKm: trailRadiusKm(height),
      max: rules.maxTrails,
      focusKey,
    });
    const now = Date.now();
    const byKind = { aircraft: [], vessel: [] };
    for (const key of keys) {
      const pts = store.points(key, now);
      if (pts.length < 2) continue;
      const kind = store.kind(key) === 'vessel' ? 'vessel' : 'aircraft';
      const [r, g, b] = COLORS[kind];
      const positions = pts.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM),
      );
      for (const [width, gain] of [
        [9, 0.35], // soft halo
        [2.2, 1.0], // bright core
      ]) {
        byKind[kind].push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.PolylineGeometry({
              positions,
              width,
              colors: pts.map((p) => new Cesium.Color(r, g, b, p.alpha * gain)),
              colorsPerVertex: true,
              arcType: Cesium.ArcType.NONE,
              vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
            }),
          }),
        );
      }
    }
    const build = (instances, seeThrough) =>
      instances.length
        ? new Cesium.Primitive({
            geometryInstances: instances,
            appearance: new Cesium.PolylineColorAppearance({
              translucent: true,
            }),
            // Ship tails can dip under the sea surface of the 3D tiles (the
            // sea sits on the geoid): keep the hidden part visible.
            ...(seeThrough
              ? {
                  depthFailAppearance: new Cesium.PolylineColorAppearance({
                    translucent: true,
                  }),
                }
              : {}),
            asynchronous: false,
            allowPicking: false,
          })
        : null;
    const next = [build(byKind.aircraft, false), build(byKind.vessel, true)];
    clear();
    for (const p of next) if (p) scene.primitives.add(p);
    primitives = next.filter(Boolean);
    drawn = (byKind.aircraft.length + byKind.vessel.length) / 2;
    scene.requestRender?.();
  }

  function tick() {
    redraw(sample());
  }
  const timer = setInterval(tick, rules.sampleMs);

  return {
    /** The Director's (or the viewer's) current subject, drawn first. */
    setFocus(record) {
      const icao = record?.icao24;
      const mmsi = record?.mmsi;
      focusKey = icao ? `aircraft:${icao}` : mmsi ? `vessel:${mmsi}` : null;
    },
    setEnabled(value) {
      on = Boolean(value);
      if (!on) clear();
      else tick();
    },
    enabled: () => on,
    refresh: tick,
    state: () => ({ enabled: on, tracked: store.size(), drawn, focusKey }),
    destroy() {
      clearInterval(timer);
      clear();
    },
  };
}
