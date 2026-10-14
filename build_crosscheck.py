import json, sys
sys.path.insert(0, '.')
from gev_asvs import rate
cat = open('catalogue.ui.json').read()
asvs = json.load(open('asvs.json'))
t = open('crosscheck.template.html').read()
html = t.replace('__CATALOGUE__', cat.strip()).replace('__ASVS__', json.dumps(asvs, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
assert '__' not in html.split('<script>')[1][:200]
open('crosscheck.html', 'w').write(html)
seed = json.load(open('gev-seed.json'))
seed['asvsLevel'] = 2
seed['secNote'] = 'Level 2 chosen: internet-reachable demo, aggregated military-asset picture, defence-prime audience. Level 1 is the floor; L3 deferred until a customer deployment.'
seed['intake']['surface'] = ('Public URL on Replit, no login. Entry points: SPA plus ~15 GET JSON proxy endpoints (aircraft, vessels, places, routes, '
    'Overpass, terrain, cyclones, FIRMS, CelesTrak). Server-side secrets: AISSTREAM_API_KEY, Google Places key. Browser-bundled by design: '
    'GOOGLE_MAPS_API_KEY, CESIUM_ION_TOKEN. Single Node process (vite preview); no database, no uploads, no user data. Repository public; main unprotected.')
seed['sec'] = rate(asvs)
L = json.load(open('/home/claude/gods-eye-view/docs/evidence/ledger.json'))
seed['remediation'] = {
    'stages': L['stages'],
    'audits': [{'id': x['id'], 'label': x['label'], 'date': x['date'], 'commit': x['commit'],
                'safety': {k: x['safety'][k] for k in ('readiness', 'verdict', 'open', 'blocking')},
                'security': {k: x['security'][k] for k in ('readiness', 'verdict', 'open', 'blocking')}} for x in L['audits']],
    'waves': L['waves'],
    'projections': L['projections'],
    'workstreams': [{k: w[k] for k in ('id', 'name', 'wave', 'deliverables', 'evidence', 'findings')} for w in L['workstreams']],
    'blocking': [f['id'] for f in L['findings'] if f['blocking']],
    'log': {f['id']: f['history'] for f in L['findings']},
}
seed['updatedAt'] = '2026-10-14T11:10:00.000Z'
json.dump(seed, open('gev-seed.crosscheck.json', 'w'), ensure_ascii=False, indent=1)
print(len(html), 'bytes; sec rated', len(seed['sec']))
