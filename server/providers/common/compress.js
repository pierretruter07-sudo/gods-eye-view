/**
 * Vite plugin: gzip the JSON our /api relays send (audit, 21 Oct). The
 * relays end their responses inside configureServer/configurePreviewServer
 * hooks, ahead of any compression the server adds later, so the worldwide
 * flight snapshot (several MB) and the other feeds went out uncompressed.
 *
 * Only JSON over 2 KB with status 200 is compressed, only when the client
 * accepts gzip, and never a response that already has a Content-Encoding.
 * The relays serve the same cached body to every client, so the last few
 * compressed bodies are kept and reused instead of compressed again.
 * @module server/providers/common/compress
 */
import { gzipSync, constants } from 'node:zlib';

const MIN_BYTES = 2048;
const KEEP = 8;

/** Gzip a body, reusing the result for a body seen recently. */
export function createGzipCache(keep = KEEP) {
  const recent = []; // [{ body, gz }], newest last
  return function gzip(body) {
    if (typeof body === 'string') {
      const hit = recent.find((e) => e.body === body);
      if (hit) return hit.gz;
    }
    const gz = gzipSync(body, { level: constants.Z_BEST_SPEED });
    if (typeof body === 'string') {
      recent.push({ body, gz });
      if (recent.length > keep) recent.shift();
    }
    return gz;
  };
}

const lower = (headers) => {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
  return out;
};

/**
 * Connect middleware: compress eligible /api responses (patches writeHead,
 * write and end on this response only).
 */
export function createApiCompression({ gzip = createGzipCache() } = {}) {
  return function apiCompression(req, res, next) {
    const accepts = /\bgzip\b/i.test(
      String(req.headers?.['accept-encoding'] || ''),
    );
    if (!accepts || !String(req.url || '').startsWith('/api/')) return next();
    const writeHead = res.writeHead;
    const write = res.write;
    const end = res.end;
    let pending = null; // deferred writeHead(status, [message], headers)

    // Node's own end()/write() call writeHead() for implicit headers, so
    // the originals go back before handing over.
    const restore = () => {
      res.writeHead = writeHead;
      res.write = write;
      res.end = end;
    };
    const flush = (extra = null, drop = []) => {
      restore();
      if (!pending) return;
      const [status, message, headers] = pending;
      pending = null;
      const merged = {};
      for (const [k, v] of Object.entries(headers || {}))
        if (!drop.includes(k.toLowerCase())) merged[k] = v;
      Object.assign(merged, extra || {});
      if (message != null) writeHead.call(res, status, message, merged);
      else writeHead.call(res, status, merged);
    };

    res.writeHead = function (status, a, b) {
      pending = typeof a === 'string' ? [status, a, b] : [status, null, a];
      return res;
    };
    res.write = function (...args) {
      flush();
      return write.apply(res, args);
    };
    res.end = function (body, ...rest) {
      const status = pending ? pending[0] : res.statusCode;
      const headers = lower(pending ? pending[2] : {});
      const type = String(
        headers['content-type'] ?? res.getHeader?.('content-type') ?? '',
      );
      const encoded =
        headers['content-encoding'] ?? res.getHeader?.('content-encoding');
      const size =
        typeof body === 'string'
          ? Buffer.byteLength(body)
          : Buffer.isBuffer(body)
            ? body.length
            : 0;
      if (
        status === 200 &&
        !encoded &&
        /json/i.test(type) &&
        size > MIN_BYTES
      ) {
        let gz = null;
        try {
          gz = gzip(body);
        } catch {
          gz = null;
        }
        if (gz) {
          res.removeHeader?.('content-length');
          const vary = headers.vary
            ? `${headers.vary}, Accept-Encoding`
            : 'Accept-Encoding';
          if (pending)
            flush({ 'Content-Encoding': 'gzip', Vary: vary }, [
              'content-length',
              'vary',
            ]);
          else {
            restore();
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Vary', vary);
          }
          return end.call(res, gz);
        }
      }
      flush();
      return end.call(res, body, ...rest);
    };
    next();
  };
}

/** @returns {import('vite').Plugin} */
export function apiCompressionPlugin() {
  const install = (server) => server.middlewares.use(createApiCompression());
  return {
    name: 'gev-api-compression',
    configureServer: install,
    configurePreviewServer: install,
  };
}
