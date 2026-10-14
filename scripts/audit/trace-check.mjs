#!/usr/bin/env node
/**
 * Traceability check (ED-153 evidence): every requirement in
 * docs/REQUIREMENTS.md has a row in docs/VERIFICATION.md and vice versa, every
 * file a row cites exists, and every test title a row quotes ("…") exists in
 * the test file it names. Exit 1 on any break.
 *
 *   node scripts/audit/trace-check.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const ID = /^\| (GEV-[A-Z]+-\d{3}) \|/;

export function requirementIds(markdown) {
  return markdown.split('\n').map((l) => l.match(ID)?.[1]).filter(Boolean);
}

/** Matrix rows: id → { files: [...], titles: [{file, title}] }. */
export function matrixRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    const id = line.match(ID)?.[1];
    if (!id) continue;
    const cells = line.split('|').slice(2, -1).join('|');
    const files = [...cells.matchAll(/`([\w./-]+\.(?:m?js|json|ya?ml|md))`/g)].map((m) => m[1]);
    // A quoted title belongs to the nearest test file named before it.
    const titles = [];
    let current = null;
    for (const token of cells.matchAll(/`([\w./-]+\.test\.mjs)`|"([^"]+)"/g)) {
      if (token[1]) current = token[1];
      else if (current) titles.push({ file: current, title: token[2].replace(/…$/, '') });
    }
    rows.set(id, { files, titles });
  }
  return rows;
}

/** Resolve a cited name to a repository path (bare test names are searched for). */
function resolveFile(name, known) {
  if (existsSync(path.join(ROOT, name))) return name;
  const hits = known.filter((f) => f.endsWith(`/${name}`));
  return hits.length === 1 ? hits[0] : null;
}

export function check() {
  const reqs = requirementIds(read('docs/REQUIREMENTS.md'));
  const rows = matrixRows(read('docs/VERIFICATION.md'));
  const problems = [];
  const dup = reqs.filter((id, i) => reqs.indexOf(id) !== i);
  for (const id of dup) problems.push(`${id}: duplicated in REQUIREMENTS.md`);
  for (const id of reqs) if (!rows.has(id)) problems.push(`${id}: no row in VERIFICATION.md`);
  for (const id of rows.keys()) if (!reqs.includes(id)) problems.push(`${id}: traced but not a requirement`);
  const tests = listTests();
  let titleCount = 0;
  for (const [id, { files, titles }] of rows) {
    for (const f of files) {
      if (!resolveFile(f, tests) && !existsSync(path.join(ROOT, f))) problems.push(`${id}: cites missing file ${f}`);
    }
    for (const { file, title } of titles) {
      titleCount += 1;
      const resolved = resolveFile(file, tests);
      if (!resolved) {
        problems.push(`${id}: test file not found: ${file}`);
        continue;
      }
      if (!read(resolved).includes(title)) problems.push(`${id}: "${title}" not found in ${resolved}`);
    }
  }
  return { requirements: reqs.length, traced: rows.size, testTitles: titleCount, problems };
}

function listTests() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSafe(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.mjs')) out.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

function readdirSafe(dir) {
  try {
    return readdirSyncImpl(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
import { readdirSync as readdirSyncImpl } from 'node:fs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = check();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Requirements: ${r.requirements}  traced: ${r.traced}  cited test titles: ${r.testTitles}`);
    for (const p of r.problems) console.log(`  ✗ ${p}`);
    if (!r.problems.length) console.log('Traceability: complete');
  }
  process.exitCode = r.problems.length ? 1 : 0;
}
