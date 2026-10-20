/**
 * Vite plugin: adsb.lol military aircraft proxy (GET /api/adsblol/mil →
 * https://api.adsb.lol/v2/mil). It feeds the Director's military stops, so
 * it is built to hold up when adsb.lol rate-limits or stalls (audit, 21 Oct:
 * HTTP 429 and timeouts on Replit, empty military stops):
 *
 * - one response is cached for 30 s (it was 12 s, shorter than the 15 s
 *   client poll, so every poll went upstream);
 * - concurrent requests share ONE upstream call;
 * - the upstream call times out after 10 s;
 * - a 429, a 5xx, a timeout or a network error starts a cooldown (honouring a
 *   sane Retry-After) during which upstream is not contacted;
 * - during a failure the last good response is served as STALE, but never
 *   once it is older than 10 minutes (military contacts that old are not
 *   shown as current);
 * - the last good response is kept on disk (.gev-cache/adsblol-mil.json), so
 *   a restart or a fresh Autoscale instance has something to serve while
 *   upstream is cooling down.
 *
 * Why serve stale instead of relaying a 429: the browser layer treats a
 * relayed 429 as a 45 s cooldown during which every refresh reports
 * "adsb.lol rate limited", while the map is still fully populated.
 * @module server/providers/aircraft/adsb-lol
 */
import fs from 'node:fs';
import path from 'node:path';

export const ADSBLOL_MIL = Object.freeze({
  url: 'https://api.adsb.lol/v2/mil',
  /** A good response is served from memory this long. */
  cacheMs: 30_000,
  /** The upstream call is abandoned after this long. */
  timeoutMs: 10_000,
  /** Cooldown after a 429 with no usable Retry-After. */
  rateLimitCooldownMs: 30_000,
  /** Cooldown after a 5xx, a timeout or a network error. */
  errorCooldownMs: 15_000,
  /** Bounds for an upstream-supplied Retry-After. */
  cooldownMinMs: 5_000,
  cooldownMaxMs: 120_000,
  /** Stale data is never served once older than this. */
  maxStaleMs: 10 * 60_000,
  /** Largest body accepted from upstream. */
  maxBytes: 16 * 1024 * 1024,
});

const DEFAULT_DISK_FILE = path.join(
  process.cwd(),
  '.gev-cache',
  'adsblol-mil.json',
);

/**
 * The request handler, with its own cache and cooldown (exported for tests).
 * @param {{fetchImpl?: Function, now?: () => number, diskFile?: string|null,
 *   rules?: typeof ADSBLOL_MIL}} [options]
 */
export function createAdsbLolMilHandler({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  diskFile = DEFAULT_DISK_FILE,
  rules = ADSBLOL_MIL,
} = {}) {
  let cache = null; // last good body (string)
  let cacheAt = 0; // when it was fetched (epoch ms)
  let cooldownUntil = 0;
  let cooldownStatus = 0;
  let inFlight = null; // the one upstream call in progress

  // A restart starts from the last good response on disk, if recent.
  if (diskFile) {
    try {
      const saved = JSON.parse(fs.readFileSync(diskFile, 'utf8'));
      if (
        typeof saved?.body === 'string' &&
        Number.isFinite(saved.at) &&
        now() - saved.at < rules.maxStaleMs
      ) {
        cache = saved.body;
        cacheAt = saved.at;
      }
    } catch {
      /* nothing saved yet */
    }
  }

  function save(body, at) {
    if (!diskFile) return;
    fs.promises
      .mkdir(path.dirname(diskFile), { recursive: true })
      .then(() => fs.promises.writeFile(diskFile, JSON.stringify({ at, body })))
      .catch(() => {});
  }

  const clamp = (ms) =>
    Math.min(rules.cooldownMaxMs, Math.max(rules.cooldownMinMs, ms));

  /** Cooldown an upstream failure earns, honouring Retry-After when sane. */
  function cooldownFor(status, retryAfter, at) {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) return clamp(seconds * 1000);
      const when = Date.parse(retryAfter);
      if (Number.isFinite(when) && when > at) return clamp(when - at);
    }
    return status === 429 ? rules.rateLimitCooldownMs : rules.errorCooldownMs;
  }

  function coolDown(status, retryAfter = null) {
    const at = now();
    cooldownUntil = at + cooldownFor(status, retryAfter, at);
    cooldownStatus = status;
    console.warn(
      `[adsb.lol Proxy] upstream ${status || 'error'}; cooling down ${Math.round((cooldownUntil - at) / 1000)} s${cache ? ', serving stale' : ''}`,
    );
  }

  /** One upstream call, shared by everyone asking meanwhile. */
  function refresh() {
    if (inFlight) return { promise: inFlight, shared: true };
    inFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), rules.timeoutMs);
      try {
        const upstream = await fetchImpl(rules.url, {
          headers: { 'User-Agent': 'gods-eye-view-adsblol-proxy/1.0' },
          signal: controller.signal,
        });
        if (upstream.ok) {
          const body = await upstream.text();
          if (body.length > rules.maxBytes)
            throw new Error('response too large');
          cache = body;
          cacheAt = now();
          cooldownUntil = 0;
          cooldownStatus = 0;
          save(body, cacheAt);
          return { ok: true, body };
        }
        if (upstream.status === 429 || upstream.status >= 500) {
          coolDown(upstream.status, upstream.headers?.get?.('retry-after'));
          upstream.body?.cancel?.().catch?.(() => {});
          return { ok: false, status: upstream.status };
        }
        // Anything else (e.g. 403) is relayed as it is, without a cooldown.
        return {
          ok: false,
          status: upstream.status,
          body: await upstream.text(),
        };
      } catch (error) {
        // A timeout or network error: back off too, instead of retrying on
        // every poll while upstream is down.
        coolDown(0);
        return {
          ok: false,
          status: 502,
          error: error?.name === 'AbortError' ? 'timeout' : error?.message,
        };
      } finally {
        clearTimeout(timer);
        inFlight = null;
      }
    })();
    return { promise: inFlight, shared: false };
  }

  function serve(res, status, body, cacheStatus, extra = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-ADS-B-Cache': cacheStatus,
      ...(['HIT', 'STALE'].includes(cacheStatus)
        ? { 'X-ADS-B-Cache-Age-Ms': String(Math.max(0, now() - cacheAt)) }
        : {}),
      ...extra,
    });
    res.end(body);
  }

  const usableStale = () =>
    Boolean(cache) && now() - cacheAt < rules.maxStaleMs;
  const retryAfterS = () =>
    String(Math.max(1, Math.ceil((cooldownUntil - now()) / 1000)));

  function serveStaleOrFail(res, status) {
    if (usableStale()) {
      serve(res, 200, cache, 'STALE', {
        'X-ADS-B-Upstream-Status': String(status || cooldownStatus || 0),
        'X-ADS-B-Retry-After-Seconds': retryAfterS(),
      });
      return;
    }
    serve(
      res,
      status && status !== 0 ? status : 503,
      JSON.stringify({ error: 'adsb.lol upstream unavailable' }),
      'NONE',
      cooldownUntil > now() ? { 'Retry-After': retryAfterS() } : {},
    );
  }

  return async function adsbLolMil(req, res) {
    try {
      const t = now();
      if (cache && t - cacheAt < rules.cacheMs) {
        serve(res, 200, cache, 'HIT');
        return;
      }
      if (t < cooldownUntil) {
        serveStaleOrFail(res, cooldownStatus || 503);
        return;
      }
      const { promise, shared } = refresh();
      const result = await promise;
      if (result.ok) {
        serve(res, 200, result.body, shared ? 'INFLIGHT' : 'MISS');
        return;
      }
      if (result.body != null) {
        serve(res, result.status, result.body, 'MISS');
        return;
      }
      serveStaleOrFail(res, result.status);
    } catch (e) {
      console.error('[adsb.lol Proxy]', e?.message);
      serveStaleOrFail(res, 502);
    }
  };
}

/** @returns {import('vite').Plugin} */
export function adsbLolProxy(options = {}) {
  let handler = null;
  const installMiddleware = (server) => {
    handler ??= createAdsbLolMilHandler(options);
    server.middlewares.use('/api/adsblol/mil', handler);
  };
  return {
    name: 'adsblol-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
