/**
 * Staged demo events. They never enter the live layers: the Director shows
 * them with a SIMULATED marker, card badge and spoken warning.
 */

let counter = 0;

/** A fake squawk-7700 aircraft on approach to Brisbane. */
export function simulatedAircraft(now = Date.now()) {
  counter += 1;
  return {
    icao24: `sim${String(counter).padStart(3, '0')}`,
    callsign: 'SIM7700',
    squawk: '7700',
    lat: -27.25,
    lon: 153.25,
    altitudeM: 3_050,
    speedMps: 95,
    heading: 190,
    onGround: false,
    operator: null,
    originCountry: null,
    simulated: true,
    createdMs: now,
  };
}

/** A fake magnitude 6.0 quake off the Queensland coast. */
export function simulatedQuake(now = Date.now()) {
  counter += 1;
  return {
    id: `sim-quake-${counter}`,
    magnitude: 6.0,
    depthKm: 10,
    lat: -25.8,
    lon: 155.2,
    timeMs: now - 4 * 60_000,
    place: 'off the coast of Queensland, Australia',
    simulated: true,
  };
}
