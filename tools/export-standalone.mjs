#!/usr/bin/env node
/**
 * @file Lift CrossCheck out of God's Eye View into a project of its own.
 *
 *   node crosscheck/tools/export-standalone.mjs <out-folder> [--force]
 *
 * Copies this folder (no God's Eye View code; the boundary test proves it
 * imports nothing from it) and adds what a stand-alone project needs:
 * package.json, a Replit run file, CI, .gitignore, .env.example (names only)
 * and a notice. Then it checks the export: no import may leave the folder.
 * Run `npm test` inside the export to prove it works on its own.
 * @module crosscheck/tools
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..');
const SKIP = new Set(['__pycache__', 'node_modules', '.DS_Store']);

const FILES = {
  'package.json': `${JSON.stringify(
    {
      name: 'crosscheck',
      version: '1.0.0',
      private: true,
      description: 'Plug in any software; see where it falls short of your standards, with a remediation plan.',
      type: 'module',
      engines: { node: '>=22' },
      scripts: {
        start: 'node server/standalone.mjs',
        test: 'node --test "engine/*.test.mjs" "server/*.test.mjs" "catalogues/*.test.mjs"',
        'build:catalogues': 'node tools/build-catalogues.mjs',
        'check:catalogues': 'node tools/build-catalogues.mjs --check',
        assess: 'node tools/assess-dir.mjs',
      },
    },
    null,
    2,
  )}\n`,
  '.replit': [
    'run = "npm start"',
    'modules = ["nodejs-22"]',
    '',
    '[deployment]',
    'run = ["node", "server/standalone.mjs"]',
    'deploymentTarget = "autoscale"',
    '',
    '[[ports]]',
    'localPort = 5175',
    'externalPort = 80',
    '',
  ].join('\n'),
  '.gitignore': ['node_modules/', '.env', '.env.*', '!.env.example', '__pycache__/', 'reports/', ''].join('\n'),
  '.env.example': [
    '# CrossCheck settings (names only; set values in the host\'s secrets).',
    '# PORT=5175',
    '# CROSSCHECK_GITHUB_TOKEN=',
    '# CROSSCHECK_AI_URL=http://localhost:11434/v1',
    '# CROSSCHECK_AI_MODEL=',
    '# CROSSCHECK_AI_KEY=',
    '',
  ].join('\n'),
  '.github/workflows/ci.yml': [
    'name: CI',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 22',
    '      - run: npm run check:catalogues',
    '      - run: npm test',
    '',
  ].join('\n'),
  'NOTICE.md': [
    '# Notice',
    '',
    'CrossCheck © Digital Dynamics Group. All rights reserved unless agreed otherwise.',
    '',
    'Standards text:',
    '',
    '- OWASP Application Security Verification Standard 5.0.0, © OWASP Foundation, CC BY-SA 4.0. Requirement text in `catalogues/asvs5.json` keeps this licence.',
    '- ISO/IEC 27001, ISO/IEC 42001 and EUROCAE ED-153 are copyrighted. CrossCheck stores clause and control numbers with paraphrased titles only. Use the full text under your own licence.',
    '- NIST SP 800-218, the Australian ISM and Essential Eight, and MIL-STD-882E are referenced by identifier with paraphrased titles.',
    '',
  ].join('\n'),
};

/** Copy the CrossCheck folder into `out`, adding the project files. */
export function exportStandalone(out, { force = false } = {}) {
  out = path.resolve(out);
  if (fs.existsSync(out) && fs.readdirSync(out).length && !force)
    throw new Error(`${out} is not empty (use --force to overwrite)`);
  const copy = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) {
        fs.mkdirSync(b, { recursive: true });
        copy(a, b);
      } else fs.copyFileSync(a, b);
    }
  };
  fs.mkdirSync(out, { recursive: true });
  copy(SRC, out);
  for (const [name, text] of Object.entries(FILES)) {
    const file = path.join(out, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  // The README's "inside God's Eye View" lines no longer apply.
  const readme = path.join(out, 'README.md');
  fs.writeFileSync(
    readme,
    fs
      .readFileSync(readme, 'utf8')
      .replace(/CrossCheck is developed inside the God's Eye View repository[\s\S]*?CrossCheck's engine\.\n/, "God's Eye View, its first worked example, is in `examples/gods-eye-view/`.\n")
      .replace(/- \*\*Inside God's Eye View:\*\*[^\n]*\n[^\n]*\n/, '')
      .replace('node crosscheck/server/standalone.mjs', 'npm start')
      .replace(/node crosscheck\/tools\//g, 'node tools/'),
  );
  const bad = escapes(out);
  if (bad.length) throw new Error(`Imports leave the export:\n${bad.join('\n')}`);
  return out;
}

/** Relative imports that point outside the exported folder. */
export function escapes(root) {
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|html)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/(?:from\s+|import\(\s*|src=)['"](\.{1,2}\/[^'"]+)['"]/g)) {
          const target = path.resolve(path.dirname(p), m[1]);
          if (!target.startsWith(root + path.sep)) bad.push(`${path.relative(root, p)} -> ${m[1]}`);
        }
      }
    }
  };
  walk(root);
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: export-standalone.mjs <out-folder> [--force]');
    process.exit(2);
  }
  console.log(`CrossCheck exported to ${exportStandalone(out, { force: process.argv.includes('--force') })}`);
}
