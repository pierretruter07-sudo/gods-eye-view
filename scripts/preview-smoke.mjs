#!/usr/bin/env node
// Smoke test of the built site as Replit serves it: start `vite preview`,
// fetch the page, and check it answers with the app shell and the security
// headers. Run after `npm run build`. Exits non-zero on any failure.
import { spawn } from 'node:child_process';

const PORT = Number(process.env.SMOKE_PORT || 4317);
const BASE = `http://127.0.0.1:${PORT}`;
const DEADLINE_MS = 45_000;

const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

function fail(message) {
  console.error(`preview smoke: FAIL: ${message}`);
  server.kill('SIGTERM');
  process.exit(1);
}

async function waitForPage() {
  const start = Date.now();
  while (Date.now() - start < DEADLINE_MS) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return response;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return fail(`no answer from ${BASE}/ within ${DEADLINE_MS / 1000} s`);
}

server.on('exit', (code) => {
  if (code) fail(`vite preview exited with ${code}`);
});

const page = await waitForPage();
const html = await page.text();
if (!/<title>[^<]*God's Eye View/i.test(html)) fail('page title missing');
if (!/<script[^>]+type="module"/.test(html)) fail('module script missing');
const want = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
for (const [name, value] of Object.entries(want)) {
  if (page.headers.get(name) !== value) fail(`${name} is not ${value}`);
}
if (
  !/frame-ancestors 'none'/.test(
    page.headers.get('content-security-policy') || '',
  )
)
  fail('CSP frame-ancestors missing');
const icon = await fetch(`${BASE}/brand/ddg-mark.svg`);
if (!icon.ok) fail(`tab icon answered ${icon.status}`);
console.log('preview smoke: ok (page, headers, tab icon)');
server.kill('SIGTERM');
process.exit(0);
