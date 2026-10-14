import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../../scripts/audit/trace-check.mjs';

test('every requirement is traced to existing code and to test titles that exist', () => {
  const r = check();
  assert.deepEqual(r.problems, []);
  assert.equal(r.traced, r.requirements);
  assert.ok(r.testTitles > 0);
});
