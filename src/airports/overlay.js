import * as Cesium from 'cesium';
import { calmWindHeadingDeg } from './profiles.js';
import { derivePhase, PHASE_COLOR } from './phase.js';

/**
 * The airport close-up overlay. While the Director dwells at an airport it
 * labels nearby aircraft with callsign and inferred phase (coloured by phase)
 * and draws the active-runway approach centreline. Pure presentation: it reads
 * analyst records and owns only its own Cesium entities.
 */
export function createAirportOverlay(viewer) {
  const collection = new Cesium.CustomDataSource('gev-airport');
  viewer.dataSources.add(collection);

  function clear() {
    collection.entities.removeAll();
  }

  /** Great-circle km between two lat/lon points. */
  function distanceKm(aLat, aLon, bLat, bLon) {
    const r = Math.PI / 180;
    const dLat = (bLat - aLat) * r;
    const dLon = (bLon - aLon) * r;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** A point `km` from (lat,lon) along `bearingDeg`. */
  function along(lat, lon, bearingDeg, km) {
    const r = Math.PI / 180;
    const d = km / 6371;
    const br = bearingDeg * r;
    const lat1 = lat * r;
    const lon1 = lon * r;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(br),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(br) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    return { lat: lat2 / r, lon: lon2 / r };
  }

  function drawApproach(profile) {
    const landingHdg = calmWindHeadingDeg(profile);
    if (landingHdg == null) return;
    // Aircraft approach ALONG the landing heading, so the centreline extends
    // out on the reciprocal from the threshold.
    const outbound = (landingHdg + 180) % 360;
    const far = along(profile.lat, profile.lon, outbound, 14);
    collection.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          profile.lon,
          profile.lat,
          far.lon,
          far.lat,
        ]),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#30d158').withAlpha(0.8),
          dashLength: 16,
        }),
        clampToGround: true,
      },
    });
    for (let km = 2; km <= 12; km += 2) {
      const gate = along(profile.lat, profile.lon, outbound, km);
      collection.entities.add({
        position: Cesium.Cartesian3.fromDegrees(gate.lon, gate.lat),
        point: {
          pixelSize: 5,
          color: Cesium.Color.fromCssColorString('#30d158').withAlpha(0.7),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }

  /**
   * Refresh labels for aircraft within the airport's terminal radius.
   * @param {object} profile Airport profile.
   * @param {Array} flights Analyst flight records.
   */
  function update(profile, flights) {
    clear();
    drawApproach(profile);
    for (const f of flights || []) {
      if (!Number.isFinite(f?.lat) || !Number.isFinite(f?.lon)) continue;
      if (
        distanceKm(profile.lat, profile.lon, f.lat, f.lon) >
        profile.terminalRadiusKm
      )
        continue;
      const { phase, label } = derivePhase(f, profile);
      const color = Cesium.Color.fromCssColorString(
        PHASE_COLOR[phase] || '#f5f7fa',
      );
      const name = f.callsign || f.icao24 || 'contact';
      collection.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          f.lon,
          f.lat,
          Math.max((f.altitudeM ?? 0) - (profile.elevationM ?? 0), 0),
        ),
        point: {
          pixelSize: 8,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${name}\n${label}`,
          font: '500 12px sans-serif',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, -6),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }

  function destroy() {
    clear();
    viewer.dataSources.remove(collection, true);
  }

  return { update, clear, destroy };
}
