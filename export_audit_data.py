"""Export the CrossCheck assessment of God's Eye View for the in-app AUDIT view.
The seed is the frozen baseline; the evidence ledger's re-ratings are laid on
top, so the export is always the latest measured audit.
Usage: python3 export_audit_data.py <repo-root>"""
import json, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
REPO = sys.argv[1]
seed = json.load(open('gev-seed.crosscheck.json'))
cat = json.load(open('catalogue.ui.json'))
asvs = json.load(open('asvs.json'))
ins = lambda c: c in ('R', 'I', 'R (I?)')
items = []
for o in cat:
    code = o['swal'].get(str(seed['swal']), '–'); r = seed['ratings'].get(o['id'], {})
    st = r.get('status') or (None if ins(code) else 'NA')
    items.append({'id': o['id'], 'lens': 'saf', 'group': o['area'], 'groupName': o['area'], 'title': o['title'],
                  'status': st, 'sev': r.get('severity') if st in ('P', 'N') else None,
                  'evidence': r.get('evidence', ''), 'fix': r.get('note', ''), 'applicability': code})
for x in asvs:
    r = seed['sec'].get(x['id'], {}); out = x['L'] > seed['asvsLevel']
    st = r.get('status') or ('NA' if out else None)
    items.append({'id': x['id'], 'lens': 'sec', 'group': x['ch'], 'groupName': x['chName'], 'title': x['text'], 'level': x['L'],
                  'out': out, 'status': st, 'sev': r.get('severity') if st in ('P', 'N') else None,
                  'evidence': r.get('evidence', ''), 'fix': r.get('note', '')})
# Latest measured state from the evidence ledger (append-only history).
ledger_path = f'{REPO}/docs/evidence/ledger.json'
assessed = seed['updatedAt'][:10]
if os.path.exists(ledger_path):
    L = json.load(open(ledger_path))
    by = {i['id']: i for i in items}
    for f in L['findings']:
        cur = f.get('current') or {}
        it = by.get(f['id'])
        if it and cur.get('status') and cur['status'] != it['status']:
            it['status'] = cur['status']
            it['sev'] = cur.get('severity') if cur['status'] in ('P', 'N') else None
            last = f['history'][-1]
            if last.get('note'): it['evidence'] = last['note']
    for p in L.get('pending', []):
        r = p.get('rated'); it = by.get(p['id'])
        if r and it:
            it['status'] = r['status']; it['sev'] = r.get('severity') if r['status'] in ('P', 'N') else None
            if r.get('note'): it['evidence'] = r['note']
    assessed = L['audits'][-1]['date']
themes = [
 ['Requirements and documented rules', 'One specification can carry safety requirements and validation, access and data rules.', ['3.0.2', '3.3.4'], ['V2.1.1', 'V8.1.1', 'V14.1.1']],
 ['Operational environment and exposure', 'Who can reach the system, and through what.', ['3.1.2', '4.4.2'], ['V8.2.1', 'V3.4.3', 'V13.1.1']],
 ['Third-party and COTS components', 'Know what you ship, and patch it on a clock.', ['3.0.13', '7.x COTS'], ['V15.1.1', 'V15.1.2', 'V15.2.1']],
 ['Configuration and release integrity', 'Baselines, what is deployed, and nothing extra.', ['3.0.7', '5.2.2', '5.2.3'], ['V13.4.1', 'V15.1.2']],
 ['Unintended functions and attack surface', 'Functions nobody asked for are hazards and entry points.', ['3.0.4'], ['V15.2.3', 'V13.4.2', 'V13.4.5']],
 ['Resource use and availability', 'Load, memory, time response and abuse resistance.', ['4.3.13'], ['V15.1.3', 'V15.2.2', 'V2.4.1']],
 ['Input data integrity', 'Data entering the system is checked before anyone relies on it.', ['5.4.9'], ['V2.2.1', 'V1.2.1', 'V16.5.2']],
 ['In-service monitoring and logging', 'Detect degradation and attack in operation.', ['4.4.5', '3.0.11'], ['V16.1.1', 'V16.3.3', 'V16.4.3']],
 ['Problem reporting and remediation', 'Defects and vulnerabilities enter one tracked process.', ['5.8.x'], ['V15.1.1']],
 ['Development environment and secrets', 'Tools, build environment and the keys they hold.', ['7.x DE', '7.x TQ'], ['V13.3.1', 'V13.3.2']],
]
out = {
  'schema': 1,
  'item': "God's Eye View",
  'source': 'CrossCheck assessment gev-example (ED-153 reconstructed catalogue v0.1, OWASP ASVS 5.0.0)',
  'assessedAt': assessed,
  'swal': seed['swal'], 'asvsLevel': seed['asvsLevel'],
  'attribution': 'OWASP Application Security Verification Standard 5.0.0, © OWASP Foundation, CC BY-SA 4.0. ED-153 objectives reconstructed from public predecessors; confirm against ED-153 before any formal claim.',
  'themes': [{'name': t[0], 'why': t[1], 'saf': t[2], 'sec': t[3]} for t in themes],
  'items': items,
}
json.dump(out, open(f'{REPO}/src/audit/data/assessment.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(items), 'items')
