import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { deflateRawSync } from 'node:zlib';
import { createCrossCheckHandler } from './handler.js';
import { aiConfig, aiRate } from './ai-client.js';
import { IntakeError, parseGithubUrl } from './intake.js';
import { servedFile } from './standalone.mjs';
import { ZipError, readZip } from './zip.js';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Build a zip in memory (deflated entries unless `stored`). */
export function makeZip(files, { stored = false } = {}) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const body = stored ? data : deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0);
    loc.writeUInt16LE(20, 4);
    loc.writeUInt16LE(0x800, 6);
    loc.writeUInt16LE(stored ? 0 : 8, 8);
    loc.writeUInt32LE(crc32(data), 14);
    loc.writeUInt32LE(body.length, 18);
    loc.writeUInt32LE(data.length, 22);
    loc.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x800, 8);
    cen.writeUInt16LE(stored ? 0 : 8, 10);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(loc, nameBuf, body);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const FIXTURE = {
  'demo-main/README.md': '# Demo\n',
  'demo-main/src/app.js': "import pino from 'pino';\neval(input);\n",
  'demo-main/src/app.test.js': 'test()\n',
  'demo-main/package.json': '{"name":"demo"}',
};

test('zips are read in memory, stored and deflated, and hostile archives refused', () => {
  for (const stored of [false, true]) {
    const entries = readZip(makeZip({ 'a/b.txt': 'hello', 'a/c.js': 'x'.repeat(5000) }, { stored }));
    assert.deepEqual(entries.map((e) => e.path), ['a/b.txt', 'a/c.js']);
    assert.equal(entries[0].read().toString(), 'hello');
    assert.equal(entries[1].read().length, 5000);
  }
  assert.throws(() => readZip(Buffer.from('not a zip, just text that is long enough')), ZipError);
  // A tiny archive claiming a huge unpacked size is refused (zip bomb).
  const bomb = makeZip({ 'big.txt': '0'.repeat(2_000_000) });
  assert.throws(() => readZip(bomb, { maxEntries: 10, maxTotalBytes: 1e9, maxEntryBytes: 1e9, maxRatio: 50 }), /compression ratio/);
  assert.throws(() => readZip(bomb, { maxEntries: 10, maxTotalBytes: 1000, maxEntryBytes: 1e9, maxRatio: 1e9 }), /too large/);
});

test('only https://github.com repository links are accepted', () => {
  assert.deepEqual(parseGithubUrl('https://github.com/owner/repo'), { owner: 'owner', repo: 'repo', ref: null });
  assert.deepEqual(parseGithubUrl('https://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo', ref: null });
  assert.deepEqual(parseGithubUrl('https://github.com/o/r/tree/release/1.2'), { owner: 'o', repo: 'r', ref: 'release/1.2' });
  assert.deepEqual(parseGithubUrl('owner/repo'), { owner: 'owner', repo: 'repo', ref: null });
  for (const bad of ['http://github.com/o/r', 'https://gitlab.com/o/r', 'https://169.254.169.254/latest', 'https://github.com/o', 'https://github.com/o/r/tree/a..b'])
    assert.throws(() => parseGithubUrl(bad), IntakeError, bad);
});

async function serve(handler) {
  const srv = http.createServer((req, res) => handler(req, res, () => {
    res.statusCode = 418;
    res.end();
  }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => srv.close() };
}

test('the API takes a zip, gathers evidence, and returns a report and a plan', async () => {
  const { base, close } = await serve(createCrossCheckHandler({ env: {} }));
  try {
    const lib = await (await fetch(`${base}/api/crosscheck/standards`)).json();
    assert.equal(lib.standards.length, 7);
    const status = await (await fetch(`${base}/api/crosscheck/status`)).json();
    assert.equal(status.ai.on, false);
    const intake = await (
      await fetch(`${base}/api/crosscheck/intake`, { method: 'POST', headers: { 'Content-Type': 'application/zip', 'X-Filename': 'demo.zip' }, body: makeZip(FIXTURE) })
    ).json();
    assert.equal(intake.name, 'demo');
    assert.equal(intake.inventory.files, 4);
    assert.equal(intake.signals['sec.no_dangerous'].state, 'fail');
    assert.equal(intake.signals['sec.no_dangerous'].evidence[0].path, 'src/app.js', 'archive folder stripped');
    assert.ok(!JSON.stringify(intake).includes('eval(input)') || intake.signals['sec.no_dangerous'].evidence[0].note.includes('eval'), 'only short notes leave');
    const res = await fetch(`${base}/api/crosscheck/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: intake.id, standards: ['nist-ssdf', 'asvs5'], levels: { asvs5: '1' }, facts: { backups: 'no' } }),
    });
    const out = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(out.assessment.standards.map((s) => s.standard), ['nist-ssdf', 'asvs5']);
    assert.equal(out.assessment.standards[1].level, '1');
    assert.ok(out.plan.waves.some((w) => w.fixes.some((f) => f.signal === 'sec.no_dangerous')));
    assert.match(out.planMarkdown, /Remediation plan · demo/);
    // Errors are plain and safe.
    const expired = await fetch(`${base}/api/crosscheck/assess`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id":"nope"}' });
    assert.equal(expired.status, 404);
    const badType = await fetch(`${base}/api/crosscheck/intake`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(badType.status, 415);
    const badLink = await fetch(`${base}/api/crosscheck/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"github":"https://evil.example/a/b"}' });
    assert.equal(badLink.status, 400);
    const other = await fetch(`${base}/somewhere-else`);
    assert.equal(other.status, 418, 'other routes pass through');
  } finally {
    close();
  }
});

test('a GitHub link is fetched through the zipball API only', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization || null });
    return new Response(makeZip(FIXTURE), { status: 200, headers: { 'content-type': 'application/zip' } });
  };
  const { base, close } = await serve(createCrossCheckHandler({ env: { CROSSCHECK_GITHUB_TOKEN: 'tok' }, fetchImpl }));
  try {
    const r = await fetch(`${base}/api/crosscheck/intake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ github: 'https://github.com/acme/demo/tree/main' }) });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.name, 'acme/demo');
    assert.deepEqual(calls, [{ url: 'https://api.github.com/repos/acme/demo/zipball/main', auth: 'Bearer tok' }]);
  } finally {
    close();
  }
});

test('AI rating is off without settings, and its answers are validated', async () => {
  assert.equal(aiConfig({}), null);
  const config = aiConfig({ CROSSCHECK_AI_URL: 'http://model.local/v1/', CROSSCHECK_AI_MODEL: 'open-model' });
  assert.deepEqual(config, { url: 'http://model.local/v1', model: 'open-model', key: null });
  const evidence = { signals: { 'doc.readme': { state: 'pass', summary: 'README', evidence: [{ id: 'doc.readme#1', path: 'README.md' }] } }, inventory: { files: 1 } };
  const items = [{ standard: 'asvs5', id: 'V17.1.1', title: 't' }];
  const fetchImpl = async (url, opts) => {
    assert.equal(url, 'http://model.local/v1/chat/completions');
    assert.equal(JSON.parse(opts.body).model, 'open-model');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ratings":[{"id":"V17.1.1","status":"P","cites":["doc.readme#1"],"why":"w"}]}' } }] }));
  };
  const r = await aiRate({ config, evidence, facts: {}, items, project: 'p', fetchImpl });
  assert.deepEqual(r.accepted.map((a) => [a.id, a.status]), [['V17.1.1', 'P']]);
  assert.deepEqual(r.errors, []);
});

test('the standalone server serves only the page and the engine', () => {
  assert.ok(servedFile('/app/').endsWith('app/index.html'));
  assert.ok(servedFile('/engine/plan.js').endsWith('engine/plan.js'));
  for (const bad of ['/kit/gev_asvs.py', '/server/handler.js', '/catalogues/asvs5.json', '/app/../server/handler.js', '/engine/engine.test.mjs', '/%2e%2e/package.json'])
    assert.equal(servedFile(bad), null, bad);
});
