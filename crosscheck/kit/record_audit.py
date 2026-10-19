"""Record a CrossCheck re-audit of God's Eye View in the evidence ledger.

The ledger (docs/evidence/ledger.json) is append-only: every re-rating adds a
dated history entry naming the audit, the change and the evidence (commit or
test). The audit's readiness and verdicts are then computed by the same code
the AUDIT view uses (src/audit/model.js), so the record and the display agree.

Usage: python3 record_audit.py <repo-root> <reaudit.json>
reaudit.json:
  {"audit": {"id": "A1", "wave": 1, "label": "Wave 1 re-audit",
             "date": "2026-10-21", "commit": "abc1234"},
   "ratings": {"V3.4.3": {"status": "C", "ref": "abc1234 CSP header",
                          "note": "CSP with script-src 'self' on every response; test …"}},
   "stage": {"id": "wave1", "ref": "Wave 1 exit met"}}          (optional)
"""
import json, os, subprocess, sys

KIT = os.path.dirname(os.path.abspath(__file__))
REPO, SPEC = sys.argv[1], sys.argv[2]
LEDGER = f'{REPO}/docs/evidence/ledger.json'
STATUSES = {'C', 'L', 'P', 'N', 'NA'}

L = json.load(open(LEDGER))
spec = json.load(open(SPEC))
audit = spec['audit']
assert audit['id'] not in {a['id'] for a in L['audits']}, f"audit {audit['id']} already recorded"
assert isinstance(audit.get('wave'), int) and 0 < audit['wave'] <= len(L['waves']) + 1, 'audit.wave out of range'
for k in ('label', 'date', 'commit'):
    assert audit.get(k), f'audit.{k} is required'

findings = {f['id']: f for f in L['findings']}
pending = {p['id']: p for p in L.get('pending', [])}
changes = 0
for fid, r in spec['ratings'].items():
    st = r['status']
    assert st in STATUSES, f'{fid}: bad status {st}'
    assert r.get('ref'), f'{fid}: every re-rating needs evidence (ref)'
    sev = r.get('severity') if st in ('P', 'N') else None
    if fid in findings:
        f = findings[fid]
        prev = f['current']['status']
        if st in ('P', 'N') and not sev: sev = f['current'].get('severity')
        f['history'].append({'date': audit['date'], 'event': 'rerated', 'audit': audit['id'], 'from': prev,
                             'status': st, 'severity': sev, 'ref': r['ref'], 'note': r.get('note', '')})
        f['current'] = {'status': st, 'severity': sev}
    elif fid in pending:
        pending[fid]['rated'] = {'audit': audit['id'], 'date': audit['date'], 'status': st, 'severity': sev,
                                 'ref': r['ref'], 'note': r.get('note', '')}
    else:
        sys.exit(f'{fid}: not a finding or pending item in the ledger')
    changes += 1

L['audits'].append({'id': audit['id'], 'wave': audit['wave'], 'label': audit['label'], 'date': audit['date'],
                    'commit': audit['commit'], 'safety': {}, 'security': {}, 'ai': {}})
st = spec.get('stage')
if st:
    stage = next(s for s in L['stages'] if s['id'] == st['id'])
    stage.update({'status': 'done', 'date': audit['date'], 'ref': st.get('ref') or audit['label']})
json.dump(L, open(LEDGER, 'w'), ensure_ascii=False, indent=1)

# Refresh the shipped snapshot, then score it with the AUDIT view's own rules.
subprocess.run([sys.executable, f'{KIT}/export_audit_data.py', REPO], check=True)
score = subprocess.run(['node', '--input-type=module', '-e', f'''
import fs from 'node:fs';
import {{ rollup }} from '{REPO}/src/audit/model.js';
const d = JSON.parse(fs.readFileSync('{REPO}/src/audit/data/assessment.json', 'utf8'));
const o = {{ swal: d.swal, asvsLevel: d.asvsLevel }};
const pick = (r) => ({{ readiness: Math.round(r.readiness * 1e4) / 1e4, counts: r.counts, open: r.open, blocking: r.blocking, verdict: r.verdict }});
console.log(JSON.stringify({{ safety: pick(rollup(d.items, 'saf', o)), security: pick(rollup(d.items, 'sec', o)), ai: pick(rollup(d.items, 'ai', o)) }}));
'''], check=True, capture_output=True, text=True)
L['audits'][-1].update(json.loads(score.stdout))
json.dump(L, open(LEDGER, 'w'), ensure_ascii=False, indent=1)
a = L['audits'][-1]
print(f"{audit['id']} recorded: {changes} re-ratings; safety {a['safety']['readiness']:.1%} ({a['safety']['verdict']}), "
      f"security {a['security']['readiness']:.1%} ({a['security']['verdict']}), "
      f"AI {a['ai']['readiness']:.1%} ({a['ai']['verdict']})")
