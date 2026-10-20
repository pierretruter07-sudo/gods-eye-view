import * as Cesium from 'cesium';

/**
 * What the focused contact looks like up close. Aircraft already have their
 * own 3D models (flights/military layers), so this covers the rest:
 *  - vessels: the bundled low-poly cargo ship (public/models/ship.glb, CC BY
 *    4.0, see public/models/README.md) at real-world size, turned to course;
 *  - satellites: a satellite glyph (bus + solar wings) instead of a dot.
 * Position comes from the intel view's smooth (dead-reckoned) track.
 */
export const SHIP_MODEL_URL = '/models/ship.glb';
/** ship.glb's hull runs along glTF +Z (bow) with ~4,200 native units. */
const SHIP_NATIVE_LENGTH = 4200;
const SHIP_LENGTH_M = 190;
/**
 * The aircraft models (nose −X) use heading + 180°. The ship's bow (glTF +Z)
 * sits 90° counter-clockwise of −X seen from above, so it needs a further
 * +90° clockwise: heading + 270° (≡ −90°).
 */
const SHIP_HEADING_OFFSET_DEG = 270;

function satelliteGlyph() {
  // Drawn on a 64-unit grid at 4×: shown at 46 CSS px, so it stays sharp on
  // 2× and 3× screens (it was a 64 px canvas, magnified and pixelated).
  const RES = 4;
  const c = document.createElement('canvas');
  c.width = 64 * RES;
  c.height = 64 * RES;
  const g = c.getContext('2d');
  g.scale(RES, RES);
  g.translate(32, 32);
  g.rotate(-Math.PI / 8);
  // Solar wings
  for (const side of [-1, 1]) {
    g.fillStyle = '#2f5d9e';
    g.strokeStyle = '#9fc4ff';
    g.lineWidth = 1.2;
    const x = side < 0 ? -29 : 9;
    g.fillRect(x, -6, 20, 12);
    g.strokeRect(x, -6, 20, 12);
    g.strokeStyle = 'rgba(159,196,255,0.55)';
    for (let i = 1; i < 4; i += 1) {
      g.beginPath();
      g.moveTo(x + i * 5, -6);
      g.lineTo(x + i * 5, 6);
      g.stroke();
    }
    g.strokeStyle = '#cfd6df';
    g.beginPath();
    g.moveTo(side * 6, 0);
    g.lineTo(side * 9, 0);
    g.stroke();
  }
  // Bus with foil
  g.fillStyle = '#d9b44a';
  g.strokeStyle = '#fff3c4';
  g.lineWidth = 1.2;
  g.fillRect(-6, -7, 12, 14);
  g.strokeRect(-6, -7, 12, 14);
  // Antenna dish
  g.fillStyle = '#e9edf2';
  g.beginPath();
  g.ellipse(0, -11, 5, 2.2, 0, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL();
}

export function createSubjectVisual(viewer, { position, dataManager = null }) {
  // The vessels layer's flat icon would sit on top of the 3D ship; hide it.
  const vesselIcons = () => dataManager?.getLayerModule?.('ais-live-vessels');
  let headingDeg = 0;
  const pos = new Cesium.CallbackProperty(
    (time, result) => position(result),
    false,
  );

  const ship = viewer.entities.add({
    show: false,
    position: pos,
    orientation: new Cesium.CallbackProperty((time, result) => {
      const p = position();
      if (!p) return undefined;
      const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(headingDeg + SHIP_HEADING_OFFSET_DEG),
        0,
        0,
      );
      return Cesium.Transforms.headingPitchRollQuaternion(
        p,
        hpr,
        Cesium.Ellipsoid.WGS84,
        undefined,
        result,
      );
    }, false),
    model: {
      uri: SHIP_MODEL_URL,
      scale: SHIP_LENGTH_M / SHIP_NATIVE_LENGTH,
      // Graphics pass: drawn larger, like a focused aircraft.
      minimumPixelSize: 96,
      maximumScale: 400,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
  });

  const sat = viewer.entities.add({
    show: false,
    position: pos,
    billboard: {
      image: satelliteGlyph(),
      width: 46,
      height: 46,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  return {
    show(o) {
      headingDeg = Number.isFinite(o.courseDeg)
        ? o.courseDeg
        : Number.isFinite(o.heading)
          ? o.heading
          : 0;
      ship.show = o.kind === 'vessel';
      sat.show = o.kind === 'satellite';
      vesselIcons()?.suppressIcon?.(o.kind === 'vessel' ? o.mmsi : null);
      viewer.scene.requestRender();
    },
    update(o) {
      if (Number.isFinite(o.courseDeg)) headingDeg = o.courseDeg;
    },
    hide() {
      vesselIcons()?.suppressIcon?.(null);
      ship.show = false;
      sat.show = false;
      viewer.scene.requestRender();
    },
    destroy() {
      viewer.entities.remove(ship);
      viewer.entities.remove(sat);
    },
  };
}
