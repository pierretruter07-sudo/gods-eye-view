import json, sys
import os, sys
# The ASVS 5.0.0 flat JSON from github.com/OWASP/ASVS (argument or ASVS_FLAT_JSON).
src = sys.argv[1] if len(sys.argv) > 1 else os.environ['ASVS_FLAT_JSON']
r = json.load(open(src))['requirements']
out = [{'id': x['req_id'], 'ch': x['chapter_id'], 'chName': x['chapter_name'], 'sec': x['section_id'], 'secName': x['section_name'], 'text': x['req_description'], 'L': int(x['L'])} for x in r]
json.dump(out, open('asvs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
sys.path.insert(0, '.')
from gev_asvs import rate
sec = rate(out)
from collections import Counter
print(len(out), 'reqs;', len(sec), 'rated;', Counter(v['status'] for v in sec.values()), Counter(v.get('severity') for v in sec.values() if v.get('severity')))
