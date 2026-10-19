import test from 'node:test';
import assert from 'node:assert/strict';
import { SENSOR_LABELS, sensorFor, solarElevationDeg } from './sensors.js';

test('solar elevation: high at local noon, below the horizon at local midnight', () => {
  // Equinox noon on the equator at Greenwich: sun nearly overhead.
  assert.ok(solarElevationDeg(Date.parse('2026-03-20T12:00:00Z'), 0, 0) > 85);
  // London at midnight in midsummer: about 15 degrees below.
  const london = solarElevationDeg(Date.parse('2026-06-21T00:00:00Z'), 51.5, 0);
  assert.ok(london < -10 && london > -20, String(london));
  // Sydney at local noon (02:00 UTC) in October: well up.
  assert.ok(solarElevationDeg(Date.parse('2026-10-19T02:00:00Z'), -33.87, 151.21) > 60);
  // Sydney at local midnight: down.
  assert.ok(solarElevationDeg(Date.parse('2026-10-19T14:00:00Z'), -33.87, 151.21) < -30);
});

const DAY_SYD = Date.parse('2026-10-19T02:00:00Z');
const NIGHT_SYD = Date.parse('2026-10-19T14:00:00Z');
const at = (kind, extra = {}, view = {}) => ({
  kind,
  ...extra,
  view: { lat: -33.87, lon: 151.21, heightM: 0, rangeM: 20_000, pitchDeg: -40, ...view },
});

test('thermal for military aircraft, airfields and naval ships; night vision where the sun is down', () => {
  assert.equal(sensorFor(at('military'), DAY_SYD), 'flir');
  assert.equal(sensorFor(at('base'), DAY_SYD), 'flir');
  assert.equal(sensorFor(at('vessel', { vessel: { name: 'HMAS TEST', shipType: 'Military' } }), DAY_SYD), 'flir');
  assert.equal(sensorFor(at('military'), NIGHT_SYD), 'flir', 'thermal wins at night too');
  assert.equal(sensorFor(at('vessel', { vessel: { name: 'EVER TEST', shipType: 'Cargo' } }), DAY_SYD), null);
  assert.equal(sensorFor(at('vessel', { vessel: { name: 'EVER TEST', shipType: 'Cargo' } }), NIGHT_SYD), 'nvg');
  assert.equal(sensorFor(at('airport'), NIGHT_SYD), 'nvg');
  assert.equal(sensorFor(at('airport'), DAY_SYD), null);
  assert.equal(SENSOR_LABELS.flir, 'SENSOR · FLIR');
  assert.equal(SENSOR_LABELS.nvg, 'SENSOR · NVG');
});

test('never a sensor look for space, planet-scale views, the descent’s GEO and ISS steps, or street cameras', () => {
  assert.equal(sensorFor(at('satellite', {}, { rangeM: 2_500_000 }), NIGHT_SYD), null);
  assert.equal(sensorFor(at('camera'), NIGHT_SYD), null);
  assert.equal(sensorFor(at('city', { stop: { id: 'globe' } }, { rangeM: 20_000_000 }), NIGHT_SYD), null);
  assert.equal(sensorFor(at('event', {}, { rangeM: 4_000_000 }), NIGHT_SYD), null);
  assert.equal(sensorFor(at('geo', { descent: 'geo' }), NIGHT_SYD), null);
  assert.equal(sensorFor(at('satellite', { descent: 'iss' }), NIGHT_SYD), null);
  assert.equal(sensorFor(at('camera', { descent: 'street' }), NIGHT_SYD), null);
  // Lower descent steps follow the normal rules.
  assert.equal(sensorFor(at('aircraft', { descent: 'low' }), NIGHT_SYD), 'nvg');
  assert.equal(sensorFor({ kind: 'military' }, NIGHT_SYD), null, 'no view, no look');
});
