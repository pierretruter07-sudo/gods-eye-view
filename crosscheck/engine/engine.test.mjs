import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess, rateItem, rollupStandard, severityFor } from './assess.js';
import { aiPrompt, evidenceIds, parseAiReply, validateAiRatings } from './ai.js';
import { FACTS, cleanFacts } from './facts.js';
import { buildPlan, planMarkdown, waveOf } from './plan.js';
import { SIGNALS, gatherEvidence, inProse, isTestPath, redact } from './signals.js';
import { buildSnapshot, cleanPath, stripCommonRoot } from './snapshot.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogues = fs
  .readdirSync(path.join(here, '..', 'catalogues'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(here, '..', 'catalogues', f), 'utf8')));
const byId = (id) => catalogues.find((c) => c.id === id);

/** A small repository as a snapshot. */
function repo(files) {
  return buildSnapshot(
    Object.entries(files).map(([p, text]) => ({ path: p, size: text.length, read: () => text })),
    { name: 'fixture' },
  );
}

const GOOD = {
  'README.md': '# Fixture\n',
  'LICENSE': 'MIT',
  'SECURITY.md': 'Report vulnerabilities to security@example.org',
  '.gitignore': 'node_modules\n.env\n',
  '.env.example': 'API_KEY=\n',
  'package.json': '{"name":"fixture","dependencies":{"zod":"3"},"scripts":{"test":"node --test"}}',
  'package-lock.json': '{}',
  '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: npm test\n      - uses: github/codeql-action/init@v3\n      - run: npx @cyclonedx/cyclonedx-npm\n      - run: cosign sign-blob dist.tgz\n',
  '.github/dependabot.yml': 'version: 2\n',
  'src/app.js': "import { z } from 'zod';\nimport passport from 'passport';\nimport pino from 'pino';\napp.use(helmet());\nres.setHeader('Content-Security-Policy', \"default-src 'self'\");\n",
  'src/app.test.js': 'test("x", () => {})\n',
};

test('evidence signals find what is there and cite where', () => {
  const ev = gatherEvidence(repo(GOOD));
  assert.equal(ev.signals['doc.readme'].state, 'pass');
  assert.equal(ev.signals['ci.tests'].state, 'pass');
  assert.equal(ev.signals['deps.lockfile'].state, 'pass');
  assert.equal(ev.signals['deps.updates'].state, 'pass');
  assert.equal(ev.signals['sast.tool'].state, 'pass');
  assert.equal(ev.signals['sbom'].state, 'pass');
  assert.equal(ev.signals['release.integrity'].state, 'pass');
  assert.equal(ev.signals['sec.headers'].state, 'pass');
  assert.equal(ev.signals['sec.authn'].state, 'pass');
  assert.equal(ev.signals['sec.logging'].state, 'pass');
  assert.equal(ev.signals['secrets.clean'].state, 'pass');
  assert.equal(ev.signals['container.nonroot'].state, 'na', 'no container: does not apply');
  // Every piece of evidence has a stable id the ratings cite.
  const e = ev.signals['sec.headers'].evidence[0];
  assert.match(e.id, /^sec\.headers#\d+$/);
  assert.equal(e.path, 'src/app.js');
  assert.ok(e.line > 0);
});

test('secrets are found and redacted; placeholders and test fixtures are treated apart', () => {
  const ev = gatherEvidence(
    repo({
      'src/config.js': "const awsKey = 'AKIAABCDEFGHIJKLMNOP';\nconst apiKey = process.env.API_KEY;\n",
      'src/x.test.js': "const password = 'correct-horse-battery';\n",
      '.env': 'TOKEN=abc',
    }),
  );
  const s = ev.signals['secrets.clean'];
  assert.equal(s.state, 'fail');
  assert.ok(s.evidence.some((e) => e.path === 'src/config.js' && /AWS access key/.test(e.note)));
  assert.ok(s.evidence.some((e) => e.path === '.env'), 'committed .env flagged');
  assert.ok(!s.evidence.some((e) => /AKIAABCDEFGHIJKLMNOP/.test(e.note)), 'never shown in full');
  assert.equal(redact("key = 'AKIAABCDEFGHIJKLMNOP'"), "key = 'AKIAABCD…'");
});

test('mentions in comments, quoted sentences and pattern definitions are not evidence', () => {
  assert.equal(inProse("  msg: 'Add a Content-Security-Policy header to every reply',", /Content-Security-Policy/), true);
  assert.equal(inProse("  'Content-Security-Policy': \"default-src 'self'\",", /Content-Security-Policy/), false);
  const ev = gatherEvidence(
    repo({
      'src/a.js': "// we should use passport here\nconst help = 'Set up passport and next-auth for sign in later';\n",
    }),
  );
  assert.equal(ev.signals['sec.authn'].state, 'fail');
  assert.equal(isTestPath('src/__tests__/a.js'), true);
  assert.equal(isTestPath('src/attest.js'), false);
});

test('AI use is found from SDK imports, dependencies or hosted API calls', () => {
  assert.equal(gatherEvidence(repo({ 'a.py': 'from openai import OpenAI\n' })).ai.used, true);
  assert.equal(gatherEvidence(repo({ 'package.json': '{\n  "dependencies": {\n    "@anthropic-ai/sdk": "1"\n  }\n}' })).ai.used, true);
  assert.equal(gatherEvidence(repo({ 'a.js': "fetch('https://api.openai.com/v1/chat/completions')\n" })).ai.used, true);
  assert.equal(gatherEvidence(repo({ 'a.js': '// replicate the old behaviour\n' })).ai.used, false);
});

test('snapshots normalise paths, drop the archive folder and refuse traversal', () => {
  assert.equal(cleanPath('./a\\b//c.js'), 'a/b/c.js');
  assert.equal(cleanPath('../etc/passwd'), null);
  assert.equal(stripCommonRoot(['repo-main/a', 'repo-main/b/c']), 'repo-main/');
  const s = repo({ 'repo-main/README.md': 'x', 'repo-main/node_modules/x.js': 'y', 'repo-main/bin.png': 'z' });
  assert.deepEqual(s.files.map((f) => f.path).sort(), ['README.md', 'bin.png']);
  assert.equal(s.files.find((f) => f.path === 'bin.png').text, null, 'binary not read');
});

test('rating rules: direct proof is Compliant, declarations and indications Largely, mixed Partial, none Non-compliant, unknown unrated', () => {
  const ev = { signals: { a: { state: 'pass', evidence: [] }, b: { state: 'fail', evidence: [] }, c: { state: 'partial', evidence: [] } } };
  const rate = (item, facts = {}) => rateItem(item, ev, facts).status;
  assert.equal(rate({ checks: [{ id: 'a', strength: 'direct' }] }), 'C');
  assert.equal(rate({ checks: ['a'] }), 'L');
  assert.equal(rate({ checks: [{ id: 'a', strength: 'direct' }], facts: ['backups'] }, { backups: 'yes' }), 'L');
  assert.equal(rate({ checks: ['a', 'b'] }), 'P');
  assert.equal(rate({ checks: ['b'] }), 'N');
  assert.equal(rate({ checks: ['c'] }), 'P');
  assert.equal(rate({ facts: ['backups'] }), null);
  assert.equal(rateItem({ facts: ['backups'] }, ev, {}).unrated, 'facts');
  assert.equal(rateItem({}, ev, {}).unrated, 'reviewer');
  assert.equal(rate({ facts: ['backups'] }, { backups: 'na' }), 'NA');
  assert.equal(severityFor('N', 'high', 'safety'), 'S2');
  assert.equal(severityFor('N', 'critical', 'security'), 'SC');
  assert.equal(severityFor('P', 'medium', 'security'), 'SL');
});

test('a standard is incomplete while items await facts or review, and blocked by any non-compliant item', () => {
  const cat = { id: 'x', short: 'X', items: [] };
  const base = { counts: {} };
  assert.equal(rollupStandard(cat, [{ status: 'C' }, { status: null, unrated: 'reviewer' }]).state, 'incomplete');
  assert.equal(rollupStandard(cat, [{ status: 'C' }, { status: 'N', sev: 'SM' }]).state, 'blocked');
  assert.equal(rollupStandard(cat, [{ status: 'C' }, { status: 'P', sev: 'SL' }]).state, 'conditions');
  const ok = rollupStandard(cat, [{ status: 'C' }, { status: 'L' }]);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.readiness, 0.875);
  assert.ok(base);
});

test('the AI standard is excluded when no AI is used, and applies when declared', () => {
  const ev = gatherEvidence(repo(GOOD));
  const off = assess({ evidence: ev, catalogues: [byId('iso42001')] });
  assert.equal(off.standards[0].state, 'na');
  const on = assess({ evidence: ev, facts: { ai_use: 'yes' }, catalogues: [byId('iso42001')] });
  assert.notEqual(on.standards[0].state, 'na');
});

test('levels scope the items: ASVS level 1 has fewer items than level 2', () => {
  const ev = gatherEvidence(repo(GOOD));
  const l1 = assess({ evidence: ev, catalogues: [byId('asvs5')], levels: { asvs5: '1' } }).standards[0].scope;
  const l2 = assess({ evidence: ev, catalogues: [byId('asvs5')], levels: { asvs5: '2' } }).standards[0].scope;
  assert.ok(l1 < l2 && l2 === 253, `${l1} < ${l2}`);
});

test('the remediation plan groups gaps into fixes across standards, in waves, with projected readiness', () => {
  const ev = gatherEvidence(repo({ 'README.md': '# x', 'src/a.js': 'eval(userInput)\n' }));
  const input = { evidence: ev, facts: { backups: 'no' }, catalogues };
  const result = assess(input);
  const plan = buildPlan(input, result);
  const all = plan.waves.flatMap((w) => w.fixes);
  // One fix (no dangerous calls) closes items in several standards.
  const evalFix = all.find((f) => f.signal === 'sec.no_dangerous');
  assert.ok(evalFix.standards.length >= 3, evalFix.standards.join(','));
  assert.ok(evalFix.where.some((w) => w.path === 'src/a.js'));
  // Waves are ordered must-fix, non-compliant, conditions, then questions.
  for (const w of plan.waves) for (const f of w.fixes) assert.equal(waveOf(f), w.n);
  assert.ok(plan.waves[3].fixes.some((f) => f.kind === 'question'));
  assert.ok(all.some((f) => f.kind === 'process' && f.fact === 'backups'));
  // Projected readiness never falls, and is marked projected in the text.
  const w1 = plan.waves[0].projected;
  for (const s of result.standards) if (s.state !== 'na') assert.ok(w1[s.standard].readiness >= s.readiness);
  const md = planMarkdown(plan, result, { project: 'fixture' });
  assert.match(md, /\(projected\)/);
  assert.match(md, /W1\.1/);
  assert.match(md, /Brief for a coding agent/);
});

test('AI ratings are kept only with real citations, never as Compliant, and never override rules', () => {
  const ev = gatherEvidence(repo(GOOD));
  const items = [
    { standard: 'asvs5', id: 'V17.1.1', title: 'x' },
    { standard: 'asvs5', id: 'V17.2.1', title: 'y' },
    { standard: 'asvs5', id: 'V17.3.1', title: 'z' },
  ];
  const ids = evidenceIds(ev, {});
  assert.ok(ids.has('signal:sec.headers') && ids.has('inventory'));
  const reply = parseAiReply('```json\n{"ratings":[{"id":"V17.1.1","status":"C","cites":["signal:sec.headers"],"why":"ok"},{"id":"V17.2.1","status":"P","cites":["made-up#1"]},{"id":"V17.3.1","status":"N","cites":[]},{"id":"V9.9.9","status":"N","cites":["inventory"]}]}\n```');
  const v = validateAiRatings(reply, { items, evidence: ev, facts: {} });
  assert.deepEqual(v.accepted.map((a) => [a.id, a.status]), [['V17.1.1', 'L']]);
  assert.equal(v.rejected.length, 3);
  assert.ok(JSON.parse(aiPrompt({ evidence: ev, facts: {}, items })).signals.length >= SIGNALS.length);
  // Applied through assess: only unrated items take an AI rating.
  const asvs = byId('asvs5');
  const r = assess({ evidence: ev, catalogues: [asvs], aiRatings: [{ standard: 'asvs5', id: 'V17.1.1', status: 'L', cites: ['inventory'], why: 'w' }, { standard: 'asvs5', id: 'V3.4.1', status: 'N', cites: ['inventory'] }] });
  const item = (id) => r.standards[0].items.find((i) => i.id === id);
  if (item('V17.1.1') && !item('V17.1.1').out) assert.equal(item('V17.1.1').basis, 'ai');
  assert.notEqual(item('V3.4.1').basis, 'ai', 'a rule-based rating stands');
});

test('intake answers are cleaned: unknown ids dropped, yes/no normalised, text capped', () => {
  const f = cleanFacts({ backups: 'YES', owner: ' Team A ', nope: 'x', criticality: 'bogus', ai_use: 'auto', purpose: 'x'.repeat(900) });
  assert.deepEqual(Object.keys(f).sort(), ['ai_use', 'backups', 'owner', 'purpose']);
  assert.equal(f.backups, 'yes');
  assert.equal(f.owner, 'Team A');
  assert.equal(f.purpose.length, 500);
  assert.ok(FACTS.every((x) => x.id && x.question));
});
