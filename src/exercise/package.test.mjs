import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePackage } from './package.js';
import { getScenario } from './scenario.js';

const scenario = getScenario('grey-tide');

test('the same scenario and seed produce the same package', () => {
  const a = generatePackage(scenario);
  const b = generatePackage(scenario);
  assert.deepEqual(a, b);
});

test('a package always has the essential roles and a positive count', () => {
  const pkg = generatePackage(scenario);
  const roles = pkg.roles.map((r) => r.role);
  for (const essential of ['Strike', 'Escort', 'SEAD / Jammer']) {
    assert.ok(roles.includes(essential), `missing ${essential}`);
  }
  assert.ok(pkg.aircraftTotal > 0);
  assert.equal(
    pkg.aircraftTotal,
    pkg.roles.reduce((n, r) => n + r.count, 0),
  );
});

test('platforms stay generic classes, never real types', () => {
  const pkg = generatePackage(scenario);
  const joined = pkg.roles.map((r) => r.platform).join(' ');
  assert.doesNotMatch(joined, /F-?\d|B-?\d|MQ-|Reaper|Gripen|Rafale|Typhoon/i);
});

test('risk is 0-100 with a matching band', () => {
  const pkg = generatePackage(scenario);
  assert.ok(pkg.risk.score >= 0 && pkg.risk.score <= 100);
  assert.ok(['Low', 'Moderate', 'High'].includes(pkg.risk.band));
});

test('timeline ends at time on target then egress, naming the fictional target', () => {
  const pkg = generatePackage(scenario);
  const tot = pkg.timeline.find((s) => s.t === 'H−00');
  assert.match(tot.event, /Zarin West Airfield/);
  assert.equal(pkg.timeline.at(-1).t, 'H+12');
});

test('authorisation is a checklist with a final command step left open', () => {
  const pkg = generatePackage(scenario);
  assert.equal(pkg.authorisation.at(-1).label, 'Command authorisation');
  assert.equal(pkg.authorisation.at(-1).cleared, false);
});

test('a different seed can change the package', () => {
  const a = generatePackage(scenario, { seed: 1 });
  const b = generatePackage(scenario, { seed: 999 });
  assert.notDeepEqual(a.roles, b.roles);
});
