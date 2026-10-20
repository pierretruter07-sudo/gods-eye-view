#!/usr/bin/env node
/**
 * @file Builds CrossCheck's standard catalogues (crosscheck/catalogues/*.json)
 * from two sources:
 *  - the kit's existing catalogues (ED-153, OWASP ASVS 5.0, ISO/IEC 42001),
 *    converted and mapped to evidence signals and facts;
 *  - the four standards added in Phase 5 (NIST SSDF, Australian ISM and
 *    Essential Eight, ISO/IEC 27001:2022, MIL-STD-882E), defined below.
 *
 * Copyright: for licensed standards (EUROCAE, ISO/IEC) CrossCheck stores
 * clause numbers and paraphrased titles only. Free standards (NIST, ASD,
 * US DoD) are also kept to identifiers and short paraphrased titles. OWASP
 * ASVS requirement text is CC BY-SA 4.0 and keeps its attribution.
 *
 * Usage: node crosscheck/tools/build-catalogues.mjs [--check]
 *   --check  exit 1 if the committed catalogues differ from a fresh build.
 * @module crosscheck/tools
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const kit = (f) => JSON.parse(fs.readFileSync(path.join(root, 'kit', f), 'utf8'));
const out = path.join(root, 'catalogues');

/** A check that IS the control (passing proves it). */
const direct = (id) => ({ id, strength: 'direct' });

// ── ED-153 (EUROCAE), safety assurance for ANS software ──────────────────
const ED153_AREAS = {
  '3 SSAS': { checks: ['doc.hazard_log', 'doc.requirements'], facts: ['risk_assessment'], weight: 'high' },
  '3.1 Initiation': { checks: ['doc.hazard_log'], facts: ['risk_assessment', 'owner'], weight: 'high' },
  '3.2 Planning': { checks: ['doc.hazard_log', 'doc.verification'] },
  '3.3 Requirements': { checks: ['doc.requirements', 'doc.verification'], weight: 'high' },
  '3.4 V&V/PA': { checks: ['doc.verification', 'tests.present', 'ci.tests'], weight: 'high' },
  '3.5 Completion': { checks: ['doc.hazard_log', 'doc.verification'] },
  '4.1 Acquisition': { checks: ['deps.lockfile'], facts: ['supplier_review'] },
  '4.2 Supply': { checks: ['deps.manifest'], facts: ['supplier_review'] },
  '4.3 Development': { checks: ['doc.requirements', 'doc.architecture', 'tests.present', 'lint.config'] },
  '4.4 Operation': { checks: ['doc.operations'], facts: ['monitoring', 'incident_process'] },
  '4.5 Maintenance': { checks: ['doc.changelog'], facts: ['change_control'] },
  '5.1 Documentation': { checks: ['doc.readme', 'doc.architecture'] },
  '5.2 CM': { checks: ['ci.pipeline', 'doc.changelog', 'deps.lockfile'], facts: ['change_control'] },
  '5.3 QA': { checks: ['doc.contributing', 'lint.config'] },
  '5.4 Verification': { checks: ['tests.present', 'ci.tests', 'doc.verification'], weight: 'high' },
  '5.5 Validation': { checks: ['doc.verification'] },
  '5.6 Joint review': { checks: ['doc.contributing'] },
  '5.7 Audit': {},
  '5.8 Problem resolution': { checks: ['doc.incident'], facts: ['incident_process'] },
  '6 Organisational': { checks: ['doc.codeowners'], facts: ['training', 'owner'] },
  '7 Additional ANS': {},
  '8 Safety Folder': { checks: ['doc.hazard_log'], weight: 'high' },
};

/** The reconstructed catalogue repeats placeholder ids (7.x): number them. */
function uniqueIds(list) {
  const seen = new Map();
  return list.map((o) => {
    const n = (seen.get(o.id) || 0) + 1;
    seen.set(o.id, n);
    return n === 1 ? o : { ...o, id: `${o.id}-${n}` };
  });
}

function ed153() {
  return {
    id: 'ed153',
    name: 'EUROCAE ED-153, software safety assurance for air navigation services',
    short: 'ED-153',
    lens: 'Safety',
    scale: 'safety',
    licence: 'Paid (EUROCAE): objective numbers and paraphrased titles only',
    source: 'EUROCAE ED-153 (reconstructed catalogue v0.1)',
    levelName: 'SWAL',
    levels: ['1', '2', '3', '4'],
    defaultLevel: '3',
    claim: ['SWAL claim not supported', 'SWAL claim supported with conditions', 'SWAL claim supported'],
    items: uniqueIds(kit('catalogue.json')).map((o) => {
      const area = ED153_AREAS[o.area] || {};
      const levels = Object.entries(o.swal || {})
        .filter(([, v]) => ['R', 'I', 'R (I?)'].includes(v))
        .map(([k]) => k);
      return {
        id: o.id,
        group: o.area.split(' ')[0],
        groupName: o.area,
        title: o.title,
        levels,
        ...(o.placeholder ? { out: true, outWhy: 'Placeholder objective in the reconstructed catalogue' } : {}),
        checks: area.checks || [],
        facts: area.facts || [],
        ...(area.weight ? { weight: area.weight } : {}),
        expects: o.evidence || null,
      };
    }),
  };
}

// ── OWASP ASVS 5.0 (CC BY-SA 4.0) ────────────────────────────────────────
const ASVS_CHAPTERS = {
  V1: ['sec.no_dangerous', 'sec.validation'],
  V2: ['sec.validation'],
  V3: ['sec.headers'],
  V4: ['sec.validation', 'sec.headers'],
  V5: ['sec.validation'],
  V6: ['sec.authn', 'sec.mfa', 'sec.rate_limit'],
  V7: ['sec.authn'],
  V8: ['sec.authz'],
  V9: ['sec.authn'],
  V10: ['sec.authn'],
  V11: ['sec.crypto'],
  V12: ['sec.tls', 'sec.headers'],
  V13: ['secrets.clean', 'secrets.gitignore', 'config.documented'],
  V14: ['doc.privacy', 'secrets.clean'],
  V15: ['deps.lockfile', 'deps.updates', 'sast.tool'],
  V16: ['sec.logging', 'sec.errors'],
  V17: [],
};

function asvs() {
  return {
    id: 'asvs5',
    name: 'OWASP Application Security Verification Standard 5.0',
    short: 'OWASP ASVS',
    lens: 'Security',
    scale: 'security',
    licence: 'CC BY-SA 4.0 (OWASP Foundation); requirement text attributed',
    attribution: 'OWASP Application Security Verification Standard 5.0.0, © OWASP Foundation, CC BY-SA 4.0',
    source: 'https://github.com/OWASP/ASVS',
    levelName: 'Level',
    levels: ['1', '2', '3'],
    defaultLevel: '2',
    claim: ['ASVS level not met', 'ASVS level met with conditions', 'ASVS level met'],
    items: kit('asvs.json').map((r) => ({
      id: r.id,
      group: r.ch,
      groupName: `${r.ch} ${r.chName}`,
      title: r.text,
      levels: ['1', '2', '3'].filter((l) => Number(l) >= r.L),
      checks: ASVS_CHAPTERS[r.ch] || [],
      facts: [],
    })),
  };
}

// ── ISO/IEC 42001 (paid; numbers and paraphrased titles) ────────────────
const ISO42001_GROUPS = {
  C4: { facts: ['purpose'], checks: ['doc.ai'] },
  C5: { facts: ['owner'] },
  C6: { facts: ['risk_assessment'], checks: ['doc.hazard_log'], weight: 'high' },
  C7: { facts: ['training'], checks: ['doc.ai'] },
  C8: { checks: ['doc.ai', 'doc.operations'] },
  C9: { facts: ['monitoring'] },
  C10: { checks: ['doc.incident'], facts: ['incident_process'] },
  'A.2': { checks: ['doc.ai'] },
  'A.3': { facts: ['owner'] },
  'A.4': { checks: ['doc.ai'] },
  'A.5': { facts: ['risk_assessment'], checks: ['doc.hazard_log'], weight: 'high' },
  'A.6': { checks: ['doc.ai', 'tests.present', 'doc.verification'] },
  'A.7': { checks: ['doc.privacy', 'doc.ai'] },
  'A.8': { checks: ['doc.ai', 'doc.readme'] },
  'A.9': { checks: ['doc.ai'], facts: ['monitoring'] },
  'A.10': { checks: ['deps.manifest'], facts: ['supplier_review'] },
};

function iso42001() {
  return {
    id: 'iso42001',
    name: 'ISO/IEC 42001, AI management system',
    short: 'ISO/IEC 42001',
    lens: 'AI management',
    scale: 'management',
    applies: 'ai',
    licence: 'Paid (ISO/IEC): clause numbers and paraphrased titles only',
    source: 'ISO/IEC 42001:2023',
    claim: ['ISO 42001 not met', 'ISO 42001 met with conditions', 'ISO 42001 met'],
    items: kit('iso42001.json').map((c) => {
      const g = ISO42001_GROUPS[c.group] || {};
      return {
        id: c.id,
        group: c.group,
        groupName: `${c.group} ${c.groupName}`,
        title: c.title,
        checks: g.checks || [],
        facts: g.facts || [],
        ...(g.weight ? { weight: g.weight } : {}),
      };
    }),
  };
}

// ── NIST SP 800-218 SSDF v1.1 (public domain; practice IDs, paraphrased) ─
function ssdf() {
  const G = {
    PO: 'PO Prepare the organisation',
    PS: 'PS Protect the software',
    PW: 'PW Produce well-secured software',
    RV: 'RV Respond to vulnerabilities',
  };
  const P = [
    ['PO.1', 'Security requirements for software development are defined and kept current', ['doc.requirements', 'doc.security_policy']],
    ['PO.2', 'Roles and responsibilities for secure development are assigned', ['doc.codeowners'], ['owner', 'training']],
    ['PO.3', 'Supporting toolchains are in place and used', ['ci.pipeline', 'sast.tool', 'lint.config']],
    ['PO.4', 'Criteria for software security checks are defined and applied', ['ci.tests', 'sast.tool']],
    ['PO.5', 'Development environments are secured and maintained', ['secrets.clean', 'secrets.gitignore'], ['admin_mfa', 'hardening'], 'high'],
    ['PS.1', 'All forms of code are protected from unauthorised access and tampering', ['doc.codeowners'], ['change_control', 'access_review'], 'high'],
    ['PS.2', 'Release integrity can be verified', [direct('release.integrity')]],
    ['PS.3', 'Each release is archived and protected, with its components recorded', ['doc.changelog', direct('sbom')]],
    ['PW.1', 'Software is designed to meet security requirements and mitigate risks', ['doc.threat_model', 'doc.architecture']],
    ['PW.2', 'The design is reviewed against security requirements and risk', ['doc.threat_model', 'doc.architecture'], ['change_control']],
    ['PW.4', 'Well-secured existing software is reused where feasible', ['deps.manifest', 'deps.lockfile'], ['supplier_review']],
    ['PW.5', 'Source code follows secure coding practices', [direct('sec.no_dangerous'), 'sec.validation', 'sec.crypto', 'lint.config'], [], 'high'],
    ['PW.6', 'Build processes are configured to improve executable security', ['ci.pipeline', 'container.nonroot']],
    ['PW.7', 'Code is reviewed or analysed to find vulnerabilities', [direct('sast.tool'), 'doc.contributing']],
    ['PW.8', 'Executable code is tested to find vulnerabilities', ['tests.present', 'ci.tests']],
    ['PW.9', 'Software ships with secure settings by default', ['sec.headers', 'config.documented', direct('secrets.clean')], [], 'high'],
    ['RV.1', 'Vulnerabilities are identified and confirmed on an ongoing basis', [direct('deps.updates'), 'doc.security_policy'], [], 'high'],
    ['RV.2', 'Vulnerabilities are assessed, prioritised and remediated', ['doc.security_policy'], ['incident_process']],
    ['RV.3', 'Root causes of vulnerabilities are analysed', ['doc.incident']],
  ];
  return {
    id: 'nist-ssdf',
    name: 'NIST SP 800-218, Secure Software Development Framework (SSDF) 1.1',
    short: 'NIST SSDF',
    lens: 'Secure development',
    scale: 'security',
    licence: 'Free (NIST, public domain); practice IDs and paraphrased titles',
    source: 'https://csrc.nist.gov/pubs/sp/800/218/final',
    claim: ['SSDF practices not met', 'SSDF practices met with conditions', 'SSDF practices met'],
    items: P.map(([id, title, checks, facts = [], weight]) => ({
      id,
      group: id.slice(0, 2),
      groupName: G[id.slice(0, 2)],
      title,
      checks,
      facts,
      ...(weight ? { weight } : {}),
    })),
  };
}

// ── Australian ISM and Essential Eight (ASD; free) ──────────────────────
function ismE8() {
  const items = [
    // Essential Eight mitigation strategies
    ['E8.1', 'E8', 'Applications are patched promptly', ['deps.updates'], ['patching'], 'high'],
    ['E8.2', 'E8', 'Operating systems are patched promptly', [], ['patching'], 'high'],
    ['E8.3', 'E8', 'Multi-factor authentication is used', ['sec.mfa'], ['admin_mfa'], 'high'],
    ['E8.4', 'E8', 'Administrative privileges are restricted', ['sec.authz'], ['access_review'], 'high'],
    ['E8.5', 'E8', 'Only approved applications can run (application control)', [], ['app_control']],
    ['E8.6', 'E8', 'Office macro settings are restricted', [], [], null, 'Organisation-wide desktop control, outside a software assessment'],
    ['E8.7', 'E8', 'User applications are hardened', [], ['hardening']],
    ['E8.8', 'E8', 'Regular backups are made and restores tested', [], ['backups'], 'high'],
    // ISM topics. CrossCheck-local IDs at topic level: map them to the
    // control numbers of the ISM release the customer is assessed against.
    ['ISM-SD.1', 'SD', 'Development, test and production environments are separated', ['config.documented'], ['change_control']],
    ['ISM-SD.2', 'SD', 'A secure software development life cycle is followed', ['doc.contributing', 'ci.tests', 'sast.tool']],
    ['ISM-SD.3', 'SD', 'A software bill of materials is produced', [direct('sbom')]],
    ['ISM-SD.4', 'SD', 'Applications are security tested before release', ['sast.tool', 'tests.present']],
    ['ISM-SD.5', 'SD', 'A vulnerability disclosure program is in place', [direct('doc.security_policy')]],
    ['ISM-WA.1', 'WA', 'Web applications follow OWASP guidance', ['sec.validation', 'sec.no_dangerous', 'sec.headers']],
    ['ISM-WA.2', 'WA', 'A maintained web application framework is used', ['deps.manifest', 'deps.lockfile']],
    ['ISM-WA.3', 'WA', 'Web application traffic is encrypted', [direct('sec.tls')], [], 'high'],
    ['ISM-WA.4', 'WA', 'Web application input is validated', ['sec.validation'], [], 'high'],
    ['ISM-WA.5', 'WA', 'Web application output is encoded', [direct('sec.no_dangerous')]],
    ['ISM-WA.6', 'WA', 'Browser-based security controls are set (CSP, HSTS, framing)', [direct('sec.headers')]],
    ['ISM-WA.7', 'WA', 'Web application events are logged', ['sec.logging']],
    ['ISM-AC.1', 'AC', 'Users and privileged users authenticate with multiple factors', ['sec.authn', 'sec.mfa'], ['admin_mfa'], 'high'],
    ['ISM-AC.2', 'AC', 'Privileged access is restricted and reviewed', ['sec.authz'], ['access_review']],
    ['ISM-SM.1', 'SM', 'Systems are hardened to a secure baseline', [], ['hardening']],
    ['ISM-SM.2', 'SM', 'Changes are controlled', ['doc.changelog'], ['change_control']],
    ['ISM-MO.1', 'MO', 'Events are logged centrally and monitored', ['sec.logging'], ['monitoring']],
    ['ISM-IR.1', 'IR', 'Cyber security incidents are managed', ['doc.incident'], ['incident_process']],
    ['ISM-SC.1', 'SC', 'Supply chain risks are managed', ['deps.lockfile'], ['supplier_review']],
    ['ISM-DP.1', 'DP', 'Sensitive data handling is documented and protected', ['doc.privacy', 'secrets.clean'], ['sensitive_data']],
    ['ISM-SE.1', 'SE', 'Secrets are not stored in code', [direct('secrets.clean'), 'secrets.gitignore'], [], 'critical'],
  ];
  const G = {
    E8: 'Essential Eight',
    SD: 'ISM · Software development',
    WA: 'ISM · Web application development',
    AC: 'ISM · Authentication and access',
    SM: 'ISM · System management',
    MO: 'ISM · System monitoring',
    IR: 'ISM · Incident management',
    SC: 'ISM · Supply chain',
    DP: 'ISM · Data protection',
    SE: 'ISM · Secrets',
  };
  return {
    id: 'ism-e8',
    name: 'Australian Information Security Manual and Essential Eight (ASD)',
    short: 'ISM + E8',
    lens: 'Government security',
    scale: 'security',
    licence: 'Free (Australian Signals Directorate); strategy names and paraphrased topic titles',
    source: 'https://www.cyber.gov.au/resources-business-and-government/essential-cyber-security/ism',
    note: 'ISM items are grouped at topic level with CrossCheck IDs; map them to the control numbers of the ISM release you are assessed against.',
    claim: ['ISM and Essential Eight not met', 'Met with conditions', 'ISM and Essential Eight met'],
    items: items.map(([id, g, title, checks, facts = [], weight, outWhy]) => ({
      id,
      group: g,
      groupName: G[g],
      title,
      checks,
      facts,
      ...(weight ? { weight } : {}),
      ...(outWhy ? { out: true, outWhy } : {}),
    })),
  };
}

// ── ISO/IEC 27001:2022 (paid; numbers and paraphrased titles) ──────────
function iso27001() {
  const ORG = 'Organisation-level (ISMS): assessed in the certification audit, not in the software';
  const PHYS = 'Physical control: assessed at the site, not in the software';
  const clauses = [
    ['4.1', 'The organisation and its context are understood'],
    ['4.2', 'Interested parties and their needs are identified'],
    ['4.3', 'The scope of the ISMS is set'],
    ['4.4', 'The ISMS is established and maintained'],
    ['5.1', 'Leadership commits to the ISMS'],
    ['5.2', 'An information security policy is set'],
    ['5.3', 'Roles, responsibilities and authorities are assigned'],
    ['6.1', 'Risks are assessed and treated', [], ['risk_assessment'], 'high'],
    ['6.2', 'Security objectives are set with plans to meet them'],
    ['6.3', 'Changes to the ISMS are planned'],
    ['7.1', 'Resources are provided'],
    ['7.2', 'People are competent', [], ['training']],
    ['7.3', 'People are aware of the policy and their part', [], ['training']],
    ['7.4', 'Communication is planned'],
    ['7.5', 'Documented information is controlled'],
    ['8.1', 'Operations are planned and controlled', ['doc.operations']],
    ['8.2', 'Risk assessments are carried out', [], ['risk_assessment']],
    ['8.3', 'Risk treatment is carried out', [], ['risk_assessment']],
    ['9.1', 'Performance is monitored and measured', [], ['monitoring']],
    ['9.2', 'Internal audits are held'],
    ['9.3', 'Management reviews the ISMS'],
    ['10.1', 'The ISMS is continually improved'],
    ['10.2', 'Nonconformities are corrected', ['doc.incident']],
  ].map(([n, t, checks = [], facts = [], weight]) => {
    const rated = checks.length || facts.length;
    return {
      id: `C${n}`,
      group: `C${n.split('.')[0]}`,
      groupName: 'Clauses 4–10 · Management system',
      title: t,
      checks,
      facts,
      ...(weight ? { weight } : {}),
      ...(rated ? {} : { out: true, outWhy: ORG }),
    };
  });
  const A = [
    // 5 Organisational controls
    ['5.1', 'Security policies are defined and approved', ['doc.security_policy']],
    ['5.2', 'Security roles and responsibilities are assigned', ['doc.codeowners'], ['owner']],
    ['5.3', 'Conflicting duties are segregated', ['doc.contributing'], ['change_control']],
    ['5.4', 'Management requires staff to apply security', null, null, null, ORG],
    ['5.5', 'Contact with authorities is maintained', null, null, null, ORG],
    ['5.6', 'Contact with special interest groups is maintained', null, null, null, ORG],
    ['5.7', 'Threat intelligence is gathered and used', ['deps.updates']],
    ['5.8', 'Security is part of project management', ['doc.requirements', 'doc.threat_model']],
    ['5.9', 'Information and assets are inventoried', ['sbom', 'deps.manifest']],
    ['5.10', 'Acceptable use of information is defined', null, null, null, ORG],
    ['5.11', 'Assets are returned when people leave', null, null, null, ORG],
    ['5.12', 'Information is classified', ['doc.privacy']],
    ['5.13', 'Information is labelled', null, null, null, ORG],
    ['5.14', 'Information transfer is protected', [direct('sec.tls')]],
    ['5.15', 'Access control rules are set and applied', ['sec.authz', 'sec.authn'], [], 'high'],
    ['5.16', 'Identities are managed through their life cycle', ['sec.authn'], ['access_review']],
    ['5.17', 'Authentication information is managed', ['sec.authn', direct('secrets.clean')], [], 'high'],
    ['5.18', 'Access rights are granted, reviewed and removed', [], ['access_review']],
    ['5.19', 'Supplier security risks are managed', [], ['supplier_review']],
    ['5.20', 'Security is addressed in supplier agreements', null, null, null, ORG],
    ['5.21', 'ICT supply chain security is managed', ['deps.lockfile', 'sbom']],
    ['5.22', 'Supplier services are monitored and changes reviewed', [], ['supplier_review']],
    ['5.23', 'Cloud service use is secured', [], ['hosting', 'supplier_review']],
    ['5.24', 'Incident management is planned and prepared', ['doc.incident'], ['incident_process']],
    ['5.25', 'Security events are assessed and decided on', [], ['incident_process']],
    ['5.26', 'Incidents are responded to', ['doc.incident'], ['incident_process']],
    ['5.27', 'Lessons are learned from incidents', ['doc.incident']],
    ['5.28', 'Evidence is collected and preserved', ['sec.logging']],
    ['5.29', 'Security is maintained during disruption', [], ['backups']],
    ['5.30', 'ICT is ready for business continuity', ['doc.operations'], ['backups']],
    ['5.31', 'Legal and contractual requirements are identified', null, null, null, ORG],
    ['5.32', 'Intellectual property rights are protected', ['doc.license']],
    ['5.33', 'Records are protected', ['sec.logging', 'doc.changelog']],
    ['5.34', 'Privacy and personal data are protected', ['doc.privacy'], ['sensitive_data']],
    ['5.35', 'Security is independently reviewed', null, null, null, ORG],
    ['5.36', 'Compliance with security policies is checked', null, null, null, ORG],
    ['5.37', 'Operating procedures are documented', ['doc.operations']],
    // 6 People controls
    ['6.1', 'Candidates are screened', null, null, null, ORG],
    ['6.2', 'Employment terms cover security', null, null, null, ORG],
    ['6.3', 'People are trained in security', [], ['training']],
    ['6.4', 'A disciplinary process exists', null, null, null, ORG],
    ['6.5', 'Duties continue after leaving or changing role', null, null, null, ORG],
    ['6.6', 'Confidentiality agreements are in place', null, null, null, ORG],
    ['6.7', 'Remote working is secured', null, null, null, ORG],
    ['6.8', 'Security events are reported', ['doc.security_policy', 'doc.incident']],
    // 7 Physical controls
    ...['Physical security perimeters are defined', 'Physical entry is controlled', 'Offices, rooms and facilities are secured', 'Premises are monitored', 'Physical and environmental threats are guarded against', 'Work in secure areas is controlled', 'Desks and screens are kept clear', 'Equipment is sited and protected', 'Assets off premises are protected', 'Storage media are managed', 'Supporting utilities are protected', 'Cabling is protected', 'Equipment is maintained', 'Equipment is disposed of or reused securely'].map((t, i) => [`7.${i + 1}`, t, null, null, null, PHYS]),
    // 8 Technological controls
    ['8.1', 'User end-point devices are protected', null, null, null, ORG],
    ['8.2', 'Privileged access rights are restricted', ['sec.authz'], ['admin_mfa'], 'high'],
    ['8.3', 'Access to information is restricted', ['sec.authz']],
    ['8.4', 'Access to source code is controlled', ['doc.codeowners'], ['change_control']],
    ['8.5', 'Authentication is secure', ['sec.authn', 'sec.mfa', 'sec.rate_limit'], [], 'high'],
    ['8.6', 'Capacity is managed'],
    ['8.7', 'Malware is guarded against', [], ['hardening']],
    ['8.8', 'Technical vulnerabilities are managed', [direct('deps.updates'), 'sast.tool'], ['patching'], 'high'],
    ['8.9', 'Configurations are managed', ['config.documented', 'secrets.gitignore']],
    ['8.10', 'Information is deleted when no longer needed', ['doc.privacy']],
    ['8.11', 'Data is masked where required'],
    ['8.12', 'Data leakage is prevented'],
    ['8.13', 'Information is backed up', [], ['backups'], 'high'],
    ['8.14', 'Processing facilities are redundant', null, null, null, ORG],
    ['8.15', 'Activities are logged', [direct('sec.logging')]],
    ['8.16', 'Activities are monitored', ['sec.logging'], ['monitoring']],
    ['8.17', 'Clocks are synchronised', null, null, null, ORG],
    ['8.18', 'Privileged utility programs are restricted', null, null, null, ORG],
    ['8.19', 'Software installation on operational systems is controlled', [], ['app_control']],
    ['8.20', 'Networks are secured', [], ['hardening']],
    ['8.21', 'Network services are secured', ['sec.tls'], ['hardening']],
    ['8.22', 'Networks are segregated'],
    ['8.23', 'Web access is filtered', null, null, null, ORG],
    ['8.24', 'Cryptography is used correctly', [direct('sec.crypto'), 'sec.tls']],
    ['8.25', 'Development follows a secure life cycle', ['ci.pipeline', 'doc.contributing', 'tests.present']],
    ['8.26', 'Application security requirements are identified', ['doc.requirements', 'doc.threat_model']],
    ['8.27', 'Secure architecture and engineering principles are applied', ['doc.architecture', 'doc.threat_model']],
    ['8.28', 'Code is written securely', [direct('sec.no_dangerous'), 'sec.validation', 'lint.config', 'sast.tool'], [], 'high'],
    ['8.29', 'Security is tested in development and acceptance', ['sast.tool', 'ci.tests']],
    ['8.30', 'Outsourced development is directed and monitored', [], ['supplier_review']],
    ['8.31', 'Development, test and production are separated', ['config.documented'], ['change_control']],
    ['8.32', 'Changes are managed', ['doc.changelog'], ['change_control']],
    ['8.33', 'Test information is protected'],
    ['8.34', 'Systems are protected during audit testing', null, null, null, ORG],
  ].map(([n, t, checks, facts, weight, outWhy]) => ({
    id: `A.${n}`,
    group: `A.${n.split('.')[0]}`,
    groupName: { 5: 'A.5 Organisational controls', 6: 'A.6 People controls', 7: 'A.7 Physical controls', 8: 'A.8 Technological controls' }[n.split('.')[0]],
    title: t,
    checks: checks || [],
    facts: facts || [],
    ...(weight ? { weight } : {}),
    ...(outWhy ? { out: true, outWhy } : {}),
  }));
  return {
    id: 'iso27001',
    name: 'ISO/IEC 27001:2022, information security management',
    short: 'ISO/IEC 27001',
    lens: 'Information security management',
    scale: 'security',
    licence: 'Paid (ISO/IEC): clause and control numbers with paraphrased titles only',
    source: 'ISO/IEC 27001:2022',
    note: 'CrossCheck assesses the software against the controls it can evidence; organisation-wide and physical controls are excluded and belong to the ISMS certification audit.',
    claim: ['ISO 27001 controls not met', 'ISO 27001 controls met with conditions', 'ISO 27001 controls met'],
    items: [...clauses, ...A],
  };
}

// ── MIL-STD-882E, system safety (US DoD; free) ──────────────────────────
function mil882e() {
  const OUT = 'Not a software task (hazardous materials, explosives or environment)';
  const T = [
    ['100', 'Management', [
      ['101', 'Hazards are identified and mitigated using the system safety method', ['doc.hazard_log'], ['risk_assessment'], 'high'],
      ['102', 'A system safety program plan is in place', ['doc.hazard_log']],
      ['103', 'A hazard management plan is in place', ['doc.hazard_log']],
      ['104', 'Government reviews and audits are supported'],
      ['105', 'Integrated product team and safety working group support'],
      ['106', 'A hazard tracking system is maintained', [direct('doc.hazard_log')], [], 'high'],
      ['107', 'Hazard management progress is reported'],
      ['108', 'Hazardous materials are managed', null, null, null, OUT],
    ]],
    ['200', 'Analysis', [
      ['201', 'A preliminary hazard list is produced', ['doc.hazard_log'], ['risk_assessment'], 'high'],
      ['202', 'A preliminary hazard analysis is carried out', ['doc.hazard_log'], ['risk_assessment']],
      ['203', 'System requirements are analysed for hazards', ['doc.requirements', 'doc.hazard_log']],
      ['204', 'Subsystem hazards are analysed', ['doc.hazard_log', 'doc.architecture']],
      ['205', 'System hazards are analysed', ['doc.hazard_log']],
      ['206', 'Operating and support hazards are analysed', ['doc.operations', 'doc.hazard_log']],
      ['207', 'Health hazards are analysed', null, null, null, OUT],
      ['208', 'Functional hazards are analysed (software functions included)', ['doc.hazard_log', 'doc.architecture'], [], 'high'],
      ['209', 'System-of-systems hazards are analysed', ['doc.architecture']],
      ['210', 'Environmental hazards are analysed', null, null, null, OUT],
    ]],
    ['300', 'Evaluation', [
      ['301', 'A safety assessment report is produced', ['doc.hazard_log', 'doc.verification']],
      ['302', 'Hazard management is assessed and reported', ['doc.hazard_log']],
      ['303', 'Safety takes part in test and evaluation', ['tests.present', 'doc.verification']],
      ['304', 'Changes, deficiency reports and mishaps are reviewed for safety', ['doc.changelog'], ['change_control', 'incident_process']],
    ]],
    ['400', 'Verification', [
      ['401', 'Safety requirements and mitigations are verified', [direct('doc.verification'), 'tests.present', 'ci.tests'], [], 'high'],
      ['402', 'Explosives hazard classification data is provided', null, null, null, OUT],
      ['403', 'Explosive ordnance disposal data is provided', null, null, null, OUT],
    ]],
  ];
  const sw = [
    ['SW.1', 'Software contributions to hazards are identified', ['doc.hazard_log', 'doc.architecture'], [], 'high'],
    ['SW.2', 'Each software function has a criticality index (SwCI)', ['doc.hazard_log'], ['criticality']],
    ['SW.3', 'Level-of-rigour tasks are done for each criticality', ['doc.verification', 'tests.present', 'ci.tests']],
    ['SW.4', 'Software safety requirements trace to tests', [direct('doc.verification'), 'doc.requirements']],
    ['SW.5', 'Software changes are assessed for safety impact', ['doc.changelog'], ['change_control']],
  ];
  return {
    id: 'mil882e',
    name: 'MIL-STD-882E, standard practice for system safety',
    short: 'MIL-STD-882E',
    lens: 'Defence system safety',
    scale: 'safety',
    licence: 'Free (US Department of Defense); task numbers and paraphrased titles',
    source: 'MIL-STD-882E (2012, with change 1)',
    note: 'Software system safety items (SW.n) summarise section 4.4 with CrossCheck IDs.',
    claim: ['System safety tasks not met', 'Met with conditions', 'System safety tasks met'],
    items: [
      ...T.flatMap(([g, gname, tasks]) =>
        tasks.map(([id, title, checks, facts, weight, outWhy]) => ({
          id: `T${id}`,
          group: `T${g}`,
          groupName: `Task ${g}-series · ${gname}`,
          title,
          checks: checks || [],
          facts: facts || [],
          ...(weight ? { weight } : {}),
          ...(outWhy ? { out: true, outWhy } : {}),
        })),
      ),
      ...sw.map(([id, title, checks, facts, weight]) => ({
        id,
        group: 'SW',
        groupName: 'Software system safety (section 4.4)',
        title,
        checks,
        facts: facts || [],
        ...(weight ? { weight } : {}),
      })),
    ],
  };
}

/** Every catalogue, in library order. */
export function buildCatalogues() {
  return [asvs(), ed153(), iso42001(), ssdf(), ismE8(), iso27001(), mil882e()];
}

function main() {
  const check = process.argv.includes('--check');
  const cats = buildCatalogues();
  let stale = 0;
  fs.mkdirSync(out, { recursive: true });
  for (const c of cats) {
    const file = path.join(out, `${c.id}.json`);
    const text = `${JSON.stringify(c, null, 1)}\n`;
    const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (was === text) continue;
    stale += 1;
    if (check) console.error(`stale: ${path.relative(root, file)}`);
    else fs.writeFileSync(file, text);
  }
  if (check && stale) process.exit(1);
  console.log(`${cats.length} catalogues, ${cats.reduce((n, c) => n + c.items.length, 0)} items${check ? '' : ` (${stale} written)`}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
