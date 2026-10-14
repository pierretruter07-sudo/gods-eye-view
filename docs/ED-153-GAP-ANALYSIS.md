# ED-153 gap analysis (target SWAL 3)

| | |
|---|---|
| Document | GEV-ED153-GA |
| Version | 0.1 |
| Date | 2026-10-14 |
| Baseline assessed | branch `audit/readiness` (see [Configuration index](CONFIGURATION-INDEX.md)) |
| Standard | EUROCAE ED-153, *Guidelines for ANS Software Safety Assurance* |
| Target | SWAL 3. Described as a new build with limited requirements. |

**Method.** Each SWAL 3 expectation from the brief is compared with the
evidence that exists in this repository today:
- the SRS;
- verification and traceability;
- zero orphan code;
- configuration management and problem reporting;
- verification independence;
- the Software Safety Folder.

The ED-153 process areas that the brief does not mention are compared the same
way. These are safety assessment, COTS / previously developed software, tools
and quality assurance. This is a self-assessment. It is not an audit opinion.

**Status key**
- ✅ **Met:** evidence exists and is current.
- 🟡 **Partial:** evidence exists but is incomplete.
- ❌ **Gap:** no evidence yet.

## 1. Headline findings

1. **Allocating a SWAL is not the developer's call (❌ blocking).** ED-153
   makes the ANSP, or a system-level safety assessment such as a Functional
   Hazard Assessment (FHA), allocate the SWAL. No FHA exists. GEV is
   currently a situational-awareness demonstrator: it is not air-navigation
   equipment and gives no ATC or separation function. Until an ANSP or customer
   allocates a SWAL against a defined operational use, "SWAL 3" is a
   planning assumption.
2. **It is not wholly a new build (🟡).** About 7.4k lines are new, written for
   the fork (Director, intel HUD, shell, Exercise). About 65k lines are
   inherited from the open-source upstream (layers, data models, server
   proxies). Under ED-153 the inherited code is previously developed
   software. It needs either a PDS justification, or reverse-engineered
   requirements with full traceability.
3. **Traceability is complete for the fork's own code, not the inherited
   code (🟡).** All 56 baseline requirements trace to code and evidence. The
   inherited code has about 1,000 tests but no requirements.
4. **Verification is not independent (❌).** Code and tests were written by
   the same team, with AI assistance. SWAL 3 expects the reviewer or tester
   to be someone other than the author.
5. **Configuration management is functional but informal (🟡).**
   - Git history, a build stamp and a configuration index exist.
   - There are no release tags, no protected branch and no problem reports.
   - The hosted demo is not a clean checkout.
   - The repository is public.

## 2. Objective-by-objective assessment

| # | ED-153 / SWAL 3 expectation | Status | Evidence today | Gap and remediation |
|---|---|---|---|---|
| 1 | SWAL allocated by system safety assessment (FHA/PSSA) | ❌ | None | Define the operational use. Run an FHA with the customer or ANSP. Derive safety requirements and record the allocated SWAL. |
| 2 | Software safety requirements derived from the safety assessment | ❌ | None. GEV-SRS 0.1 was reverse-engineered from behaviour. | Add a safety-requirement tier (GEV-SAF-xxx) from the FHA, and trace it into GEV-SRS. |
| 3 | Software Requirements Specification | 🟡 | [REQUIREMENTS.md](REQUIREMENTS.md): 56 uniquely identified requirements, each with a verification method | Formal review and approval. Add requirements for the inherited layer engine (data ingest, rendering limits, failure handling). Validate with users. |
| 4 | Architecture / design description | 🟡 | [ARCHITECTURE.md](ARCHITECTURE.md): components, data flow, trust boundaries. Import-direction and package-boundary checks enforce structure. | Add a design-to-requirement mapping per component and interface definitions for the `/api` proxies. |
| 5 | Bidirectional traceability (safety req → SRS → design → code → test → result) | 🟡 | [VERIFICATION.md §2](VERIFICATION.md): every requirement maps to a code location and an evidence item (56/56, checked mechanically). The results log records test runs per commit. | No safety-requirement tier (item 2). Inherited code is not traced. The matrix is now checked mechanically in CI and `npm test` (`scripts/audit/trace-check.mjs`: 56/56 traced, 51 cited test titles verified to exist). |
| 6 | Zero orphan code | 🟡 | `scripts/audit/import-graph.mjs`: 326/326 files reachable, 0 orphans, 0 dangling imports. 518 unreachable inherited files were removed. | "Reachable" is not the same as "required". Remaining items: reachable-but-unused functionality (e.g. the `/api/route` endpoint), and inherited code with no requirement. Remove or justify each through a deactivated-code review. |
| 7 | Functional testing of every requirement, nominal and off-nominal | 🟡 | 42 of 56 requirements are verified by automated test. Fork modules have explicit off-nominal cases (unplaceable records, old or small quakes, ordinary squawks, missing operator, hostile feed strings, upstream failures). | 7 requirements are verified by inspection and 6 by demonstration only. Write test procedures and expected results for these, and record each run. |
| 8 | Structural coverage | ❌ | Not measured | Add `c8` or V8 coverage to `npm test`, report statement and branch coverage for fork modules, and justify uncovered code. |
| 9 | Code review | ❌ | No review records. Changes are committed directly. | Use pull-request reviews on a protected `main` with a reviewer checklist. Keep the review record. |
| 10 | Verification independence | ❌ | A clean-clone build and test runs in a separate environment (Replit), but the same team authors and verifies. | Appoint an independent reviewer or tester for requirements, tests and results. Record the independence in the verification report. |
| 11 | Verification plan and report | 🟡 | [VERIFICATION.md](VERIFICATION.md) (plan, matrix, results log). [TESTING.md](TESTING.md) (procedure). | Add the verification report for the release baseline: test results, coverage, review findings, open problems. |
| 12 | Configuration identification and baselines | 🟡 | [CONFIGURATION-INDEX.md](CONFIGURATION-INDEX.md), lockfile, build stamp on every build | Tag the release baseline. Generate the configuration index from the tag. Put the two Replit-only config files under version control. Deploy from a CI artifact. |
| 13 | Problem reporting and change control | 🟡 | GitHub Issues with a bug template. Changelog. Commit messages. | No problem reports have ever been raised. Every change goes straight to a branch. Log defects as issues, link fixes to issues, and review changes before merge. |
| 14 | Baseline security | ❌ | The repository is **public** and `main` is unprotected | Make the repository private (or split public and private parts). Protect `main` (reviews and status checks). Enable 2FA and secret scanning. |
| 15 | COTS / previously developed software | ❌ | Licences inventoried ([THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)). Data-source terms flagged ([DATA_SOURCES.md](../DATA_SOURCES.md)). | Write a PDS/COTS assessment for CesiumJS, satellite.js, the upstream fork and every live data feed: version, known defects, behaviour on failure, how they are monitored. |
| 16 | Tool assessment | 🟡 | Tools pinned in the lockfile: Vite, Prettier, Node test runner | List the development and verification tools and state why none needs qualification (none generates flight or ATC output). Record the AI-assisted authoring and its review controls. |
| 17 | Software quality assurance | ❌ | CI gates exist but CI has been red on `main` (fixed on this branch) | Define a QA role and checks: CI must pass before merge; periodic process audit. |
| 18 | Software Safety Folder / SSAR | 🟡 | This analysis plus the documents above form the folder index (§3) | Write the SSAR safety argument once items 1–2 exist. Until then, a "readiness folder" is the honest label. |

## 3. Software Safety Folder: current index

| Folder item | Document | State |
|---|---|---|
| Safety assessment and SWAL allocation | — | Missing (item 1) |
| Software Requirements Specification | [REQUIREMENTS.md](REQUIREMENTS.md) | Draft 0.1 |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | Draft |
| Verification plan, traceability, results | [VERIFICATION.md](VERIFICATION.md) | Draft 0.1 |
| Test procedure | [TESTING.md](../TESTING.md) | Current |
| Configuration index | [CONFIGURATION-INDEX.md](CONFIGURATION-INDEX.md) | Draft 0.1 |
| Known limitations and open problems | [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) | Current |
| Security assessment | [SECURITY.md](../SECURITY.md) | Current |
| Data sources, licences and COTS inventory | [DATA_SOURCES.md](../DATA_SOURCES.md), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | Current |
| Gap analysis and remediation plan | this document | 0.1 |

## 4. Remediation plan

| Phase | Work | Outcome | Rough effort |
|---|---|---|---|
| A. Baseline hygiene (now) | Make the repo private. Protect `main`. Tag `v0.2.0-demo`. Add coverage reporting. (Traceability CI check: done.) Raise issues for every known limitation. | Items 6, 8, 12, 13, 14, 17 move to 🟡/✅ | 2–3 days |
| B. Safety basis (needs customer) | Agree the operational use. Run the FHA with the customer or ANSP. Derive GEV-SAF requirements. Record the allocated SWAL. | Items 1, 2 | 1–2 weeks, customer-dependent |
| C. Scope decision on inherited code | Either cut the inherited layer engine to the minimum the requirements need, or reverse-engineer and trace its requirements. Write the PDS/COTS assessment for libraries and feeds. | Items 5, 6, 15 | 2–4 weeks |
| D. Independent verification | Appoint an independent reviewer. Review the SRS and tests. Execute I/D procedures with records. Write the verification report. | Items 7, 9, 10, 11 | 1–2 weeks |
| E. SSAR | Write the safety argument referencing A–D. Freeze the configuration index at the release tag. | Item 18 | 3–5 days |

**Readiness verdict:** the code base, requirements baseline, traceability
for new code, configuration identification and documentation are in good
shape for an executive demonstration and a pre-audit review. An ED-153 SWAL 3
claim is **not supportable yet**. Three things are missing: a safety
assessment that allocates the SWAL, independent verification, and treatment
of the inherited and COTS software. None of these is technically hard. Two
of them depend on the customer defining the operational use.
