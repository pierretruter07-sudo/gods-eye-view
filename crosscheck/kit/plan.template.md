# God's Eye View remediation plan

**Purpose.** This plan takes God's Eye View from its audited state to:
- OWASP ASVS 5.0 Level 2;
- an ED-153 SWAL 3 claim backed by evidence and ready for independent assessment.

Every gap that CrossCheck found is assigned once to a workstream, with a fix and the evidence that will close it.

| | |
|---|---|
| Item | God's Eye View (fork of the public God's Eye View project) |
| Baseline | Branch `baseline/crosscheck-2026-10-14`, commit `1518ea8`. Frozen; never changes. |
| Assessed with | CrossCheck dual assessor (ED-153 reconstructed catalogue v0.1 + OWASP ASVS 5.0.0) |
| Plan version | 0.1, 14 Oct 2026, for approval |

## 1. Where we start

| Lens | Target | Baseline | Verdict |
|---|---|---|---|
| Safety | ED-153 SWAL 3 | 38% readiness, 72 open findings (23 non-compliant, 15 at S1–S2) | Claim not supported |
| Security | ASVS 5.0 Level 2 | 62% readiness, 31 open findings (13 fail, 5 at High) | Level 2 not met |

That makes **103 findings in total**. Twenty of them block a claim outright: 15 at S1–S2 and 5 at High.

## 2. What "done" means

- **Security: done.** CrossCheck shows ASVS Level 2 met. Every Level 1–2 requirement passes or largely passes, and no Critical or High finding is open.
  - Adding sign-in (W5) brings the authentication, session and token chapters (V6, V7, V9, V10) into scope.
  - They are assessed in Wave 2. Using an external identity provider keeps most password requirements with that provider.
- **Safety: claim-ready.** CrossCheck shows the SWAL 3 claim supported:
  - every required objective is at least Largely compliant;
  - no S1–S2 finding is open;
  - the safety folder holds the argument and evidence.
- **Final ED-153 acceptance is not ours to give.** It needs:
  - an independent assessor;
  - the customer's operational context;
  - a check of the reconstructed catalogue against a purchased copy of ED-153.

  This plan delivers everything up to that review.

## 3. How every fix is evidenced

The same loop runs for every gap, and the AUDIT view in God's Eye View replays it:

1. **Fix in a commit** that names the finding, e.g. `CrossCheck V3.4.3: add script-src Content-Security-Policy`.
2. **Prove it.** Each code fix comes with a test or a CI check. Each document fix is a versioned file in `docs/`.
3. **Re-rate in CrossCheck.** The commit SHA becomes the evidence reference on the finding.
4. **Re-audit at the end of each wave** and record the new verdict against the frozen baseline.

### How the record is kept and read

There is one source of truth: `docs/evidence/ledger.json`. The plan PDF, the wave re-audit reports, the final evidence pack, the CrossCheck evidence view and the AUDIT replay in God's Eye View are all generated from it, so they cannot disagree.

Every view reads from the top down:

| Level | Question it answers | Where |
|---|---|---|
| 0 · 40,000 ft | What was done and what changed: baseline → audit → plan → fixes → re-audit → evidence | Page 1 of every PDF; top of the CrossCheck evidence view |
| 1 · Waves | What each wave delivered and the verdict after it | Wave pages; CrossCheck wave timeline |
| 2 · Workstreams | Which deliverables closed which findings | Workstream pages; CrossCheck workstream cards |
| 3 · Line by line | For one finding: baseline rating, fix, commit, test, new rating, date | Ledger appendix; CrossCheck finding history |

The pipeline itself is recorded as dated events in the ledger:
1. Baseline frozen
2. Audit
3. Plan issued
4. Plan approved
5. Each wave started and completed
6. Each re-audit
7. Evidence pack issued

## 4. Waves

| Wave | Name | Workstreams | Who | Indicative effort | Exit check |
|---|---|---|---|---|---|
| 1 | Harden | W1 Web hardening, W2 Abuse resistance, W3 Supply chain and secrets, W4 Logging and monitoring, W6 Data and validation rules | Engineering | 1 week | Every Wave 1 security finding closed except V8; re-audit |
| 2 | Control access | W5 Access control (plus new V6/V7/V9/V10 scope) | Engineering + customer IdP | 1 week | **ASVS Level 2 met**; re-audit |
| 3 | Prove safety | W7 Safety analysis, W8 Safety plan, process and CM, W9 Requirements, verification and validation | Safety lead, engineering, customer | 2–3 weeks | No S1–S2 finding open |
| 4 | Assure and hand over | W10 Safety case and release evidence | Safety lead, independent reviewer | 1 week | **SWAL 3 claim supported**; evidence pack issued |

Waves 1 and 3 can run in parallel if a safety lead is available.

## 5. Workstreams

{{WORKSTREAMS}}

## 6. What only the customer or owner can do

| Item | Why it cannot be done in code | Needed by |
|---|---|---|
| Choose the identity provider (Google Workspace, Microsoft Entra ID or Auth0) | It is the customer's directory | Wave 2 |
| Confirm the operational context and join the hazard assessment | Hazards depend on how the tool is used | Wave 3 |
| Name the plan approver and an independent reviewer | ED-153 needs a reviewer independent of the developers | Wave 3 |
| Restrict the Google Maps and Cesium browser keys in their consoles | The keys belong to the account owner | Wave 1 |
| Validate with operational users | Validation needs real users | Wave 3 |

## 7. Decisions requested to start

1. Approve this plan (version 0.1) so Wave 1 can start.
2. Pick an identity provider for Wave 2. Without a decision, a provider-neutral OIDC setup will be built and tested against a local test provider.
3. Confirm the default operational context in W7, or replace it.
