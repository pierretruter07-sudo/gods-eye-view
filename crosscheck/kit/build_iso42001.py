"""ISO/IEC 42001:2023 (AI management systems) catalogue for CrossCheck.

ISO text is copyrighted: only clause and control NUMBERS with short
paraphrased titles are recorded here. Confirm against the purchased standard
before any formal claim. Writes iso42001.json.
"""
import json, os

CLAUSES = [
    ('4', 'Context', [
        ('4.1', 'Organisation and its context'),
        ('4.2', 'Interested parties and their needs'),
        ('4.3', 'Scope of the AI management system'),
        ('4.4', 'AI management system established'),
    ]),
    ('5', 'Leadership', [
        ('5.1', 'Leadership and commitment'),
        ('5.2', 'AI policy'),
        ('5.3', 'Roles, responsibilities and authorities'),
    ]),
    ('6', 'Planning', [
        ('6.1.1', 'Actions on AI risks and opportunities'),
        ('6.1.2', 'AI risk assessment'),
        ('6.1.3', 'AI risk treatment'),
        ('6.1.4', 'AI system impact assessment'),
        ('6.2', 'AI objectives and plans'),
        ('6.3', 'Planning of changes'),
    ]),
    ('7', 'Support', [
        ('7.1', 'Resources'),
        ('7.2', 'Competence'),
        ('7.3', 'Awareness'),
        ('7.4', 'Communication'),
        ('7.5', 'Documented information'),
    ]),
    ('8', 'Operation', [
        ('8.1', 'Operational planning and control'),
        ('8.2', 'AI risk assessment in operation'),
        ('8.3', 'AI risk treatment in operation'),
        ('8.4', 'AI system impact assessment in operation'),
    ]),
    ('9', 'Performance evaluation', [
        ('9.1', 'Monitoring, measurement and evaluation'),
        ('9.2', 'Internal audit'),
        ('9.3', 'Management review'),
    ]),
    ('10', 'Improvement', [
        ('10.1', 'Continual improvement'),
        ('10.2', 'Nonconformity and corrective action'),
    ]),
]
ANNEX = [
    ('A.2', 'Policies for AI', [
        ('A.2.2', 'AI policy'),
        ('A.2.3', 'Alignment with other policies'),
        ('A.2.4', 'Review of the AI policy'),
    ]),
    ('A.3', 'Internal organisation', [
        ('A.3.2', 'AI roles and responsibilities'),
        ('A.3.3', 'Reporting of concerns'),
    ]),
    ('A.4', 'Resources for AI systems', [
        ('A.4.2', 'Resource documentation'),
        ('A.4.3', 'Data resources'),
        ('A.4.4', 'Tooling resources'),
        ('A.4.5', 'System and computing resources'),
        ('A.4.6', 'Human resources'),
    ]),
    ('A.5', 'Impact assessment', [
        ('A.5.2', 'Impact assessment process'),
        ('A.5.3', 'Documented impact assessments'),
        ('A.5.4', 'Impacts on individuals and groups'),
        ('A.5.5', 'Societal impacts'),
    ]),
    ('A.6', 'AI system life cycle', [
        ('A.6.1.2', 'Objectives for responsible development'),
        ('A.6.1.3', 'Responsible design and development processes'),
        ('A.6.2.2', 'Requirements and specification'),
        ('A.6.2.3', 'Design and development documentation'),
        ('A.6.2.4', 'Verification and validation'),
        ('A.6.2.5', 'Deployment'),
        ('A.6.2.6', 'Operation and monitoring'),
        ('A.6.2.7', 'Technical documentation'),
        ('A.6.2.8', 'Event logs'),
    ]),
    ('A.7', 'Data for AI systems', [
        ('A.7.2', 'Data for development and enhancement'),
        ('A.7.3', 'Acquisition of data'),
        ('A.7.4', 'Data quality'),
        ('A.7.5', 'Data provenance'),
        ('A.7.6', 'Data preparation'),
    ]),
    ('A.8', 'Information for interested parties', [
        ('A.8.2', 'Documentation and information for users'),
        ('A.8.3', 'External reporting'),
        ('A.8.4', 'Communication of incidents'),
        ('A.8.5', 'Information for interested parties'),
    ]),
    ('A.9', 'Use of AI systems', [
        ('A.9.2', 'Processes for responsible use'),
        ('A.9.3', 'Objectives for responsible use'),
        ('A.9.4', 'Intended use'),
    ]),
    ('A.10', 'Third parties and customers', [
        ('A.10.2', 'Allocation of responsibilities'),
        ('A.10.3', 'Suppliers'),
        ('A.10.4', 'Customers'),
    ]),
]

items = []
for part, groups in (('clause', CLAUSES), ('control', ANNEX)):
    for key, name, rows in groups:
        for cid, title in rows:
            # Clause ids carry a C prefix ("C4.3") so they never read as an
            # ED-153 objective number; Annex A ids are already unique.
            items.append({'id': cid if part == 'control' else f'C{cid}', 'kind': part,
                          'group': key if part == 'control' else f'C{key}', 'groupName': name, 'title': title})
assert len([i for i in items if i['kind'] == 'control']) == 38
assert len({i['id'] for i in items}) == len(items)
here = os.path.dirname(os.path.abspath(__file__))
json.dump(items, open(f'{here}/iso42001.json', 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items;', sum(i['kind'] == 'control' for i in items), 'Annex A controls')
