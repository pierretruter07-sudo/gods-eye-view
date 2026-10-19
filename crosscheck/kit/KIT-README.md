# CrossCheck audit kit

Scripts and data behind the God's Eye View audit: the three standard
catalogues, the God's Eye View ratings, the evidence ledger, the AUDIT view
snapshot, the remediation plan PDF and the CrossCheck page.

The God's Eye View repo is the source of truth for results
(`docs/evidence/ledger.json`, `src/audit/data/assessment.json`). This kit
produces and updates them.

## Requirements

- Python 3.10 or later (standard library only).
- Node.js with Playwright and Chromium (renders the PDFs).
- IBM Plex fonts (Sans, Sans Condensed, Mono) as woff2, for the plan PDF.

## Hard-coded paths to change first

| File | Path | Change to |
|---|---|---|
| `build_plan_pdf.py` | `FONT = '/home/claude/vendor/plex/packages'` | your IBM Plex `packages` folder |
| `build_crosscheck.py` | `/home/claude/gods-eye-view/docs/evidence/ledger.json` | your clone's ledger |
| `build_asvs.py` | `/home/claude/owasp/asvs/...flat.json` | the ASVS 5.0.0 flat JSON from github.com/OWASP/ASVS (only to rebuild `asvs.json`) |
| `plan_tables.py` | `/home/claude/ed153-kit/...` | this folder |
| `pdf.mjs`, `shoot*.mjs`, `dbg.mjs` | `/opt/node-tools/node_modules/x.js` | a normal `import { chromium } from 'playwright'` |

## What each file does

| File | Role |
|---|---|
| `catalogue.json`, `catalogue.ui.json` | ED-153 objective catalogue (reconstructed; numbers and paraphrased titles) |
| `asvs.json` (`build_asvs.py`) | OWASP ASVS 5.0.0 requirements, CC BY-SA 4.0 |
| `iso42001.json` (`build_iso42001.py`) | ISO/IEC 42001 clauses 4–10 and Annex A controls (numbers and paraphrased titles) |
| `gev_assessment.py` | God's Eye View rated against ED-153 at SWAL 3 |
| `gev_asvs.py` | God's Eye View rated against ASVS Level 2 |
| `gev_iso42001.py` | God's Eye View rated against ISO 42001, with the AI scope |
| `gev-seed.json`, `gev-seed.crosscheck.json` | The God's Eye View assessment as CrossCheck stores it |
| `build_ledger.py <repo>` | Builds or merges `docs/evidence/ledger.json` and `docs/REMEDIATION-PLAN.md` (waves, workstreams, projections). Append-only merge. |
| `export_audit_data.py <repo>` | Writes `src/audit/data/assessment.json` for the AUDIT view (baseline plus ledger re-ratings) |
| `record_audit.py <repo> <reaudit.json>` | Records a re-audit: appends history, refreshes the snapshot, scores all three standards with the app's own code, marks the stage done |
| `build_plan_pdf.py <repo> <out.html> <version> "<date>"` then `node pdf.mjs <out.html> <out.pdf> "<footer title>"` | Remediation plan PDF |
| `build_gev_pdf.py` | The ED-153 status PDF (`docs/ED-153-STATUS.pdf`) |
| `build_crosscheck.py` | Builds `crosscheck.html` from `crosscheck.template.html` and the seed with the ledger copy |
| `crosscheck.html` | The CrossCheck page as published |
| `plan_tables.py`, `plan.template.md`, `plan.ws.md`, `findings.json` | Inputs to the plan text |

## Usual order

1. Ratings change: edit `gev_*.py`, then `python3 build_crosscheck.py`.
2. `python3 build_ledger.py <repo>` and `python3 export_audit_data.py <repo>`.
3. In the repo: `node --test src/audit/audit.test.mjs` (the AUDIT view must reproduce the ledger's numbers).
4. Plan PDF: `build_plan_pdf.py`, then `pdf.mjs`.
5. After a wave: `record_audit.py` (rehearse on a copy of the repo first).

## Copyright

ED-153 (EUROCAE) and ISO/IEC 42001 (ISO/IEC) are copyrighted: keep to clause
numbers and paraphrased titles. ASVS text keeps its CC BY-SA 4.0 attribution.
