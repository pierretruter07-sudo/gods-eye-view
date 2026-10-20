import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS } from '../engine/facts.js';
import { SIGNALS } from '../engine/signals.js';
import { buildCatalogues } from '../tools/build-catalogues.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const onDisk = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8')));

test('the committed catalogues match a fresh build of crosscheck/tools/build-catalogues.mjs', () => {
  const fresh = buildCatalogues();
  assert.equal(onDisk.length, fresh.length);
  for (const c of fresh) assert.deepEqual(onDisk.find((d) => d.id === c.id), c, c.id);
});

test('the library has seven standards, including the four added in Phase 5', () => {
  const ids = onDisk.map((c) => c.id).sort();
  assert.deepEqual(ids, ['asvs5', 'ed153', 'ism-e8', 'iso27001', 'iso42001', 'mil882e', 'nist-ssdf']);
  const count = (id) => onDisk.find((c) => c.id === id).items.length;
  assert.equal(count('nist-ssdf'), 19, 'SSDF 1.1: 19 practices');
  assert.equal(onDisk.find((c) => c.id === 'iso27001').items.filter((i) => i.id.startsWith('A.')).length, 93, 'ISO 27001:2022 Annex A: 93 controls');
  assert.equal(onDisk.find((c) => c.id === 'ism-e8').items.filter((i) => i.group === 'E8').length, 8, 'Essential Eight');
  assert.ok(count('mil882e') >= 25);
});

test('every catalogue item has an id and title, and references only known signals and facts', () => {
  const signals = new Set(SIGNALS.map((s) => s.id));
  const facts = new Set(FACTS.map((f) => f.id));
  for (const c of onDisk) {
    assert.ok(c.name && c.short && c.scale && c.licence, c.id);
    const seen = new Set();
    for (const i of c.items) {
      assert.ok(i.id && i.title, `${c.id} item`);
      assert.ok(!seen.has(i.id), `${c.id} duplicate ${i.id}`);
      seen.add(i.id);
      for (const k of i.checks) assert.ok(signals.has(typeof k === 'string' ? k : k.id), `${c.id} ${i.id} -> ${JSON.stringify(k)}`);
      for (const f of i.facts) assert.ok(facts.has(f), `${c.id} ${i.id} -> ${f}`);
    }
  }
});

test('licensed standards carry numbers and short paraphrased titles only', () => {
  for (const id of ['iso27001', 'iso42001', 'ed153']) {
    const c = onDisk.find((x) => x.id === id);
    assert.match(c.licence, /paraphrased/i);
    for (const i of c.items) assert.ok(i.title.length <= 90, `${id} ${i.id} title is short`);
  }
  assert.match(onDisk.find((x) => x.id === 'asvs5').attribution, /CC BY-SA 4\.0/);
});
