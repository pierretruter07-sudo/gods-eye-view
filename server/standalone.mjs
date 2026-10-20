#!/usr/bin/env node
/**
 * @file CrossCheck's own web server: the page and the API, no God's Eye
 * View. Plain Node (no dependencies).
 *
 *   node crosscheck/server/standalone.mjs     (PORT, default 5175; HOST, default 0.0.0.0)
 *
 * Serves only the page (app/) and the engine it imports (engine/); the kit,
 * catalogues and server code are never served as files.
 * @module crosscheck/server/standalone
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCrossCheckHandler } from './handler.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVED = ['app', 'engine'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/** Security headers on every response. */
function secure(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

/** Resolve a request path to a served file, or null. */
export function servedFile(urlPath, root = ROOT) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (p === '/' || p === '/app') p = '/app/';
  if (p.endsWith('/')) p += 'index.html';
  const abs = path.resolve(root, `.${p}`);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!SERVED.includes(rel.split(path.sep)[0])) return null;
  if (!TYPES[path.extname(abs)]) return null;
  if (/\.test\.m?js$/.test(abs)) return null;
  return abs;
}

/** Create the server (not listening). */
export function createServer(options = {}) {
  const api = createCrossCheckHandler(options);
  return http.createServer((req, res) => {
    secure(res);
    api(req, res, () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        return res.end();
      }
      const url = req.url || '/';
      if (url === '/' || url.startsWith('/?')) {
        res.statusCode = 302;
        res.setHeader('Location', '/app/');
        return res.end();
      }
      const file = servedFile(url);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('Not found');
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', TYPES[path.extname(file)]);
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5175;
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => console.log(`CrossCheck on http://${host}:${port}/`));
}
