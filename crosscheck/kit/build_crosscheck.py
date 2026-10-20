import json, os, sys

# Paths are relative to this kit; the ledger argument is taken as given.
_LEDGER_ARG = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())
sys.path.insert(0, '.')
from gev_asvs import rate
cat = open('catalogue.ui.json').read()
asvs = json.load(open('asvs.json'))
iso = json.load(open('iso42001.json'))
js = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
t = open('crosscheck.template.html').read()
html = t.replace('__CATALOGUE__', cat.strip()).replace('__ASVS__', js(asvs)).replace('__ISO__', js(iso))
assert '__' not in html.split('<script>')[1][:200]
open('crosscheck.html', 'w').write(html)
seed = json.load(open('gev-seed.json'))
seed['asvsLevel'] = 2
seed['secNote'] = 'Level 2 chosen: internet-reachable demo, aggregated military-asset picture, defence-prime audience. Level 1 is the floor; L3 deferred until a customer deployment.'
seed['intake']['surface'] = ('Public URL on Replit, no login. Entry points: SPA plus ~15 GET JSON proxy endpoints (aircraft, vessels, places, routes, '
    'Overpass, terrain, cyclones, FIRMS, CelesTrak). Server-side secrets: AISSTREAM_API_KEY, Google Places key. Browser-bundled by design: '
    'GOOGLE_MAPS_API_KEY, CESIUM_ION_TOKEN. Single Node process (vite preview); no database, no uploads, no user data. Repository public; main unprotected.')
seed['sec'] = rate(asvs)
import gev_iso42001
seed['ai'] = gev_iso42001.rate(iso)
seed['aiScope'] = gev_iso42001.SCOPE
seed['aiStandard'] = 'ISO/IEC 42001:2023 (AI management system); clause numbers and paraphrased titles only'
# The evidence ledger of the audited repo (argument; default: the God's Eye
# View repo this kit sits in).
LEDGER_PATH = _LEDGER_ARG or os.path.join('..', '..', 'docs', 'evidence', 'ledger.json')
L = json.load(open(LEDGER_PATH))
seed['remediation'] = {
    'stages': L['stages'],
    'audits': [{'id': x['id'], 'label': x['label'], 'date': x['date'], 'commit': x['commit'],
                'safety': {k: x['safety'][k] for k in ('readiness', 'verdict', 'open', 'blocking')},
                'security': {k: x['security'][k] for k in ('readiness', 'verdict', 'open', 'blocking')},
                **({'ai': {k: x['ai'][k] for k in ('readiness', 'verdict', 'open', 'blocking', 'date', 'commit', 'note') if k in x['ai']}} if x.get('ai') else {})}
               for x in L['audits']],
    'waves': L['waves'],
    'projections': L['projections'],
    'workstreams': [{k: w[k] for k in ('id', 'name', 'wave', 'deliverables', 'evidence', 'findings')} for w in L['workstreams']],
    'blocking': [f['id'] for f in L['findings'] if f['blocking']],
    'log': {f['id']: f['history'] for f in L['findings']},
}
seed['updatedAt'] = '2026-10-14T11:10:00.000Z'
json.dump(seed, open('gev-seed.crosscheck.json', 'w'), ensure_ascii=False, indent=1)
assert '__ISO__' not in html
print(len(html), 'bytes; sec rated', len(seed['sec']), '; ai rated', len(seed['ai']))
