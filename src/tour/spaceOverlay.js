/**
 * @file Space-stop visuals for the Director: the focused satellite's
 * glowing orbit ring, the geostationary belt, and the satellite's coverage
 * footprint on the Earth (ground it sees at 10° elevation or more) with a
 * faint cone from the satellite down to its edge.
 *
 * One CustomDataSource; positions refresh about once a second; everything
 * fades in on arrival and out on departure. Orbit rings come from the
 * loaded orbit elements (SGP4, one period); when none are loaded a circular
 * ring through the satellite's position is drawn from a typical inclination.
 * @module tour/spaceOverlay
 */
import * as Cesium from 'cesium';
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
} from 'satellite.js';
import {
  FOOTPRINT_MIN_ELEVATION_DEG,
  GEO_ALTITUDE_KM,
  circleAround,
  coverageAngle,
  coverageRadiusKm,
  fallbackRing,
  geoBelt,
} from './spaceGeometry.js';

const HUD_BLUE = Cesium.Color.fromCssColorString('#64d2ff');
const BELT_BLUE = Cesium.Color.fromCssColorString('#a8e6ff');
const RING_STEPS = 180;
const FADE_IN_MS = 900;
const FADE_OUT_MS = 450;
const UPDATE_MS = 1000;
/** The footprint fill is rebuilt only after the satellite moves this far. */
const FILL_MOVE_DEG = 0.5;
const CONE_LINES = 16;
const EDGE_HEIGHT_M = 1500;

/** Whether a stop's satellite is in (or near) geostationary orbit. */
export function isGeoSatellite(sat) {
  return sat?.group === 'geo' || sat?.altitudeM > 30_000_000;
}

/** Geodetic position of a satrec at `date`, or null. */
function satrecPosition(satrec, date, gmst = null) {
  try {
    const pv = propagate(satrec, date);
    if (!pv?.position || typeof pv.position === 'boolean') return null;
    const geo = eciToGeodetic(pv.position, gmst ?? gstime(date));
    return {
      lat: degreesLat(geo.latitude),
      lon: degreesLong(geo.longitude),
      altKm: geo.height,
    };
  } catch {
    return null;
  }
}

/** One orbital period of positions, at a fixed GMST so the ring closes. */
function satrecRing(satrec, date) {
  if (!satrec?.no) return null;
  const periodMs = ((2 * Math.PI) / satrec.no) * 60_000; // no: rad/min
  if (!Number.isFinite(periodMs) || periodMs <= 0) return null;
  let gmst;
  try {
    gmst = gstime(date);
  } catch {
    return null;
  }
  const out = [];
  for (let i = 0; i <= RING_STEPS; i += 1) {
    const p = satrecPosition(
      satrec,
      new Date(date.getTime() + (i / RING_STEPS) * periodMs),
      gmst,
    );
    if (p) out.push(p);
  }
  return out.length > RING_STEPS / 2 ? out : null;
}

const toCartesians = (points, heightM = null) =>
  points.map((p) =>
    Cesium.Cartesian3.fromDegrees(
      p.lon,
      p.lat,
      heightM ?? (p.altKm ?? 0) * 1000,
    ),
  );

/**
 * @param {{viewer: object, satrecFor?: (noradId: string) => object|null,
 *   now?: () => Date}} options
 */
export function createSpaceOverlay({
  viewer,
  satrecFor = () => null,
  now = () => new Date(),
}) {
  const ds = new Cesium.CustomDataSource('gev-space');
  viewer.dataSources.add(ds);
  let alpha = 0;
  let fade = null; // { from, to, start, ms, done }
  let timer = 0;
  let fadeTimer = 0;
  let token = 0;
  // Live geometry read by CallbackProperties (refreshed at ~1 Hz).
  const live = { sat: null, edge: [], cone: [], nadir: [], label: null };

  const withAlpha = (color, a) =>
    new Cesium.CallbackProperty(() => color.withAlpha(a * alpha), false);
  const render = () => viewer.scene.requestRender?.();

  function animate(to, ms, done) {
    clearInterval(fadeTimer);
    fade = { from: alpha, to, start: Date.now(), ms, done };
    fadeTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - fade.start) / fade.ms);
      const e = t * t * (3 - 2 * t);
      alpha = fade.from + (fade.to - fade.from) * e;
      render();
      if (t >= 1) {
        clearInterval(fadeTimer);
        const cb = fade.done;
        fade = null;
        cb?.();
      }
    }, 33);
  }

  // Rings use callback positions so they draw on the first frame (constant
  // polylines are built on a worker and can appear a second or more late).
  const instant = (positions) =>
    new Cesium.CallbackProperty(() => positions, false);

  function addBelt(strength) {
    ds.entities.add({
      polyline: {
        positions: instant(toCartesians(geoBelt(RING_STEPS))),
        width: 5,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          taperPower: 1,
          color: withAlpha(BELT_BLUE, strength),
        }),
      },
    });
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        viewer.camera.positionCartographic
          ? Cesium.Math.toDegrees(viewer.camera.positionCartographic.longitude)
          : 0,
        0,
        GEO_ALTITUDE_KM * 1000,
      ),
      label: {
        text: 'GEOSTATIONARY BELT · 35,786 KM',
        font: '600 11px "JetBrains Mono", ui-monospace, monospace',
        fillColor: withAlpha(BELT_BLUE, 0.9),
        outlineColor: withAlpha(Cesium.Color.BLACK, 0.6),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      },
    });
  }

  function addRing(points) {
    const positions = instant(toCartesians(points));
    // Wide soft glow under a crisp core line.
    ds.entities.add({
      polyline: {
        positions,
        width: 14,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.22,
          taperPower: 1,
          color: withAlpha(HUD_BLUE, 0.8),
        }),
      },
    });
    ds.entities.add({
      polyline: {
        positions,
        width: 1.5,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.ColorMaterialProperty(withAlpha(HUD_BLUE, 0.95)),
      },
    });
  }

  function locate(sat, satrec) {
    const p = satrec ? satrecPosition(satrec, now()) : null;
    return p
      ? { lat: p.lat, lon: p.lon, altKm: p.altKm }
      : { lat: sat.lat, lon: sat.lon, altKm: sat.altitudeM / 1000 };
  }

  function refresh(sat, satrec) {
    const at = locate(sat, satrec);
    // Outer edge: the horizon (matches the coverage card's footprint
    // radius). Inner dashed ring: usable coverage at 10° elevation.
    const edge = circleAround(at.lat, at.lon, coverageAngle(at.altKm, 0), 120);
    live.usable = toCartesians(
      circleAround(
        at.lat,
        at.lon,
        coverageAngle(at.altKm, FOOTPRINT_MIN_ELEVATION_DEG),
        120,
      ),
      EDGE_HEIGHT_M,
    );
    const apex = Cesium.Cartesian3.fromDegrees(at.lon, at.lat, at.altKm * 1000);
    live.sat = apex;
    live.edge = toCartesians(edge, EDGE_HEIGHT_M);
    live.fill = new Cesium.PolygonHierarchy(toCartesians(edge, 0));
    // Replacing a polygon's geometry rebuilds it over a few frames, and it
    // is not drawn meanwhile: at a GEO stop the fill covers the visible
    // Earth, so the night side flickered every refresh (Pierre, 20 Oct).
    // Rebuild only when the sub-satellite point has moved, and keep the old
    // fill on screen until the new one is ready.
    if (
      live.fillEntity &&
      (!live.fillAt ||
        Math.abs(at.lat - live.fillAt.lat) > FILL_MOVE_DEG ||
        Math.abs(((at.lon - live.fillAt.lon + 540) % 360) - 180) >
          FILL_MOVE_DEG)
    ) {
      live.fillAt = { lat: at.lat, lon: at.lon };
      swapFill(live.fill);
    }
    const step = Math.floor((edge.length - 1) / CONE_LINES);
    live.cone = Array.from({ length: CONE_LINES }, (_, i) => [
      apex,
      live.edge[i * step],
    ]);
    live.nadir = [apex, Cesium.Cartesian3.fromDegrees(at.lon, at.lat, 0)];
    // Label the usable ring on the viewer's right (bearing heading + 90°),
    // which stays on screen at every stop framing.
    const n = live.usable.length - 1;
    const bearing =
      (Cesium.Math.toDegrees(viewer.camera.heading || 0) + 90) % 360;
    live.label = live.usable[Math.round((bearing / 360) * n) % n];
    live.radiusKm = coverageRadiusKm(at.altKm, 0);
    render();
  }

  const fillEntity = (hierarchy) =>
    ds.entities.add({
      polygon: {
        hierarchy,
        granularity: Cesium.Math.RADIANS_PER_DEGREE * 2,
        height: 0,
        material: new Cesium.ColorMaterialProperty(withAlpha(HUD_BLUE, 0.16)),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });

  /** Double buffer: the old fill stays until the new one can be drawn. */
  function swapFill(hierarchy) {
    const prev = live.fillEntity;
    const next = fillEntity(hierarchy);
    live.fillEntity = next;
    if (!prev) return;
    const sphere = new Cesium.BoundingSphere();
    const started = performance.now();
    const removeHook = viewer.scene.preRender.addEventListener(() => {
      const state = viewer.dataSourceDisplay?.getBoundingSphere?.(
        next,
        false,
        sphere,
      );
      const ready =
        state !== Cesium.BoundingSphereState.PENDING ||
        performance.now() - started > 5000;
      if (!ready && live.fillEntity === next) return;
      removeHook();
      if (ds.entities.contains(prev)) ds.entities.remove(prev);
    });
  }

  function addFootprint() {
    // The fill is rebuilt only when the satellite has moved (swapFill), never
    // per frame; a coarse granularity keeps it light.
    live.fillEntity = fillEntity(live.fill);
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => live.edge, false),
        width: 7,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          taperPower: 1,
          color: withAlpha(HUD_BLUE, 0.75),
        }),
      },
    });
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => live.usable, false),
        width: 1.5,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: withAlpha(HUD_BLUE, 0.7),
          dashLength: 10,
        }),
      },
    });
    for (let i = 0; i < CONE_LINES; i += 1)
      ds.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => live.cone[i], false),
          width: 1,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.ColorMaterialProperty(withAlpha(HUD_BLUE, 0.22)),
        },
      });
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => live.nadir, false),
        width: 1.5,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: withAlpha(HUD_BLUE, 0.6),
          dashLength: 12,
        }),
      },
    });
    ds.entities.add({
      position: new Cesium.CallbackProperty(() => live.label, false),
      label: {
        text: new Cesium.CallbackProperty(
          () =>
            `FOOTPRINT · R ${Math.round(live.radiusKm || 0).toLocaleString('en-US')} KM · DASHED ≥${FOOTPRINT_MIN_ELEVATION_DEG}° ELEV`,
          false,
        ),
        font: '600 11px "JetBrains Mono", ui-monospace, monospace',
        fillColor: withAlpha(HUD_BLUE, 1),
        outlineColor: withAlpha(Cesium.Color.BLACK, 0.6),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(-8, -12),
        horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
      },
    });
  }

  function reset() {
    token += 1;
    live.fillEntity = null;
    live.fillAt = null;
    clearInterval(timer);
    clearInterval(fadeTimer);
    timer = 0;
    fade = null;
    alpha = 0;
    ds.entities.removeAll();
  }

  /**
   * Draw the visuals for a stop (does nothing for stops not in space).
   * @returns {boolean} whether anything was drawn
   */
  function show(stop) {
    reset();
    if (stop?.kind === 'geo') {
      addBelt(0.75);
    } else if (stop?.kind === 'satellite' && stop.satellite) {
      const sat = stop.satellite;
      if (
        !Number.isFinite(sat.lat) ||
        !Number.isFinite(sat.lon) ||
        !(sat.altitudeM > 0)
      )
        return false;
      let satrec = null;
      try {
        satrec = satrecFor(String(sat.noradId)) || null;
      } catch {
        satrec = null;
      }
      const geo = isGeoSatellite(sat);
      if (geo) addBelt(0.9);
      else addRing(satrecRing(satrec, now()) || fallbackRing(sat, RING_STEPS));
      refresh(sat, satrec);
      addFootprint();
      const first = locate(sat, satrec);
      live.fillAt = { lat: first.lat, lon: first.lon };
      timer = setInterval(() => refresh(sat, satrec), UPDATE_MS);
    } else {
      return false;
    }
    animate(1, FADE_IN_MS);
    return true;
  }

  /** Fade everything out (departure) and remove it. */
  function clear() {
    if (!ds.entities.values.length) return;
    const mine = token;
    clearInterval(timer);
    timer = 0;
    animate(0, FADE_OUT_MS, () => {
      if (mine === token) ds.entities.removeAll();
    });
  }

  function destroy() {
    reset();
    viewer.dataSources.remove(ds, true);
  }

  return {
    show,
    clear,
    destroy,
    /** Diagnostics: how many entities are on the globe now. */
    count: () => ds.entities.values.length,
  };
}
