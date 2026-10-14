import { isStateVessel } from '../data/stateVessel.js';
import { shapeForAircraftClass } from './silhouettes.js';

/**
 * Asset type catalogue: maps feed values to a reference type with a
 * Wikipedia article whose lead image is used as a small "type reference"
 * photo. It is a reference for the TYPE, never a photo of this airframe or
 * hull, and the HUD says so. Pure: no DOM, no network.
 *
 * Aircraft match on the ICAO type designator (readsb `t`, adsbdb), then on
 * the type description. Vessels match on the AIS family or a naval hull
 * prefix. Satellites match on the catalogue name.
 */

// Silhouette per catalogue id; everything else is drawn as an airliner.
const SHAPE_IDS = {
  transport: ['c17', 'c130', 'a400', 'c5', 'c27', 'c295', 'e2', 'an124', 'dash8', 'atr72', 'atr42', 'saab340'],
  fighter: ['fa18', 'fa18ef', 'f35', 'f16', 'f15', 'typhoon', 'rafale', 'hawk'],
  uav: ['rq4', 'mq9'],
  helicopter: ['h60', 'h47', 'v22', 'aw139', 'h135', 'bell206', 'r44', 's92'],
  light: ['pc21', 'kingair', 'pc12', 'c208', 'c172'],
};
function aircraftShape(id) {
  for (const [shape, ids] of Object.entries(SHAPE_IDS)) if (ids.includes(id)) return shape;
  return 'airliner';
}

// [id, display name, Wikipedia article, ICAO designators, description pattern]
const AIRCRAFT = [
  // ── Military: transport and tankers
  ['c17', 'Boeing C-17 Globemaster III', 'Boeing C-17 Globemaster III', ['C17'], /C-?17|GLOBEMASTER/],
  ['c130', 'Lockheed C-130 Hercules', 'Lockheed C-130 Hercules', ['C130', 'C30J'], /C-?130|HERCULES/],
  ['kc30', 'Airbus KC-30A MRTT', 'Airbus A330 MRTT', [], /MRTT|KC-?30/],
  ['kc135', 'Boeing KC-135 Stratotanker', 'Boeing KC-135 Stratotanker', ['K35R', 'K35E', 'K35T', 'C135'], /KC-?135|STRATOTANKER/],
  ['rc135', 'Boeing RC-135', 'Boeing RC-135', ['R135'], /RC-?135/],
  ['kc46', 'Boeing KC-46 Pegasus', 'Boeing KC-46 Pegasus', ['KC46', 'K46'], /KC-?46|PEGASUS/],
  ['a400', 'Airbus A400M Atlas', 'Airbus A400M Atlas', ['A400'], /A400M/],
  ['c5', 'Lockheed C-5 Galaxy', 'Lockheed C-5 Galaxy', ['C5', 'C5M'], /C-?5M?\b|GALAXY/],
  ['c27', 'Leonardo C-27J Spartan', 'Alenia C-27J Spartan', ['C27J'], /C-?27J|SPARTAN/],
  ['c295', 'Airbus C-295', 'EADS CASA C-295', ['C295'], /C-?295/],
  // ── Military: surveillance
  ['p8', 'Boeing P-8 Poseidon', 'Boeing P-8 Poseidon', ['P8'], /P-?8\b|POSEIDON/],
  ['e7', 'Boeing E-7 Wedgetail', 'Boeing E-7 Wedgetail', ['E737'], /E-?7\b|WEDGETAIL/],
  ['e3', 'Boeing E-3 Sentry', 'Boeing E-3 Sentry', ['E3TF', 'E3CF'], /E-?3\b|SENTRY|AWACS/],
  ['e2', 'Northrop Grumman E-2 Hawkeye', 'Northrop Grumman E-2 Hawkeye', ['E2'], /HAWKEYE/],
  ['rq4', 'Northrop Grumman RQ-4 Global Hawk', 'Northrop Grumman RQ-4 Global Hawk', ['Q4', 'GLHK'], /GLOBAL HAWK|RQ-?4|TRITON/],
  ['mq9', 'General Atomics MQ-9 Reaper', 'General Atomics MQ-9 Reaper', ['Q9'], /MQ-?9|REAPER/],
  // ── Military: rotary
  ['h60', 'Sikorsky UH-60 Black Hawk', 'Sikorsky UH-60 Black Hawk', ['H60', 'S70'], /H-?60|BLACK ?HAWK|SEAHAWK/],
  ['h47', 'Boeing CH-47 Chinook', 'Boeing CH-47 Chinook', ['H47'], /CH-?47|CHINOOK/],
  ['v22', 'Bell Boeing V-22 Osprey', 'Bell Boeing V-22 Osprey', ['V22'], /V-?22|OSPREY/],
  // ── Military: combat and training
  ['fa18', 'McDonnell Douglas F/A-18 Hornet', 'McDonnell Douglas F/A-18 Hornet', ['F18', 'F18H', 'FA18'], /F\/?A-?18(?![EF])|\bHORNET/],
  ['fa18ef', 'Boeing F/A-18E/F Super Hornet', 'Boeing F/A-18E/F Super Hornet', ['F18S'], /SUPER HORNET|F\/?A-?18[EF]|GROWLER/],
  ['f35', 'Lockheed Martin F-35 Lightning II', 'Lockheed Martin F-35 Lightning II', ['F35'], /F-?35|LIGHTNING II/],
  ['f16', 'General Dynamics F-16 Fighting Falcon', 'General Dynamics F-16 Fighting Falcon', ['F16'], /F-?16|FIGHTING FALCON/],
  ['f15', 'McDonnell Douglas F-15 Eagle', 'McDonnell Douglas F-15 Eagle', ['F15'], /F-?15/],
  ['typhoon', 'Eurofighter Typhoon', 'Eurofighter Typhoon', ['EUFI'], /TYPHOON/],
  ['rafale', 'Dassault Rafale', 'Dassault Rafale', ['RFAL'], /RAFALE/],
  ['b52', 'Boeing B-52 Stratofortress', 'Boeing B-52 Stratofortress', ['B52'], /B-?52/],
  ['pc21', 'Pilatus PC-21', 'Pilatus PC-21', ['PC21'], /PC-?21/],
  ['hawk', 'BAE Systems Hawk', 'BAE Systems Hawk', ['HAWK'], /\bHAWK\b/],
  // ── Airliners
  ['b747', 'Boeing 747', 'Boeing 747', ['B741', 'B742', 'B743', 'B744', 'B748', 'B74S', 'B74R', 'BLCF'], /\b747\b/],
  ['b737max', 'Boeing 737 MAX', 'Boeing 737 MAX', ['B37M', 'B38M', 'B39M', 'B3XM'], /737 ?MAX/],
  ['b737', 'Boeing 737', 'Boeing 737 Next Generation', ['B736', 'B737', 'B738', 'B739', 'B733', 'B734', 'B735'], /\b737\b/],
  ['b757', 'Boeing 757', 'Boeing 757', ['B752', 'B753'], /\b757\b/],
  ['b767', 'Boeing 767', 'Boeing 767', ['B762', 'B763', 'B764'], /\b767\b/],
  ['b777', 'Boeing 777', 'Boeing 777', ['B772', 'B773', 'B77L', 'B77W', 'B778', 'B779'], /\b777\b/],
  ['b787', 'Boeing 787 Dreamliner', 'Boeing 787 Dreamliner', ['B788', 'B789', 'B78X'], /\b787\b|DREAMLINER/],
  ['b717', 'Boeing 717', 'Boeing 717', ['B712'], /\b717\b/],
  ['md11', 'McDonnell Douglas MD-11', 'McDonnell Douglas MD-11', ['MD11'], /MD-?11/],
  ['a220', 'Airbus A220', 'Airbus A220', ['BCS1', 'BCS3'], /A220|CS(100|300)/],
  ['a320neo', 'Airbus A320neo family', 'Airbus A320neo family', ['A19N', 'A20N', 'A21N'], /A32[01] ?NEO/],
  ['a320', 'Airbus A320 family', 'Airbus A320 family', ['A318', 'A319', 'A320', 'A321'], /A3(18|19|20|21)\b/],
  ['a330neo', 'Airbus A330neo', 'Airbus A330neo', ['A338', 'A339'], /A330-?(800|900)|A330 ?NEO/],
  ['a330', 'Airbus A330', 'Airbus A330', ['A332', 'A333'], /A330/],
  ['a350', 'Airbus A350', 'Airbus A350', ['A359', 'A35K'], /A350/],
  ['a380', 'Airbus A380', 'Airbus A380', ['A388'], /A380/],
  ['an124', 'Antonov An-124 Ruslan', 'Antonov An-124 Ruslan', ['A124'], /AN-?124/],
  ['ejet', 'Embraer E-Jet', 'Embraer E-Jet family', ['E170', 'E75L', 'E75S', 'E190', 'E195', 'E290', 'E295'], /EMBRAER (ERJ-)?1[79]\d|E-?JET/],
  ['crj', 'Bombardier CRJ', 'Bombardier CRJ700 series', ['CRJ1', 'CRJ2', 'CRJ7', 'CRJ9', 'CRJX'], /CRJ|REGIONAL JET/],
  ['dash8', 'De Havilland Canada Dash 8', 'De Havilland Canada Dash 8', ['DH8A', 'DH8B', 'DH8C', 'DH8D'], /DASH ?8|DHC-?8|Q400/],
  ['atr72', 'ATR 72', 'ATR 72', ['AT72', 'AT75', 'AT76'], /ATR ?72/],
  ['atr42', 'ATR 42', 'ATR 42', ['AT43', 'AT45', 'AT46'], /ATR ?42/],
  ['saab340', 'Saab 340', 'Saab 340', ['SF34'], /SAAB 340/],
  // ── Business and general aviation
  ['g650', 'Gulfstream G650', 'Gulfstream G650', ['GLF6'], /G650/],
  ['global', 'Bombardier Global Express', 'Bombardier Global Express', ['GLEX', 'GL5T', 'GL7T'], /GLOBAL (EXPRESS|[0-9]{4})/],
  ['citation', 'Cessna Citation', 'Cessna Citation family', ['C25A', 'C25B', 'C25C', 'C510', 'C525', 'C550', 'C560', 'C56X', 'C680', 'C68A', 'C700', 'C750'], /CITATION/],
  ['kingair', 'Beechcraft King Air', 'Beechcraft King Air', ['BE20', 'BE30', 'BE35', 'BE9L', 'B350'], /KING ?AIR/],
  ['pc12', 'Pilatus PC-12', 'Pilatus PC-12', ['PC12'], /PC-?12/],
  ['c208', 'Cessna 208 Caravan', 'Cessna 208 Caravan', ['C208'], /CARAVAN|\b208\b/],
  ['c172', 'Cessna 172', 'Cessna 172', ['C172'], /\b172\b|SKYHAWK/],
  // ── Civil helicopters
  ['aw139', 'AgustaWestland AW139', 'AgustaWestland AW139', ['A139'], /AW-?139/],
  ['h135', 'Airbus Helicopters H135', 'Eurocopter EC135', ['EC35'], /EC-?135|H135/],
  ['bell206', 'Bell 206', 'Bell 206', ['B06'], /BELL 206|JETRANGER/],
  ['r44', 'Robinson R44', 'Robinson R44', ['R44'], /\bR44\b/],
  ['s92', 'Sikorsky S-92', 'Sikorsky S-92', ['S92'], /S-?92/],
].map(([id, name, article, codes, pattern]) =>
  Object.freeze({ id, name, article, codes: Object.freeze(codes), pattern, shape: aircraftShape(id) }),
);

const BY_CODE = new Map();
for (const t of AIRCRAFT) for (const code of t.codes) BY_CODE.set(code, t);
const KC30 = AIRCRAFT.find((t) => t.id === 'kc30');

const SHIP_SHAPE = { naval: 'warship', patrol: 'warship', tanker: 'cargo', cargo: 'cargo', passenger: 'cargo' };

// [id, name, article, AIS family pattern]
const VESSELS = [
  ['naval', 'Naval vessel', 'Warship', null],
  ['patrol', 'Patrol vessel', 'Patrol boat', /LAW ENFORCE/],
  ['sar', 'Search and rescue vessel', 'Lifeboat (rescue)', /\bSAR\b/],
  ['tanker', 'Tanker', 'Oil tanker', /TANKER/],
  ['cargo', 'Cargo vessel', 'Container ship', /CARGO/],
  ['passenger', 'Passenger vessel', 'Cruise ship', /PASSENGER/],
  ['fishing', 'Fishing vessel', 'Fishing vessel', /FISHING/],
  ['tug', 'Tug', 'Tugboat', /TUG|TOWING/],
  ['pilot', 'Pilot boat', 'Pilot boat', /PILOT/],
  ['sailing', 'Sailing vessel', 'Sailboat', /SAILING/],
  ['pleasure', 'Pleasure craft', 'Motor yacht', /PLEASURE/],
  ['highspeed', 'High-speed craft', 'High-speed craft', /HIGH-SPEED/],
].map(([id, name, article, pattern]) =>
  Object.freeze({ id: `ship-${id}`, name, article, pattern, shape: SHIP_SHAPE[id] || 'smallcraft' }),
);

// [id, name, article, name pattern]
const SATELLITES = [
  ['iss', 'International Space Station', 'International Space Station', /\bISS\b|ZARYA/],
  ['tiangong', 'Tiangong space station', 'Tiangong space station', /TIANHE|TIANGONG|\bCSS\b/],
  ['hubble', 'Hubble Space Telescope', 'Hubble Space Telescope', /\bHST\b|HUBBLE/],
  ['starlink', 'Starlink satellite', 'Starlink', /STARLINK/],
  ['oneweb', 'OneWeb satellite', 'OneWeb', /ONEWEB/],
  ['gps', 'GPS satellite', 'GPS Block III', /NAVSTAR|\bGPS\b/],
  ['galileo', 'Galileo satellite', 'Galileo (satellite navigation)', /GALILEO|GSAT0/],
  ['iridium', 'Iridium satellite', 'Iridium satellite constellation', /IRIDIUM/],
  ['goes', 'GOES weather satellite', 'Geostationary Operational Environmental Satellite', /\bGOES\b/],
].map(([id, name, article, pattern]) => Object.freeze({ id: `sat-${id}`, name, article, pattern, shape: 'satellite' }));

/** Every catalogue entry, for batch preloading. */
export const ASSET_TYPES = Object.freeze([...AIRCRAFT, ...VESSELS, ...SATELLITES]);

const ref = (type, basis) => ({ id: type.id, name: type.name, article: type.article, shape: type.shape, basis });

function aircraftType(o) {
  const code = String(o.typeCode || '').trim().toUpperCase();
  const desc = String(o.typeName || '').toUpperCase();
  // The A330 MRTT shares the airliner's designator; a military contact flying
  // one is the tanker (RAAF KC-30A, RAF Voyager, MRTT operators).
  if (o.military && /^A33[23]$/.test(code)) return ref(KC30, `ICAO type ${code} · military`);
  const byCode = BY_CODE.get(code);
  if (byCode) return ref(byCode, `ICAO type ${code}`);
  if (desc) {
    const byDesc = AIRCRAFT.find((t) => t.pattern.test(desc));
    if (byDesc) return ref(byDesc, 'Type description');
  }
  // Known to the feed but not in the catalogue: name it, draw its class.
  if (code || desc) {
    return {
      id: 'unlisted-aircraft',
      name: String(o.typeName || '').trim() || `ICAO type ${code}`,
      article: null,
      shape: shapeForAircraftClass(o.aircraftClass),
      basis: code ? `ICAO type ${code} · not in photo library` : 'Type description · not in photo library',
    };
  }
  return null;
}

function vesselType(o) {
  if (isStateVessel(o) && !/LAW ENFORCE|\bSAR\b/.test(String(o.shipType || '').toUpperCase()))
    return ref(VESSELS[0], o.shipType ? `AIS type ${o.shipType}` : 'Naval hull prefix');
  const family = String(o.shipType || '').toUpperCase();
  const match = family && VESSELS.find((t) => t.pattern?.test(family));
  return match ? ref(match, `AIS type ${o.shipType}`) : null;
}

function satelliteType(o) {
  const name = String(o.name || '').toUpperCase();
  const match = name && SATELLITES.find((t) => t.pattern.test(name));
  return match ? ref(match, 'Catalogue name') : null;
}

/** The reference type for an intel object, or null when it cannot be identified. */
export function resolveAssetType(o) {
  if (!o || o.simulated) return null;
  if (o.kind === 'aircraft') return aircraftType(o);
  if (o.kind === 'vessel') return vesselType(o);
  if (o.kind === 'satellite') return satelliteType(o);
  return null;
}
