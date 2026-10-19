"""Build the God's Eye View evidence ledger and remediation plan from CrossCheck data.

Single source of truth: docs/evidence/ledger.json in the GEV repo.
Outputs (repo-relative): docs/evidence/ledger.json, docs/REMEDIATION-PLAN.md
Usage: python3 build_ledger.py <repo-root>
"""
import json, sys, re, os

KIT = os.path.dirname(os.path.abspath(__file__))
REPO = sys.argv[1]
seed = json.load(open(f'{KIT}/gev-seed.crosscheck.json'))
cat = {o['id']: o for o in json.load(open(f'{KIT}/catalogue.ui.json'))}
asvs = {x['id']: x for x in json.load(open(f'{KIT}/asvs.json'))}
iso = {x['id']: x for x in json.load(open(f'{KIT}/iso42001.json'))}
sys.path.insert(0, KIT)
import gev_iso42001  # noqa: E402  (ISO 42001 ratings, targets, human-only steps)

SEVLABEL = {'S1': 'S1', 'S2': 'S2', 'S3': 'S3', 'S4': 'S4', 'SC': 'Critical', 'SH': 'High', 'SM': 'Medium', 'SL': 'Low'}
STATUS = {'C': 'Compliant', 'L': 'Largely', 'P': 'Partial', 'N': 'Non-compliant', 'NA': 'Not applicable'}
SCORE = {'C': 1, 'L': 0.75, 'P': 0.4, 'N': 0}
ins = lambda c: c in ('R', 'I', 'R (I?)')

WAVES = [
    {'id': 1, 'name': 'Harden', 'who': 'Engineering', 'effort': '1 week', 'exit': 'Every Wave 1 security finding closed except V8; re-audit',
     'fixes': 'Locks down the front end and the proxies: security headers and a strict script policy, rate limits on paid services, dependency scanning, secret hygiene, structured logs and input rules.',
     'unlocks': 'A hardened base, so company sign-in can be added in Wave 2 without building on holes.'},
    {'id': 2, 'name': 'Control access', 'who': 'Engineering + customer identity provider', 'effort': '1 week', 'exit': 'ASVS Level 2 met; AI policy, AIMS scope and intended use issued; re-audit',
     'fixes': 'Adds company sign-in and roles (viewer, operator, admin), so only known people reach live data, paid services and Exercise mode. Sets up the AI management system: scope, AI policy, roles, intended use and an AI supplier register.',
     'unlocks': 'Every user known and every action attributable, so the Wave 3 safety work can be written against real roles and real use.'},
    {'id': 3, 'name': 'Prove safety', 'who': 'Safety lead, engineering, customer', 'effort': '2–3 weeks', 'exit': 'No S1–S2 safety or High AI finding open',
     'fixes': 'Writes the safety evidence: hazard log, failure modes and their effects, a safety level per failure, the safety plan, requirements and verification, and feed-health monitoring. Assesses AI risks and impacts (wrong or missed announcements, effects on the people shown) and logs what the Director announces.',
     'unlocks': 'A safety argument with evidence behind it, and AI risks and impacts on record, ready for Wave 4 to review and hand over.'},
    {'id': 4, 'name': 'Assure and hand over', 'who': 'Safety lead, independent reviewer', 'effort': '1 week', 'exit': 'SWAL 3 claim supported; first AIMS internal audit done; evidence pack issued',
     'fixes': 'Builds the safety case and safety folder, issues the release evidence pack, and runs the first AI management system internal audit.',
     'unlocks': 'Only steps that need people remain: validation with operational users, an independent process audit and the AI management review.'},
]
SIGNOFF = {'name': 'Sign-off', 'who': 'Customer and independent reviewer',
           'fixes': 'The customer validates the system with operational users, an independent reviewer audits the process, and leadership holds the AI management review.',
           'unlocks': 'SWAL 3 claim supported, ASVS Level 2 met and ISO 42001 met: ready for formal assessment and certification.'}

WS = [
    ('W1', 'Web hardening', 1,
     ['Security headers on every response: HSTS, nosniff, Referrer-Policy and a Content-Security-Policy with script-src.',
      'Inline HTML templates moved so the policy can drop unsafe-inline.',
      'Debug handle (window.__godsEyeView, ?fps) gated out of production builds.'],
     'Header tests in the preview-serving suite; a browser-captured policy report.',
     ['V3.2.1', 'V3.4.1', 'V3.4.3', 'V3.4.4', 'V3.4.5', 'V13.4.5']),
    ('W2', 'Abuse resistance and availability', 1,
     ['Rate limiting on by default for every cost-bearing proxy, with global caps.',
      'Client IP taken from the forwarded header only when the request comes through the known proxy hop.',
      'Heavy endpoints and resource budgets (frame time, memory, latency) documented.'],
     'Limiter tests; a load test against the deployed app.',
     ['V2.4.1', 'V2.3.2', 'V15.3.4', 'V2.1.3', 'V15.1.3', '4.3.13']),
    ('W3', 'Supply chain and secrets', 1,
     ['npm audit and Dependabot in CI; CI fails on High or Critical.',
      'CycloneDX software bill of materials (SBOM) for each release; patch time limits in SECURITY.md.',
      'COTS dossiers: CesiumJS, satellite.js, Node, browsers, Replit, each data feed.',
      'Browser keys restricted by referrer and API (owner action); secrets in a managed store with rotation.'],
     'CI logs; SBOM file; dossiers; console screenshots.',
     ['V15.2.1', 'V15.1.1', 'V15.1.2', 'V13.3.1', 'V13.3.2', 'V13.2.5', '3.0.13', '7.x COTS', '7.x SE', '4.3.10']),
    ('W4', 'Logging and monitoring', 1,
     ['Structured JSON logs with UTC timestamps and request IDs; untrusted values encoded.',
      'Security events logged: rate-limit hits, validation rejects.',
      'Log inventory; logs forwarded to a separate store with alerting (Wave 2).',
      'Feed-health telemetry mapped to the SWAL monitoring objective.'],
     'Logger tests; log inventory; an alert fired in test.',
     ['V16.1.1', 'V16.3.3', 'V16.4.3', 'V16.2.1', 'V16.2.2', 'V16.2.4', 'V16.4.1', 'V16.4.2', '3.0.11', '4.4.5', '4.4.4']),
    ('W5', 'Access control', 2,
     ['Sign-in through an external identity provider (OIDC); roles viewer, operator, admin.',
      'Server-side checks on every function; paid proxies need operator; Exercise mode needs an explicit role.',
      'Session timeout and logout; authorization model documented.'],
     'Access-control test matrix (role × endpoint); CrossCheck assessment of the new V6, V7, V9 and V10 rows.',
     ['V8.1.1', 'V8.2.1']),
    ('W6', 'Data and validation rules', 1,
     ['Input-validation specification per API endpoint: types, ranges, lengths, combined-field rules.',
      'Data classification (public, aggregated-sensitive, simulated) with handling rules for caching, export and retention.'],
     'Both documents, each validation rule traced to an existing test.',
     ['V2.1.1', 'V2.1.2', 'V14.1.1', 'V14.1.2']),
    ('W7', 'Safety analysis', 3,
     ['Concept of operations: users, environment, advisory-only boundary.',
      'Functional hazard assessment: failure modes per component, effects on the operator, justified likelihood.',
      'SWAL allocation per failure; preliminary system safety assessment.',
      'Safety requirements (GEV-SAF tier) traced into the SRS.'],
     'Versioned analysis documents reviewed with the customer.',
     ['3.1.2', '3.1.5', '4.1.2', '3.3.1', '3.3.2', '3.3.3', '3.0.5', '3.3.5', '4.1.3', '3.3.4']),
    ('W8', 'Safety plan, process and configuration management', 3,
     ['Software safety assessment plan: approach, rigour per SWAL, I/R/D classification, named reviewer sign-off.',
      'Development plan with an AI-assistance policy: no tool credit, human review of every AI change.',
      'Configuration management plan: protected main, reviews, tagged releases, CI-built artifact with build stamp, tested rollback.',
      'Change-impact template; requirement change control through issues; QA role and audits.',
      'Problem-report process (known limitations logged as issues); operations and maintenance plans; training records.'],
     'Approved plans; repository settings evidence; release records.',
     ['3.0.1', '3.2.1', '3.2.2', '3.2.3', '3.2.4', '3.0.8', '3.0.9', '3.4.3', '4.2.4', '4.3.3', '4.3.11', '3.0.7', '5.2.1', '5.2.3', '5.2.x',
      '5.4.13', '3.0.12', '3.0.15', '4.4.1', '4.5.1', '4.5.2', '4.5.3', '5.3.x', '5.8.x', '6.1.x', '6.2.x', '6.3.x', '6.4.x', '7.x DE']),
    ('W9', 'Requirements, verification and validation', 3,
     ['Reviewed and approved SRS covering the inherited layer engine; traceability widened from 56 requirements.',
      'Dead-code review (remove /api/route); isolation argument per first-level component.',
      'Integration tests at every component boundary; feed-integrity and outage tests.',
      'Architecture review record; verification report; validation with operational users; joint reviews; user guide.'],
     'Review records, test reports, validation minutes.',
     ['3.0.2', '3.0.3', '3.0.4', '3.0.14', '4.3.1', '4.3.4', '4.3.7', '4.3.14', '3.4.2', '5.4.3', '5.4.4', '5.4.5', '5.4.9', '5.4.12', '3.4.1',
      '5.5.x', '5.6.x', '4.4.3']),
    ('W10', 'Safety case and release evidence', 4,
     ['Software safety assessment report with a GSN-style argument (direct and back-up).',
      'Software safety folder; assessment report and distribution record per release; independent audit.'],
     'Issued safety folder and independent audit report.',
     ['3.0.10', '3.0.17', '3.4.4', '3.5.1', '3.5.3', '5.7.2–5.7.4', '8']),
    ('W11', 'AI management system', 2,
     ['AIMS scope and manual: which AI uses are covered (Director, narration, AI-assisted development, HENRI).',
      'AI policy with the advisory-only boundary and principles; roles (AIMS owner, AI risk owner); objectives.',
      'Intended-use statement with prohibited uses; in-app disclosure of automated selection and synthetic narration; package description corrected.',
      'AI supplier register (coding agents, future model provider) with data and model-use terms; customer obligations.',
      'AI tooling documented; human review and tests required for every AI-generated change.'],
     'Issued AIMS manual, policy, intended-use statement and supplier register; disclosure visible in the app.',
     ['C4.1', 'C4.2', 'C4.3', 'C4.4', 'C5.1', 'C5.2', 'C5.3', 'C6.2', 'C6.3', 'C7.1', 'C7.2', 'C7.3', 'C7.4', 'A.2.2', 'A.2.3', 'A.2.4',
      'A.3.2', 'A.3.3', 'A.4.2', 'A.4.4', 'A.4.5', 'A.4.6', 'A.6.1.2', 'A.6.1.3', 'A.8.2', 'A.8.3', 'A.8.5', 'A.9.2', 'A.9.3', 'A.9.4',
      'A.10.2', 'A.10.3', 'A.10.4']),
    ('W12', 'AI risk, impact and monitoring', 3,
     ['AI risk assessment and treatment with a statement of applicability for Annex A.',
      'Impact assessments: individuals and groups, societal and dual-use effects of a public military-asset picture.',
      'Event log of every automated selection and announcement with its inputs; AI performance measures (false and missed announcements).',
      'Validation of announcements against feeds and with users; AI release criteria; AI incident communication.'],
     'Risk register, impact assessments, event-log samples, validation record.',
     ['C6.1.1', 'C6.1.2', 'C6.1.3', 'C6.1.4', 'C8.1', 'C8.2', 'C8.3', 'C8.4', 'C9.1', 'C10.2', 'A.5.2', 'A.5.3', 'A.5.4', 'A.5.5',
      'A.6.2.4', 'A.6.2.5', 'A.6.2.6', 'A.6.2.8', 'A.7.4', 'A.8.4']),
    ('W13', 'AIMS audit and review', 4,
     ['AIMS internal audit programme (CrossCheck as the method, an independent auditor for sign-off).',
      'Management review minutes; continual-improvement log in the evidence ledger.'],
     'Audit report and management-review minutes.',
     ['C9.2', 'C9.3', 'C10.1']),
]

BASE = {'branch': 'baseline/crosscheck-2026-10-14', 'commit': '1518ea8', 'date': '2026-10-14'}
# ISO 42001 was added a day later and assessed against main at that time
# (frozen as its own baseline branch); its findings start from there.
AI_BASE = {'branch': 'baseline/iso42001-2026-10-15', 'commit': 'eeadc22', 'date': '2026-10-15'}


def rollup():
    def calc(items):
        sc = n = 0; c = {'C': 0, 'L': 0, 'P': 0, 'N': 0, 'NA': 0}
        for s in items:
            c[s] += 1
            if s in SCORE: sc += SCORE[s]; n += 1
        return c, round(sc / n, 4) if n else 0
    ed = [r.get('status') for k, r in seed['ratings'].items() if ins(cat[k]['swal'].get('3', '-')) and r.get('status')]
    sec = [r.get('status') for k, r in seed['sec'].items() if asvs[k]['L'] <= 2 and r.get('status')]
    ai = [r.get('status') for k, r in seed['ai'].items() if r.get('status')]
    return calc(ed), calc(sec), calc(ai)


def finding(fid, ws, wave):
    if fid in iso:
        r = seed['ai'][fid]; lens = 'ISO42001'; x = iso[fid]
        title = x['title']; area = f"{x['group']} {x['groupName']}"
        sev = r.get('severity') or ('SH' if r['status'] == 'N' else 'SM')
    elif fid in asvs:
        r = seed['sec'][fid]; lens = 'ASVS'; x = asvs[fid]
        title = x['text']; area = f"{x['ch']} {x['chName']}"
        sev = r.get('severity') or ('SH' if r['status'] == 'N' else 'SM')
    else:
        r = seed['ratings'][fid]; lens = 'ED-153'; o = cat[fid]
        title = o['title']; area = o['area']
        sev = r.get('severity') or ('S2' if r['status'] == 'N' else 'S3')
    return {
        'id': fid, 'lens': lens, 'title': title, 'area': area, 'workstream': ws, 'wave': wave,
        'blocking': sev in ('S1', 'S2', 'SC', 'SH'),
        'baseline': {'status': r['status'], 'severity': sev, 'evidence': r.get('evidence', '')},
        'fix': r.get('note', ''),
        'current': {'status': r['status'], 'severity': sev},
        # Planned end state with Claude + Replit + owner actions (scenario A).
        'target': (gev_iso42001.A_END if fid in iso else A_END).get(fid, 'C'),
        # End state with the customer and an independent reviewer (scenario B).
        'targetFull': FULL_END.get(fid, 'C'),
        'history': [{'date': (AI_BASE if fid in iso else BASE)['date'], 'event': 'rated', 'audit': 'A0', 'status': r['status'], 'severity': sev,
                     'ref': f"baseline {(AI_BASE if fid in iso else BASE)['commit']}", 'note': r.get('evidence', '')}],
    }


(edc, edr), (sc, sr), (aic, air) = rollup()

# Projections: what each wave should achieve if every planned fix lands.
# Scenario A = Claude + Replit + owner actions; human-only steps end where noted.
A_END = {'3.2.3': 'L', '3.4.1': 'P', '3.4.3': 'P', '3.1.5': 'L', '4.1.2': 'L', '4.1.3': 'L', '3.3.1': 'L', '3.3.2': 'L', '3.3.3': 'L',
         '3.3.5': 'L', '3.0.5': 'L', '5.5.x': 'P', '5.6.x': 'P', '5.7.2–5.7.4': 'P', '6.4.x': 'L', '7.x SE': 'NA', '3.0.10': 'L',
         '3.0.17': 'L', '8': 'L', '3.4.4': 'L', '3.0.11': 'L', '3.1.2': 'L', '3.3.4': 'L', '3.0.2': 'L', '4.3.4': 'L', '3.2.4': 'L',
         '3.5.3': 'L', 'V13.3.2': 'L', 'V13.2.5': 'L', 'V16.4.2': 'L', 'V16.4.3': 'L', 'V13.3.1': 'L'}
HUMAN = {'3.4.1': 'Validation with operational users', '3.4.3': 'Process assurance by someone independent of the developers',
         '5.5.x': 'Validation with operational users', '5.6.x': 'Joint reviews with the customer', '5.7.2–5.7.4': 'Independent audit'}
# Items not yet rated because they depend on the host: rated in the wave
# shown, expected result conservative until a scan of the deployed app.
PENDING = [
    {'id': 'V4.1.2', 'wave': 1, 'workstream': 'W1', 'target': 'L',
     'why': 'Depends on the hosting edge: rate from a redirect scan of the deployed app.'},
    {'id': 'V12.1.1', 'wave': 1, 'workstream': 'W1', 'target': 'L',
     'why': 'Depends on the hosting edge: rate from a TLS scan of the deployed app.'},
    {'id': 'V12.1.2', 'wave': 1, 'workstream': 'W1', 'target': 'L',
     'why': 'Depends on the hosting edge: rate from a TLS scan of the deployed app.'},
]
FULL_END = {'7.x SE': 'NA'}
def project(max_wave, end):
    edv, scv = [], []
    wave_of = {fid: w[2] for w in WS for fid in w[5]}
    for k, r in seed['ratings'].items():
        if not ins(cat[k]['swal'].get('3', '-')) or not r.get('status'): continue
        st = r['status']
        if st in ('P', 'N') and wave_of.get(k, 9) <= max_wave: st = end.get(k, 'C')
        edv.append(st)
    for p in PENDING:
        if p['wave'] <= max_wave and not seed['sec'].get(p['id'], {}).get('status'): scv.append(p['target'])
    for k, r in seed['sec'].items():
        if asvs[k]['L'] > 2 or not r.get('status'): continue
        st = r['status']
        if st in ('P', 'N') and wave_of.get(k, 9) <= max_wave: st = end.get(k, 'C')
        scv.append(st)
    aiv = []
    ai_end = gev_iso42001.A_END if end is A_END else {}
    for k, r in seed['ai'].items():
        if not r.get('status'): continue
        st = r['status']
        if st in ('P', 'N') and wave_of.get(k, 9) <= max_wave: st = ai_end.get(k, 'C')
        aiv.append(st)
    sc_ = lambda v: round(sum(SCORE[x] for x in v if x in SCORE) / max(1, sum(x in SCORE for x in v)), 4)
    return sc_(edv), sc_(scv), sc_(aiv)
journey = [{'label': 'Baseline', 'safety': edr, 'security': sr, 'ai': air, 'kind': 'actual'}]
for w in WAVES:
    a, b, c = project(w['id'], A_END)
    journey.append({'label': f"After Wave {w['id']}", 'safety': a, 'security': b, 'ai': c, 'kind': 'target'})
bA = project(9, FULL_END)
projections = {
    'journey': journey,
    'scenarios': [
        {'id': 'A', 'label': 'Claude + Replit + owner actions', 'safety': journey[-1]['safety'], 'security': journey[-1]['security'],
         'ai': journey[-1]['ai'],
         'safety_verdict': 'Not yet supported: human-only steps remain open', 'security_verdict': 'ASVS Level 2 met',
         'ai_verdict': 'Met with conditions: management review and an independent AIMS audit remain open',
         'human_only': [{'id': k, 'why': v} for k, v in {**HUMAN, **gev_iso42001.HUMAN}.items()]},
        {'id': 'B', 'label': 'Plus customer and independent reviewer', 'safety': bA[0], 'security': bA[1], 'ai': bA[2],
         'safety_verdict': 'SWAL 3 claim supported, ready for independent assessment', 'security_verdict': 'ASVS Level 2 met',
         'ai_verdict': 'ISO 42001 conformity supported, ready for certification audit'},
    ],
    'note': 'Readiness = weighted score (Compliant 1, Largely 0.75, Partial 0.4, Non-compliant 0) over rated in-scope items. Verdicts follow the CrossCheck rules, not the score. New scope from sign-in (ASVS V6, V7, V9, V10) is assessed in Wave 2 and is not in these projections.',
}
findings = [finding(fid, ws[0], ws[2]) for ws in WS for fid in ws[5]]
_assigned = [fid for ws in WS for fid in ws[5]]
assert len(_assigned) == len(set(_assigned)), 'a finding is in two workstreams'
_open_ai = {k for k, r in seed['ai'].items() if r.get('status') in ('P', 'N')}
assert _open_ai == {f for f in _assigned if f in iso}, sorted(_open_ai ^ {f for f in _assigned if f in iso})
ed_f = [f for f in findings if f['lens'] == 'ED-153']; sec_f = [f for f in findings if f['lens'] == 'ASVS']
ai_f = [f for f in findings if f['lens'] == 'ISO42001']
ledger = {
    'schema': 1,
    'item': "God's Eye View",
    'repository': 'github.com/pierretruter07-sudo/gods-eye-view',
    'baseline': BASE,
    'standards': {'safety': 'EUROCAE ED-153 (CrossCheck reconstructed catalogue v0.1), SWAL 3',
                  'security': 'OWASP ASVS 5.0.0, Level 2',
                  'ai': 'ISO/IEC 42001:2023 AI management system (clause numbers and paraphrased titles; confirm against the standard)'},
    'aiBaseline': AI_BASE,
    'stages': [
        {'id': 'baseline', 'name': 'Baseline frozen', 'status': 'done', 'date': BASE['date'], 'ref': BASE['branch']},
        {'id': 'audit', 'name': 'Audit', 'status': 'done', 'date': BASE['date'], 'ref': 'CrossCheck assessment gev-example'},
        {'id': 'plan', 'name': 'Plan issued', 'status': 'done', 'date': '2026-10-14', 'ref': 'docs/REMEDIATION-PLAN.md v0.1'},
        {'id': 'approve', 'name': 'Plan approved', 'status': 'done', 'date': '2026-10-14', 'ref': 'Owner approval, Pierre Truter (Digital Dynamics Group), 14 Oct 2026 21:08 AEST'},
        {'id': 'wave1', 'name': 'Wave 1 · Harden', 'status': 'pending', 'date': None, 'ref': None},
        {'id': 'wave2', 'name': 'Wave 2 · Control access', 'status': 'pending', 'date': None, 'ref': None},
        {'id': 'wave3', 'name': 'Wave 3 · Prove safety', 'status': 'pending', 'date': None, 'ref': None},
        {'id': 'wave4', 'name': 'Wave 4 · Assure and hand over', 'status': 'pending', 'date': None, 'ref': None},
        {'id': 'evidence', 'name': 'Evidence pack issued', 'status': 'pending', 'date': None, 'ref': None},
    ],
    'audits': [{
        'id': 'A0', 'wave': 0, 'label': 'Baseline audit', 'date': BASE['date'], 'commit': BASE['commit'],
        'safety': {'readiness': edr, 'counts': edc, 'open': len(ed_f), 'blocking': sum(f['blocking'] for f in ed_f),
                   'verdict': 'SWAL 3 claim not supported'},
        'security': {'readiness': sr, 'counts': sc, 'open': len(sec_f), 'blocking': sum(f['blocking'] for f in sec_f),
                     'verdict': 'ASVS L2 not met'},
        'ai': {'readiness': air, 'counts': aic, 'open': len(ai_f), 'blocking': sum(f['blocking'] for f in ai_f),
               'verdict': 'ISO 42001 not met', 'date': AI_BASE['date'], 'commit': AI_BASE['commit'],
               'note': 'ISO 42001 lens added on 2026-10-15, assessed against main at eeadc22.'},
    }],
    'projections': projections,
    'pending': PENDING,
    'signoff': SIGNOFF,
    'waves': WAVES,
    'workstreams': [{'id': w[0], 'name': w[1], 'wave': w[2], 'deliverables': w[3], 'evidence': w[4], 'findings': w[5]} for w in WS],
    'findings': findings,
}
os.makedirs(f'{REPO}/docs/evidence', exist_ok=True)
ledger_new_ai = ledger['audits'][0]['ai']
# Append-only: keep any history and stage/audit records already in the ledger.
_path = f'{REPO}/docs/evidence/ledger.json'
if os.path.exists(_path):
    old = json.load(open(_path))
    prev = {f['id']: f for f in old.get('findings', [])}
    for f in ledger['findings']:
        p = prev.get(f['id'])
        if p:
            f['baseline'] = p['baseline']  # the baseline is frozen once recorded
        if p and len(p.get('history', [])) > 1:
            f['history'] = p['history']; f['current'] = p['current']
        for e in f['history']:
            if e.get('event') == 'rated': e.setdefault('audit', 'A0')
    if len(old.get('audits', [])) > 1:
        # Re-audits recorded: keep them, and keep the plan's projections as issued.
        ledger['audits'] = old['audits']
        ledger['projections'] = old['projections']
    rated = {x['id']: x.get('rated') for x in old.get('pending', [])}
    for x in ledger['pending']:
        if rated.get(x['id']): x['rated'] = rated[x['id']]
    for a in ledger['audits']:
        if a['id'] == 'A0':
            a.setdefault('wave', 0)
            a.setdefault('ai', ledger_new_ai)
    ostages = {s['id']: s for s in old.get('stages', [])}
    for s in ledger['stages']:
        o = ostages.get(s['id'])
        if o and o['status'] == 'done' and s['status'] != 'done': s.update(o)
json.dump(ledger, open(f'{REPO}/docs/evidence/ledger.json', 'w'), ensure_ascii=False, indent=1)

# Remediation plan markdown
def table(ids):
    by = {f['id']: f for f in findings}
    rows = ['| ID | Lens | Requirement | Status | Severity | Fix |', '|---|---|---|---|---|---|']
    for i in ids:
        f = by[i]; t = f['title']
        if f['lens'] == 'ASVS':
            t = t.replace('Verify that ', ''); t = t[0].upper() + t[1:]; t = t[:95] + '…' if len(t) > 96 else t
        rows.append(f"| {i} | {f['lens']} | {t.replace('|', '/')} | {STATUS[f['baseline']['status']]} | {SEVLABEL[f['baseline']['severity']]} | {f['fix'].replace('|', '/')} |")
    return '\n'.join(rows)

sec5 = []
for w in WS:
    n = len(w[5])
    sec5.append(f"### {w[0]} {w[1]} (Wave {w[2]})\n\n**Deliverables**\n\n" + '\n'.join(f'- {d}' for d in w[3]) +
                f"\n\n**Evidence:** {w[4]}\n\nCloses {n} finding{'s' if n != 1 else ''}:\n\n" + table(w[5]))
sec5.append('Out of scope at SWAL 3 but addressed anyway: **7.x Tool qualification**, covered by the AI-use policy in W8.')
t = open(f'{KIT}/plan.template.md').read().replace('{{WORKSTREAMS}}', '\n\n'.join(sec5))
assert '{{' not in t
open(f'{REPO}/docs/REMEDIATION-PLAN.md', 'w').write(t)

ids = [f['id'] for f in findings]
print(len(findings), 'findings;', len(set(ids)), 'unique; ED', len(ed_f), 'ASVS', len(sec_f),
      '; blocking', sum(f['blocking'] for f in findings), '; readiness', edr, sr)
