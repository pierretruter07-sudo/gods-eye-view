import { readResponseTextCapped } from './common/http.js';

/**
 * Airport weather (METAR) from the NOAA Aviation Weather Center data API:
 * public domain, worldwide reporting stations, no key. Each station is
 * cached for 10 minutes (METARs are issued hourly or half-hourly) and a
 * last-good report is served for up to 2 hours if the upstream fails.
 * Only fields the place card shows are passed on, validated and capped.
 */
const AWC = 'https://aviationweather.gov/api/data/metar';
const FRESH_MS = 10 * 60_000;
const STALE_OK_MS = 2 * 3600_000;
const RETRY_MS = 60_000;
const ICAO = /^[A-Z]{4}$/;

const num = (value, min, max) => {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
    ? n
    : null;
};
const text = (value, max) =>
  typeof value === 'string' && value.trim() && !/[\u0000-\u001f<>]/.test(value)
    ? value.trim().slice(0, max)
    : null;

/** Keep only the fields the place card shows, validated. */
export function parseMetar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const station = text(raw.icaoId, 4);
  if (!station || !ICAO.test(station)) return null;
  const obsSec = num(raw.obsTime, 0, 4_102_444_800);
  const visib =
    typeof raw.visib === 'string'
      ? text(raw.visib, 8)
      : num(raw.visib, 0, 100) != null
        ? String(raw.visib)
        : null;
  const clouds = Array.isArray(raw.clouds)
    ? raw.clouds
        .slice(0, 4)
        .map((c) => ({
          cover: text(c?.cover, 4),
          baseFt: num(c?.base, 0, 60_000),
        }))
        .filter((c) => c.cover)
    : [];
  return {
    station,
    name: text(raw.name, 80),
    observedAt: obsSec ? obsSec * 1000 : null,
    tempC: num(raw.temp, -90, 60),
    dewpointC: num(raw.dewp, -90, 60),
    windDirDeg: raw.wdir === 'VRB' ? 'VRB' : num(raw.wdir, 0, 360),
    windKt: num(raw.wspd, 0, 250),
    gustKt: num(raw.wgst, 0, 300),
    visibility: visib,
    qnhHpa: num(raw.altim, 850, 1100),
    category: text(raw.fltCat, 4),
    clouds,
    raw: text(raw.rawOb, 300),
  };
}

export function metarProxy({
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs = 8000,
} = {}) {
  const cache = new Map(); // station → { report, at }
  const tried = new Map(); // station → last failed attempt

  async function fetchStations(ids) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${AWC}?ids=${ids.join(',')}&format=json`;
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Gods Eye View (airport weather context)',
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('metar_upstream_unavailable');
      }
      const body = await readResponseTextCapped(
        response,
        256 * 1024,
        controller.signal,
      );
      const list = body.trim() ? JSON.parse(body) : [];
      return Array.isArray(list) ? list.map(parseMetar).filter(Boolean) : [];
    } finally {
      clearTimeout(timer);
    }
  }

  async function handler(req, res) {
    const json = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const query = new URL(req.url || '/', 'http://local').searchParams;
    const ids = [
      ...new Set(
        String(query.get('ids') || '')
          .toUpperCase()
          .split(','),
      ),
    ].filter(Boolean);
    if (!ids.length || ids.length > 6 || !ids.every((id) => ICAO.test(id)))
      return json(400, { error: 'invalid_station' });
    const t = now();
    const due = ids.filter(
      (id) =>
        !(cache.get(id) && t - cache.get(id).at < FRESH_MS) &&
        !(tried.get(id) && t - tried.get(id) < RETRY_MS),
    );
    if (due.length) {
      try {
        const reports = await fetchStations(due);
        for (const r of reports) cache.set(r.station, { report: r, at: t });
        for (const id of due) if (!cache.has(id)) tried.set(id, t);
      } catch {
        for (const id of due) tried.set(id, t);
      }
    }
    const reports = ids
      .map((id) => cache.get(id))
      .filter((c) => c && t - c.at <= STALE_OK_MS)
      .map((c) => ({ ...c.report, stale: t - c.at >= FRESH_MS }));
    json(200, {
      source: 'NOAA Aviation Weather Center',
      licence: 'U.S. public domain',
      reports,
    });
  }

  return {
    name: 'metar',
    configureServer({ middlewares }) {
      middlewares.use('/api/metar', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/metar', handler);
    },
  };
}
