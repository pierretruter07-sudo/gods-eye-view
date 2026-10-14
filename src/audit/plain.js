/**
 * @file Plain-English cards for the must-fix items, for first-time viewers.
 * Each card: what the gap is, why it matters, and the fix. Other items fall
 * back to the standard's wording and the assessor's notes.
 * @module audit/plain
 */

export const PLAIN = Object.freeze({
  'V8.2.1': {
    title: 'Anyone with the link can use everything',
    why: 'There is no sign-in. Strangers can run the paid map services and the exercise mode.',
    fix: 'Add company sign-in (SSO) before sharing the app beyond the team.',
  },
  'V8.1.1': {
    title: 'No written rules for who may do what',
    why: 'Without access rules there is nothing to build sign-in and roles against, or to test them with.',
    fix: 'Define viewer, operator and admin roles and what each may use.',
  },
  'V3.4.3': {
    title: 'The browser is not told which scripts to trust',
    why: 'A content security policy is the last line of defence if a malicious script slips into the page.',
    fix: 'Ship a strict content security policy that allows only the app’s own scripts.',
  },
  'V2.4.1': {
    title: 'Nothing stops someone hammering the paid services',
    why: 'Rate limiting is off by default, so one person can run up costs or knock the feeds over.',
    fix: 'Turn rate limits on by default, with a global cap per service.',
  },
  'V15.2.1': {
    title: 'Third-party code is not checked for known holes',
    why: 'No automatic scan means a published vulnerability in a library could ship unnoticed.',
    fix: 'Scan dependencies in every build and block releases with high-risk findings.',
  },
  '3.0.1': {
    title: 'No safety assurance plan written down',
    why: 'ED-153 starts from a documented plan; without it no later evidence has a frame to sit in.',
    fix: 'Write the software safety assessment plan and have it signed off.',
  },
  '3.0.5': {
    title: 'The safety level has not been formally set',
    why: 'SWAL 3 is assumed, not derived from hazards, so the rigour applied cannot be justified yet.',
    fix: 'Derive the SWAL from a hazard log using severity × likelihood.',
  },
  '3.0.10': {
    title: 'No argument that the safety level is met',
    why: 'Assessors need a reasoned case, not a pile of documents.',
    fix: 'Write the safety argument with direct and back-up evidence.',
  },
  '3.0.11': {
    title: 'Safety is not monitored once running',
    why: 'If feeds fail or data goes stale in service, nobody would know from the records.',
    fix: 'Add feed-health telemetry and an incident log tied to the safety level.',
  },
  '3.0.17': {
    title: 'No overall safety case',
    why: 'The claim that the software is acceptably safe has to be argued and traced to evidence.',
    fix: 'Build a structured safety case (GSN) in the safety folder.',
  },
  '3.1.5': {
    title: 'No system-level hazard assessment yet',
    why: 'Software safety requirements come from the system’s hazards; they have not been analysed.',
    fix: 'Run a functional hazard assessment with the customer.',
  },
  '3.2.3': {
    title: 'The plan has not been reviewed',
    why: 'A plan nobody has checked carries no assurance weight.',
    fix: 'Have a named reviewer sign off the plan.',
  },
  '3.3.1': {
    title: 'Failure modes not yet identified',
    why: 'You cannot protect against failures you have not listed, such as stale or wrong positions.',
    fix: 'List how each component can fail.',
  },
  '3.3.2': {
    title: 'Effects of failures not described',
    why: 'Each failure needs its effect on the operator spelled out to judge how serious it is.',
    fix: 'Describe what each failure does to the person using the display.',
  },
  '3.3.3': {
    title: 'Risk of each failure not assessed',
    why: 'Severity alone is not enough; how likely a failure is decides the safety level.',
    fix: 'Justify the likelihood of each failure.',
  },
  '3.3.5': {
    title: 'Safety level not allocated per failure',
    why: 'Each failure’s severity and likelihood must map to a SWAL through the ED-153 matrix.',
    fix: 'Allocate a SWAL to each failure and keep the most stringent.',
  },
  '3.4.1': {
    title: 'Not yet validated with real users',
    why: 'Validation shows the safety requirements are the right ones for the people using it.',
    fix: 'Validate the safety requirements with operational users.',
  },
  '3.4.3': {
    title: 'The process has not been independently checked',
    why: 'Someone outside development must confirm the process was followed.',
    fix: 'Run a process assurance (QA) audit.',
  },
  '4.1.2': {
    title: 'Hazard assessment missing from acquisition',
    why: 'The acquiring organisation needs the hazard assessment to set requirements for the supplier.',
    fix: 'Share one functional hazard assessment for both purposes.',
  },
  '4.1.3': {
    title: 'No preliminary system safety assessment',
    why: 'The PSSA turns hazards into the safety requirements the software must meet.',
    fix: 'Do the preliminary system safety assessment after the hazard assessment.',
  },
  'C4.3': {
    title: 'Nobody has said which AI is covered',
    why: 'The Director’s automatic picks, the planned narrator and AI-written code all need managing, but none is formally in scope.',
    fix: 'Write down the scope of the AI management system and what sits inside it.',
  },
  'C5.2': {
    title: 'There is no AI policy',
    why: 'A policy fixes the advisory-only, non-kinetic boundary and the commitments every AI feature must keep.',
    fix: 'Issue a short AI policy approved by the owner.',
  },
  'C6.1.2': {
    title: 'AI risks have not been assessed',
    why: 'A wrong announcement, misleading narration or unreviewed AI-written code are real risks nobody has weighed.',
    fix: 'Run an AI risk assessment with clear criteria and record the result.',
  },
  'C6.1.4': {
    title: 'No assessment of how the AI affects people',
    why: 'Automatic announcements single out crews and vessels on a public display and shape what operators believe.',
    fix: 'Assess the impact on individuals, groups and society and record it.',
  },
  'A.2.2': {
    title: 'The AI policy is not documented',
    why: 'Operators and customers need a written policy to hold the AI features to.',
    fix: 'Publish the AI policy (the same document as clause 5.2).',
  },
  'A.5.2': {
    title: 'No process to check AI features before release',
    why: 'Each new AI feature, such as narration, should be assessed for its effect on people before it ships.',
    fix: 'Define an impact assessment step in the release process.',
  },
  'A.9.4': {
    title: 'Intended use is not formally stated',
    why: 'Without a statement of intended and prohibited uses, misuse such as targeting cannot be refused on paper.',
    fix: 'Publish an intended-use statement that lists prohibited uses.',
  },
  'A.10.3': {
    title: 'AI suppliers are not checked',
    why: 'AI coding agents and a future model provider shape the code and data, but their terms and risks are unknown.',
    fix: 'Assess and register each AI supplier and agree terms for data and model use.',
  },
});

/** Shorten text at a word boundary for lists. */
export function shorten(text, max = 80) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** A card for any item: plain words for must-fix items, the standard's otherwise. */
export function cardFor(item) {
  const plain = PLAIN[item.id];
  if (plain) return { ...plain, plain: true };
  const text =
    item.lens === 'sec'
      ? item.title
          .replace(/^Verify that /, '')
          .replace(/^./, (c) => c.toUpperCase())
      : item.title;
  return {
    title: text,
    why: item.evidence || 'No assessor note recorded.',
    fix: item.fix || '',
    plain: false,
  };
}
