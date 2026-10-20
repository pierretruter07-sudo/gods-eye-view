#!/usr/bin/env node
/**
 * @file Assess a folder on disk from the command line.
 *
 *   node crosscheck/tools/assess-dir.mjs <folder> [--standards asvs5,nist-ssdf]
 *        [--facts facts.json] [--out report-folder]
 *
 * Prints the verdict per standard and the plan's waves; with --out it also
 * writes assessment.json, plan.json and plan.md.
 * @module crosscheck/tools
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess } from '../engine/assess.js';
import { buildPlan, planMarkdown } from '../engine/plan.js';
import { gatherEvidence } from '../engine/signals.js';
import { buildSnapshot } from '../engine/snapshot.js';
import { cleanFacts } from '../engine/facts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogueDir = path.resolve(here, '..', 'catalogues');

/** Every catalogue on disk. */
export function loadCatalogues(dir = catalogueDir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** Snapshot entries for a folder on disk. */
export function folderEntries(folder) {
  const entries = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', '.claude', 'node_modules'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const size = fs.statSync(p).size;
        entries.push({ path: path.relative(folder, p), size, read: () => fs.readFileSync(p) });
      }
    }
  };
  walk(folder);
  return entries;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

function main() {
  const folder = process.argv[2];
  if (!folder || !fs.existsSync(folder)) {
    console.error('Usage: assess-dir.mjs <folder> [--standards ids] [--facts facts.json] [--out folder]');
    process.exit(2);
  }
  const wanted = arg('--standards')?.split(',');
  const catalogues = loadCatalogues().filter((c) => !wanted || wanted.includes(c.id));
  const facts = arg('--facts') ? cleanFacts(JSON.parse(fs.readFileSync(arg('--facts'), 'utf8'))) : {};
  const snapshot = buildSnapshot(folderEntries(path.resolve(folder)), { name: path.basename(path.resolve(folder)) });
  const evidence = gatherEvidence(snapshot);
  const input = { evidence, facts, catalogues };
  const result = assess(input);
  const plan = buildPlan(input, result);
  console.log(`${snapshot.name}: ${evidence.inventory.files} files, ${evidence.inventory.codeFiles} code, ${evidence.inventory.testFiles} tests`);
  console.log(result.summary.headline);
  for (const s of result.standards)
    console.log(`  ${s.short.padEnd(14)} ${String(Math.round(s.readiness * 100)).padStart(3)}%  ${s.verdict}  (open ${s.open}, must-fix ${s.blocking}, unrated ${s.unrated})`);
  for (const w of plan.waves)
    if (w.fixes.length) console.log(`  Wave ${w.n} ${w.name}: ${w.fixes.length} fixes`);
  const out = arg('--out');
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'assessment.json'), JSON.stringify(result, null, 1));
    fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify(plan, null, 1));
    fs.writeFileSync(path.join(out, 'plan.md'), planMarkdown(plan, result, { project: snapshot.name, date: new Date().toISOString().slice(0, 10) }));
    console.log(`Written to ${out}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
