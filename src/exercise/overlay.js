import * as Cesium from 'cesium';

/**
 * Fictional-theatre overlay for Exercise mode. Draws the invented border,
 * the friendly base, the simulated target and abstract air-defence rings as
 * Cesium entities. Everything is labelled as simulated. Clearable/disposable.
 */
const AMBER = '#ff9f0a';
const DEEP_ORANGE = '#ff7a1a';
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

  /** A point `de` m east and `dn` m north of (lat,lon). */
  function offsetGeo(lat, lon, de, dn) {
    const dLat = dn / 111_320;
    const dLon = de / (111_320 * Math.cos((lat * Math.PI) / 180));
    return [lon + dLon, lat + dLat];
  }

  /** Degrees ring for a rectangle centred at local (cE,cN), rotated by heading. */
  function rect(lat, lon, cE, cN, len, wid, hdgDeg) {
    const h = (hdgDeg * Math.PI) / 180;
    const ax = [Math.sin(h), Math.cos(h)]; // along-runway (east,north)
    const bx = [Math.cos(h), -Math.sin(h)]; // across
    const out = [];
    for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const e = cE + a * (len / 2) * ax[0] + b * (wid / 2) * bx[0];
      const n = cN + a * (len / 2) * ax[1] + b * (wid / 2) * bx[1];
      out.push(...offsetGeo(lat, lon, e, n));
    }
    return out;
  }

  function slab(lat, lon, cE, cN, len, wid, hdg, cssColor, height = 0) {
    source.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(rect(lat, lon, cE, cN, len, wid, hdg)),
        material: Cesium.Color.fromCssColorString(cssColor),
        height,
      },
    });
  }

  function building(lat, lon, cE, cN, len, wid, hdg, cssColor, extrudedHeight) {
    source.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(rect(lat, lon, cE, cN, len, wid, hdg)),
        material: Cesium.Color.fromCssColorString(cssColor),
        extrudedHeight,
        outline: true,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.35),
      },
    });
  }

  /** A fictional town around the airfield: a road grid and blocks of
   * buildings on a cardinal grid, with the runway cutting across it. */
  function drawCity(target) {
    const { lat, lon } = target;
    const h = (70 * Math.PI) / 180; // runway axis, to keep a clear corridor
    const sin = Math.sin(h);
    const cos = Math.cos(h);
    const spacing = 300;
    const N = 7;
    const half = N * spacing;
    // Roads (dark asphalt): N/S lines (heading 0) and E/W lines (heading 90).
    for (let i = -N; i <= N; i += 1) {
      slab(lat, lon, i * spacing, 0, half * 2 + 400, 13, 0, '#43413c', 0.3);
      slab(lat, lon, 0, i * spacing, half * 2 + 400, 13, 90, '#43413c', 0.3);
    }
    // Buildings in the grid cells, skipping the runway corridor and apron.
    const palette = ['#8b8578', '#9a9488', '#787266', '#a19a8b', '#6f6a60'];
    for (let gx = -N; gx <= N; gx += 1) {
      for (let gy = -N; gy <= N; gy += 1) {
        const cE = gx * spacing + rand(-55, 55);
        const cN = gy * spacing + rand(-55, 55);
        const along = cE * sin + cN * cos;
        const cross = cE * cos - cN * sin;
        if (Math.abs(cross) < 170 && Math.abs(along) < 1500) continue; // runway clear zone
        if (Math.hypot(cE + 300, cN - 320) < 320) continue; // apron/terminal
        if (Math.random() < 0.28) continue; // some empty lots
        const dist = Math.hypot(cE + 200, cN - 350);
        const height = Math.max(8, Math.min(55, (9 + 40 * Math.exp(-dist / 650)) * rand(0.7, 1.2)));
        building(lat, lon, cE, cN, rand(44, 82), rand(44, 82), 0, palette[Math.floor(rand(0, palette.length))], height);
      }
    }
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  /** A fictional forward airfield so the target reads as a real place. */
  function drawAirfield(target) {
    const { lat, lon } = target;
    const hdg = 70; // runway orientation
    slab(lat, lon, 0, 0, 2600, 55, hdg, '#2c2d2b', 1); // runway
    slab(lat, lon, 0, 0, 2600, 3, hdg, '#d8d2b8', 1.2); // centreline
    slab(lat, lon, -300, 320, 900, 360, hdg, '#52534c', 0.8); // apron
    // Four hangars along the apron.
    for (let i = 0; i < 4; i += 1) {
      building(lat, lon, -600 + i * 200, 360, 70, 55, hdg, '#71726b', 16);
    }
    // Control tower.
    building(lat, lon, 120, 300, 20, 20, hdg, '#6a6b64', 40);
    // Fuel farm: three tanks.
    for (let i = 0; i < 3; i += 1) {
      const [tlon, tlat] = offsetGeo(lat, lon, 420 + i * 55, 240);
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(tlon, tlat, 11),
        cylinder: {
          length: 22,
          topRadius: 24,
          bottomRadius: 24,
          material: Cesium.Color.fromCssColorString('#8a8b82'),
          outline: true,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.3),
        },
      });
    }
  }

  function ring(threat) {
    const color = Cesium.Color.fromCssColorString(threat.band === 'high' ? DEEP_ORANGE : AMBER);
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
    drawCity(scenario.target);
    drawAirfield(scenario.target);
    marker(scenario.friendlyBase, BLUE, scenario.friendlyBase.name);
    marker(scenario.target, DEEP_ORANGE, `${scenario.target.name}  · SIMULATED`, { diamond: true });
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
