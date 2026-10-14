# CrossCheck kit

Source of the CrossCheck dual assessor (ED-153 SWAL 3 + OWASP ASVS 5.0 L2) and the God's Eye View remediation pipeline.

- `crosscheck.template.html` + `build_crosscheck.py`: the CrossCheck app.
- `gev-seed.crosscheck.json`: frozen baseline assessment of God's Eye View.
- `build_ledger.py`: builds `docs/evidence/ledger.json` and `docs/REMEDIATION-PLAN.md` (append-only merge).
- `record_audit.py`: records a re-audit in the ledger.
- `export_audit_data.py`: exports the AUDIT view snapshot (baseline + ledger re-ratings).
- `build_plan_pdf.py` + `pdf.mjs`: the remediation plan PDF.

The ASVS text in `asvs.json` is © OWASP Foundation, CC BY-SA 4.0.
ED-153 objectives are reconstructed from public predecessors; confirm against ED-153 before any formal claim.
