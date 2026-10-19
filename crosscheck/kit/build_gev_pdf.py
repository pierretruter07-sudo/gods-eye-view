"""Builds 'God's Eye View — ED-153 status' as HTML (then printed to PDF by Chromium)."""
import json, html
from collections import Counter, OrderedDict
from gev_assessment import GEV

E = html.escape
cat = json.load(open('catalogue.json'))
for r in cat:
    key = r['id'] if r['id'] != '7.x' else f"7.x {r['title']}"
    r['key'] = key
    r['status'], r['gev_evidence'], r['action'] = GEV[key]

COL = {'C': '#2f7d5b', 'L': '#8cbf7a', 'P': '#e3a83c', 'N': '#c4553f', 'NA': '#cfd4dc'}
LBL = {'C': 'Compliant', 'L': 'Largely', 'P': 'Partially', 'N': 'Not met', 'NA': 'N/A'}
SCORE = {'C': 1, 'L': 0.75, 'P': 0.4, 'N': 0}

def chip(s):
    fg = '#fff' if s in ('C', 'N') else '#1d2733'
    return f'<span class="chip" style="background:{COL[s]};color:{fg}">{LBL[s]}</span>'

# ── Area groups ───────────────────────────────────────────────────────────
GROUPS = OrderedDict([
    ('Safety assurance system (3.0)', ['3 SSAS']),
    ('Safety assessment (3.1–3.5)', ['3.1 Initiation', '3.2 Planning', '3.3 Requirements', '3.4 V&V/PA', '3.5 Completion']),
    ('Acquisition & supply (4.1–4.2)', ['4.1 Acquisition', '4.2 Supply']),
    ('Development (4.3)', ['4.3 Development']),
    ('Operation & maintenance (4.4–4.5)', ['4.4 Operation', '4.5 Maintenance']),
    ('Documentation & CM (5.1–5.2)', ['5.1 Documentation', '5.2 CM']),
    ('Verification & validation (5.3–5.8)', ['5.3 QA', '5.4 Verification', '5.5 Validation', '5.6 Joint review', '5.7 Audit', '5.8 Problem resolution']),
    ('Organisational & additional (6–8)', ['6 Organisational', '7 Additional ANS', '8 Safety Folder']),
])
group_rows = OrderedDict((g, [r for r in cat if r['area'] in areas]) for g, areas in GROUPS.items())
applicable = [r for r in cat if r['status'] != 'NA']
counts = Counter(r['status'] for r in cat)
score = sum(SCORE[r['status']] for r in applicable) / len(applicable)

def area_bars():
    w, rowh, left, barw = 760, 34, 250, 420
    h = 40 + rowh * len(group_rows) + 30
    out = [f'<svg viewBox="0 0 {w} {h}" class="fig" role="img" aria-label="Status by process area">']
    out.append(f'<text x="{left}" y="20" class="axis">objectives applicable at SWAL 3 →</text>')
    maxn = max(len([r for r in rows if r['status'] != 'NA']) for rows in group_rows.values())
    for i, (g, rows) in enumerate(group_rows.items()):
        y = 34 + i * rowh
        app = [r for r in rows if r['status'] != 'NA']
        c = Counter(r['status'] for r in app)
        out.append(f'<text x="{left - 12}" y="{y + 15}" text-anchor="end" class="lbl">{E(g)}</text>')
        x = left
        for s in ('C', 'L', 'P', 'N'):
            if not c[s]:
                continue
            bw = barw * c[s] / maxn
            out.append(f'<rect x="{x:.1f}" y="{y}" width="{bw:.1f}" height="20" rx="2" fill="{COL[s]}"><title>{LBL[s]}: {c[s]}</title></rect>')
            if bw > 16:
                fg = '#fff' if s in ('C', 'N') else '#1d2733'
                out.append(f'<text x="{x + bw / 2:.1f}" y="{y + 14}" text-anchor="middle" class="val" style="fill:{fg}">{c[s]}</text>')
            x += bw
        sc = sum(SCORE[r['status']] for r in app) / len(app) if app else 0
        out.append(f'<text x="{x + 10:.1f}" y="{y + 15}" class="score">{round(sc * 100)}%</text>')
    ly = h - 14
    lx = left
    for s in ('C', 'L', 'P', 'N'):
        out.append(f'<rect x="{lx}" y="{ly - 10}" width="12" height="12" rx="2" fill="{COL[s]}"/><text x="{lx + 17}" y="{ly}" class="lbl">{LBL[s]}</text>')
        lx += 95
    out.append(f'<text x="{lx + 10}" y="{ly}" class="axis">% = weighted readiness</text>')
    out.append('</svg>')
    return ''.join(out)

# ── Features ─────────────────────────────────────────────────────────────
DIMS = ['Requirements', 'Traced', 'Tests', 'Architecture', 'COTS / data justified', 'In-service monitoring', 'Hazard analysis']
FEATURES = [
    # name, status, note, req ids, dims
    ('Flights (OpenSky, adsb.lol chain)', 'Operational', 'Free feeds rate-limit; 3 of 4 sources non-commercial', 'LAY-001–004, SRV-004', 'PPLLNNN'),
    ('Military aircraft', 'Operational', 'ADS-B broadcasters only', 'LAY-001–004', 'PPLLNNN'),
    ('AIS vessels', 'Operational', 'AISStream key set; coastal coverage', 'LAY-001–004', 'PPLLPNN'),
    ('Satellites (CelesTrak)', 'Operational', 'Public TLEs', 'LAY-001, INT-007', 'PPLLPNN'),
    ('Earthquakes (USGS)', 'Operational', 'Glow removed; markers only', 'LAY-001, DIR-002', 'PPLLPNN'),
    ('Active fires (NASA FIRMS)', 'Inactive', 'No FIRMS key on the demo', 'LAY-001, LAY-004', 'PPLLPNN'),
    ('Tropical cyclones (NOAA)', 'Limited', 'Atlantic and E/C Pacific only', 'LAY-001', 'PPLLPNN'),
    ('Military installations (OSM)', 'Operational', 'Overpass fair-use limits', 'LAY-001', 'PPLLPNN'),
    ('Submarine cables', 'Operational', 'CC BY-NC-SA: legal review', 'LAY-001', 'PPLLNNN'),
    ('Director (tour + narration)', 'Operational', 'Rule-based lines; browser speech', 'DIR-001–010', 'CCLLPNN'),
    ('Intel HUD + type photos', 'Operational', 'FEED/SIM tagging enforced by tests', 'INT-001–007, 013–014', 'CCCLPNN'),
    ('Analyst actions', 'Operational', 'Real: passes, conjunctions, imagery; rest simulated', 'INT-008–010', 'CCCLPNN'),
    ('Triage, watchlist, areas', 'Operational', 'Feed-driven ranking', 'INT-005, INT-011', 'CCCLNNN'),
    ('Exercise mode (fictional)', 'Demo only', 'No live data; human authorisation', 'EXE-001–005', 'CCLLCNN'),
    ('Server proxies & fallbacks', 'Operational', 'Keys server-side; JSON 404', 'SRV-001–005, SEC', 'CCCLPNN'),
    ('Performance & quality ladder', 'Operational', 'Preload, haze, caches; real-GPU FPS unmeasured', 'PRF-001–006', 'CCLLPNN'),
    ('Security controls', 'Operational', 'Injection tests; repo still public', 'SEC-001–005', 'CCCLPNN'),
    ('CM & verification tooling', 'Operational', 'CI green; trace and orphan gates', 'CM-001–003', 'CCCCPPN'),
    ('HENRI LLM commentator', 'Not started', 'Original goal; needs containment design', '—', 'NNNNNNN'),
    ('Feed-health indicators', 'Not started', 'Data age per layer', '—', 'NNNNNNN'),
]
FSTAT = {'Operational': '#2f7d5b', 'Limited': '#e3a83c', 'Inactive': '#c4553f', 'Demo only': '#5b6f8a', 'Not started': '#8a94a3'}

def feature_heatmap():
    w = 760
    left, top, cw, rh = 230, 52, 74, 16
    h = top + rh * len(FEATURES) + 10
    out = [f'<svg viewBox="0 0 {w} {h}" class="fig" role="img" aria-label="Feature by assurance dimension">']
    for j, d in enumerate(DIMS):
        x = left + j * cw + cw / 2
        words = d.split(' ')
        if len(words) > 1 and len(d) > 12:
            mid = len(words) // 2
            out.append(f'<text x="{x}" y="{top - 24}" text-anchor="middle" class="hdr">{E(" ".join(words[:mid]))}</text>')
            out.append(f'<text x="{x}" y="{top - 11}" text-anchor="middle" class="hdr">{E(" ".join(words[mid:]))}</text>')
        else:
            out.append(f'<text x="{x}" y="{top - 11}" text-anchor="middle" class="hdr">{E(d)}</text>')
    for i, (name, st, note, req, dims) in enumerate(FEATURES):
        y = top + i * rh
        out.append(f'<circle cx="10" cy="{y + 7}" r="4" fill="{FSTAT[st]}"/><text x="20" y="{y + 11}" class="lbl">{E(name)}</text>')
        for j, s in enumerate(dims):
            out.append(f'<rect x="{left + j * cw + 3}" y="{y + 2}" width="{cw - 6}" height="{rh - 4}" rx="3" fill="{COL[s]}"><title>{E(name)} · {DIMS[j]}: {LBL[s]}</title></rect>')
    out.append('</svg>')
    return ''.join(out)

def feature_table():
    rows = ''.join(
        f'<tr><td><span class="dot" style="background:{FSTAT[st]}"></span>{E(n)}</td><td>{E(st)}</td><td class="mono">{E(req)}</td><td>{E(note)}</td></tr>'
        for n, st, note, req, _ in FEATURES)
    return f'<table class="t compact"><thead><tr><th>Feature</th><th>Status</th><th>Requirements</th><th>Note</th></tr></thead><tbody>{rows}</tbody></table>'

# ── Depth diagram ────────────────────────────────────────────────────────
def depth_diagram():
    levels = [('SWAL 4', 'Software requirements', 'black box', 'Functional (black-box) tests'),
              ('SWAL 3', 'Architecture', '1st-level components as black boxes', 'Interface & component (grey-box) tests'),
              ('SWAL 2', 'Source code', 'line-by-line', 'Code-level analysis; independence on some'),
              ('SWAL 1', 'Executable', 'step-by-step', 'Executable analysis; independence on most')]
    w, h = 760, 210
    out = [f'<svg viewBox="0 0 {w} {h}" class="fig" role="img" aria-label="Analysis depth per SWAL">']
    for i, (sw, depth, how, ev) in enumerate(levels):
        y = 14 + i * 46
        indent = i * 34
        target = sw == 'SWAL 3'
        fill = '#1f3a5f' if target else '#eef1f5'
        fg = '#fff' if target else '#1d2733'
        out.append(f'<rect x="{20 + indent}" y="{y}" width="{420 - indent}" height="36" rx="5" fill="{fill}"/>')
        out.append(f'<text x="{34 + indent}" y="{y + 23}" class="lbl" style="fill:{fg}" font-weight="700">{sw}</text>')
        out.append(f'<text x="{108 + indent}" y="{y + 23}" class="lbl" style="fill:{fg}">{E(depth)} · {E(how)}</text>')
        out.append(f'<text x="460" y="{y + 23}" class="lbl">{E(ev)}</text>')
    out.append('<text x="20" y="204" class="axis">Each level adds analysis depth and inherits every objective below it. Highlighted: GEV target rigour.</text>')
    out.append('</svg>')
    return ''.join(out)

# ── Roadmap ──────────────────────────────────────────────────────────────
PHASES = [
    ('A', 'Baseline hygiene', 0, 1, 'Private repo, protected main, release tag, COTS SBOM, issues for limitations', '#1f3a5f'),
    ('B', 'Safety basis', 0, 3, 'ConOps, FHA with a customer, GEV-SAF requirements, allocated SWAL', '#3d6a99'),
    ('C', 'Architecture & COTS evidence', 1, 5, 'Component interface specs & tests, COTS dossiers, trim or trace inherited code', '#5b8bb8'),
    ('D', 'Independent verification', 4, 6, 'Independent review of functional tests, I/D procedures, verification report', '#7aa6cf'),
    ('E', 'Safety Folder / SSAR', 6, 7, 'Safety argument frozen at a release tag', '#9cc0e0'),
]
def roadmap():
    w, left, top, wk, rh = 760, 210, 30, 72, 40
    h = top + rh * len(PHASES) + 40
    out = [f'<svg viewBox="0 0 {w} {h}" class="fig" role="img" aria-label="Remediation roadmap">']
    for k in range(8):
        x = left + k * wk
        out.append(f'<line x1="{x}" y1="{top - 6}" x2="{x}" y2="{h - 34}" stroke="#e3e7ec"/>')
        if k < 7:
            out.append(f'<text x="{x + wk / 2}" y="{top - 12}" text-anchor="middle" class="axis">Wk {k + 1}</text>')
    for i, (pid, name, s, e, detail, colr) in enumerate(PHASES):
        y = top + i * rh
        out.append(f'<text x="{left - 12}" y="{y + 15}" text-anchor="end" class="lbl" font-weight="600">{pid}. {E(name)}</text>')
        out.append(f'<text x="{left - 12}" y="{y + 29}" text-anchor="end" class="axis">{"needs customer" if pid == "B" else ""}</text>')
        out.append(f'<rect x="{left + s * wk + 2}" y="{y + 3}" width="{(e - s) * wk - 4}" height="20" rx="4" fill="{colr}"><title>{E(detail)}</title></rect>')
    gx = left + 7 * wk
    out.append(f'<line x1="{gx}" y1="{top - 6}" x2="{gx}" y2="{h - 34}" stroke="#c4553f" stroke-width="1.5" stroke-dasharray="4 3"/>')
    out.append(f'<text x="{gx - 4}" y="{h - 18}" text-anchor="end" class="axis" style="fill:#c4553f">SWAL 3 rigour evidence complete (≈ week 7)</text>')
    out.append(f'<text x="{left}" y="{h - 18}" class="axis">Today: demo-ready</text>')
    out.append('</svg>')
    return ''.join(out)

CLUSTERS = [
    ('Safety basis', '3.0.5, 3.1.5, 3.3.x, 4.1.2–3', 'SWAL derived from hazards', 'Not met', 'Hazard log, FHA, allocation record', 'B'),
    ('Plan & argument', '3.2.x, 3.0.10, 3.0.17', 'Accepted plan; safety argument', 'Not met', 'Assessment plan reviewed by a named party; GSN argument', 'B, E'),
    ('Requirements & architecture', '4.3.4–5, 4.3.15, 5.4.3–5, 5.4.10', 'SRS, architecture, trace to components', 'Largely (new code)', 'Extend SRS and trace to inherited engine; interface specs', 'C'),
    ('COTS & data feeds', '3.0.13, 5.4.9, ch. 7', 'Same confidence for COTS and feeds', 'Partially', 'COTS dossiers, SBOM, feed integrity and outage tests', 'A, C'),
    ('Configuration & change', '3.0.7, 3.0.12, 3.0.15, 5.2.x, 5.4.13', 'Known build; impact analysis; rollback', 'Partially', 'Release tags, CI-built deploys, impact template, rollback test', 'A'),
    ('Independence & tools', '5.4.3, 4.3.19, ch. 7', 'Contested functional-test independence', 'Partially', 'Independent test reviewer; AI-use policy with no tool credit', 'D'),
    ('Monitoring & validation', '3.0.11, 4.4.5, 5.5.x', 'In-service monitoring; operational validation', 'Not met', 'Telemetry, feed-health indicators, user validation', 'C, D'),
]

def cluster_table():
    st = {'Not met': 'N', 'Partially': 'P', 'Largely (new code)': 'L'}
    rows = ''.join(f'<tr><td><b>{E(a)}</b><div class="mono sm">{E(b)}</div></td><td>{E(c)}</td><td>{chip(st[d])}</td><td>{E(e)}</td><td class="ctr">{E(f)}</td></tr>' for a, b, c, d, e, f in CLUSTERS)
    return f'<table class="t"><thead><tr><th>Gap cluster</th><th>SWAL 3 expects</th><th>GEV today</th><th>Evidence to produce</th><th>Phase</th></tr></thead><tbody>{rows}</tbody></table>'

def appendix():
    parts = []
    for g, rows in group_rows.items():
        body = ''.join(
            f'<tr><td class="mono">{E(r["id"])}</td><td>{E(r["title"])}{" <i>(placeholder)</i>" if r["placeholder"] else ""}</td>'
            f'<td class="ctr mono">{E(r["swal"]["3"])}</td><td>{chip(r["status"])}</td><td>{E(r["gev_evidence"])}</td><td>{E(r["action"])}</td></tr>'
            for r in rows)
        parts.append(f'<h3>{E(g)}</h3><table class="t ap"><thead><tr><th>ID</th><th>Objective</th><th>S3</th><th>Status</th><th>Evidence today</th><th>Action</th></tr></thead><tbody>{body}</tbody></table>')
    return ''.join(parts)

n_app = len(applicable)
kpis = [(f'{round(score * 100)}%', 'weighted readiness at SWAL 3'),
        (str(counts['C'] + counts['L']), f'of {n_app} applicable objectives met or largely met'),
        (str(counts['N']), 'objectives not met'),
        (f'{sum(1 for f in FEATURES if f[1] == "Operational")}/{len(FEATURES)}', 'platform features operational')]

CSS = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #1d2733; font-size: 10pt; line-height: 1.45; margin: 0; }
h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 6px; color: #13263d; letter-spacing: -0.01em; }
h2 { font-size: 15pt; margin: 0 0 4px; color: #13263d; }
h3 { font-size: 11pt; margin: 14px 0 6px; color: #1f3a5f; }
p { margin: 0 0 8px; }
.lead { font-size: 11pt; color: #34414f; max-width: 165mm; }
.kicker { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: #3d6a99; font-weight: 700; margin-bottom: 10px; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.cover { padding-top: 34mm; }
.band { height: 6px; background: linear-gradient(90deg, #13263d, #3d6a99 60%, #9cc0e0); border-radius: 3px; margin: 18px 0 22px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
.kpi { border: 1px solid #dde3ea; border-radius: 8px; padding: 12px 12px 10px; }
.kpi b { display: block; font-size: 20pt; color: #13263d; line-height: 1.1; }
.kpi span { font-size: 8.5pt; color: #5a6878; }
.verdict { border-left: 4px solid #c4553f; background: #fbf3f1; padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 14px 0; }
.ok { border-left-color: #2f7d5b; background: #f1f8f4; }
.meta { font-size: 8.5pt; color: #5a6878; margin-top: 26mm; }
.fig { width: 100%; height: auto; margin: 6px 0 10px; font-family: inherit; }
.fig .lbl { font-size: 11px; fill: #1d2733; }
.fig .hdr { font-size: 10px; fill: #34414f; font-weight: 600; }
.fig .axis { font-size: 9.5px; fill: #5a6878; }
.fig .val { font-size: 10px; font-weight: 700; }
.fig .score { font-size: 11px; font-weight: 700; fill: #13263d; }
.t { width: 100%; border-collapse: collapse; font-size: 8.6pt; margin: 6px 0 10px; }
.t th { text-align: left; font-weight: 700; color: #34414f; border-bottom: 1.5px solid #1f3a5f; padding: 4px 5px; }
.t td { border-bottom: 1px solid #e6eaef; padding: 4px 5px; vertical-align: top; }
.t tr { page-break-inside: avoid; }
.compact { font-size: 7.8pt; } .compact td { padding: 2.5px 5px; } .compact .mono { font-size: 7.3pt; }
.ap td:nth-child(5), .ap td:nth-child(6) { font-size: 8pt; color: #34414f; }
.mono { font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 8pt; }
.sm { color: #5a6878; margin-top: 2px; }
.ctr { text-align: center; }
.chip { display: inline-block; font-size: 7.6pt; font-weight: 700; border-radius: 10px; padding: 1px 7px; white-space: nowrap; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
.legend { font-size: 8.5pt; color: #5a6878; }
.note { font-size: 8.5pt; color: #5a6878; border-top: 1px solid #e6eaef; padding-top: 6px; margin-top: 8px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
ul { margin: 4px 0 8px 16px; padding: 0; } li { margin: 2px 0; }
"""

legend_feat = ' '.join(f'<span><span class="dot" style="background:{c}"></span>{k}</span>&nbsp;&nbsp;' for k, c in FSTAT.items())

HTML = f"""<!doctype html><html><head><meta charset="utf-8"><title>God's Eye View — ED-153 status and path to SWAL 3</title><style>{CSS}</style></head><body>

<section class="page cover">
  <div class="kicker">Digital Dynamics Group · Software assurance</div>
  <h1>God's Eye View<br>ED-153 status and path to SWAL 3</h1>
  <div class="band"></div>
  <p class="lead">Every platform feature, its current state, and what ED-153 (EUROCAE <i>Guidelines for ANS Software Safety Assurance</i>) would require to bring it to SWAL 3 rigour, assessed objective by objective against a reconstructed catalogue of {len(cat)} objectives.</p>
  <div class="kpis">{''.join(f'<div class="kpi"><b>{a}</b><span>{E(b)}</span></div>' for a, b in kpis)}</div>
  <div class="verdict"><b>Verdict.</b> The platform is demo-ready, and its engineering evidence is strong for new code: requirements traced in CI, 1,086 passing tests, 0 orphan files. A SWAL 3 claim is <b>not yet supportable</b>. Three things are missing: a hazard assessment that allocates the SWAL, COTS and data-feed justification, and independent review of functional tests.</div>
  <div class="verdict ok"><b>Context.</b> ED-153 is an example means of compliance under EU 2017/373 guidance, not a mandated standard. Australia's CASA rules set no SWAL requirement. For a public-data advisory tool, alignment is voluntary until an air navigation service provider integrates it and sets the required SWAL.</div>
  <div class="meta">Baseline: GitHub <span class="mono">main</span> 799ff53 · Assessed 14 October 2026 · Self-assessment, not an audit opinion.<br>
  Catalogue reconstructed from EUROCONTROL <i>Recommendations for ANS Software</i> (2005), the Czech CAA ED-153 guide (2016/2019) and EASA AMC/GM. Per-SWAL applicability is inferred; confirm against a purchased copy of ED-153 before any external claim.</div>
</section>

<section class="page">
  <div class="kicker">1 · Platform features</div>
  <h2>20 features: 15 operational, 2 not started</h2>
  <p class="lead">Feature engineering is solid. The assurance dimensions that ED-153 adds on top (data justification, monitoring, hazard analysis) are where every feature falls short.</p>
  {feature_heatmap()}
  <p class="legend">Feature status: {legend_feat}&nbsp; Cells: {' '.join(chip(s) for s in ('C','L','P','N'))}</p>
  {feature_table()}
</section>

<section class="page">
  <div class="kicker">2 · ED-153 at SWAL 3</div>
  <h2>Readiness {round(score * 100)}%: strongest in documentation and development, weakest wherever a hazard assessment is needed</h2>
  <p class="lead">{n_app} of {len(cat)} objectives apply at SWAL 3 here ({counts['NA']} are discretionary at SWAL 3 or not yet in scope, such as acquisition by an ANSP). {counts['C']} are compliant, {counts['L']} largely, {counts['P']} partially, and {counts['N']} not met.</p>
  {area_bars()}
  <h3>What SWAL 3 asks for: architecture-depth analysis</h3>
  {depth_diagram()}
  <p class="note">SWAL is allocated from severity × likelihood by the service provider's safety assessment. Structural coverage is not an ED-153 SWAL 3 objective (recommended at SWAL 2). Sources disagree on functional-test independence at SWAL 3: the Czech CAA guide requires none, while EUROCONTROL's 2005 guidance asks for a separate team. Plan for it.</p>
</section>

<section class="page">
  <div class="kicker">3 · Gaps and the path</div>
  <h2>Seven gap clusters; about seven weeks to complete SWAL 3 evidence</h2>
  <p class="lead">Phase A is in our hands now. Phase B needs a customer or service provider to define the operational use. Everything else follows from it.</p>
  {cluster_table()}
  {roadmap()}
  <p class="note">Effort is indicative for one team. The HENRI LLM commentator should be added as an isolated, advisory first-level component with no alerting path, so that it does not raise the platform's SWAL.</p>
</section>

<section class="page">
  <div class="kicker">Appendix A · Objective-by-objective assessment</div>
  <h2>All {len(cat)} objectives</h2>
  <p class="legend">S3 = inferred applicability at SWAL 3: R required, R (I?) required with contested independence, D discretionary, – not applied. Placeholder rows stand in for areas whose ED-153 titles were not recovered from public sources.</p>
  {appendix()}
</section>

<section class="page">
  <div class="kicker">Appendix B · Method and sources</div>
  <h2>How this assessment was made</h2>
  <ul>
    <li><b>Catalogue:</b> objective IDs and titles from EUROCONTROL SAF.ET1.ST03.1000-GUI-01-00 (2005) and -REP-01-00, the Czech CAA guide CAA-S-SP-002-2 v3 (numbered to match ED-153), the Thales 2013 EUROCONTROL workshop deck, and EASA AMC4 ATS.OR.205(a)(2) minimum evidence.</li>
    <li><b>Applicability:</b> per-SWAL R/D/I values are inferred from the SWAL depth definitions (requirements → architecture → source → executable) and the Czech independence summary. ED-153's own tables were not read; it is a paid EUROCAE document.</li>
    <li><b>Status scale:</b> Compliant / Largely / Partially / Not met / N/A, after the Automotive SPICE N–P–L–F scale. Weighted readiness scores C 1, L 0.75, P 0.4, N 0 across applicable objectives.</li>
    <li><b>Evidence:</b> the God's Eye View repository (docs/REQUIREMENTS.md, VERIFICATION.md, CONFIGURATION-INDEX.md, ED-153-GAP-ANALYSIS.md), CI results and Replit clean-clone runs of 14 October 2026.</li>
    <li><b>Regulatory context:</b> EU 2017/373 with ED Decision 2019/022/R (ED-153 listed as an example standard); Regulations (EU) 2023/1768 and 2023/1769 with DS-GE.SoC; EASA FAQs 139175 and 139614; CASA MOS Part 171/172.</li>
    <li><b>Limits:</b> self-assessment by the development team, not independent. Inherited upstream code was assessed at the level of the platform, not module by module.</li>
  </ul>
  <p class="note">Companion files: <i>ED-153 software assurance objectives</i> (research report) and the ED-153 Gap Assessor (reusable template).</p>
</section>
</body></html>"""

open('gev-ed153-status.html', 'w').write(HTML)
print('features', len(FEATURES), 'operational', sum(1 for f in FEATURES if f[1] == 'Operational'), 'score', round(score * 100), counts)
