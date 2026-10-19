import json
s=json.load(open('/home/claude/ed153-kit/gev-seed.crosscheck.json'))
cat={o['id']:o for o in json.load(open('/home/claude/ed153-kit/catalogue.ui.json'))}
asvs={x['id']:x for x in json.load(open('/home/claude/ed153-kit/asvs.json'))}
W={
'W1':['V3.2.1','V3.4.1','V3.4.3','V3.4.4','V3.4.5','V13.4.5'],
'W2':['V2.4.1','V2.3.2','V15.3.4','V2.1.3','V15.1.3','4.3.13'],
'W3':['V15.2.1','V15.1.1','V15.1.2','V13.3.1','V13.3.2','V13.2.5','3.0.13','7.x COTS','7.x SE','4.3.10'],
'W4':['V16.1.1','V16.3.3','V16.4.3','V16.2.1','V16.2.2','V16.2.4','V16.4.1','V16.4.2','3.0.11','4.4.5','4.4.4'],
'W5':['V8.1.1','V8.2.1'],
'W6':['V2.1.1','V2.1.2','V14.1.1','V14.1.2'],
'W7':['3.1.2','3.1.5','4.1.2','3.3.1','3.3.2','3.3.3','3.0.5','3.3.5','4.1.3','3.3.4'],
'W8':['3.0.1','3.2.1','3.2.2','3.2.3','3.2.4','3.0.8','3.0.9','3.4.3','4.2.4','4.3.3','4.3.11','3.0.7','5.2.1','5.2.3','5.2.x','5.4.13','3.0.12','3.0.15','4.4.1','4.5.1','4.5.2','4.5.3','5.3.x','5.8.x','6.1.x','6.2.x','6.3.x','6.4.x','7.x DE'],
'W9':['3.0.2','3.0.3','3.0.4','3.0.14','4.3.1','4.3.4','4.3.7','4.3.14','3.4.2','5.4.3','5.4.4','5.4.5','5.4.9','5.4.12','3.4.1','5.5.x','5.6.x','4.4.3'],
'W10':['3.0.10','3.0.17','3.4.4','3.5.1','3.5.3','5.7.2–5.7.4','8'],
}
SEV={'S1':'S1','S2':'S2','S3':'S3','S4':'S4','SC':'Critical','SH':'High','SM':'Medium','SL':'Low'}
ST={'P':'Partial','N':'Non-compliant'}
def row(i):
    if i in asvs:
        r=s['sec'][i]; lens='ASVS'; t=asvs[i]['text'].replace('Verify that ','')
        t=t[0].upper()+t[1:]; t=(t[:95]+'…') if len(t)>96 else t
    else:
        r=s['ratings'][i]; lens='ED-153'; t=cat[i]['title']
    sev=r.get('severity') or ('SH' if lens=='ASVS' and r['status']=='N' else 'SM' if lens=='ASVS' else 'S2' if r['status']=='N' else 'S3')
    return f"| {i} | {lens} | {t.replace('|','/')} | {ST[r['status']]} | {SEV[sev]} | {r.get('note','').replace('|','/')} |"
out={}
for w,ids in W.items():
    out[w]="| ID | Lens | Requirement | Status | Severity | Fix |\n|---|---|---|---|---|---|\n"+"\n".join(row(i) for i in ids)
json.dump(out,open('/home/claude/ed153-kit/plan_tables.json','w'),ensure_ascii=False)
f=json.load(open('/home/claude/ed153-kit/findings.json'))
allids=[i for v in W.values() for i in v]
print('dupes',len(allids)-len(set(allids)),'missing',set(f['ed']+f['sec'])-set(allids),'extra',set(allids)-set(f['ed']+f['sec']), 'total',len(allids))
