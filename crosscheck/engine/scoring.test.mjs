import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headline, mustFix, rollup } from './scoring.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'examples', 'gods-eye-view', 'assessment.json'), 'utf8'),
);

test('the engine reproduces the God’s Eye View baseline: safety 38%, security 62%, AI 24%, 28 must-fix', () => {
  const o = { swal: example.swal, asvsLevel: example.asvsLevel };
  const saf = rollup(example.items, 'saf', o);
  const sec = rollup(example.items, 'sec', o);
  const ai = rollup(example.items, 'ai', o);
  assert.equal(Math.round(saf.readiness * 100), 38);
  assert.equal(Math.round(sec.readiness * 100), 62);
  assert.equal(Math.round(ai.readiness * 100), 24);
  assert.equal(mustFix(example.items).length, 28);
  assert.ok(headline(saf, sec, ai));
});

test('crosscheck/ stands alone: nothing in it imports or reads from God’s Eye View', () => {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|py|html)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/(?:from\s+|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g)) {
          const spec = m[1];
          if (!spec.startsWith('.')) continue;
          const target = path.resolve(path.dirname(p), spec);
          if (!target.startsWith(path.resolve(here, '..'))) bad.push(`${path.relative(here, p)} -> ${spec}`);
        }
        // Tools may write into the repo they audit (passed as an argument),
        // but never reach God's Eye View's code relative to this folder.
        if (/['"`]\.\.\/(?:\.\.\/)+src\//.test(text)) bad.push(`${path.relative(here, p)} reaches ../src/`);
      }
    }
  };
  walk(path.resolve(here, '..'));
  assert.deepEqual(bad, []);
});
