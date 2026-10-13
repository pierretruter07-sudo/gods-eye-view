/**
 * Strike-package generator for the training exercise. This is a game system,
 * like the mission planner in a strategy title: it turns a fictional scenario
 * into an abstract package of roles, a relative timeline, a risk score and an
 * authorisation checklist.
 *
 * Deliberately NOT realistic tradecraft: platforms are generic classes, there
 * are no real weapons, no munitions maths, no coordinates-based routing or
 * weaponeering. Every number is a game stat, deterministic from a seed so the
 * demo repeats exactly.
 */

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CALLSIGN_WORDS = ['Kestrel', 'Anvil', 'Vanguard', 'Harrier', 'Sentinel', 'Mustang'];

/** Abstract package roles. Platforms are generic classes, never real types. */
const ROLE_TEMPLATES = [
  { role: 'Strike', platform: 'Multirole flight', min: 2, max: 6, essential: true },
  { role: 'Escort', platform: 'Air-superiority pair', min: 2, max: 2, essential: true },
  { role: 'SEAD / Jammer', platform: 'Electronic-attack pair', min: 2, max: 2, essential: true },
  { role: 'Tanker', platform: 'Air-refuelling', min: 1, max: 1, essential: false },
  { role: 'ISR', platform: 'High-altitude recon', min: 1, max: 1, essential: false },
];

const AUTH_STEPS = [
  'Target vetted against no-strike list',
  'Collateral-damage estimate within threshold',
  'Rules of engagement confirmed',
  'Airspace deconfliction cleared',
  'Command authorisation',
];

function riskBand(score) {
  if (score >= 67) return 'High';
  if (score >= 34) return 'Moderate';
  return 'Low';
}

/**
 * Build an abstract strike package for a scenario.
 * @param {object} scenario - A fictional scenario (see scenario.js).
 * @param {object} [options] - { seed?: number }
 */
export function generatePackage(scenario, options = {}) {
  const seed = options.seed ?? seedFrom(`${scenario.id}:${scenario.target.id}`);
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  const callsign = pick(CALLSIGN_WORDS);
  const designator = String(between(1, 9)).padStart(2, '0');

  const roles = ROLE_TEMPLATES.map((t) => ({
    role: t.role,
    platform: t.platform,
    count: between(t.min, t.max),
    essential: t.essential,
  }));
  const aircraftTotal = roles.reduce((n, r) => n + r.count, 0);

  // Risk is an abstract game number: threat environment plus package size.
  const threats = scenario.threats || [];
  const threatScore =
    threats.reduce((n, t) => n + (t.band === 'high' ? 30 : t.band === 'medium' ? 15 : 8), 0);
  const sizePenalty = Math.max(0, aircraftTotal - 8) * 2;
  const risk = Math.min(100, Math.round(threatScore + sizePenalty + between(0, 10)));

  // Relative timeline (H = time on target). Purely illustrative spacing.
  const timeline = [
    { t: 'H−40', event: `${callsign} package launch from ${scenario.friendlyBase.name}` },
    { t: 'H−18', event: 'Tanker rendezvous and top-off' },
    { t: 'H−08', event: 'ISR on station' },
    { t: 'H−05', event: 'Jammers active, escorts sweep' },
    { t: 'H−00', event: `Time on target: ${scenario.target.name}` },
    { t: 'H+12', event: 'Egress; battle-damage assessment' },
  ];

  return {
    name: `Package ${callsign} ${designator}`,
    callsign,
    scenarioId: scenario.id,
    target: scenario.target,
    launchFrom: scenario.friendlyBase,
    roles,
    aircraftTotal,
    timeline,
    risk: { score: risk, band: riskBand(risk) },
    authorisation: AUTH_STEPS.map((label, i) => ({ label, cleared: i < AUTH_STEPS.length - 1 })),
    seed,
  };
}
