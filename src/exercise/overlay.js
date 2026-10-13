import * as Cesium from 'cesium';

/**
 * Fictional-theatre overlay for Exercise mode. Draws the invented border,
 * the friendly base, the simulated target and abstract air-defence rings as
 * Cesium entities. Everything is labelled as simulated. Clearable/disposable.
 */
const AMBER = '#ff9f0a';
const RED = '#ff453a';
const BLUE = '#64d2ff';

export function createExerciseOverlay(viewer) {
  const source = new Cesium.CustomDataSource('gev-exercise');
  viewer.dataSources.add(source);

  function clear() {
    source.entities.removeAll();
  }

  function marker({ lat, lon }, color, text, { diamond = false } = {}) {
    const c = Cesium.Color.fromCssColorString(color);
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: diamond ? 0 : 10,
        color: c,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      billboard: diamond
        ? {
            image: diamondImage(color),
            width: 22,
            height: 22,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
      label: {
        text,
        font: '600 13px sans-serif',
        fillColor: c,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  function ring(threat) {
    const color = Cesium.Color.fromCssColorString(threat.band === 'high' ? RED : AMBER);
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(threat.lon, threat.lat),
      ellipse: {
        semiMajorAxis: threat.radiusKm * 1000,
        semiMinorAxis: threat.radiusKm * 1000,
        material: color.withAlpha(0.08),
        outline: true,
        outlineColor: color.withAlpha(0.7),
        outlineWidth: 2,
        height: 0,
      },
    });
  }

  /** Render the whole theatre. */
  function show(scenario) {
    clear();
    if (scenario.border?.length) {
      source.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(scenario.border.flat()),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(AMBER).withAlpha(0.8),
            dashLength: 20,
          }),
          clampToGround: true,
        },
      });
    }
    for (const threat of scenario.threats || []) ring(threat);
    marker(scenario.friendlyBase, BLUE, scenario.friendlyBase.name);
    marker(scenario.target, RED, `${scenario.target.name}  · SIMULATED`, { diamond: true });
  }

  function destroy() {
    clear();
    viewer.dataSources.remove(source, true);
  }

  return { show, clear, destroy };
}

/** A small diamond billboard drawn to a data URL (target marker). */
function diamondImage(color) {
  const c = document.createElement('canvas');
  c.width = 22;
  c.height = 22;
  const ctx = c.getContext('2d');
  ctx.translate(11, 11);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeRect(-7, -7, 14, 14);
  return c.toDataURL();
}
