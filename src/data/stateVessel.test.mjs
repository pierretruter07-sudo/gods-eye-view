import test from 'node:test';
import assert from 'node:assert/strict';
import { isStateVessel, stateVesselBasis } from './stateVessel.js';
import { normalizeVesselType } from './vesselLabels.js';

test('numeric AIS codes become families the state-vessel rule understands', () => {
  assert.equal(normalizeVesselType('35'), 'MILITARY');
  assert.equal(normalizeVesselType('55'), 'LAW ENFORCE');
  assert.equal(normalizeVesselType('71'), 'CARGO');
  assert.ok(isStateVessel({ shipType: normalizeVesselType('35') }));
  assert.ok(isStateVessel({ shipType: normalizeVesselType('51') }));
  assert.ok(!isStateVessel({ shipType: normalizeVesselType('71') }));
});

test('a naval hull prefix marks a state vessel even without an AIS type', () => {
  assert.ok(isStateVessel({ name: 'HMAS ANZAC' }));
  assert.ok(isStateVessel({ name: 'USS Ronald Reagan', shipType: '' }));
  assert.equal(stateVesselBasis({ name: 'HMS QUEEN ELIZABETH' }), 'Naval hull prefix in AIS name');
  assert.ok(!isStateVessel({ name: 'HMASTER' }), 'prefix must be a separate word');
  assert.ok(!isStateVessel({ name: 'MSC GULSUN', shipType: 'CARGO' }));
  assert.equal(stateVesselBasis({ name: 'MSC GULSUN' }), null);
});
