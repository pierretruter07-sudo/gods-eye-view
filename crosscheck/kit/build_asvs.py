import json, sys
src = '/home/claude/owasp/asvs/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json'
r = json.load(open(src))['requirements']
out = [{'id': x['req_id'], 'ch': x['chapter_id'], 'chName': x['chapter_name'], 'sec': x['section_id'], 'secName': x['section_name'], 'text': x['req_description'], 'L': int(x['L'])} for x in r]
json.dump(out, open('asvs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
sys.path.insert(0, '.')
from gev_asvs import rate
sec = rate(out)
from collections import Counter
print(len(out), 'reqs;', len(sec), 'rated;', Counter(v['status'] for v in sec.values()), Counter(v.get('severity') for v in sec.values() if v.get('severity')))
