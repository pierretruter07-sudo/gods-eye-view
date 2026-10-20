/**
 * @file The facts code cannot show. CrossCheck asks for these at intake:
 * what the software is for, where it runs, who owns it, and which processes
 * exist around it. An answer is the submitter's declaration: items that
 * rest on one are rated "Largely" at best and marked declared, never
 * verified, until a reviewer checks the evidence.
 * @module crosscheck/engine/facts
 */

/** Answer kinds. */
export const YES = 'yes';
export const NO = 'no';
export const NA = 'na';

/**
 * Every fact: id, the question, its kind ('text', 'yesno' or 'choice'),
 * the plan theme a "no" falls under, and what to do when the answer is no.
 */
export const FACTS = Object.freeze([
  // About the software
  { id: 'purpose', kind: 'text', group: 'About the software', question: 'What is the software for, and who uses it?' },
  { id: 'owner', kind: 'text', group: 'About the software', question: 'Who owns it (a named person or team accountable for it)?' },
  { id: 'hosting', kind: 'text', group: 'About the software', question: 'Where does it run (cloud provider, on premises, devices)?' },
  {
    id: 'criticality',
    kind: 'choice',
    group: 'About the software',
    question: 'If it fails or gives wrong output, what is the worst credible outcome?',
    options: [
      ['none', 'Inconvenience only'],
      ['minor', 'Minor harm or loss'],
      ['major', 'Major harm, injury or large loss'],
      ['hazardous', 'Serious injury or loss of life is possible'],
    ],
  },
  { id: 'internet_facing', kind: 'yesno', group: 'About the software', question: 'Is it reachable from the internet?' },
  { id: 'sensitive_data', kind: 'yesno', group: 'About the software', question: 'Does it handle personal, classified or commercially sensitive data?' },
  {
    id: 'ai_use',
    kind: 'choice',
    group: 'About the software',
    question: 'Does it use AI or machine learning?',
    options: [
      ['auto', 'Work it out from the code'],
      ['yes', 'Yes'],
      ['no', 'No'],
    ],
  },
  // Processes around it
  { id: 'risk_assessment', kind: 'yesno', group: 'Processes around it', theme: 'safety', question: 'Has a risk (or hazard) assessment been done for its intended use?', fix: 'Run a risk assessment for the intended use and record the result.' },
  { id: 'change_control', kind: 'yesno', group: 'Processes around it', theme: 'governance', question: 'Do changes go through review and approval before release?', fix: 'Set up change control: review, approval and a record for every release.' },
  { id: 'access_review', kind: 'yesno', group: 'Processes around it', theme: 'access', question: 'Are user and admin accounts reviewed and removed when no longer needed?', fix: 'Review accounts on a schedule and remove leavers promptly.' },
  { id: 'admin_mfa', kind: 'yesno', group: 'Processes around it', theme: 'access', question: 'Do administrators (and access to its hosting) require multi-factor authentication?', fix: 'Require MFA for every administrator and for the hosting console.' },
  { id: 'patching', kind: 'yesno', group: 'Processes around it', theme: 'ops', question: 'Are its servers, operating systems and runtimes patched on a schedule?', fix: 'Patch operating systems and runtimes on a set schedule, critical fixes within 48 hours.' },
  { id: 'backups', kind: 'yesno', group: 'Processes around it', theme: 'ops', question: 'Is its data backed up, and has a restore been tested?', fix: 'Back up the data and test a restore at least every quarter.' },
  { id: 'monitoring', kind: 'yesno', group: 'Processes around it', theme: 'logging', question: 'Is it monitored in production, with alerts someone responds to?', fix: 'Monitor it in production and route alerts to someone on call.' },
  { id: 'incident_process', kind: 'yesno', group: 'Processes around it', theme: 'ops', question: 'Is there an incident response process that covers it?', fix: 'Extend the incident response process to cover this software.' },
  { id: 'supplier_review', kind: 'yesno', group: 'Processes around it', theme: 'supply', question: 'Are its suppliers and hosted services assessed before use?', fix: 'Assess suppliers and hosted services before use, and record the result.' },
  { id: 'training', kind: 'yesno', group: 'Processes around it', theme: 'governance', question: 'Are the people who build and run it trained in secure development?', fix: 'Train the team in secure development and record it.' },
  { id: 'app_control', kind: 'yesno', group: 'Processes around it', theme: 'ops', question: 'Do the hosts it runs on allow only approved programs to execute (application control)?', fix: 'Apply application control on the hosts that run it.' },
  { id: 'hardening', kind: 'yesno', group: 'Processes around it', theme: 'ops', question: 'Are its hosts hardened (unneeded services off, secure baseline applied)?', fix: 'Harden the hosts against a recognised baseline.' },
]);

/** A fact by id. */
export const factById = (id) => FACTS.find((f) => f.id === id) || null;

/**
 * Normalise submitted answers: unknown ids dropped, yes/no answers to
 * 'yes' | 'no' | 'na', text trimmed and capped.
 * @param {Record<string, unknown>} raw
 */
export function cleanFacts(raw = {}) {
  const out = {};
  for (const f of FACTS) {
    const v = raw?.[f.id];
    if (v == null || v === '') continue;
    if (f.kind === 'text') {
      const t = String(v).trim().slice(0, 500);
      if (t) out[f.id] = t;
    } else if (f.kind === 'yesno') {
      const t = String(v).toLowerCase();
      if ([YES, NO, NA].includes(t)) out[f.id] = t;
    } else if (f.options.some(([k]) => k === v)) out[f.id] = v;
  }
  return out;
}
