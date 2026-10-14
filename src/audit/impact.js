/**
 * @file What each audit item means for God's Eye View itself.
 *
 * The standards speak in general terms; a viewer needs to see the effect on
 * this system: which feeds, screens or people a gap touches and what would
 * go wrong. Must-fix items have their own statement; every other item uses
 * the statement for its process area, ASVS chapter or ISO 42001 group. Wording says "could":
 * these are consequences of an open gap, not incidents that happened.
 * @module audit/impact
 */

/** Parts of God's Eye View an item can touch. */
export const PARTS = Object.freeze({
  aircraft: 'Aircraft feeds',
  ships: 'Ship feed (AIS)',
  satellites: 'Satellites',
  hazards: 'Quakes, fires, storms',
  maps: 'Maps and paid keys',
  server: 'Server proxies',
  director: 'Director and alerts',
  exercise: 'Exercise mode',
  operators: 'People using it',
  release: 'Releases',
  evidence: 'Safety case',
  ai: 'AI features',
});

const LIVE = ['aircraft', 'ships', 'satellites', 'hazards'];

/** Statements for the must-fix items. */
const ITEMS = Object.freeze({
  'V8.2.1': {
    parts: ['maps', 'server', 'ships', 'exercise'],
    text: 'Anyone who finds the link can run up the Google Maps and 3D-tile bill, use up the AIS and OpenSky quotas so live ships and aircraft stop for everyone, and open Exercise mode.',
  },
  'V8.1.1': {
    parts: ['operators', 'exercise', 'server'],
    text: 'Nothing says who may see military tracks, open Exercise mode or call the paid proxies, so there is no basis to restrict any of it, or to show later who could.',
  },
  'V3.4.3': {
    parts: ['aircraft', 'ships', 'maps', 'operators'],
    text: 'If injected script ever reaches the page, it could draw fake aircraft or ships, hide real ones, or copy the browser-side Google Maps and Cesium keys.',
  },
  'V2.4.1': {
    parts: ['server', 'maps', 'aircraft', 'ships'],
    text: 'One script hammering the proxies can burn the Google quota and trip the OpenSky and AIS limits, so flights and ships freeze or vanish for every user.',
  },
  'V15.2.1': {
    parts: ['release', 'server'],
    text: 'A published hole in Cesium, satellite.js or the Node proxy could ship unnoticed, giving an attacker a way into the server that holds the AIS and Google server keys.',
  },
  '3.0.1': {
    parts: ['evidence', 'operators'],
    text: 'There is no agreed way to show the display is safe to rely on, so a customer cannot accept God’s Eye View for any operational use.',
  },
  '3.0.5': {
    parts: ['evidence', 'aircraft', 'ships'],
    text: 'Without hazards setting the safety level, nobody can say whether a stale aircraft position is a nuisance or a hazard, so the rigour applied cannot be justified.',
  },
  '3.0.10': {
    parts: ['evidence'],
    text: 'Good engineering cannot be credited: nothing links the feed checks, tests and labels to a claim that the display is safe enough.',
  },
  '3.0.11': {
    parts: [...LIVE, 'operators'],
    text: 'If OpenSky, AIS or CelesTrak stalls, the globe can keep showing old positions as if live, and nobody is alerted or keeps a record.',
  },
  '3.0.17': {
    parts: ['evidence'],
    text: 'The customer has nothing to sign off, so God’s Eye View cannot move beyond demonstrations.',
  },
  '3.1.5': {
    parts: ['aircraft', 'ships', 'satellites', 'operators'],
    text: 'Hazards such as a missed emergency squawk, a misplaced ship or a wrong satellite pass have never been listed, so none is guarded against by design.',
  },
  '3.2.3': {
    parts: ['evidence'],
    text: 'The safety plan carries no weight with a customer until someone accountable has reviewed it.',
  },
  '3.3.1': {
    parts: ['aircraft', 'ships', 'satellites', 'director'],
    text: 'The ways the display can mislead (stale, duplicated, misplaced or dropped tracks, a frozen Director) are not listed, so no test targets them.',
  },
  '3.3.2': {
    parts: ['operators', 'aircraft', 'ships', 'director'],
    text: 'Nobody has written down what an operator would get wrong if an aircraft showed in the wrong place or a quake alert never appeared.',
  },
  '3.3.3': {
    parts: ['evidence', 'aircraft', 'ships'],
    text: 'Without likelihoods, a rare glitch and a daily feed outage get the same attention, so effort goes to the wrong places.',
  },
  '3.3.5': {
    parts: ['evidence'],
    text: 'Each failure has no safety level of its own, so the parts that matter most (live positions, alerts) get no extra rigour.',
  },
  '3.4.1': {
    parts: ['operators', 'director'],
    text: 'Real users have never confirmed that the alerts, labels and FEED or SIMULATED tags mean what they need. A misread display is the hazard.',
  },
  '3.4.3': {
    parts: ['evidence'],
    text: 'Nobody outside development has checked the process was followed, so the evidence could be challenged.',
  },
  '4.1.2': {
    parts: ['evidence', 'operators'],
    text: 'A buyer has no hazard assessment to write requirements from, so they cannot say what “safe enough” means for their use.',
  },
  '4.1.3': {
    parts: ['evidence'],
    text: 'Hazards have not been turned into safety requirements, so there is nothing specific to build or test the software against.',
  },
  'C4.3': {
    parts: ['ai', 'director', 'operators'],
    text: 'Nobody has decided which AI is in scope (the Director’s automatic picks and announcements, the planned HENRI narrator, AI-written code), so none of it is governed and a customer cannot be told what is controlled.',
  },
  'C5.2': {
    parts: ['ai', 'director', 'operators'],
    text: 'With no AI policy, there is no written rule that the Director and narration only advise and never act, so that boundary could quietly erode as features are added.',
  },
  'C6.1.2': {
    parts: ['ai', 'director', 'aircraft', 'ships'],
    text: 'Nobody has assessed what happens if the Director announces the wrong aircraft or ship, misses an emergency squawk or narrates stale data as live, so no defence against it is required.',
  },
  'C6.1.4': {
    parts: ['ai', 'operators', 'director'],
    text: 'The effect of automatic announcements on the people watching, and on the crews and vessels being singled out on a public display, has not been assessed.',
  },
  'A.2.2': {
    parts: ['ai', 'operators'],
    text: 'Without a published AI policy, operators and customers have nothing to hold the AI features to, and the advisory-only promise exists only in the README.',
  },
  'A.5.2': {
    parts: ['ai', 'director', 'operators'],
    text: 'There is no process to check a new AI feature (such as HENRI narration) for its effect on people before it ships, so each one goes live unassessed.',
  },
  'A.9.4': {
    parts: ['ai', 'operators', 'exercise'],
    text: 'Without a formal intended-use statement, nothing says the picture must not be used to target, track individuals or make operational decisions, so misuse cannot be refused on paper.',
  },
  'A.10.3': {
    parts: ['ai', 'release', 'server'],
    text: 'AI coding agents and a future HENRI model provider are not assessed, so unreviewed AI-written code or a provider’s data terms could reach the live system unnoticed.',
  },
});

/** Statements per process area (ED-153), chapter (ASVS) and clause or control group (ISO 42001). */
const AREAS = Object.freeze({
  '3 SSAS': {
    parts: ['evidence', 'operators'],
    risk: 'Without a safety assurance system, nobody can show the live picture is safe to rely on.',
  },
  '3.1 Initiation': {
    parts: ['evidence', ...LIVE],
    risk: 'Hazards from the feeds and the display are not identified at the start, so the design never addresses them.',
  },
  '3.2 Planning': {
    parts: ['evidence'],
    risk: 'Safety work is not planned, so evidence is missing or late when a customer asks.',
  },
  '3.3 Requirements': {
    parts: ['aircraft', 'ships', 'director'],
    risk: 'Failures such as stale or misplaced tracks are not turned into requirements, so nothing forces a defence against them.',
  },
  '3.4 V&V/PA': {
    parts: ['operators', 'evidence'],
    risk: 'Safety requirements are not checked with users or independently, so mistakes in them survive.',
  },
  '3.5 Completion': {
    parts: ['evidence'],
    risk: 'Safety work is never closed out, so no version is ever cleared for use.',
  },
  '4.1 Acquisition': {
    parts: ['evidence', 'operators'],
    risk: 'A buyer has no safety inputs to set requirements or accept a delivery.',
  },
  '4.2 Supply': {
    parts: ['release', 'evidence'],
    risk: 'What is delivered, and its safety evidence, is not agreed with the customer.',
  },
  '4.3 Development': {
    parts: [...LIVE, 'director', 'release'],
    risk: 'Gaps in design and coding discipline can let feed errors reach the display unnoticed.',
  },
  '4.4 Operation': {
    parts: [...LIVE, 'operators'],
    risk: 'In service, feed outages or degraded data may go unseen and unrecorded.',
  },
  '4.5 Maintenance': {
    parts: ['release', 'server'],
    risk: 'Changes after delivery could break a feed or the display without anyone noticing.',
  },
  '5.1 Documentation': {
    parts: ['evidence'],
    risk: 'Without controlled documents, nobody can show which version was assessed.',
  },
  '5.2 CM': {
    parts: ['release', 'evidence'],
    risk: 'If configuration is not controlled, the version running may not be the version that was checked.',
  },
  '5.3 QA': {
    parts: ['evidence'],
    risk: 'Nobody checks the process is followed, so the evidence can be questioned.',
  },
  '5.4 Verification': {
    parts: [...LIVE, 'director'],
    risk: 'Feed handling and the display are not proven against their requirements, so errors can ship.',
  },
  '5.5 Validation': {
    parts: ['operators'],
    risk: 'Without checks by real users, the display may not support the decisions they make.',
  },
  '5.6 Joint review': {
    parts: ['operators', 'evidence'],
    risk: 'The customer never reviews progress, so surprises appear at hand-over.',
  },
  '5.7 Audit': {
    parts: ['evidence'],
    risk: 'Nobody independent confirms the work, so the safety claim carries less weight.',
  },
  '5.8 Problem resolution': {
    parts: ['release', 'operators'],
    risk: 'Faults users report may never be tracked to a fix.',
  },
  '6 Organisational': {
    parts: ['evidence'],
    risk: 'Without roles and competence, nobody is accountable for safety.',
  },
  '7 Additional ANS': {
    parts: ['release', 'server'],
    risk: 'Third-party parts (Cesium, feeds) and tools are trusted without assurance.',
  },
  '8 Safety Folder': {
    parts: ['evidence'],
    risk: 'The evidence is scattered, so a customer cannot review it in one place.',
  },
  V1: {
    parts: ['aircraft', 'ships', 'operators'],
    risk: 'Feed text such as callsigns and ship names could carry markup that runs in the page.',
  },
  V2: {
    parts: ['server', ...LIVE],
    risk: 'Unchecked input or abuse of the proxies could feed bad data to the globe or exhaust paid quotas.',
  },
  V3: {
    parts: ['operators', 'maps'],
    risk: 'Weak browser protections let injected script change what operators see, or copy keys.',
  },
  V4: {
    parts: ['server'],
    risk: 'The JSON proxy endpoints could be misused or leak more than they should.',
  },
  V5: {
    parts: ['server'],
    risk: 'Uploaded files could carry attacks.',
    na: 'God’s Eye View takes no file uploads.',
  },
  V6: {
    parts: ['operators', 'exercise'],
    risk: 'Weak sign-in would let others act as an operator.',
    na: 'There is no sign-in yet; it arrives in Wave 2 and is assessed then.',
  },
  V7: {
    parts: ['operators'],
    risk: 'Sessions could be hijacked.',
    na: 'There are no sessions until sign-in arrives in Wave 2.',
  },
  V8: {
    parts: ['operators', 'exercise', 'server', 'maps'],
    risk: 'Without access control, anyone can use every feature and every paid service.',
  },
  V9: {
    parts: ['operators'],
    risk: 'Tokens could be forged or replayed.',
    na: 'God’s Eye View issues no tokens yet.',
  },
  V10: {
    parts: ['operators'],
    risk: 'A flawed sign-in integration could let accounts be taken over.',
    na: 'No OAuth or OpenID Connect yet; company sign-in comes in Wave 2.',
  },
  V11: {
    parts: ['server'],
    risk: 'Weak cryptography would expose protected data.',
    na: 'God’s Eye View does no cryptography of its own.',
  },
  V12: {
    parts: ['server', 'maps'],
    risk: 'Weak transport security would let traffic and keys be read or changed in transit.',
  },
  V13: {
    parts: ['server', 'release', 'maps'],
    risk: 'Leaked keys, debug features or loose settings in production.',
  },
  V14: {
    parts: ['operators', 'server'],
    risk: 'Sensitive data could be kept or exposed longer than needed.',
  },
  V15: {
    parts: ['release', 'server'],
    risk: 'Vulnerable libraries or unsafe code paths could reach production.',
  },
  V16: {
    parts: ['server', 'operators'],
    risk: 'Attacks and failures leave no trace, so they cannot be spotted or investigated.',
  },
  V17: {
    parts: ['server'],
    risk: 'Real-time media channels could be abused.',
    na: 'God’s Eye View uses no WebRTC.',
  },
  C4: {
    parts: ['ai', 'operators'],
    risk: 'The AI features have no defined context or scope, so nobody can say which of them are controlled.',
  },
  C5: {
    parts: ['ai', 'operators'],
    risk: 'No one in leadership owns the AI features or their policy, so their limits depend on whoever writes the next change.',
  },
  C6: {
    parts: ['ai', 'director', 'aircraft', 'ships'],
    risk: 'AI risks such as a wrong announcement or misleading narration are not assessed or planned for, so no fix is ever required.',
  },
  C7: {
    parts: ['ai', 'operators'],
    risk: 'People building and using the AI features are not shown to be competent or aware of its limits.',
  },
  C8: {
    parts: ['ai', 'director'],
    risk: 'AI risks are not re-checked as the system changes, so a new feed or feature can add risk unseen.',
  },
  C9: {
    parts: ['ai', 'director', 'evidence'],
    risk: 'Nobody measures how often the Director gets it wrong, so problems with the AI features stay invisible.',
  },
  C10: {
    parts: ['ai', 'evidence'],
    risk: 'Problems with the AI features are not tracked to a fix, so they can recur.',
  },
  'A.2': {
    parts: ['ai', 'operators'],
    risk: 'There is no AI policy to steer how the AI features are built and used.',
  },
  'A.3': {
    parts: ['ai', 'operators'],
    risk: 'Nobody is accountable for the AI features, and there is no way to raise a concern about them.',
  },
  'A.4': {
    parts: ['ai', 'release'],
    risk: 'The AI parts of the system and the tools that build them are not identified, so they cannot be managed.',
  },
  'A.5': {
    parts: ['ai', 'operators', 'director'],
    risk: 'The effect of automatic announcements on people and groups is not assessed.',
  },
  'A.6': {
    parts: ['ai', 'director', 'release'],
    risk: 'The AI features are not validated, monitored or logged, so a wrong announcement cannot be detected or explained.',
  },
  'A.7': {
    parts: ['ai', ...LIVE],
    risk: 'The feed data the AI features decide on is not held to stated quality requirements.',
    na: 'God’s Eye View trains or tunes no model; its rules use live feed values only.',
  },
  'A.8': {
    parts: ['ai', 'operators'],
    risk: 'Users are not told how the AI features choose what to show, or about AI incidents.',
  },
  'A.9': {
    parts: ['ai', 'operators', 'exercise'],
    risk: 'Responsible use of the AI features is not defined, so misuse has no line to cross.',
  },
  'A.10': {
    parts: ['ai', 'release', 'server'],
    risk: 'Responsibilities between Digital Dynamics Group, AI suppliers and customers are not set.',
  },
});

const OPEN = new Set(['P', 'N']);

/**
 * How an item affects God's Eye View.
 * @returns {{tone: 'risk'|'covered'|'na'|'unrated', heading: string, text: string, parts: string[]}}
 */
export function impactFor(item) {
  const area = AREAS[item.group] || { parts: [], risk: '' };
  const own = ITEMS[item.id];
  const parts = (own?.parts || area.parts).filter((p) => PARTS[p]);
  if (item.status === 'NA' || item.out)
    return {
      tone: 'na',
      heading: 'Why it doesn’t apply here',
      text:
        area.na ||
        (item.out
          ? 'Above the security level chosen for God’s Eye View (ASVS Level 2).'
          : item.lens === 'ai'
            ? 'Excluded in the statement of applicability for God’s Eye View.'
            : 'Not required at the safety level chosen (SWAL 3).'),
      parts: [],
    };
  if (!item.status)
    return {
      tone: 'unrated',
      heading: 'Not rated yet',
      text: `Depends on the hosting; rated in Wave 1 from a scan of the deployed app. At stake: ${area.risk.charAt(0).toLowerCase()}${area.risk.slice(1)}`,
      parts,
    };
  if (OPEN.has(item.status))
    return {
      tone: 'risk',
      heading: 'What this means for God’s Eye View',
      text: own?.text || area.risk,
      parts,
    };
  return {
    tone: 'covered',
    heading: own ? 'Fixed. Before the fix:' : 'In place. Without it:',
    text: own?.text || area.risk,
    parts,
  };
}

/** Every must-fix item needs its own statement (checked by tests). */
export const IMPACT_ITEMS = Object.keys(ITEMS);
export const IMPACT_AREAS = Object.keys(AREAS);
