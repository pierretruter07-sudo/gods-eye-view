"""CrossCheck ratings of God's Eye View against ISO/IEC 42001:2023.

Scope assessed (stated in the seed as aiScope): God's Eye View as an
AI-enabled product of Digital Dynamics Group —
  * automated decision support: the Director picks, ranks and announces
    incidents; triage scoring; flight-phase inference;
  * synthetic speech narration of those lines;
  * AI-generated code and documents (Claude, Replit Agent);
  * the planned HENRI language-model commentator.
GEV trains no models. Ratings use CrossCheck statuses C/L/P/N/NA and the
security severity scale (SC/SH/SM/SL); High findings block a conformity claim.
Each value: (status, severity or None, evidence, fix).
"""

SCOPE = ('God’s Eye View as an AI-enabled product: automated decision support (Director selection and '
         'announcements, triage scoring, phase inference), synthetic narration, AI-generated code and documents '
         '(Claude, Replit Agent) and the planned HENRI language-model commentator. No models are trained.')

RATINGS = {
    # ── Clauses 4–10: the management system ─────────────────────────────
    '4.1': ('N', 'SM', 'No analysis of the organisation’s context for AI (purpose, climate, legal and contractual factors).',
            'Write the AI context statement as part of the AIMS manual.'),
    '4.2': ('N', 'SM', 'Interested parties (operators, customer, regulators, people under surveillance) and their AI expectations are not listed.',
            'Register interested parties and their requirements.'),
    '4.3': ('N', 'SH', 'No defined scope for an AI management system: which AI uses (Director, narration, AI coding, HENRI) are covered is undecided.',
            'Define and document the AIMS scope and its boundaries.'),
    '4.4': ('N', 'SM', 'No AI management system exists.',
            'Establish the AIMS: manual, processes and their interactions.'),
    '5.1': ('P', 'SM', 'Owner approval of the remediation plan shows commitment, but no AI-specific leadership commitment is recorded.',
            'Record leadership commitment and resourcing for the AIMS.'),
    '5.2': ('N', 'SH', 'No AI policy.',
            'Issue an AI policy: purpose, advisory-only boundary, principles, commitments to requirements and improvement.'),
    '5.3': ('N', 'SM', 'No AI roles or authorities assigned.',
            'Assign AIMS owner, AI risk owner and approver roles.'),
    '6.1.1': ('N', 'SM', 'AI risks and opportunities are not planned for.',
              'Plan actions on AI risks and opportunities in the AIMS.'),
    '6.1.2': ('N', 'SH', 'No AI risk assessment (e.g. a wrong automated announcement, misleading narration, unreviewed AI-written code).',
              'Run and document an AI risk assessment with criteria.'),
    '6.1.3': ('P', 'SM', 'The CrossCheck remediation plan treats safety and security risks; AI-specific risks have no treatment plan.',
              'Add AI risk treatment and a statement of applicability for Annex A.'),
    '6.1.4': ('N', 'SH', 'No AI system impact assessment for the people and groups affected by the display and its announcements.',
              'Assess and document impacts on individuals, groups and society.'),
    '6.2': ('N', 'SM', 'No measurable AI objectives.', 'Set AI objectives with measures and owners.'),
    '6.3': ('P', 'SL', 'Changes are tracked (changelog, configuration index, evidence ledger) but not assessed for AI effects.',
            'Add an AI impact check to change planning.'),
    '7.1': ('P', 'SL', 'Engineering resources exist; none allocated to the AIMS.', 'Allocate AIMS resources.'),
    '7.2': ('N', 'SL', 'AI competence of the people building and using the system is not defined or evidenced.',
            'Define AI competence needs and keep training records.'),
    '7.3': ('N', 'SL', 'No AI awareness for staff (policy, their contribution, consequences of non-conformity).',
            'Brief everyone working on the system on the AI policy.'),
    '7.4': ('N', 'SL', 'No AI communication plan.', 'Decide what is communicated about AI, to whom and when.'),
    '7.5': ('L', 'SL', 'Controlled documents exist (requirements, verification, configuration index, evidence ledger).',
            'Bring AIMS records under the same control.'),
    '8.1': ('P', 'SM', 'CI gates and traceability control the build, but AI-specific operational controls are not defined.',
            'Define operational controls for AI features and AI-assisted development.'),
    '8.2': ('N', 'SM', 'AI risk assessments are not performed at planned intervals.', 'Schedule AI risk reassessment.'),
    '8.3': ('N', 'SM', 'No AI risk treatment in operation.', 'Implement and track AI risk treatment.'),
    '8.4': ('N', 'SM', 'Impact assessments are not repeated on change.', 'Repeat impact assessment on significant change.'),
    '9.1': ('N', 'SM', 'AI performance (announcement accuracy, false alerts, feed staleness) is not measured.',
            'Define and collect AI performance measures.'),
    '9.2': ('P', 'SM', 'The CrossCheck audit is an internal audit, but there is no AIMS audit programme.',
            'Plan internal AIMS audits; keep CrossCheck as the method.'),
    '9.3': ('N', 'SL', 'No management review of AI.', 'Hold and minute AIMS management reviews.'),
    '10.1': ('P', 'SL', 'The audit-to-compliance pipeline shows continual improvement for safety and security.',
             'Extend it to the AIMS.'),
    '10.2': ('P', 'SM', 'Findings are tracked to closure in the evidence ledger; no AI nonconformity process.',
             'Handle AI nonconformities through the same ledger.'),

    # ── Annex A controls ──────────────────────────────────────────────────
    'A.2.2': ('N', 'SH', 'No documented AI policy.', 'Issue the AI policy (shared with clause 5.2).'),
    'A.2.3': ('N', 'SL', 'AI policy alignment with security, privacy and ethics rules not shown.',
              'Map the AI policy to existing policies.'),
    'A.2.4': ('N', 'SL', 'No review cycle for an AI policy.', 'Review the AI policy at planned intervals.'),
    'A.3.2': ('N', 'SM', 'Nobody is accountable for AI decisions in the product.', 'Name AI roles (shared with 5.3).'),
    'A.3.3': ('P', 'SM', 'SECURITY.md gives a vulnerability route; there is no route for AI concerns.',
              'Add an AI concern reporting route.'),
    'A.4.2': ('P', 'SM', 'Dependencies and configuration are documented; AI components are not identified as such.',
              'Document AI resources in an AI system inventory.'),
    'A.4.3': ('L', 'SL', 'Every feed is listed with licence and commercial-use flag (DATA_SOURCES.md).',
              'Add data-quality notes per feed used for automated decisions.'),
    'A.4.4': ('P', 'SM', 'AI coding tools (Claude, Replit Agent) are visible in commit trailers but not documented as tooling with versions and limits.',
              'Document AI tooling, versions and permitted use.'),
    'A.4.5': ('P', 'SL', 'Hosting is known (Replit) but computing resources for AI features are not documented.',
              'Document system and computing resources.'),
    'A.4.6': ('N', 'SL', 'Human resources and competence for AI are not documented.', 'Record people, roles and competence.'),
    'A.5.2': ('N', 'SH', 'No process to assess the impact of AI features (shared with 6.1.4).',
              'Define the impact assessment process.'),
    'A.5.3': ('N', 'SM', 'No impact assessments on record.', 'Keep impact assessments as documented information.'),
    'A.5.4': ('P', 'SM', 'Principles exist (no person dossiers, generic ownership, SIMULATED labels) but impacts on individuals are not assessed.',
              'Assess impacts on individuals and groups, building on the existing guardrails.'),
    'A.5.5': ('N', 'SM', 'Societal effects of a public military-asset picture with automated announcements are not assessed.',
              'Assess societal and dual-use impacts.'),
    'A.6.1.2': ('P', 'SM', 'Ethics guardrails are stated in the README (non-kinetic, no dossiers, FEED/SIMULATED tags) but not as formal objectives.',
                'Turn the guardrails into responsible-development objectives.'),
    'A.6.1.3': ('P', 'SM', 'CI gates and traceability apply to all code; AI-generated changes have no specific review rule.',
                'Require human review and tests for AI-generated changes.'),
    'A.6.2.2': ('L', 'SL', 'Director and intel behaviour are specified (GEV-DIR-*, GEV-INT-*).',
                'Add AI-specific requirements (accuracy, disclosure, override).'),
    'A.6.2.3': ('L', 'SL', 'Architecture and decisions are documented.', 'Record design decisions for AI features.'),
    'A.6.2.4': ('P', 'SM', 'Director rules are unit-tested; no validation that announcements are accurate and useful.',
                'Validate announcements against feeds and with users.'),
    'A.6.2.5': ('P', 'SM', 'Deployed to Replit without release criteria for AI features.', 'Define AI release criteria.'),
    'A.6.2.6': ('N', 'SM', 'AI features are not monitored in operation (false or missed announcements, stale feeds).',
                'Monitor AI features in operation (shared with feed-health telemetry).'),
    'A.6.2.7': ('L', 'SL', 'Technical documentation exists (architecture, requirements, verification).',
                'Add an AI system card.'),
    'A.6.2.8': ('N', 'SM', 'No event logs of what the Director announced and why.',
                'Log automated selections and announcements with their inputs.'),
    'A.7.2': ('NA', None, 'No model is trained or fine-tuned; decision rules use live feed values only.',
              'Revisit when HENRI or any learned model is added.'),
    'A.7.3': ('L', 'SL', 'Feed data is acquired from documented sources under recorded terms.',
              'Note acquisition terms that restrict automated use.'),
    'A.7.4': ('P', 'SM', 'Records are validated and stale data is flagged, but data-quality requirements for automated decisions are not set.',
              'Set data-quality requirements for decision inputs.'),
    'A.7.5': ('L', 'SL', 'Provenance is shown in the app (FEED tags, source chips) and in the data-source register.',
              'Keep provenance for every announced fact.'),
    'A.7.6': ('L', 'SL', 'Normalisation and admission rules are coded and tested.', 'Document data preparation steps.'),
    'A.8.2': ('P', 'SM', 'FEED/SIMULATED labels and known limitations exist, but users are not told selections and narration are automated, and the package still advertises voice control that is not shipped.',
              'Disclose automated selection and synthetic narration; correct the package description.'),
    'A.8.3': ('N', 'SL', 'No external reporting obligations identified for AI.', 'Identify external reporting duties.'),
    'A.8.4': ('N', 'SM', 'No plan to communicate AI incidents to users or customers.', 'Define AI incident communication.'),
    'A.8.5': ('P', 'SL', 'README and runbook inform some parties; no plan for others.', 'Plan information for interested parties.'),
    'A.9.2': ('P', 'SM', 'The Director is advisory and any input hands control back, but responsible-use processes are not documented.',
              'Document responsible-use processes for operators.'),
    'A.9.3': ('N', 'SL', 'No objectives for responsible use.', 'Set responsible-use objectives.'),
    'A.9.4': ('P', 'SH', 'The advisory-only, non-kinetic boundary is stated, but there is no formal intended-use statement with prohibited uses.',
              'Publish an intended-use statement, including prohibited uses.'),
    'A.10.2': ('N', 'SM', 'Responsibilities between Digital Dynamics Group, AI suppliers and customers are not allocated.',
               'Allocate AI responsibilities in contracts and the AIMS.'),
    'A.10.3': ('N', 'SH', 'AI suppliers (AI coding agents, a future HENRI model provider) are not assessed or managed.',
               'Assess and register AI suppliers; set terms for data and model use.'),
    'A.10.4': ('P', 'SM', 'Customer-facing limitations exist; AI-specific customer obligations are not defined.',
               'Define customer AI obligations and expectations.'),
}

# Planned end state with Claude + Replit + owner actions (scenario A). Items
# that need people (leadership, management review, competence, independent
# audit, user validation) stop short; scenario B closes them.
A_END = {'5.1': 'L', '9.2': 'P', '9.3': 'P', '7.2': 'P', 'A.4.6': 'P', 'A.6.2.4': 'L', '4.2': 'L',
         'A.5.5': 'L', 'A.8.3': 'L'}
HUMAN = {'9.3': 'Management review by leadership', '9.2': 'Independent AIMS internal audit',
         '7.2': 'Competence evidence for the team', 'A.4.6': 'Human resources and competence records'}


def cid(k):
    """Catalogue id for a ratings key: clauses get the C prefix."""
    return k if k.startswith('A.') else f'C{k}'


RATINGS = {cid(k): v for k, v in RATINGS.items()}
A_END = {cid(k): v for k, v in A_END.items()}
HUMAN = {cid(k): v for k, v in HUMAN.items()}


def rate(catalogue):
    """Ratings keyed by id, in the seed's {status, severity, evidence, note} shape."""
    ids = {c['id'] for c in catalogue}
    assert set(RATINGS) == ids, sorted(ids ^ set(RATINGS))
    out = {}
    for cid, (status, sev, evidence, fix) in RATINGS.items():
        r = {'status': status, 'evidence': evidence, 'note': fix}
        if sev and status in ('P', 'N'):
            r['severity'] = sev
        out[cid] = r
    return out
