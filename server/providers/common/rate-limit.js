import { makeRateLimiter } from '../../../src/sources/rateLimit.js';
export { makeRateLimiter } from '../../../src/sources/rateLimit.js';

/**
 * Per-client limiter for the fan-out proxies (tracks, enrichment, terrain,
 * METAR): each distinct key they are asked for costs an upstream call, so a
 * caller walking the keyspace is bounded here. `max` per minute per client,
 * global backstop at eight times that.
 */
export function makeFanOutRateLimiter(max = 20) {
  return makeRateLimiter({ windowMs: 60_000, max, globalMax: max * 8 });
}

/** Drop the oldest entries of a Map until it holds at most `max`. */
export function capMap(map, max) {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Default cap for the cost-bearing Google proxies: requests per minute per client. */
export const DEFAULT_GOOGLE_PER_MIN = 30;

/**
 * Per-client rate limiter for the cost-bearing API proxies (Google Places).
 * ON BY DEFAULT at `DEFAULT_GOOGLE_PER_MIN` (the app runs on a public URL, so
 * an open Places proxy is an open bill). The env var overrides the cap: a
 * positive integer N sets N requests per minute per client; `0` or `off`
 * disables the limiter for a private deployment. Built lazily once, then
 * reused so the per-client window state persists across requests. The global
 * backstop is four times the per-client cap so one host can't starve the rest.
 *
 * @param {string|undefined} envValue - Raw env value (requests/min/client).
 * @returns {((key:string)=>boolean)|null} An `allow(key)` fn, or null when disabled.
 */
export function makeOptInRateLimiter(envValue) {
  const raw = String(envValue ?? '')
    .trim()
    .toLowerCase();
  if (raw === '0' || raw === 'off' || raw === 'false') return null;
  const parsed = Number(raw);
  const max =
    raw && Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : DEFAULT_GOOGLE_PER_MIN;
  return makeRateLimiter({
    windowMs: 60_000,
    max,
    globalMax: max * 4,
  });
}

/**
 * Client key for rate limiting. The socket peer address by default. Behind a
 * trusted reverse proxy (Replit, a load balancer) every socket is the proxy,
 * so set `TRUST_PROXY=1` to key on the leftmost `X-Forwarded-For` address
 * instead. Off by default: the header is client-controlled, and trusting it on
 * a directly exposed server would let a rotating value mint fresh quota.
 */
export function clientKey(req, env = process.env) {
  if (env.TRUST_PROXY === '1') {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded.slice(0, 64);
  }
  return String(req.socket?.remoteAddress || 'local');
}
