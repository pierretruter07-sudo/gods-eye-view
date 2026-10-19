"""Render the remediation plan PDF from the evidence ledger.

Order: Level 0 (40,000 ft) → Level 1 waves → Level 2 workstreams → Level 3 line by line → method.
Usage: python3 build_plan_pdf.py <repo-root> <out.html>
"""
import json, sys, html, base64, os

E = html.escape
REPO, OUT = sys.argv[1], sys.argv[2]
L = json.load(open(f'{REPO}/docs/evidence/ledger.json'))
F = L['findings']; A0 = L['audits'][-1]; BASE = L['audits'][0]
FONT = '/home/claude/vendor/plex/packages'

def ff(name, path, weight):
    b = base64.b64encode(open(f'{FONT}/{path}', 'rb').read()).decode()
    return f"@font-face{{font-family:'{name}';src:url(data:font/woff2;base64,{b}) format('woff2');font-weight:{weight}}}"

FONTS = ''.join([
    ff('Plex Sans', 'plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2', 400),
    ff('Plex Sans', 'plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2', 500),
    ff('Plex Sans', 'plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2', 600),
    ff('Plex Cond', 'plex-sans-condensed/fonts/complete/woff2/IBMPlexSansCondensed-SemiBold.woff2', 600),
    ff('Plex Cond', 'plex-sans-condensed/fonts/complete/woff2/IBMPlexSansCondensed-Bold.woff2', 700),
    ff('Plex Mono', 'plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2', 400),
    ff('Plex Mono', 'plex-mono/fonts/complete/woff2/IBMPlexMono-Medium.woff2', 500),
])
STC = {'C': '#2c7a57', 'L': '#7fb06c', 'P': '#d99a2b', 'N': '#c0503a', 'NA': '#b9c2cc'}
STN = {'C': 'Compliant', 'L': 'Largely', 'P': 'Partial', 'N': 'Non-compliant', 'NA': 'N/A'}
SEVL = {'S1': 'S1', 'S2': 'S2', 'S3': 'S3', 'S4': 'S4', 'SC': 'Critical', 'SH': 'High', 'SM': 'Medium', 'SL': 'Low'}
SEVC = {'S1': '#9c2f22', 'S2': '#c0503a', 'S3': '#d99a2b', 'S4': '#7c8a99', 'SC': '#7d1d3f', 'SH': '#c0503a', 'SM': '#d99a2b', 'SL': '#7c8a99'}
SAF, SEC, AIC, INK = '#2a5f8f', '#6b4fa0', '#9c3f7a', '#142233'
LENSES = (('ED-153', 'safety', SAF), ('ASVS', 'security', SEC), ('ISO42001', 'AI', AIC))
DATE = sys.argv[4] if len(sys.argv) > 4 else '14 October 2026'
VER = sys.argv[3] if len(sys.argv) > 3 else 'v0.1'

def gauge(pct, col, label):
    import math
    r, cx, cy = 52, 64, 64; a = math.pi * (1 - pct)
    x, y = cx + r * math.cos(a), cy - r * math.sin(a)
    return (f'<svg viewBox="0 0 128 76" width="150" aria-label="{label}"><path d="M12 64 A52 52 0 0 1 116 64" fill="none" stroke="#e3e8ee" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="M12 64 A52 52 0 0 1 {x:.1f} {y:.1f}" fill="none" stroke="{col}" stroke-width="10" stroke-linecap="round"/>'
            f'<text x="64" y="60" text-anchor="middle" style="font:600 22px Plex Cond;fill:{INK}">{round(pct*100)}%</text></svg>')

def stage_strip():
    out = []
    cur = next((s['id'] for s in L['stages'] if s['status'] != 'done'), None)
    for i, s in enumerate(L['stages']):
        st = 'done' if s['status'] == 'done' else 'now' if s['id'] == cur else 'todo'
        out.append(f'<div class="stg {st}"><span class="n">{i+1}</span><b>{E(s["name"])}</b><span class="d">{E(s["date"] or ("next" if st=="now" else "planned"))}</span></div>')
    return '<div class="strip">' + ''.join(out) + '</div>'

def wave_bars():
    rows = []
    mx = max(sum(1 for f in F if f['wave'] == w['id']) for w in L['waves'])
    for w in L['waves']:
        ed = sum(1 for f in F if f['wave'] == w['id'] and f['lens'] == 'ED-153')
        sc = sum(1 for f in F if f['wave'] == w['id'] and f['lens'] == 'ASVS')
        ai = sum(1 for f in F if f['wave'] == w['id'] and f['lens'] == 'ISO42001')
        bl = sum(1 for f in F if f['wave'] == w['id'] and f['blocking'])
        ws = ', '.join(x['id'] for x in L['workstreams'] if x['wave'] == w['id'])
        rows.append(f'<div class="wb"><div class="wl"><b>Wave {w["id"]} · {E(w["name"])}</b><span>{ws}</span></div>'
                    f'<div class="wbar"><i style="width:{ed/mx*100:.1f}%;background:{SAF}"></i><i style="width:{sc/mx*100:.1f}%;background:{SEC}"></i><i style="width:{ai/mx*100:.1f}%;background:{AIC}"></i></div>'
                    f'<div class="wn">{ed+sc+ai}<small>{bl} blocking</small></div></div>')
    return ''.join(rows)


def journey_chart():
    J = L['projections']['journey']; B = L['projections']['scenarios'][1]
    actual = [a for a in L['audits']]
    W, H, l, r, t, b = 240, 150, 26, 34, 8, 22
    xs = [l + i * (W - l - r) / (len(J) - 1) for i in range(len(J))]
    y = lambda v: t + (1 - v) * (H - t - b)
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Readiness journey">']
    for v in (0, .5, 1):
        out.append(f'<line x1="{l}" x2="{W-r}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#e3e8ee"/><text x="{l-4}" y="{y(v)+3:.1f}" text-anchor="end" style="font:7.5px Plex Mono;fill:#8a97a6">{int(v*100)}%</text>')
    for i, j in enumerate(J):
        out.append(f'<text x="{xs[i]:.1f}" y="{H-12}" text-anchor="middle" style="font:7.5px Plex Sans;fill:#6a7889">{E(j["label"].replace("After ", "").replace("Wave ", "W"))}</text>')
    keys = [k for k in ('safety', 'security', 'ai') if k in J[0]]
    def stack(vals, gap):
        order = sorted(keys, key=lambda k: y(vals[k]))
        out, last = {}, -99
        for k in order:
            out[k] = max(y(vals[k]) + 3, last + gap); last = out[k]
        return out
    y0, y1 = stack(J[0], 9), stack(J[-1], 9)
    for key, col in (('safety', SAF), ('security', SEC), ('ai', AIC)):
        if key not in keys: continue
        pts = ' '.join(f'{xs[i]:.1f},{y(j[key]):.1f}' for i, j in enumerate(J))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.6" stroke-dasharray="4 3"/>')
        out.append(f'<circle cx="{xs[0]:.1f}" cy="{y(J[0][key]):.1f}" r="3.2" fill="{col}"/><text x="{xs[0]+5:.1f}" y="{y0[key]+(6 if key=="safety" else -4):.1f}" style="font:600 9px Plex Cond;fill:{col}">{round(J[0][key]*100)}%</text>')
        # actual re-audits after baseline (if any), plotted at their wave index
        for k, a in enumerate(actual[1:], start=1):
            if k < len(xs) and key in a: out.append(f'<circle cx="{xs[k]:.1f}" cy="{y(a[key]["readiness"]):.1f}" r="3.2" fill="{col}"/>')
        out.append(f'<text x="{xs[-1]+6:.1f}" y="{y1[key]:.1f}" style="font:600 9px Plex Cond;fill:{col}">{round(J[-1][key]*100)}%</text>')
        out.append(f'<circle cx="{xs[-1]:.1f}" cy="{y(B[key]):.1f}" r="2.6" fill="#fff" stroke="{col}" stroke-width="1.2"/>')
    out.append('</svg>')
    return ''.join(out)

def page1():
    s, c, ai = A0['safety'], A0['security'], A0['ai']
    sA = L['projections']['scenarios'][0]
    return f'''<section class="page">
  <header class="ph"><span class="eb">CrossCheck evidence record · Level 0 · 40,000 ft view</span><span class="eb r">Plan {VER} · {DATE}</span></header>
  <h1>God's Eye View: from audit to compliance</h1>
  <p class="lede">CrossCheck audited God's Eye View against three global standards: <b style="color:{SAF}">EUROCAE ED-153</b> for software safety assurance at SWAL 3, <b style="color:{SEC}">OWASP ASVS 5.0</b> for application security at Level 2, and <b style="color:{AIC}">ISO/IEC 42001</b> for managing AI responsibly. This plan closes every gap it found, in four waves, with each fix evidenced line by line.</p>
  {stage_strip()}
  <div class="g3">
    <div class="card"><span class="k">Where we start · baseline {E(L["baseline"]["commit"])}</span>
      <div class="gg"><div>{gauge(s["readiness"], SAF, "Safety readiness")}<b class="lab" style="color:{SAF}">Safety · ED-153</b><span class="v bad">{E(s["verdict"])}</span></div>
      <div>{gauge(c["readiness"], SEC, "Security readiness")}<b class="lab" style="color:{SEC}">Security · ASVS L2</b><span class="v bad">{E(c["verdict"])}</span></div>
      <div>{gauge(ai["readiness"], AIC, "AI management readiness")}<b class="lab" style="color:{AIC}">AI · ISO 42001</b><span class="v bad">{E(ai["verdict"])}</span></div></div>
      <p class="sm"><b>{len(F)}</b> findings: {s["open"]} safety, {c["open"]} security, {ai["open"]} AI. <b>{s["blocking"]+c["blocking"]+ai["blocking"]}</b> of them block a claim.</p></div>
    <div class="card"><span class="k">How the gaps are closed</span>
      <p class="flow"><b>{len(F)}</b> findings <span>→</span> <b>{len(L["workstreams"])}</b> workstreams <span>→</span> <b>{len(L["waves"])}</b> waves</p>
      {wave_bars()}
      <p class="lg"><i style="background:{SAF}"></i>safety <i style="background:{SEC}"></i>security <i style="background:{AIC}"></i>AI findings</p></div>
    <div class="card"><span class="k">Readiness journey</span>
      {journey_chart()}
      <p class="lg" style="margin:2px 0 6px"><i style="background:{SAF}"></i>safety <i style="background:{SEC}"></i>security <i style="background:{AIC}"></i>AI · ● measured · dashed: target with Claude + Replit · ○ with customer and independent reviewer</p>
      <ol class="fin"><li><b>Wave 2:</b> ASVS Level 2 met; AI policy, scope and intended use in place.</li><li><b>Wave 3:</b> no AI must-fix left.</li><li><b>Wave 4:</b> safety {round(sA["safety"]*100)}%, AI {round(sA["ai"]*100)}%; human-only steps ({len(sA["human_only"])}) then take the SWAL 3 claim to supported and ISO 42001 to met.</li></ol></div>
  </div>
  <div class="read"><span class="k">Reading this record</span><span><b>0</b> This page</span><span><b>1</b> Waves</span><span><b>2</b> Workstreams</span><span><b>3</b> Line by line, every finding</span><span><b>A</b> Method and rules</span></div>
</section>'''

def page_waves():
    weeks = {1: (0, 1), 2: (1, 2), 3: (1, 4), 4: (4, 5)}
    rows = ''
    for w in L['waves']:
        a, b = weeks[w['id']]
        ws = [x for x in L['workstreams'] if x['wave'] == w['id']]
        rows += (f'<tr><td><b>Wave {w["id"]} · {E(w["name"])}</b><div class="sm">{E(w["who"])} · {E(w["effort"])}</div></td>'
                 f'<td>{"<br>".join(E(x["id"]+" "+x["name"]) for x in ws)}</td>'
                 f'<td><div class="gantt"><i style="left:{a*20}%;width:{(b-a)*20}%"></i></div></td><td>{E(w["exit"])}</td></tr>')
    cust = [('Choose the identity provider', 'Wave 2'), ('Confirm the operational context; join the hazard assessment', 'Wave 3'),
            ('Name the plan approver and an independent reviewer', 'Wave 3'), ('Restrict browser keys in the Google and Cesium consoles', 'Wave 1'),
            ('Validate with operational users', 'Wave 3'), ('Approve the AI policy and name an AI owner', 'Wave 2'),
            ('Hold the AI management review', 'Sign-off')]
    return f'''<section class="page">
  <header class="ph"><span class="eb">Level 1 · Waves</span><span class="eb r">Plan {VER} · {DATE}</span></header>
  <h2>Four waves, each ending in a re-audit</h2>
  <p class="lede sm">Waves 1–2 close the security gaps in code; Wave 2 also sets up the AI management system. Waves 3–4 build the safety evidence that ED-153 asks for and the AI risk, impact and audit records ISO 42001 asks for. Wave 3 can start alongside Wave 2 if a safety lead is free.</p>
  <table class="t"><thead><tr><th style="width:20%">Wave</th><th style="width:28%">Workstreams</th><th style="width:22%">Weeks 1 → 5</th><th>Exit check</th></tr></thead><tbody>{rows}</tbody></table>
  <h3>Only the customer or owner can do these</h3>
  <div class="g2 tight2">{"".join(f'<table class="t tight"><thead><tr><th>Action</th><th style="width:22%">Needed by</th></tr></thead><tbody>{"".join(f"<tr><td>{E(a)}</td><td>{b}</td></tr>" for a,b in half)}</tbody></table>' for half in (cust[:4], cust[4:]))}</div>
  <p class="sm" style="margin-top:10px"><b>Not ours to give:</b> final ED-153 acceptance needs an independent assessor, the customer's operational context, and a check of CrossCheck's reconstructed catalogue against a purchased copy of ED-153. ISO/IEC 42001 certification needs an accredited certification body.</p>
</section>'''

def page_ws():
    cards = ''
    for w in L['workstreams']:
        fs = [f for f in F if f['workstream'] == w['id']]
        ed = sum(f['lens'] == 'ED-153' for f in fs); sc = sum(f['lens'] == 'ASVS' for f in fs); ai = len(fs) - ed - sc; bl = sum(f['blocking'] for f in fs)
        counts = ''.join(f'<span style="color:{col}">{n} {name}</span>' for n, name, col in ((ed, 'safety', SAF), (sc, 'security', SEC), (ai, 'AI', AIC)) if n)
        cards += (f'<div class="wsc"><div class="wh"><b>{w["id"]}</b><span>{E(w["name"])}</span><em>Wave {w["wave"]}</em></div>'
                  f'<div class="cnt">{counts}<span class="{"bad" if bl else "zero"}">{bl} blocking</span></div>'
                  f'<ul>{"".join(f"<li>{E(d)}</li>" for d in w["deliverables"][:2])}</ul><p class="ev"><b>Evidence:</b> {E(w["evidence"])}</p></div>')
    return f'''<section class="page">
  <header class="ph"><span class="eb">Level 2 · Workstreams</span><span class="eb r">Plan {VER} · {DATE}</span></header>
  <h2>{len(L["workstreams"])} workstreams; each finding belongs to exactly one</h2>
  <div class="wsg">{cards}</div>
</section>'''

def page_lines():
    out = []
    for w in L['workstreams']:
        rows = ''
        for f in [f for f in F if f['workstream'] == w['id']]:
            t = f['title']
            if f['lens'] == 'ASVS':
                t = t.replace('Verify that ', ''); t = t[0].upper() + t[1:]
                t = (t[:150].rsplit(' ', 1)[0] + '…') if len(t) > 152 else t
            b = f['baseline']; cur = f['current']
            closed = next((h for h in reversed(f['history']) if h['event'] != 'rated' or h['status'] in ('C', 'L', 'NA')), None) if cur['status'] in ('C', 'L', 'NA') else None
            rows += (f'<tr><td class="mono">{E(f["id"])}<div class="lens {"s" if f["lens"]=="ASVS" else "a" if f["lens"]=="ISO42001" else "f"}">{"ISO 42001" if f["lens"]=="ISO42001" else f["lens"]}</div></td><td>{E(t)}<div class="sm area">{E(f["area"])}</div></td>'
                     f'<td><span class="st" style="background:{STC[b["status"]]}">{STN[b["status"]]}</span></td>'
                     f'<td><span class="sev" style="background:{SEVC[b["severity"]]}">{SEVL[b["severity"]]}</span></td>'
                     f'<td>{E(f["fix"])}</td><td class="sm">{E(b["evidence"])}</td>'
                     f'<td class="mono">{E(closed["ref"]) if closed else "open"}</td></tr>')
        out.append(f'<h3 class="wsh">{w["id"]} {E(w["name"])} <span>Wave {w["wave"]} · {len(w["findings"])} findings</span></h3>'
                   f'<table class="t lines"><thead><tr><th style="width:8%">ID</th><th style="width:25%">Requirement</th><th style="width:8%">Baseline</th><th style="width:7%">Severity</th><th style="width:20%">Fix</th><th style="width:22%">Baseline evidence</th><th style="width:10%">Closed by</th></tr></thead><tbody>{rows}</tbody></table>')
    return f'''<section class="flowsec">
  <header class="ph"><span class="eb">Level 3 · Line by line</span><span class="eb r">Plan {VER} · {DATE}</span></header>
  <h2>Every finding, its fix and how it will be closed</h2>
  <p class="lede sm">"Closed by" is filled from the ledger as fixes land: a commit SHA, test or document reference, with the date and new rating in CrossCheck.</p>
  {"".join(out)}
</section>'''

def page_method():
    return f'''<section class="page">
  <header class="ph"><span class="eb">Appendix A · Method and rules</span><span class="eb r">Plan {VER} · {DATE}</span></header>
  <h2>How CrossCheck rates and decides</h2>
  <div class="g2">
    <div><h3>Status scale</h3><table class="t"><tbody>
      <tr><td><span class="st" style="background:{STC["C"]}">Compliant</span></td><td>Fully met, with evidence.</td></tr>
      <tr><td><span class="st" style="background:{STC["L"]}">Largely</span></td><td>Met with minor, non-blocking gaps.</td></tr>
      <tr><td><span class="st" style="background:{STC["P"]}">Partial</span></td><td>Some evidence; material gaps remain.</td></tr>
      <tr><td><span class="st" style="background:{STC["N"]}">Non-compliant</span></td><td>Not met, or no evidence.</td></tr></tbody></table>
      <p class="sm">Weighted readiness: Compliant 1, Largely 0.75, Partial 0.4, Non-compliant 0, averaged over rated items in scope.</p>
      <h3>Severity</h3><p class="sm">Safety findings S1–S4 after EASA AMC 20-189 (S1–S2 block a claim). Security and AI findings Critical, High, Medium, Low (Critical and High block a level or conformity).</p></div>
    <div><h3>Verdict rules</h3><p class="sm"><b>ED-153 SWAL claim supported</b> only if every required objective is at least Largely, no S1–S2 finding is open, and independence is evidenced where the SWAL requires it.</p>
      <p class="sm"><b>ASVS level met</b> only if every requirement at or below the level passes or largely passes, and no Critical or High finding is open.</p>
      <p class="sm"><b>ISO 42001 met</b> only if every clause 4–10 requirement and every applicable Annex A control conforms or largely conforms, and no High finding is open. Excluded controls need a reason in the statement of applicability.</p>
      <h3>Evidence rules</h3><p class="sm">The ledger (<span class="mono">docs/evidence/ledger.json</span>) is the single source of truth. History is append-only. Every status change cites a commit, test, document or review record.</p>
      <h3>Sources</h3><p class="sm">ED-153 objectives reconstructed from EUROCONTROL <i>Recommendations for ANS Software</i> (2005), the Czech CAA ED-153 guide and EASA AMC/GM to Regulation (EU) 2017/373; confirm against ED-153 before any formal claim. OWASP ASVS 5.0.0, © OWASP Foundation, CC BY-SA 4.0. ISO/IEC 42001:2023 is cited by clause and control number with paraphrased titles only; confirm against a purchased copy.</p></div>
  </div>
</section>'''

CSS = FONTS + f'''
@page {{ size: A4 landscape; margin: 14mm 14mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font: 9.5pt/1.45 'Plex Sans', sans-serif; color: {INK}; }}
.page {{ page-break-after: always; min-height: 170mm; }}
.flowsec {{ page-break-after: always; }}
.ph {{ display: flex; justify-content: space-between; border-bottom: 1.5px solid {INK}; padding-bottom: 5px; margin-bottom: 12px; }}
.eb {{ font: 600 7.5pt 'Plex Cond'; letter-spacing: .14em; text-transform: uppercase; color: {SAF}; }}
.eb.r {{ color: #6a7889; }}
h1 {{ font: 700 24pt/1.1 'Plex Cond'; margin: 0 0 6px; }}
h2 {{ font: 600 17pt/1.15 'Plex Cond'; margin: 0 0 6px; }}
h3 {{ font: 600 11pt 'Plex Cond'; margin: 14px 0 6px; }}
.lede {{ max-width: 230mm; margin: 0 0 12px; font-size: 10.5pt; color: #33465b; }}
.sm {{ font-size: 8.5pt; color: #4a5a6c; }}
.mono {{ font: 400 8pt 'Plex Mono'; }}
.k {{ font: 600 7.5pt 'Plex Cond'; letter-spacing: .14em; text-transform: uppercase; color: #6a7889; }}
.strip {{ display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; margin: 6px 0 14px; }}
.stg {{ display: grid; gap: 2px; padding: 7px 8px; border-radius: 5px; border: 1px solid #d9e0e6; background: #f6f8fa; }}
.stg .n {{ font: 500 7.5pt 'Plex Mono'; color: #8a97a6; }}
.stg b {{ font: 600 9pt/1.15 'Plex Cond'; }}
.stg .d {{ font: 400 7.5pt 'Plex Mono'; color: #6a7889; }}
.stg.done {{ background: #e8f3ee; border-color: #9fcdb5; }}
.stg.done .n {{ color: #2c7a57; }}
.stg.now {{ background: #fff4e0; border-color: #e3b25a; box-shadow: inset 0 -3px 0 #d99a2b; }}
.g3 {{ display: grid; grid-template-columns: 1.15fr 1.15fr 0.95fr; gap: 12px; }}
.g2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.card {{ border: 1px solid #d9e0e6; border-radius: 8px; padding: 12px 14px; }}
.gg {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin: 6px 0; }}
.gg svg {{ width: 100%; max-width: 120px; }}
.gg > div {{ display: grid; justify-items: center; gap: 2px; text-align: center; }}
.lab {{ font: 600 9pt 'Plex Cond'; }}
.v {{ font-size: 8pt; }}
.bad {{ color: #b0442f; }} .zero {{ color: #8a97a6; }}

p.flow {{ font: 600 12pt 'Plex Cond'; margin: 6px 0 10px; }}
p.flow span {{ color: #8a97a6; margin: 0 4px; }}
.wb {{ display: grid; grid-template-columns: 38% 1fr 14%; gap: 8px; align-items: center; margin: 7px 0; }}
.wl b {{ display: block; font: 600 9pt 'Plex Cond'; }} .wl span {{ font: 400 7.5pt 'Plex Mono'; color: #6a7889; }}
.wbar {{ display: flex; height: 10px; background: #eef2f5; border-radius: 3px; overflow: hidden; }} .wbar i {{ display: block; }}
.wn {{ font: 600 11pt 'Plex Cond'; text-align: right; }} .wn small {{ display: block; font: 400 7pt 'Plex Sans'; color: #b0442f; }}
.lg {{ font-size: 7.5pt; color: #6a7889; }} .lg i {{ display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 10px; vertical-align: -1px; }}
.fin {{ margin: 4px 0 0; padding-left: 16px; font-size: 8.5pt; }} .fin li {{ margin: 3px 0; }}
.read {{ display: flex; gap: 18px; align-items: center; margin-top: 14px; padding: 8px 12px; border-radius: 6px; background: #f2f5f8; font-size: 8.5pt; }}
.read b {{ display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: {INK}; color: #fff; font: 600 7.5pt 'Plex Sans'; margin-right: 4px; }}
.t {{ width: 100%; border-collapse: collapse; font-size: 8.5pt; }}
.t th {{ text-align: left; font: 600 7.5pt 'Plex Cond'; letter-spacing: .08em; text-transform: uppercase; color: #6a7889; border-bottom: 1.5px solid {INK}; padding: 5px 6px; }}
.t td {{ border-bottom: 1px solid #e3e8ee; padding: 5px 6px; vertical-align: top; }}
.t.tight td {{ padding: 3px 6px; }}
.t thead {{ display: table-header-group; }} .t tr {{ page-break-inside: avoid; }}
.gantt {{ position: relative; height: 12px; background: repeating-linear-gradient(90deg,#eef2f5 0 19.6%,#fff 19.6% 20%); border-radius: 3px; }}
.gantt i {{ position: absolute; top: 0; bottom: 0; background: {SAF}; border-radius: 3px; }}
.wsg {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }}
.wsc {{ border: 1px solid #d9e0e6; border-radius: 7px; padding: 7px 8px; font-size: 6.8pt; line-height: 1.33; break-inside: avoid; }}
.tight2 {{ gap: 14px; }}
.wh {{ display: grid; grid-template-columns: auto 1fr; gap: 0 6px; }} .wh b {{ font: 600 12pt 'Plex Cond'; grid-row: span 2; }} .wh span {{ font: 600 8.5pt/1.15 'Plex Cond'; }} .wh em {{ font: normal 400 7pt 'Plex Mono'; color: #6a7889; }}
.cnt {{ display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 4px; font: 500 7.5pt 'Plex Mono'; }}
.wsc ul {{ margin: 4px 0; padding-left: 13px; }} .wsc li {{ margin: 1px 0; }} .ev {{ margin: 4px 0 0; color: #4a5a6c; }}
.wsh {{ display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #d9e0e6; padding-bottom: 3px; margin-top: 16px; page-break-after: avoid; }}
.wsh span {{ font: 400 8pt 'Plex Mono'; color: #6a7889; }}
.lines td {{ font-size: 7.8pt; }}
.lens {{ font: 600 6.5pt 'Plex Mono'; margin-top: 2px; }} .lens.f {{ color: {SAF}; }} .lens.s {{ color: {SEC}; }} .lens.a {{ color: {AIC}; }}
.area {{ margin-top: 2px; font-size: 7pt; }}
.st, .sev {{ display: inline-block; padding: 1px 5px; border-radius: 3px; color: #fff; font: 600 6.8pt 'Plex Sans'; white-space: nowrap; }}
'''
HTML = f'''<!doctype html><html><head><meta charset="utf-8"><title>God's Eye View remediation plan</title><style>{CSS}</style></head><body>
{page1()}{page_waves()}{page_ws()}{page_lines()}{page_method()}</body></html>'''
open(OUT, 'w').write(HTML)
print('ok', len(HTML))
