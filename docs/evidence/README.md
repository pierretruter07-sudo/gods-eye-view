# Evidence record

This folder is the audit trail for taking God's Eye View from its audited baseline to compliance. It covers ED-153 (software safety assurance, SWAL 3), OWASP ASVS 5.0 (application security, Level 2) and ISO/IEC 42001 (AI management system), assessed with CrossCheck.

## Read it top down

| Level | Read this first if you want to know… | Where |
|---|---|---|
| 0 · 40,000 ft | What was done and what changed | Page 1 of each PDF (latest: `remediation-plan-v0.4.pdf`, which adds ISO/IEC 42001; v0.3 counted the pending items; v0.2 added the readiness journey; v0.1 is the first issue); `ledger.json` → `stages`, `audits` |
| 1 · Waves | What each wave delivered and the verdict after it | `ledger.json` → `waves`, `audits` |
| 2 · Workstreams | Which deliverables closed which findings | `../REMEDIATION-PLAN.md` §5; `ledger.json` → `workstreams` |
| 3 · Line by line | For one finding: baseline rating, fix, commit, test, new rating, date | `ledger.json` → `findings[].history` |

## The pipeline

1. **Baseline frozen.** Branch `baseline/crosscheck-2026-10-14` (commit `1518ea8`) never changes. The ISO 42001 lens was added on 2026-10-15 and assessed against `eeadc22`, frozen as `baseline/iso42001-2026-10-15`.
2. **Audit.** CrossCheck rates every ED-153 objective, every ASVS requirement and every ISO 42001 clause and Annex A control against the code and documents.
3. **Plan.** `../REMEDIATION-PLAN.md` assigns each of the 159 findings (72 safety, 31 security, 56 AI) to exactly one workstream and wave.
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

## Recording a re-audit

After each wave, the changed findings are re-rated and recorded with the CrossCheck kit:

```
python3 record_audit.py <repo-root> reaudit.json
```

`reaudit.json` names the audit (`id`, `wave`, `label`, `date`, `commit`), gives each re-rating a status and its evidence (`ref`, `note`), and can mark the wave's stage done. The tool:

1. appends one dated history entry per finding (from → to, the audit id, the evidence);
2. refreshes the shipped snapshot (`src/audit/data/assessment.json`), so the app shows the latest measured audit;
3. scores the audit with the AUDIT view's own rules (`src/audit/model.js`), so the record and the display can't disagree;
4. refuses an audit id that is already recorded, a status it doesn't know, and a re-rating without evidence.

A rehearsal on a scratch copy (all Wave 1 fixes landing as planned) gave 43.9% safety and 85.9% security. That is exactly the plan's Wave 1 target.

## Measured versus projected

The AUDIT view's timeline runs Baseline → Wave 1 → … → Wave 4 → Sign-off.

- **Measured** stops (solid) come from a recorded audit.
- **Projected** stops (dashed, labelled *Projected* on screen) apply each finding's planned `target` on top of the latest measured state.
- Sign-off applies `targetFull`, the end state with the customer and an independent reviewer.

Unit tests check that every projected stop reproduces `projections.journey` and the Sign-off stop reproduces scenario B. A projected stop is the plan, never evidence.

Three ASVS items (V4.1.2, V12.1.1, V12.1.2) depend on the hosting edge and were not rated at the baseline. They are listed in `pending`: rated in Wave 1 from a scan of the deployed app, and projected conservatively as *Pass with note* until then. Counting them is why plan v0.3 shows security at 88% after Wave 2, not v0.2's 89%.

## ISO/IEC 42001 (added 2026-10-15)

The third ring audits God's Eye View as an AI system: the Director's automatic picks and announcements, the planned HENRI narration and AI-assisted development. It rates clauses 4–10 and the Annex A controls (65 items; A.7.2 excluded because no model is trained). Baseline: 24% readiness, *ISO 42001 not met*, 56 open findings, 8 must-fix. Workstreams W11 (Wave 2), W12 (Wave 3) and W13 (Wave 4) close them; the plan projects 91% after Wave 4 and 97% once leadership holds the management review and an independent AIMS audit is done. Clause numbers and paraphrased titles only; confirm against a purchased copy of the standard. Certification needs an accredited body.
