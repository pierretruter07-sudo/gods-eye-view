/**
 * @file Shockwave rings for an earthquake the Director is showing: glowing
 * rings expand from the epicentre a few times, then settle into one faint
 * ring and a marker until the Director moves on.
 *
 * The ring size is a display scale chosen so each step in magnitude reads
 * clearly at the Director's earthquake view (it doubles per magnitude
 * unit). It is not a measured shaking or intensity area.
 * @module visuals/quakeRings
 */

export const QUAKE_RINGS = Object.freeze({
  rings: 3,
  /** Seconds for one ring to grow to full size. */
  growS: 4,
  /** Seconds between ring starts. */
  staggerS: 1.3,
  /** Pulses (each one is `rings` rings) before settling. */
  pulses: 3,
  /** Rings sit this far up so terrain and 3D tiles do not hide them. */
  heightM: 1500,
  segments: 96,
});

/** Display radius (km) for a magnitude: 30 km at M5, doubling per unit. */
export function ringRadiusKm(magnitude) {
  if (!Number.isFinite(magnitude)) return 30;
  return Math.min(400, Math.max(15, 30 * 2 ** (magnitude - 5)));
}

/**
 * Ring state at time `t` seconds after the alert: for each ring, its
 * fraction of full size (0-1) and opacity; after the pulses, one settled
 * ring.
 */
export function ringFrame(t, rules = QUAKE_RINGS) {
  const cycle = rules.growS + rules.staggerS * (rules.rings - 1);
  if (t >= cycle * rules.pulses)
    return { settled: true, rings: [{ scale: 1, alpha: 0.35 }] };
  const local = t % cycle;
  const rings = [];
  for (let i = 0; i < rules.rings; i += 1) {
    const p = (local - i * rules.staggerS) / rules.growS;
    if (p < 0 || p > 1) {
      rings.push({ scale: 0, alpha: 0 });
      continue;
    }
    // Ease out: fast start, slowing as it spreads, fading as it goes.
    const scale = 1 - (1 - p) ** 2.2;
    rings.push({ scale, alpha: 0.95 * (1 - p) ** 1.2 });
  }
  return { settled: false, rings };
}

/** Circle of positions (degrees) around a point, for a radius in km. */
export function circleDegrees(lat, lon, radiusKm, segments = 96) {
  const R = 6371;
  const d = radiusKm / R;
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const out = [];
  for (let i = 0; i <= segments; i += 1) {
    const b = (i / segments) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b),
    );
    const lon2 =
      lo +
      Math.atan2(
        Math.sin(b) * Math.sin(d) * Math.cos(la),
        Math.cos(d) - Math.sin(la) * Math.sin(lat2),
      );
    out.push({ lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI });
  }
  return out;
}

/**
 * Mount the ring renderer.
 * @param {{viewer: object, Cesium: object, enabled?: boolean}} options
 */
export function createQuakeRings({
  viewer,
  Cesium,
  enabled = true,
  rules = QUAKE_RINGS,
}) {
  const scene = viewer.scene;
  const ds = new Cesium.CustomDataSource('gev-quake-rings');
  viewer.dataSources.add(ds);
  let on = enabled;
  let active = null; // { lat, lon, radiusKm, start }

  const color = (alpha) => new Cesium.Color(1.0, 0.45, 0.2, alpha);

  function show(quake) {
    clear();
    if (!on || !Number.isFinite(quake?.lat) || !Number.isFinite(quake?.lon))
      return false;
    const radiusKm = ringRadiusKm(quake.magnitude);
    active = {
      lat: quake.lat,
      lon: quake.lon,
      radiusKm,
      start: performance.now(),
    };
    const frame = () =>
      ringFrame((performance.now() - active.start) / 1000, rules);
    for (let i = 0; i < rules.rings; i += 1) {
      const positions = new Cesium.CallbackProperty(() => {
        const r = frame().rings[i];
        if (!r || r.scale <= 0.01) return [];
        return Cesium.Cartesian3.fromDegreesArrayHeights(
          circleDegrees(
            active.lat,
            active.lon,
            radiusKm * r.scale,
            rules.segments,
          ).flatMap((p) => [p.lon, p.lat, rules.heightM]),
        );
      }, false);
      ds.entities.add({
        polyline: {
          positions,
          width: i === 0 ? 10 : 7,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: new Cesium.CallbackProperty(
              () => color(frame().rings[i]?.alpha ?? 0),
              false,
            ),
          }),
        },
      });
    }
    // Epicentre marker: a small bright point that stays.
    ds.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        quake.lon,
        quake.lat,
        rules.heightM,
      ),
      point: {
        pixelSize: 9,
        color: color(1),
        outlineColor: new Cesium.Color(1, 1, 1, 0.9),
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    scene.requestRender?.();
    return true;
  }

  function clear() {
    ds.entities.removeAll();
    active = null;
  }

  return {
    show,
    clear,
    setEnabled(value) {
      on = Boolean(value);
      if (!on) clear();
    },
    enabled: () => on,
    state: () =>
      active
        ? {
            radiusKm: active.radiusKm,
            ...ringFrame((performance.now() - active.start) / 1000, rules),
          }
        : null,
    destroy() {
      clear();
      viewer.dataSources.remove(ds, true);
    },
  };
}
