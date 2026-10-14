#!/usr/bin/env node
/**
 * Static import graph + orphan-code report (audit tool).
 *
 * Walks every relative `import … from`, `export … from`, `import('…')` and
 * side-effect `import '…'` from the shipped entry points (the browser app and
 * the server/Vite config) and reports:
 *   - reachable source files (what actually ships / runs),
 *   - ORPHANS: non-test source files no entry point reaches (dead code),
 *   - TEST-ONLY: files only reachable from tests,
 *   - dangling relative imports (a file imports something that is missing).
 *
 * Bare package imports (`cesium`, `vite`, …) are not followed. Usage:
 *   node scripts/audit/import-graph.mjs            # summary
 *   node scripts/audit/import-graph.mjs --orphans  # list orphan files
 *   node scripts/audit/import-graph.mjs --json     # machine-readable
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIRS = ['src', 'server', 'build'];
export const ENTRY_POINTS = Object.freeze(['src/main.js', 'server/standalone/vite.config.js', 'vite.config.js']);

const SPEC = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

function listSources(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js)$/.test(e.name)) out.push(path.relative(ROOT, p));
    }
  };
  if (existsSync(path.join(ROOT, dir))) walk(path.join(ROOT, dir));
  return out;
}

const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SELF = `${PKG.name}/`;

function resolveSpec(from, spec) {
  // The package's own name resolves through its "exports" map.
  if (spec.startsWith(SELF)) {
    const entry = PKG.exports?.[`./${spec.slice(SELF.length)}`];
    const target = typeof entry === 'string' ? entry : entry?.node || entry?.default;
    if (!target) return { missing: `exports:${spec}` };
    return path.relative(ROOT, path.resolve(ROOT, target));
  }
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // package
  if (spec.endsWith('/')) return null; // a directory URL (e.g. the repo root), not a module
  const base = path.resolve(ROOT, path.dirname(from), spec.split('?')[0]);
  for (const c of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return path.relative(ROOT, c);
  }
  return { missing: path.relative(ROOT, base) };
}

export function importsOf(file) {
  const text = readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs = [];
  for (const m of text.matchAll(SPEC)) specs.push(m[1] || m[2] || m[3] || m[4]);
  return specs;
}

export function buildGraph(entries = ENTRY_POINTS) {
  const seen = new Set();
  const dangling = [];
  const stack = entries.filter((e) => existsSync(path.join(ROOT, e)));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.(m?js)$/.test(f)) continue;
    for (const spec of importsOf(f)) {
      const r = resolveSpec(f, spec);
      if (!r) continue;
      if (typeof r === 'object') dangling.push({ from: f, spec, missing: r.missing });
      else if (!seen.has(r)) stack.push(r);
    }
  }
  return { reachable: seen, dangling };
}

const isTest = (f) => /\.test\.m?js$/.test(f) || /(^|\/)(testing|testSupport|fixtures?)\//.test(f) || /fixtureRoot\.mjs$/.test(f);

export function report() {
  const all = SOURCE_DIRS.flatMap(listSources);
  const { reachable, dangling } = buildGraph();
  const tests = all.filter(isTest);
  const fromTests = buildGraph(tests).reachable;
  const nonTest = all.filter((f) => !isTest(f));
  const orphans = nonTest.filter((f) => !reachable.has(f) && !fromTests.has(f)).sort();
  const testOnly = nonTest.filter((f) => !reachable.has(f) && fromTests.has(f)).sort();
  const lines = (fs) => fs.reduce((n, f) => n + readFileSync(path.join(ROOT, f), 'utf8').split('\n').length, 0);
  return {
    files: { total: nonTest.length, reachable: nonTest.filter((f) => reachable.has(f)).length, orphans: orphans.length, testOnly: testOnly.length },
    lines: { reachable: lines(nonTest.filter((f) => reachable.has(f))), orphans: lines(orphans), testOnly: lines(testOnly) },
    orphans,
    testOnly,
    dangling,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = report();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Source files: ${r.files.total}  reachable: ${r.files.reachable}  orphan: ${r.files.orphans}  test-only: ${r.files.testOnly}`);
    console.log(`Lines        reachable: ${r.lines.reachable}  orphan: ${r.lines.orphans}  test-only: ${r.lines.testOnly}`);
    console.log(`Dangling relative imports: ${r.dangling.length}`);
    for (const d of r.dangling) console.log(`  ${d.from} → ${d.spec}`);
    if (process.argv.includes('--orphans')) {
      console.log('\nOrphans:');
      for (const f of r.orphans) console.log(`  ${f}`);
      console.log('\nTest-only:');
      for (const f of r.testOnly) console.log(`  ${f}`);
    }
  }
}
