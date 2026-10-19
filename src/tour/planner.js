import { isStateVessel } from '../data/stateVessel.js';
import {
  EVENT_RULES,
  MILITARY_TYPES,
  STOP_CAMERA,
  TOUR_AIRPORTS,
  TOUR_BASES,
  TOUR_ROTATION,
  TOUR_SPACE,
  TOUR_STOPS,
  TOUR_TIMING,
} from './config.js';
import { countNearby, rankEvents } from './events.js';
import {
  airportLine,
  baseLine,
  eventLine,
  militaryLine,
  satelliteLine,
  stopLine,
  vesselLine,
} from './lines.js';

/** AIS ship types that mark a naval or other state vessel. */

const ISS_NORAD = '25544';

/**
 * Decides what the Director shows next. Pure: callers pass live records and
 * the time, and get back a stop description (camera view, spoken line,
 * optional event for the card). Alerts come first, but at most one every
 * TOUR_TIMING.alertGapMin; otherwise the rotation tours military aircraft,
 * busy airports, military airfields, ships, satellites and the planet.
 */
export function createPlanner({
  rotation = TOUR_ROTATION,
  space = TOUR_SPACE,
} = {}) {
  const shownAt = new Map(); // event key -> last time shown (ms)
  let slot = 0;
  let airportIndex = 0;
  let cityIndex = 0;
  let vesselIndex = 0;
  let militaryIndex = 0;
  let spaceSlot = 0; // position in space.groups
  const groupIndex = new Map(); // group -> next member to show
  let sinceSpace = 0; // stops since the last one in space
  let baseIndex = 0;
  let lastAlertAt = -Infinity;
  const militaryShownAt = new Map(); // icao24 -> last time shown (ms)
  const alertAllowed = (now) =>
    now - lastAlertAt >= TOUR_TIMING.alertGapMin * 60_000;

  const dwell = (kind) =>
    kind === 'event' ? TOUR_TIMING.eventDwellS : TOUR_TIMING.stopDwellS;

  function freshEvents(data, now) {
    return rankEvents({
      flights: data.flights,
      quakes: data.quakes,
      now,
    }).filter((e) => !shownAt.has(e.key));
  }

  function eventStop(event, now, recent) {
    shownAt.set(event.key, now);
    lastAlertAt = now;
    return {
      kind: 'event',
      event,
      view: {
        lat: event.lat,
        lon: event.lon,
        heightM: 0,
        ...STOP_CAMERA[event.kind],
      },
      line: eventLine(event, now, { recent }),
      dwellS: dwell('event'),
    };
  }

  const builders = {
    recent(data, now) {
      if (!alertAllowed(now)) return null;
      const revisitMs = TOUR_TIMING.revisitAfterMin * 60_000;
      const candidates = rankEvents({
        flights: data.flights,
        quakes: data.quakes,
        now,
      })
        .filter(
          (e) => shownAt.has(e.key) && now - shownAt.get(e.key) >= revisitMs,
        )
        .sort((a, b) => shownAt.get(a.key) - shownAt.get(b.key));
      return candidates.length ? eventStop(candidates[0], now, true) : null;
    },

    airport(data) {
      const airport = TOUR_AIRPORTS[airportIndex % TOUR_AIRPORTS.length];
      airportIndex += 1;
      const airborne = countNearby(
        data.flights,
        airport.lat,
        airport.lon,
        EVENT_RULES.airportRadiusKm,
      );
      return {
        kind: 'airport',
        airport,
        view: {
          lat: airport.lat,
          lon: airport.lon,
          heightM: 0,
          ...STOP_CAMERA.airport,
        },
        line: airportLine(airport, airborne, EVENT_RULES.airportRadiusKm),
        dwellS: dwell('airport'),
      };
    },

    vessel(data) {
      const placed = (data.vessels || []).filter(
        (v) => Number.isFinite(v?.lat) && Number.isFinite(v?.lon),
      );
      // Naval / state ships first (even slow ones), then moving cargo.
      const naval = placed.filter(
        (v) =>
          isStateVessel(v) &&
          (v.speedKts ?? 0) >= EVENT_RULES.stateVesselMinKts,
      );
      const moving = placed.filter(
        (v) => (v.speedKts ?? 0) >= EVENT_RULES.vesselMinKts,
      );
      if (!naval.length && !moving.length) return null;
      const cargo = moving.filter((v) =>
        /cargo|tanker|container/i.test(v.shipType || ''),
      );
      const pool = naval.length ? naval : cargo.length ? cargo : moving;
      const vessel = pool[vesselIndex % pool.length];
      vesselIndex += 1;
      return {
        kind: 'vessel',
        vessel,
        view: {
          lat: vessel.lat,
          lon: vessel.lon,
          heightM: 0,
          ...STOP_CAMERA.vessel,
        },
        line: vesselLine(vessel),
        dwellS: dwell('vessel'),
      };
    },

    military(data, now) {
      const repeatMs = TOUR_TIMING.militaryRepeatMin * 60_000;
      // The military feed first; military airframes in the general flights
      // feed fill in when that feed is rate-limited or empty.
      const seen = new Set();
      const pool = [
        ...(data.military || []),
        ...(data.flights || []).filter((f) => f?.military === true),
      ].filter((m) => {
        if (!m?.icao24) return true;
        if (seen.has(m.icao24)) return false;
        seen.add(m.icao24);
        return true;
      });
      const airborne = pool.filter(
        (m) =>
          Number.isFinite(m?.lat) &&
          Number.isFinite(m?.lon) &&
          !m.onGround &&
          !(now - (militaryShownAt.get(m.icao24) ?? -Infinity) < repeatMs),
      );
      if (!airborne.length) return null;
      // Most interesting first: named types (helicopters, ISR, bombers,
      // tankers, fighters, transports), then identified airframes.
      const score = (m) =>
        (MILITARY_TYPES[String(m.typeCode || '').toUpperCase()]?.score || 0) *
          10 +
        (m.callsign ? 2 : 0) +
        (m.aircraftClass ? 1 : 0);
      const ranked = [...airborne].sort((a, b) => score(b) - score(a));
      const top = ranked.filter((m) => score(m) === score(ranked[0]));
      const aircraft = top[militaryIndex % top.length];
      militaryIndex += 1;
      if (aircraft.icao24) militaryShownAt.set(aircraft.icao24, now);
      const typeName =
        MILITARY_TYPES[String(aircraft.typeCode || '').toUpperCase()]?.name ||
        null;
      return {
        kind: 'military',
        aircraft,
        view: {
          lat: aircraft.lat,
          lon: aircraft.lon,
          heightM: Number.isFinite(aircraft.altitudeM) ? aircraft.altitudeM : 0,
          ...STOP_CAMERA.military,
        },
        line: militaryLine(aircraft, { typeName }),
        dwellS: dwell('military'),
      };
    },

    base(data) {
      const base = TOUR_BASES[baseIndex % TOUR_BASES.length];
      baseIndex += 1;
      const airborne = countNearby(
        [...(data.flights || []), ...(data.military || [])],
        base.lat,
        base.lon,
        EVENT_RULES.airportRadiusKm,
      );
      return {
        kind: 'base',
        base,
        view: { lat: base.lat, lon: base.lon, heightM: 0, ...STOP_CAMERA.base },
        line: baseLine(base, airborne, EVENT_RULES.airportRadiusKm),
        dwellS: dwell('base'),
      };
    },

    satellite(data) {
      const sats = (data.satellites || []).filter(
        (s) =>
          Number.isFinite(s?.lat) &&
          Number.isFinite(s?.lon) &&
          Number.isFinite(s?.altitudeM),
      );
      if (!sats.length) return null;
      // Next group in the cycle that has anything tracked; else any satellite.
      const groups = space.groups || [];
      let group = null;
      let members = [];
      for (let tries = 0; tries < groups.length; tries += 1) {
        const g = groups[spaceSlot % groups.length];
        spaceSlot += 1;
        members = sats.filter((s) => s.group === g);
        if (g === 'stations')
          members.sort(
            (a, b) => (b.noradId === ISS_NORAD) - (a.noradId === ISS_NORAD),
          );
        if (members.length) {
          group = g;
          break;
        }
      }
      if (!group) {
        group = '*';
        members = sats;
      }
      const i = groupIndex.get(group) || 0;
      groupIndex.set(group, i + 1);
      const sat = { ...members[i % members.length] };
      sat.isIss = sat.noradId === ISS_NORAD;
      const geo = sat.group === 'geo' || sat.altitudeM > 30_000_000;
      return {
        kind: 'satellite',
        satellite: sat,
        view: {
          lat: sat.lat,
          lon: sat.lon,
          heightM: sat.altitudeM,
          ...(geo
            ? STOP_CAMERA.geoSatellite
            : sat.altitudeM > 8_000_000
              ? STOP_CAMERA.meoSatellite
              : STOP_CAMERA.satellite),
        },
        line: satelliteLine(sat),
        dwellS: dwell('satellite'),
      };
    },

    city(data) {
      const stop = TOUR_STOPS[cityIndex % TOUR_STOPS.length];
      cityIndex += 1;
      const airborne =
        stop.id === 'globe'
          ? (data.flights || []).filter((f) => !f.onGround).length
          : countNearby(
              data.flights,
              stop.lat,
              stop.lon,
              EVENT_RULES.nearbyRadiusKm,
            );
      return {
        kind: 'city',
        stop,
        view: { heightM: 0, ...stop },
        line: stopLine(stop, airborne, EVENT_RULES.nearbyRadiusKm),
        dwellS: dwell('city'),
      };
    },
  };

  function pick(data, now) {
    const [fresh] = alertAllowed(now) ? freshEvents(data, now) : [];
    if (fresh) return eventStop(fresh, now, false);
    // Space is due: at least one stop in every `space.every`.
    if (space.every > 0 && sinceSpace >= space.every - 1) {
      const sat = builders.satellite(data, now);
      if (sat) return sat;
    }
    for (let tries = 0; tries < rotation.length; tries += 1) {
      const kind = rotation[slot % rotation.length];
      slot += 1;
      const stop = builders[kind]?.(data, now);
      if (stop) return stop;
    }
    return builders.city(data, now);
  }

  return {
    /**
     * True when an incident that has never been shown may be shown now
     * (at most one alert every TOUR_TIMING.alertGapMin).
     */
    hasFresh(data, now = Date.now()) {
      return alertAllowed(now) && freshEvents(data, now).length > 0;
    },

    next(data, now = Date.now()) {
      const stop = pick(data, now);
      sinceSpace = stop?.kind === 'satellite' ? 0 : sinceSpace + 1;
      return stop;
    },
  };
}
