/** Pure rules for when a camera stop should trigger an immediate flight refresh. */

/** Above this camera height the regional flight view is not useful. */
export const PREFETCH_MAX_HEIGHT_M = 1_500_000;
/** Refresh when the view centre moved at least this far since the last one. */
export const PREFETCH_MIN_MOVE_KM = 40;
/** …or when the last refresh is older than this. */
export const PREFETCH_MAX_AGE_MS = 25_000;

function km(a, b) {
  const dLat = (b.lat - a.lat) * 111.32;
  const dLon =
    (b.lon - a.lon) *
    111.32 *
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export function shouldRefreshFlights({ last, here, heightM, now }) {
  if (!here || !(heightM <= PREFETCH_MAX_HEIGHT_M)) return false;
  if (!last) return true;
  return (
    km(last, here) >= PREFETCH_MIN_MOVE_KM ||
    now - last.at >= PREFETCH_MAX_AGE_MS
  );
}
