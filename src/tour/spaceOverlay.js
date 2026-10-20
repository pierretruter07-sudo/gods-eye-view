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
  closeRing,
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
const EDGE_HEIGHT_M = 1500;
/** One sweep of the coverage scan (beam band and ground ring), ms. */
const SCAN_MS = 4000;

/**
 * The coverage beam: a faint glass cone from the satellite to the edge of
 * what it sees, brighter at its rim and near the satellite, with a soft band
 * sweeping down it (Pierre, 20 Oct: coverage shown as more than lines, but
 * not prominent). st.t runs 0 at the satellite to 1 at the Earth.
 */
const BEAM_SHADER = `
uniform vec4 color;
uniform float fade;
uniform float sweep;
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  float t = clamp(materialInput.st.t, 0.0, 1.0);
  vec3 n = normalize(materialInput.normalEC);
  vec3 v = normalize(materialInput.positionToEyeEC);
  float rim = (1.0 - abs(dot(n, v))) * (1.0 - t);
  float band = exp(-pow((t - sweep) / 0.05, 2.0));
  m.diffuse = color.rgb;
  m.emission = color.rgb * 0.3 * band;
  // Seen side-on, the rim is brighter; seen down its axis (a high orbit)
  // every face is edge-on, so the rim term is kept small there.
  float body = (0.08 + 0.12 * rim * rim) * (1.0 - 0.85 * t);
  m.alpha = clamp(color.a * fade * (body + 0.3 * band * (1.0 - 0.7 * t)), 0.0, 0.2);
  return m;
}`;

/**
 * Triangles from an apex to a ring of points, each with its own flat normal
 * (positions in Earth-fixed metres).
 */
function beamGeometry(apex, edge) {
  const n = edge.length - 1;
  const positions = new Float64Array(n * 9);
  const normals = new Float32Array(n * 9);
  const st = new Float32Array(n * 6);
  const a = new Cesium.Cartesian3();
  const b = new Cesium.Cartesian3();
  const normal = new Cesium.Cartesian3();
  for (let i = 0; i < n; i += 1) {
    const p1 = edge[i];
    const p2 = edge[i + 1];
    Cesium.Cartesian3.subtract(p1, apex, a);
    Cesium.Cartesian3.subtract(p2, apex, b);
    Cesium.Cartesian3.cross(a, b, normal);
    if (Cesium.Cartesian3.magnitudeSquared(normal) > 0)
      Cesium.Cartesian3.normalize(normal, normal);
    [apex, p1, p2].forEach((p, k) => {
      positions.set([p.x, p.y, p.z], i * 9 + k * 3);
      normals.set([normal.x, normal.y, normal.z], i * 9 + k * 3);
    });
    st.set([(i + 0.5) / n, 0, i / n, 1, (i + 1) / n, 1], i * 6);
  }
  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      normal: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normals,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: st,
      }),
    },
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromPoints([apex, ...edge]),
  });
}

/** Whether a stop's satellite is in (or near) geostationary orbit. */
export function isGeoSatellite(sat) {
  return sat?.group === 'geo' || sat?.altitudeM > 30_000_000;
}

/** Geodetic position of a satrec at `date`, or null. */
export function satrecPosition(satrec, date, gmst = null) {
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
  // Closed exactly, so the line never breaks where its ends meet.
  return out.length > RING_STEPS / 2 ? closeRing(out) : null;
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
  const live = { sat: null, edge: [], nadir: [], label: null, at: null };
  // The coverage beam (one Primitive, swapped in whole when it moves) and
  // its material, shared across rebuilds.
  let beam = null;
  const beamMaterial = new Cesium.Material({
    fabric: {
      uniforms: { color: HUD_BLUE.withAlpha(0.5), fade: 0, sweep: 0 },
      source: BEAM_SHADER,
    },
    translucent: true,
  });
  const removeBeamTick = viewer.scene.preRender.addEventListener(() => {
    if (!beam) return;
    beamMaterial.uniforms.fade = alpha;
    beamMaterial.uniforms.sweep = (performance.now() % SCAN_MS) / SCAN_MS;
  });
  // The beam being replaced stays on screen until its successor has drawn
  // (removing it in the same frame could leave a one-frame gap: a flicker).
  let outgoing = [];
  let beamApex = null;
  const removeBeam = (p) => {
    if (p && !p.isDestroyed()) viewer.scene.primitives.remove(p);
  };
  const removeBeamSwap = viewer.scene.postRender.addEventListener(() => {
    if (!outgoing.length || (beam && !beam.ready)) return;
    outgoing.forEach(removeBeam);
    outgoing = [];
  });
  function clearBeam() {
    outgoing.forEach(removeBeam);
    outgoing = [];
    removeBeam(beam);
    beam = null;
    beamApex = null;
  }
  /** Build the beam for this apex and edge; the old one goes in the same frame. */
  function drawBeam(apex, edge) {
    // Rebuilt only once the satellite has moved (a GEO beam barely moves).
    if (beam && beamApex && Cesium.Cartesian3.distance(beamApex, apex) < 1000)
      return;
    let next = null;
    try {
      next = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: beamGeometry(apex, edge),
        }),
        appearance: new Cesium.MaterialAppearance({
          material: beamMaterial,
          translucent: true,
          faceForward: true,
          closed: false,
          materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
        }),
        asynchronous: false,
        allowPicking: false,
        compressVertices: false,
      });
    } catch (error) {
      console.warn('[tour] coverage beam unavailable', error);
      return;
    }
    if (beam) outgoing.push(beam);
    beam = viewer.scene.primitives.add(next);
    beamApex = Cesium.Cartesian3.clone(apex);
  }

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
        font: '600 22px "JetBrains Mono", ui-monospace, monospace',
        scale: 0.5,
        fillColor: withAlpha(BELT_BLUE, 0.9),
        outlineColor: withAlpha(Cesium.Color.BLACK, 0.6),
        outlineWidth: 6,
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
    live.at = at;
    live.angle = coverageAngle(at.altKm, 0);
    drawBeam(apex, live.edge);
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
        material: new Cesium.ColorMaterialProperty(withAlpha(HUD_BLUE, 0.06)),
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
    // A scan ring that widens from below the satellite to the footprint's
    // edge and fades as it goes, in step with the band down the beam.
    const scanPhase = () => (performance.now() % SCAN_MS) / SCAN_MS;
    ds.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(
          () =>
            live.at
              ? toCartesians(
                  circleAround(
                    live.at.lat,
                    live.at.lon,
                    live.angle * Math.max(0.02, scanPhase()),
                    72,
                  ),
                  EDGE_HEIGHT_M,
                )
              : [],
          false,
        ),
        width: 4,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          taperPower: 1,
          color: new Cesium.CallbackProperty(
            () => HUD_BLUE.withAlpha(0.55 * alpha * (1 - scanPhase()) ** 1.5),
            false,
          ),
        }),
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
        font: '600 22px "JetBrains Mono", ui-monospace, monospace',
        scale: 0.5,
        fillColor: withAlpha(HUD_BLUE, 1),
        outlineColor: withAlpha(Cesium.Color.BLACK, 0.6),
        outlineWidth: 6,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(-8, -12),
        horizontalOrigin: Cesium.HorizontalOrigin.RIGHT,
      },
    });
  }

  function reset() {
    token += 1;
    clearBeam();
    live.at = null;
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
    if (!ds.entities.values.length && !beam) return;
    const mine = token;
    clearInterval(timer);
    timer = 0;
    animate(0, FADE_OUT_MS, () => {
      if (mine !== token) return;
      ds.entities.removeAll();
      clearBeam();
    });
  }

  function destroy() {
    reset();
    removeBeamTick();
    removeBeamSwap();
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
