# Evidence record

This folder is the audit trail for taking God's Eye View from its audited baseline to compliance. It covers ED-153 (software safety assurance, SWAL 3) and OWASP ASVS 5.0 (application security, Level 2), assessed with CrossCheck.

## Read it top down

| Level | Read this first if you want to know… | Where |
|---|---|---|
| 0 · 40,000 ft | What was done and what changed | Page 1 of each PDF (latest: `remediation-plan-v0.2.pdf`, approved; v0.1 is the issued draft); `ledger.json` → `stages`, `audits` |
| 1 · Waves | What each wave delivered and the verdict after it | `ledger.json` → `waves`, `audits` |
| 2 · Workstreams | Which deliverables closed which findings | `../REMEDIATION-PLAN.md` §5; `ledger.json` → `workstreams` |
| 3 · Line by line | For one finding: baseline rating, fix, commit, test, new rating, date | `ledger.json` → `findings[].history` |

## The pipeline

1. **Baseline frozen.** Branch `baseline/crosscheck-2026-10-14` (commit `1518ea8`) never changes.
2. **Audit.** CrossCheck rates every ED-153 objective and every ASVS requirement against the code and documents.
3. **Plan.** `../REMEDIATION-PLAN.md` assigns each of the 103 findings to exactly one workstream and wave.
4. **Approve.** The plan approval is recorded as a dated stage.
5. **Remediate.** Each fix is a commit named after its finding (for example `CrossCheck V3.4.3: …`) with a test or CI check.
6. **Re-audit.** At the end of each wave, CrossCheck re-rates the changed findings and records a new audit snapshot.
7. **Evidence pack.** The final PDF and safety folder are issued from this ledger.

## Rules for the ledger

- `ledger.json` is the single source of truth. The PDFs, the CrossCheck evidence view and the God's Eye View AUDIT replay are all generated from it.
- History is append-only. A finding's earlier entries are never edited.
- Every status change cites a commit, test, document or review record.
- `baseline` on each finding never changes. `current` always equals the last history entry.

## Readiness journey

`ledger.json` → `projections.journey` holds the target readiness after each wave (Claude + Replit + owner actions). `projections.scenarios` holds the two end states: without and with the customer and an independent reviewer. Each re-audit adds a measured point to `audits`. The PDFs and the CrossCheck evidence view plot measured points as dots and targets as dashed lines, so the gap between plan and reality stays visible.
