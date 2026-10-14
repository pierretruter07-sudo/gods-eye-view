import { derivePhase } from '../airports/phase.js';
import { footprintKm } from './hud.js';
import { distanceKm } from './objects.js';

/**
 * The intel view for a PLACE (an airport or a city stop of the Director):
 * live traffic, current weather, the latest incidents nearby and what else
 * is around. Every row is a live feed value or is computed from one (counts,
 * distances, phase of flight, runway into wind); nothing is simulated, and an
 * empty feed says so instead of showing a made-up figure.
 * Pure: no DOM, no Cesium.
 * @module intel/place
 */

const SQUAWKS = {
  7500: 'unlawful interference',
  7600: 'radio failure',
  7700: 'emergency',
};

const row = (label, value) =>
  value == null || value === ''
    ? null
    : { label, value: String(value), sim: false };
const card = (id, title, rows) => ({
  id,
  title,
  rows: rows.filter(Boolean),
  source: 'feed',
});
const nf = (n) => Math.round(n).toLocaleString('en-US');

/** Compass point for a bearing in degrees. */
function compass(deg) {
  const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return pts[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x =
    Math.cos(a.lat * r) * Math.sin(b.lat * r) -
    Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function ago(ms, now) {
  if (!Number.isFinite(ms)) return null;
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 1) return 'just now';
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
function within(list, place, km) {
  return (list || []).filter(
    (x) =>
      Number.isFinite(x?.lat) &&
      Number.isFinite(x?.lon) &&
      distanceKm(place, x) <= km,
  );
}
function where(place, x) {
  return `${nf(distanceKm(place, x))} km ${compass(bearing(place, x))}`;
}

/** Simple phase for places without an airport profile. */
function roughPhase(f) {
  const vr = Number(f.verticalRateMps);
  if (f.onGround) return 'ground';
  if (Number.isFinite(vr) && vr > 2.5) return 'out';
  if (Number.isFinite(vr) && vr < -2.5) return 'in';
  return 'over';
}

/** Runway end most nearly into the wind, or the calm-wind preference. */
export function runwayIntoWind(profile, metar) {
  if (!profile?.runways?.length) return null;
  const wind = metar?.windDirDeg;
  const speed = metar?.windKt ?? 0;
  if (typeof wind !== 'number' || speed < 5)
    return profile.calmWind
      ? `${profile.calmWind} (calm-wind preference)`
      : null;
  let best = null;
  for (const rw of profile.runways) {
    for (const [end, hdg] of [
      [rw.low, rw.lowHeadingDeg],
      [rw.high, rw.highHeadingDeg],
    ]) {
      const d = Math.abs(((hdg - wind + 540) % 360) - 180);
      if (!best || d < best.d) best = { end, d };
    }
  }
  // Parallel runways share a heading: name the stem once ("19L/19R" → "19").
  const stem = best.end.replace(/[LRC]$/, '');
  const ends = profile.runways
    .flatMap((r) => [r.low, r.high])
    .filter((e) => e.replace(/[LRC]$/, '') === stem);
  return `${ends.join(' / ')} (wind ${String(wind).padStart(3, '0')}°)`;
}

function weatherCard(place, metar, now) {
  if (metar === 'loading')
    return card('weather', 'Weather', [row('METAR', 'Loading…')]);
  if (!metar)
    return card('weather', 'Weather', [
      row(
        'METAR',
        place.icao
          ? `No current report for ${place.icao}`
          : 'No reporting station',
      ),
    ]);
  const wind =
    metar.windKt === 0
      ? 'Calm'
      : metar.windDirDeg === 'VRB'
        ? `Variable ${metar.windKt} kt`
        : metar.windKt != null
          ? `${String(metar.windDirDeg ?? 0).padStart(3, '0')}° ${metar.windKt} kt${metar.gustKt ? ` gusting ${metar.gustKt}` : ''}`
          : null;
  const vis =
    metar.visibility === '6+'
      ? '10 km or more'
      : Number.isFinite(Number(metar.visibility))
        ? `${(Number(metar.visibility) * 1.609).toFixed(1)} km`
        : metar.visibility;
  const cloud = metar.clouds?.length
    ? metar.clouds
        .slice(0, 2)
        .map((c) =>
          c.baseFt != null ? `${c.cover} ${nf(c.baseFt)} ft` : c.cover,
        )
        .join(', ')
    : 'No cloud reported';
  return card('weather', `Weather · ${metar.station}`, [
    row('Wind', wind),
    row('Visibility', vis),
    row('Cloud', cloud),
    row(
      'Temp / dew point',
      metar.tempC != null
        ? `${Math.round(metar.tempC)}° / ${metar.dewpointC != null ? Math.round(metar.dewpointC) : '–'}°C`
        : null,
    ),
    row('QNH', metar.qnhHpa != null ? `${Math.round(metar.qnhHpa)} hPa` : null),
    row('Flight rules', metar.category),
    row('Runway into wind', runwayIntoWind(place.profile, metar)),
    row(
      'Observed',
      `${ago(metar.observedAt, now) || 'time unknown'}${metar.stale ? ' (last good report)' : ''}`,
    ),
  ]);
}

/**
 * @param {{kind:'airport'|'city', id:string, label:string, icao?:string,
 *   lat:number, lon:number, profile?:object, timeZone?:string}} place
 * @param {{flights?:object[], military?:object[], vessels?:object[],
 *   quakes?:object[], fires?:object[], storms?:object[],
 *   satellites?:object[], metar?:object|null|'loading', layersOn?:object,
 *   now?:number}} ctx
 */
export function buildPlaceHud(place, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const on = ctx.layersOn || {};
  const flights = within(ctx.flights, place, 50);

  // ── Live traffic ──────────────────────────────────────────────────────
  const counts = { ground: 0, in: 0, out: 0, over: 0 };
  for (const f of flights) {
    if (place.profile && distanceKm(place, f) <= 25) {
      const { phase } = derivePhase(f, place.profile);
      const k =
        phase === 'parked' || phase === 'taxi'
          ? 'ground'
          : phase === 'landing' || phase === 'approach'
            ? 'in'
            : phase === 'takeoff' || phase === 'departure' || phase === 'climb'
              ? 'out'
              : 'over';
      counts[k] += 1;
    } else counts[roughPhase(f)] += 1;
  }
  const ops = new Map();
  for (const f of flights) {
    const p = /^[A-Z]{3}(?=\d)/.exec(String(f.callsign || '').trim())?.[0];
    if (p) ops.set(p, (ops.get(p) || 0) + 1);
  }
  const topOps = [...ops]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p, n]) => `${p} ${n}`)
    .join(' · ');
  const squawks = within(ctx.flights, place, 300).filter(
    (f) => SQUAWKS[String(f.squawk || '')],
  );
  const military = within(ctx.military, place, 150);
  const traffic = card('traffic', 'Live traffic', [
    row(
      'Aircraft within 50 km',
      on.flights === false ? 'Flights layer off' : `${flights.length}`,
    ),
    flights.length
      ? row(
          'On ground · arriving · departing',
          `${counts.ground} · ${counts.in} · ${counts.out}`,
        )
      : null,
    row('Busiest operators', topOps || null),
    row(
      'Emergency squawks (300 km)',
      squawks.length
        ? squawks
            .slice(0, 2)
            .map((f) => `${f.callsign || f.icao24} ${f.squawk}`)
            .join(', ')
        : 'None',
    ),
    on.military === false
      ? null
      : row('Military aircraft (150 km)', `${military.length}`),
  ]);

  // ── Latest incidents nearby ──────────────────────────────────────────
  const quakes = within(ctx.quakes, place, 1000).sort(
    (a, b) => (b.timeMs || 0) - (a.timeMs || 0),
  );
  const q = quakes[0];
  const fires = within(ctx.fires, place, 100);
  const newestFire = fires.reduce(
    (m, f) => (Number.isFinite(f.acqTime) && f.acqTime > m ? f.acqTime : m),
    0,
  );
  const storms = within(ctx.storms, place, 1500);
  const incidents = card('incidents', 'Latest incidents nearby', [
    row(
      'Earthquakes (1,000 km)',
      on.earthquakes === false
        ? 'Earthquakes layer off'
        : q
          ? `M${Number(q.magnitude).toFixed(1)} · ${where(place, q)} · ${ago(q.timeMs, now)}${quakes.length > 1 ? ` (+${quakes.length - 1} more)` : ''}`
          : 'None in the current USGS feed',
    ),
    row(
      'Fire hotspots (100 km)',
      on.fires === false
        ? 'Fires layer off'
        : fires.length
          ? `${fires.length}${newestFire ? ` · newest ${ago(newestFire, now)}` : ''}`
          : 'None in the current NASA FIRMS window',
    ),
    row(
      'Tropical cyclones (1,500 km)',
      on.storms === false
        ? null
        : storms.length
          ? storms
              .slice(0, 2)
              .map((s) =>
                `${s.name} ${s.classification || ''} · ${where(place, s)}`.trim(),
              )
              .join('; ')
          : 'None in NHC advisories',
    ),
    squawks.length
      ? row(
          'Squawk alerts',
          squawks
            .slice(0, 2)
            .map(
              (f) => `${f.callsign || f.icao24}: ${SQUAWKS[String(f.squawk)]}`,
            )
            .join('; '),
        )
      : null,
  ]);

  // ── Around the location ──────────────────────────────────────────────
  const ships = within(ctx.vessels, place, 50);
  const moving = ships.filter((s) => Number(s.speedKts) >= 1).length;
  const overhead = (ctx.satellites || []).filter((s) => {
    const altKm = Number(s.altitudeM) / 1000;
    if (!Number.isFinite(altKm) || !Number.isFinite(s.lat)) return false;
    return distanceKm(place, s) <= footprintKm(altKm) * 0.9;
  }).length;
  let localTime = null;
  try {
    if (place.timeZone)
      localTime = new Intl.DateTimeFormat('en-AU', {
        timeZone: place.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(now);
  } catch {
    localTime = null;
  }
  const around = card('around', 'Around the location', [
    row(
      'Ships within 50 km',
      on.vessels === false
        ? 'Ships layer off'
        : `${ships.length}${ships.length ? ` (${moving} under way)` : ''}`,
    ),
    on.satellites === false
      ? null
      : row('Satellites overhead now', `${overhead} in view`),
    row('Local time', localTime),
    row(
      'Field elevation',
      place.profile?.elevationM != null
        ? `${nf(place.profile.elevationM * 3.28084)} ft`
        : null,
    ),
    row(
      'Runways',
      place.profile?.runways?.length
        ? place.profile.runways.map((r) => r.ref).join(', ')
        : null,
    ),
  ]);

  const metar = ctx.metar && ctx.metar !== 'loading' ? ctx.metar : null;
  const status = [
    `${flights.length} aircraft within 50 km`,
    metar?.tempC != null ? `${Math.round(metar.tempC)}°C` : null,
    metar?.windKt != null
      ? metar.windKt === 0
        ? 'calm'
        : `wind ${metar.windKt} kt`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    kind: place.kind === 'airport' ? 'airport' : 'location',
    title: place.label,
    subtitle: place.icao || '',
    source: 'FEED',
    demo: false,
    status,
    cards: [traffic, weatherCard(place, ctx.metar, now), incidents, around],
    actions: [],
  };
}
