import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePhase, headingDiff } from './phase.js';
import { AIRPORT_PROFILES, calmWindHeadingDeg } from './profiles.js';

const ybbn = AIRPORT_PROFILES.ybbn;
const FT = 1 / 3.28084;
const KT = 1 / 1.943844;
const FPM = 1 / 196.850394;

test('runway headings come from the designator number', () => {
  assert.equal(ybbn.runways[0].lowHeadingDeg, 10);
  assert.equal(ybbn.runways[0].highHeadingDeg, 190);
  assert.equal(AIRPORT_PROFILES.yssy.runways[0].lowHeadingDeg, 70);
  assert.equal(AIRPORT_PROFILES.ypad.runways[1].lowHeadingDeg, 120);
});

test('calm-wind heading resolves from the stem on either end', () => {
  assert.equal(calmWindHeadingDeg(ybbn), 190); // "19" is the high end of 01L/19R
  assert.equal(calmWindHeadingDeg(AIRPORT_PROFILES.ypad), 230);
});

test('headingDiff wraps correctly', () => {
  assert.equal(headingDiff(350, 10), 20);
  assert.equal(headingDiff(10, 190), 180);
});

test('ground speed splits parked, taxi and take-off roll', () => {
  const base = { altitudeM: ybbn.elevationM, onGround: true, heading: 190 };
  assert.equal(derivePhase({ ...base, speedMps: 0 }, ybbn).phase, 'parked');
  assert.equal(derivePhase({ ...base, speedMps: 10 * KT }, ybbn).phase, 'taxi');
  assert.equal(derivePhase({ ...base, speedMps: 90 * KT }, ybbn).phase, 'takeoff');
});

test('vertical rate separates approach from departure above the field', () => {
  const at = (aglFt, rateFpm) => ({
    altitudeM: (aglFt * FT) + ybbn.elevationM,
    speedMps: 180 * KT,
    verticalRateMps: rateFpm * FPM,
    heading: 190,
    onGround: false,
  });
  assert.equal(derivePhase(at(3000, -800), ybbn).phase, 'approach');
  assert.equal(derivePhase(at(3000, 1200), ybbn).phase, 'departure');
  assert.equal(derivePhase(at(800, -600), ybbn).phase, 'landing');
  assert.equal(derivePhase(at(800, 1000), ybbn).phase, 'takeoff');
});

test('without a vertical rate, track vs runway decides low and fast', () => {
  const low = (hdg) => ({
    altitudeM: (800 * FT) + ybbn.elevationM,
    speedMps: 150 * KT,
    verticalRateMps: null,
    heading: hdg,
    onGround: false,
  });
  // Calm-wind landing heading at YBBN is 190; departures fly 010.
  assert.equal(derivePhase(low(10), ybbn).phase, 'takeoff');
  assert.equal(derivePhase(low(190), ybbn).arriving, true);
});

test('high and level reads as cruise', () => {
  const r = derivePhase(
    { altitudeM: 11000, speedMps: 250 * KT, verticalRateMps: 0, heading: 90, onGround: false },
    ybbn,
  );
  assert.equal(r.phase, 'cruise');
  assert.equal(r.arriving, null);
});
