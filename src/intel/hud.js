import { buildDossier, pick, rng, seedFrom } from './enrichment.js';

/**
 * Constellation HUD model: at most FOUR cards around the focused contact,
 * plus a header and kind-specific analyst actions. Every row says where it
 * came from: `sim: false` rows are live feed values or are computed from
 * them (orbital period from altitude, phase of flight from vertical rate);
 * `sim: true` rows are illustrative. Ownership is only ever generic
 * ("Holding group") — never an invented company attached to a real asset.
 * Pure and deterministic per object: no DOM, no Cesium.
 */
export const MAX_CARDS = 4;

const R_EARTH_KM = 6371;
const MU = 398600.4418; // km³/s², Earth
const FT = 3.28084;
const KT = 1.943844;

const row = (label, value, sim = false) => (value == null || value === '' ? null : { label, value: String(value), sim });
const rows = (...r) => r.filter(Boolean);
const card = (id, title, list, extra = {}) => {
  const sims = list.filter((x) => x.sim).length;
  const source = sims === 0 ? 'feed' : sims === list.length ? 'sim' : 'mixed';
  return { id, title, rows: list, source: extra.gauge?.sim && source === 'feed' ? 'mixed' : source, ...extra };
};
const nf = (v) => Math.round(v).toLocaleString('en-US');

function countBy(nearbyAll, kind) {
  return (nearbyAll || []).filter((n) => n.object.kind === kind).length;
}

function aircraftHud(o, rand, d, nearbyAll) {
  const altFt = Number.isFinite(o.altitudeM) ? o.altitudeM * FT : null;
  const vr = Number(o.verticalRateMps);
  const phase = o.onGround
    ? 'On ground'
    : Number.isFinite(vr) && vr > 2.5
      ? 'Climbing'
      : Number.isFinite(vr) && vr < -2.5
        ? 'Descending'
        : altFt != null && altFt > 18000
          ? 'Cruise'
          : 'Level';
  const emergency = ['7500', '7600', '7700'].includes(String(o.squawk || ''));
  const fuel = 0.35 + rand() * 0.55;
  const anomaly = emergency ? 0.82 + rand() * 0.15 : 0.05 + rand() * 0.25;
  return [
    card('operator', 'Operator & registry', rows(
      row('Operator', o.operator),
      row('Country', o.originCountry),
      row('ICAO 24', o.icao24),
      row('Owner / lessor', 'Leasing entity', true),
    )),
    card('flight', 'Flight', rows(
      row('Phase', phase),
      row('Altitude', altFt == null ? null : `${nf(altFt)} ft`),
      row('Ground speed', Number.isFinite(o.speedMps) ? `${Math.round(o.speedMps * KT)} kt` : null),
      row('Heading', Number.isFinite(o.heading) ? `${Math.round(o.heading)}°` : null),
    ), o.routeOrigin || o.routeDestination ? { route: { from: o.routeOrigin || '—', to: o.routeDestination || '—', progress: null } } : {}),
    card('mission', 'Mission & logistics', rows(
      row('Assessed role', d.analysis.find((a) => a.label === 'Assessed role')?.value, true),
      row('Endurance', `${(fuel * 9).toFixed(1)} h`, true),
      row('Souls on board', o.military ? 'Not assessed' : `~${60 + Math.floor(rand() * 260)}`, true),
    ), { gauge: { label: 'Fuel', value: fuel, text: `${Math.round(fuel * 100)}%`, sim: true, tone: fuel < 0.4 ? 'warn' : 'ok' } }),
    card('risk', 'Risk', rows(
      row('Squawk', o.squawk || 'None reported'),
      row('Nearby aircraft', `${countBy(nearbyAll, 'aircraft')} within 150 km`),
      row('Watchlist', emergency ? 'Flagged' : 'None', true),
    ), { gauge: { label: 'Anomaly', value: anomaly, text: anomaly.toFixed(2), sim: true, tone: anomaly > 0.6 ? 'alert' : anomaly > 0.35 ? 'warn' : 'ok' } }),
  ];
}

function vesselHud(o, rand, d, nearbyAll) {
  const fuel = 0.3 + rand() * 0.6;
  const anomaly = 0.04 + rand() * 0.3;
  const stationary = Number.isFinite(o.speedKts) && o.speedKts < 0.8;
  return [
    card('ownership', 'Ownership', rows(
      row('Beneficial owner', 'Holding group', true),
      row('Registered owner', 'Single-ship company', true),
      row('Operator', 'Liner operator', true),
      row('Sanctions screen', 'No match (4 lists)', true),
    )),
    card('voyage', 'Voyage', rows(
      row('Speed', Number.isFinite(o.speedKts) ? `${o.speedKts.toFixed(1)} kt` : null),
      row('Course', Number.isFinite(o.courseDeg) ? `${Math.round(o.courseDeg)}°` : null),
      row('Type', o.shipType),
      row('Status', stationary ? 'Stationary' : 'Under way'),
    ), o.destination ? { route: { from: 'Now', to: o.destination, progress: null } } : {}),
    card('logistics', 'Logistics', rows(
      row('Assessed cargo', d.analysis.find((a) => a.label === 'Assessed cargo')?.value, true),
      row('Endurance', `${Math.round(fuel * 30)} days`, true),
      row('Last port call', d.analysis.find((a) => a.label === 'Last port call')?.value, true),
    ), { gauge: { label: 'Fuel', value: fuel, text: `${Math.round(fuel * 100)}%`, sim: true, tone: fuel < 0.35 ? 'warn' : 'ok' } }),
    card('risk', 'Risk', rows(
      row('AIS gaps (24 h)', `${rand() < 0.85 ? 0 : 1 + Math.floor(rand() * 3)}`, true),
      row('Loitering', stationary ? 'Stationary at sea' : 'None'),
      row('Nearby vessels', `${countBy(nearbyAll, 'vessel')} within 100 km`),
    ), { gauge: { label: 'Anomaly', value: anomaly, text: anomaly.toFixed(2), sim: true, tone: anomaly > 0.6 ? 'alert' : anomaly > 0.35 ? 'warn' : 'ok' } }),
  ];
}

/** Orbital period (minutes) for a circular orbit at `altKm` — real physics. */
export function orbitalPeriodMin(altKm) {
  const a = R_EARTH_KM + altKm;
  return (2 * Math.PI * Math.sqrt((a * a * a) / MU)) / 60;
}
/** Ground footprint radius (km) to the horizon from `altKm` — real geometry. */
export function footprintKm(altKm) {
  const r = R_EARTH_KM;
  return Math.acos(r / (r + altKm)) * r;
}
export function orbitClass(altKm) {
  if (altKm < 2000) return 'LEO';
  if (altKm < 35000) return 'MEO';
  if (altKm < 36500) return 'GEO';
  return 'HEO';
}

function satelliteHud(o, rand, d, nearbyAll) {
  const altKm = Number.isFinite(o.altitudeM) ? o.altitudeM / 1000 : null;
  const power = 0.7 + rand() * 0.28;
  return [
    card('operator', 'Operator', rows(
      row('Constellation', o.group),
      row('NORAD ID', o.noradId),
      row('Operator', 'State / commercial', true),
      row('Launched', `${2008 + Math.floor(rand() * 17)}`, true),
    )),
    card('orbit', 'Orbit', rows(
      row('Altitude', altKm == null ? null : `${nf(altKm)} km`),
      row('Speed', Number.isFinite(o.speedMps) ? `${nf(o.speedMps * 3.6)} km/h` : null),
      row('Period', altKm == null ? null : `${orbitalPeriodMin(altKm).toFixed(1)} min`),
      row('Regime', altKm == null ? null : orbitClass(altKm)),
    )),
    card('mission', 'Mission & payload', rows(
      row('Assessed mission', d.analysis.find((a) => a.label === 'Assessed mission')?.value, true),
      row('Payload', pick(rand, ['Optical imager', 'Comms transponders', 'Radar (SAR)', 'Navigation payload', 'Science instruments']), true),
      row('Status', 'Active', true),
    ), { gauge: { label: 'Power', value: power, text: `${Math.round(power * 100)}%`, sim: true, tone: 'ok' } }),
    card('coverage', 'Coverage', rows(
      row('Footprint radius', altKm == null ? null : `${nf(footprintKm(altKm))} km`),
      row('Objects within 1,500 km', `${countBy(nearbyAll, 'satellite')}`),
      row('Next ground-station pass', `${5 + Math.floor(rand() * 80)} min`, true),
    )),
  ];
}

function quakeHud(o, rand, d, nearbyAll) {
  const m = Number(o.magnitude) || 0;
  const depth = Number(o.depthKm);
  const level = m >= 7 ? 0.9 : m >= 6 ? 0.65 : m >= 5 ? 0.4 : 0.2;
  return [
    card('event', 'Event', rows(
      row('Magnitude', m ? m.toFixed(1) : null),
      row('Depth', Number.isFinite(depth) ? `${Math.round(depth)} km` : null),
      row('Location', o.place),
      row('Time', Number.isFinite(o.timeMs) ? new Date(o.timeMs).toUTCString().slice(17, 22) + ' UTC' : null),
    )),
    card('impact', 'Impact', rows(
      row('People exposed', `~${nf((m >= 6 ? 400000 : 40000) * (0.3 + rand()))}`, true),
      row('Shaking', m >= 6 ? 'Strong' : m >= 5 ? 'Moderate' : 'Light', true),
      row('Tsunami potential', m >= 6.5 && Number.isFinite(depth) && depth < 70 ? 'Assess' : 'Low', true),
    )),
    card('infrastructure', 'Assets in range', rows(
      row('Aircraft within 300 km', `${countBy(nearbyAll, 'aircraft')}`),
      row('Vessels within 300 km', `${countBy(nearbyAll, 'vessel')}`),
      row('Ports / airfields', `${1 + Math.floor(rand() * 5)}`, true),
    )),
    card('response', 'Response', rows(
      row('Posture', m >= 6 ? 'Prepare to assist' : 'Monitor', true),
      row('Aftershock risk', d.analysis.find((a) => a.label === 'Aftershock risk')?.value, true),
    ), { gauge: { label: 'Alert level', value: level, text: m >= 6 ? 'Orange' : m >= 5 ? 'Yellow' : 'Green', sim: true, tone: level > 0.6 ? 'alert' : level > 0.35 ? 'warn' : 'ok' } }),
  ];
}

/** Analyst actions per kind. Each runner in actions.js labels its output FEED or SIMULATED. */
export const HUD_ACTIONS = Object.freeze({
  aircraft: [
    { id: 'flightplan', label: 'Request flight plan' },
    { id: 'atc', label: 'Contact ATC sector' },
    { id: 'imagery', label: 'Task imagery pass' },
  ],
  vessel: [
    { id: 'manifest', label: 'Request manifest' },
    { id: 'port', label: 'Notify port authority' },
    { id: 'imagery', label: 'Task imagery pass' },
  ],
  satellite: [
    { id: 'passes', label: 'Predict passes' },
    { id: 'conjunction', label: 'Conjunction check' },
    { id: 'downlink', label: 'Request downlink' },
  ],
  earthquake: [
    { id: 'responders', label: 'Alert responders' },
    { id: 'infra', label: 'Infrastructure check' },
    { id: 'imagery', label: 'Request imagery' },
  ],
});

export function buildHud(o, nearbyAll = []) {
  const d = buildDossier(o);
  const rand = rng(seedFrom(`hud:${o.key || o.id}`));
  const build = { aircraft: aircraftHud, vessel: vesselHud, satellite: satelliteHud, earthquake: quakeHud }[o.kind];
  const cards = build ? build(o, rand, d, nearbyAll).filter((c) => c.rows.length || c.gauge).slice(0, MAX_CARDS) : [];
  if (o.simulated) for (const c of cards) {
    c.source = 'sim';
    for (const r of c.rows) r.sim = true;
  }
  const status = d.feed
    .filter((f) => /speed|altitude|course|heading|magnitude|depth/i.test(f.label))
    .map((f) => f.value)
    .slice(0, 3)
    .join(' · ');
  return {
    kind: o.kind,
    title: d.title,
    subtitle: d.subtitle,
    source: d.source,
    demo: !!d.demo,
    status,
    cards,
    actions: HUD_ACTIONS[o.kind] || [],
  };
}
