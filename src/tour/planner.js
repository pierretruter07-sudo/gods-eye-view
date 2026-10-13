import {
  EVENT_RULES,
  STOP_CAMERA,
  TOUR_AIRPORTS,
  TOUR_ROTATION,
  TOUR_STOPS,
  TOUR_TIMING,
} from './config.js';
import { countNearby, rankEvents } from './events.js';
import {
  airportLine,
  eventLine,
  militaryLine,
  satelliteLine,
  stopLine,
  vesselLine,
} from './lines.js';

/** AIS ship types that mark a naval or other state vessel. */
const STATE_VESSEL = /military|naval|law enforce|search and rescue|\bsar\b|warship|coast ?guard/i;

const ISS_NORAD = '25544';
/** Satellite groups worth showing, in the order they are visited. */
const SATELLITE_GROUPS = ['stations', 'gps-ops', 'galileo', 'glonass', 'geo', 'visual'];

/**
 * Decides what the Director shows next. Pure: callers pass live records and
 * the time, and get back a stop description (camera view, spoken line,
 * optional event for the card). New incidents always come first; otherwise
 * the rotation cycles through recent incidents, airports, ships, satellites
 * and wide views so the camera keeps moving.
 */
export function createPlanner({ rotation = TOUR_ROTATION } = {}) {
  const shownAt = new Map(); // event key -> last time shown (ms)
  let slot = 0;
  let airportIndex = 0;
  let cityIndex = 0;
  let vesselIndex = 0;
  let militaryIndex = 0;
  let satelliteIndex = 0;

  const dwell = (kind) =>
    kind === 'event' ? TOUR_TIMING.eventDwellS : TOUR_TIMING.stopDwellS;

  function freshEvents(data, now) {
    return rankEvents({ flights: data.flights, quakes: data.quakes, now }).filter(
      (e) => !shownAt.has(e.key),
    );
  }

  function eventStop(event, now, recent) {
    shownAt.set(event.key, now);
    return {
      kind: 'event',
      event,
      view: { lat: event.lat, lon: event.lon, heightM: 0, ...STOP_CAMERA[event.kind] },
      line: eventLine(event, now, { recent }),
      dwellS: dwell('event'),
    };
  }

  const builders = {
    recent(data, now) {
      const revisitMs = TOUR_TIMING.revisitAfterMin * 60_000;
      const candidates = rankEvents({ flights: data.flights, quakes: data.quakes, now })
        .filter((e) => shownAt.has(e.key) && now - shownAt.get(e.key) >= revisitMs)
        .sort((a, b) => shownAt.get(a.key) - shownAt.get(b.key));
      return candidates.length ? eventStop(candidates[0], now, true) : null;
    },

    airport(data) {
      const airport = TOUR_AIRPORTS[airportIndex % TOUR_AIRPORTS.length];
      airportIndex += 1;
      const airborne = countNearby(data.flights, airport.lat, airport.lon, EVENT_RULES.airportRadiusKm);
      return {
        kind: 'airport',
        airport,
        view: { lat: airport.lat, lon: airport.lon, heightM: 0, ...STOP_CAMERA.airport },
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
        (v) => STATE_VESSEL.test(v.shipType || '') && (v.speedKts ?? 0) >= EVENT_RULES.stateVesselMinKts,
      );
      const moving = placed.filter((v) => (v.speedKts ?? 0) >= EVENT_RULES.vesselMinKts);
      if (!naval.length && !moving.length) return null;
      const cargo = moving.filter((v) => /cargo|tanker|container/i.test(v.shipType || ''));
      const pool = naval.length ? naval : cargo.length ? cargo : moving;
      const vessel = pool[vesselIndex % pool.length];
      vesselIndex += 1;
      return {
        kind: 'vessel',
        vessel,
        view: { lat: vessel.lat, lon: vessel.lon, heightM: 0, ...STOP_CAMERA.vessel },
        line: vesselLine(vessel),
        dwellS: dwell('vessel'),
      };
    },

    military(data) {
      const airborne = (data.military || []).filter(
        (m) => Number.isFinite(m?.lat) && Number.isFinite(m?.lon) && !m.onGround,
      );
      if (!airborne.length) return null;
      // Identified airframes (callsign or type) make the better story.
      const named = airborne.filter((m) => m.callsign || m.aircraftClass);
      const pool = named.length ? named : airborne;
      const aircraft = pool[militaryIndex % pool.length];
      militaryIndex += 1;
      return {
        kind: 'military',
        aircraft,
        view: { lat: aircraft.lat, lon: aircraft.lon, heightM: Number.isFinite(aircraft.altitudeM) ? aircraft.altitudeM : 0, ...STOP_CAMERA.military },
        line: militaryLine(aircraft),
        dwellS: dwell('military'),
      };
    },

    satellite(data) {
      const sats = (data.satellites || []).filter(
        (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon) && Number.isFinite(s?.altitudeM),
      );
      if (!sats.length) return null;
      const order = [
        ...sats.filter((s) => s.noradId === ISS_NORAD),
        ...SATELLITE_GROUPS.flatMap((g) =>
          sats.filter((s) => s.group === g && s.noradId !== ISS_NORAD),
        ),
      ];
      const pool = order.length ? order : sats;
      const sat = { ...pool[satelliteIndex % pool.length] };
      satelliteIndex += 1;
      sat.isIss = sat.noradId === ISS_NORAD;
      return {
        kind: 'satellite',
        satellite: sat,
        view: { lat: sat.lat, lon: sat.lon, heightM: sat.altitudeM, ...STOP_CAMERA.satellite },
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
          : countNearby(data.flights, stop.lat, stop.lon, EVENT_RULES.nearbyRadiusKm);
      return {
        kind: 'city',
        stop,
        view: { heightM: 0, ...stop },
        line: stopLine(stop, airborne, EVENT_RULES.nearbyRadiusKm),
        dwellS: dwell('city'),
      };
    },
  };

  return {
    /** True when an incident exists that has never been shown. */
    hasFresh(data, now = Date.now()) {
      return freshEvents(data, now).length > 0;
    },

    next(data, now = Date.now()) {
      const [fresh] = freshEvents(data, now);
      if (fresh) return eventStop(fresh, now, false);
      for (let tries = 0; tries < rotation.length; tries += 1) {
        const kind = rotation[slot % rotation.length];
        slot += 1;
        const stop = builders[kind]?.(data, now);
        if (stop) return stop;
      }
      return builders.city(data, now);
    },
  };
}
