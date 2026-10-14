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

### W1 Web hardening (Wave 1)

**Deliverables**

- Security headers on every response: HSTS, nosniff, Referrer-Policy and a Content-Security-Policy with script-src.
- Inline HTML templates moved so the policy can drop unsafe-inline.
- Debug handle (window.__godsEyeView, ?fps) gated out of production builds.

**Evidence:** Header tests in the preview-serving suite; a browser-captured policy report.

Closes 6 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V3.2.1 | ASVS | Security controls are in place to prevent browsers from rendering content or functionality in H… | Partial | Medium | Add nosniff and a CSP (see V3.4.3, V3.4.4). |
| V3.4.1 | ASVS | A Strict-Transport-Security header field is included on all responses to enforce an HTTP Strict… | Non-compliant | Medium | Set HSTS (max-age >= 1 year) in server headers or at the edge. |
| V3.4.3 | ASVS | HTTP responses include a Content-Security-Policy response header field which defines directives… | Non-compliant | High | Ship a script-src CSP (nonces or hashes) after moving inline HTML templates. |
| V3.4.4 | ASVS | All HTTP responses contain an 'X-Content-Type-Options: nosniff' header field. This instructs br… | Non-compliant | Medium | Add nosniff to server.headers. |
| V3.4.5 | ASVS | The application sets a referrer policy to prevent leakage of technically sensitive data to thir… | Partial | Low | Set Referrer-Policy: strict-origin-when-cross-origin explicitly. |
| V13.4.5 | ASVS | Documentation (such as for internal APIs) and monitoring endpoints are not exposed unless expli… | Partial | Low | Remove or gate the debug handle in production. |

### W2 Abuse resistance and availability (Wave 1)

**Deliverables**

- Rate limiting on by default for every cost-bearing proxy, with global caps.
- Client IP taken from the forwarded header only when the request comes through the known proxy hop.
- Heavy endpoints and resource budgets (frame time, memory, latency) documented.

**Evidence:** Limiter tests; a load test against the deployed app.

Closes 6 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V2.4.1 | ASVS | Anti-automation controls are in place to protect against excessive calls to application functio… | Partial | High | Enable limits by default; add global quota caps and alerting on provider spend. |
| V2.3.2 | ASVS | Business logic limits are implemented per the application's documentation to avoid business log… | Partial | Medium | Turn rate limiting on by default in production config. |
| V15.3.4 | ASVS | All proxying and middleware components transfer the user's original IP address correctly using … | Partial | Medium | Trust the platform's forwarded header only from the known proxy hop. |
| V2.1.3 | ASVS | Expectations for business logic limits and validations are documented, including both per-user … | Partial | Medium | Document per-client and global limits for each cost-bearing proxy. |
| V15.1.3 | ASVS | The application documentation identifies functionality which is time-consuming or resource-dema… | Partial | Low | Document heavy endpoints (Overpass, routes, tracks) and their limits. |
| 4.3.13 | ED-153 | Resource management (load, memory, time response) | Partial | S4 | Resource budgets (frame time, memory, latency). |

### W3 Supply chain and secrets (Wave 1)

**Deliverables**

- npm audit and Dependabot in CI; CI fails on High or Critical.
- CycloneDX software bill of materials (SBOM) for each release; patch time limits in SECURITY.md.
- COTS dossiers: CesiumJS, satellite.js, Node, browsers, Replit, each data feed.
- Browser keys restricted by referrer and API (owner action); secrets in a managed store with rotation.

**Evidence:** CI logs; SBOM file; dossiers; console screenshots.

Closes 10 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V15.2.1 | ASVS | The application only contains components which have not breached the documented update and reme… | Non-compliant | High | Add npm audit and Dependabot; fail CI on high/critical. |
| V15.1.1 | ASVS | Application documentation defines risk based remediation time frames for 3rd party component ve… | Non-compliant | Medium | Add a patch SLA to SECURITY.md (e.g. critical 7 days, high 30). |
| V15.1.2 | ASVS | An inventory catalog, such as software bill of materials (SBOM), is maintained of all third-par… | Non-compliant | Medium | Generate a CycloneDX SBOM in CI and keep it with each release. |
| V13.3.1 | ASVS | A secrets management solution, such as a key vault, is used to securely create, store, control … | Partial | Medium | Move to a managed secret store with rotation for the production deployment. |
| V13.3.2 | ASVS | Access to secret assets adheres to the principle of least privilege. | Partial | Medium | Restrict browser keys by HTTP referrer and API; verify in the Google and Cesium consoles. |
| V13.2.5 | ASVS | The web or application server is configured with an allowlist of resources or systems to which … | Partial | Low | Restrict outbound egress to the documented hosts where hosting allows. |
| 3.0.13 | ED-153 | COTS | Partial | S3 | COTS dossiers: CesiumJS, satellite.js, Node, browser, host, feeds. |
| 7.x COTS | ED-153 | COTS | Partial | S4 | COTS dossiers, SBOM, wrappers. |
| 7.x SE | ED-153 | Service experience | Non-compliant | S3 | Service history argument where COTS credit claimed. |
| 4.3.10 | ED-153 | Standards/rules (incl. PDS/COTS references) | Partial | S4 | Reference PDS/COTS standards and deviations. |

### W4 Logging and monitoring (Wave 1)

**Deliverables**

- Structured JSON logs with UTC timestamps and request IDs; untrusted values encoded.
- Security events logged: rate-limit hits, validation rejects.
- Log inventory; logs forwarded to a separate store with alerting (Wave 2).
- Feed-health telemetry mapped to the SWAL monitoring objective.

**Evidence:** Logger tests; log inventory; an alert fired in test.

Closes 11 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V16.1.1 | ASVS | An inventory exists documenting the logging performed at each layer of the application's techno… | Non-compliant | Medium | Document what each layer logs, where, and retention. |
| V16.3.3 | ASVS | The application logs the security events that are defined in the documentation and also logs at… | Non-compliant | Medium | Log rate-limit and validation rejects as security events. |
| V16.4.3 | ASVS | Logs are securely transmitted to a logically separate system for analysis, detection, alerting,… | Non-compliant | Medium | Forward logs to a SIEM or log service with alerting. |
| V16.2.1 | ASVS | Each log entry includes necessary metadata (such as when, where, who, what) that would allow fo… | Partial | Low | Adopt structured JSON logs with timestamp and request id. |
| V16.2.2 | ASVS | Time sources for all logging components are synchronized, and that timestamps in security event… | Partial | Low | Emit ISO-8601 UTC timestamps. |
| V16.2.4 | ASVS | Logs can be read and correlated by the log processor that is in use, preferably by using a comm… | Partial | Low | Use JSON lines. |
| V16.4.1 | ASVS | All logging components appropriately encode data to prevent log injection. | Partial | Low | Encode or JSON-stringify untrusted values in logs. |
| V16.4.2 | ASVS | Logs are protected from unauthorized access and cannot be modified. | Partial | Low | Ship logs to an append-only store. |
| 3.0.11 | ED-153 | SWAL monitoring | Non-compliant | S2 | Telemetry and incident log mapped to SWAL. |
| 4.4.5 | ED-153 | Performance monitoring | Non-compliant | S3 | Telemetry and feed-health indicators. |
| 4.4.4 | ED-153 | Software operation | Partial | S4 | Operating procedures and logs. |

### W5 Access control (Wave 2)

**Deliverables**

- Sign-in through an external identity provider (OIDC); roles viewer, operator, admin.
- Server-side checks on every function; paid proxies need operator; Exercise mode needs an explicit role.
- Session timeout and logout; authorization model documented.

**Evidence:** Access-control test matrix (role × endpoint); CrossCheck assessment of the new V6, V7, V9 and V10 rows.

Closes 2 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V8.1.1 | ASVS | Authorization documentation defines rules for restricting function-level and data-specific acce… | Non-compliant | High | Define roles (viewer, operator, admin) and which functions each may use. |
| V8.2.1 | ASVS | The application ensures that function-level access is restricted to consumers with explicit per… | Non-compliant | High | Put authentication (SSO/OIDC) in front of the app before any non-public deployment. |

### W6 Data and validation rules (Wave 1)

**Deliverables**

- Input-validation specification per API endpoint: types, ranges, lengths, combined-field rules.
- Data classification (public, aggregated-sensitive, simulated) with handling rules for caching, export and retention.

**Evidence:** Both documents, each validation rule traced to an existing test.

Closes 4 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| V2.1.1 | ASVS | The application's documentation defines input validation rules for how to check the validity of… | Partial | Medium | Write an input-validation spec per API endpoint (types, ranges, lengths). |
| V2.1.2 | ASVS | The application's documentation defines how to validate the logical and contextual consistency … | Partial | Low | Add to the validation spec. |
| V14.1.1 | ASVS | All sensitive data created and processed by the application has been identified and classified … | Non-compliant | Medium | Classify data (public, aggregated-sensitive, simulated) and record handling rules. |
| V14.1.2 | ASVS | All sensitive data protection levels have a documented set of protection requirements. This mus… | Non-compliant | Medium | Define per-class requirements (retention, caching, export). |

### W7 Safety analysis (Wave 3)

**Deliverables**

- Concept of operations: users, environment, advisory-only boundary.
- Functional hazard assessment: failure modes per component, effects on the operator, justified likelihood.
- SWAL allocation per failure; preliminary system safety assessment.
- Safety requirements (GEV-SAF tier) traced into the SRS.

**Evidence:** Versioned analysis documents reviewed with the customer.

Closes 10 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| 3.1.2 | ED-153 | Operational environment | Partial | S3 | ConOps: users, environment, advisory-only boundary. |
| 3.1.5 | ED-153 | System FHA & PSSA output | Non-compliant | S2 | FHA with the customer. |
| 4.1.2 | ED-153 | Functional Hazard Assessment | Non-compliant | S2 | FHA (shared with 3.1.5). |
| 3.3.1 | ED-153 | Failures identification | Non-compliant | S2 | Failure modes per component. |
| 3.3.2 | ED-153 | Failure effects | Non-compliant | S2 | Effects of each failure on users. |
| 3.3.3 | ED-153 | Assessment of risk | Non-compliant | S2 | Likelihood justification. |
| 3.0.5 | ED-153 | SWAL allocation | Non-compliant | S2 | Hazard log and severity x likelihood allocation. |
| 3.3.5 | ED-153 | SWAL allocation | Non-compliant | S2 | Allocation per failure. |
| 4.1.3 | ED-153 | Preliminary System Safety Assessment | Non-compliant | S2 | PSSA after the FHA. |
| 3.3.4 | ED-153 | Software requirements setting | Partial | S3 | GEV-SAF tier traced into the SRS. |

### W8 Safety plan, process and configuration management (Wave 3)

**Deliverables**

- Software safety assessment plan: approach, rigour per SWAL, I/R/D classification, named reviewer sign-off.
- Development plan with an AI-assistance policy: no tool credit, human review of every AI change.
- Configuration management plan: protected main, reviews, tagged releases, CI-built artifact with build stamp, tested rollback.
- Change-impact template; requirement change control through issues; QA role and audits.
- Problem-report process (known limitations logged as issues); operations and maintenance plans; training records.

**Evidence:** Approved plans; repository settings evidence; release records.

Closes 29 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| 3.0.1 | ED-153 | Implementation of the SSAS | Non-compliant | S2 | Write the SSAS into a software safety assessment plan. |
| 3.2.1 | ED-153 | Approach | Partial | S3 | Software safety assessment approach. |
| 3.2.2 | ED-153 | Plan | Partial | S3 | Software safety assessment plan. |
| 3.2.3 | ED-153 | Plan review | Non-compliant | S2 | Named reviewer signs off the plan. |
| 3.2.4 | ED-153 | Plan dissemination | Partial | S3 | Distribution record. |
| 3.0.8 | ED-153 | Assurance rigour objective | Partial | S3 | State SWAL-scaled rigour in the plan. |
| 3.0.9 | ED-153 | Assurance rigour criteria | Partial | S3 | Per-objective I/R/D classification in the plan. |
| 3.4.3 | ED-153 | Process assurance | Non-compliant | S2 | QA audit of the process. |
| 4.2.4 | ED-153 | Planning | Partial | S4 | Project and development plans. |
| 4.3.3 | ED-153 | Process implementation | Partial | S4 | Development plan incl. COTS scope and AI-use policy. |
| 4.3.11 | ED-153 | Requirement development management | Partial | S4 | Requirement change control via issues. |
| 3.0.7 | ED-153 | Configuration management assurance | Partial | S3 | Tag releases; deploy a CI-built artifact. |
| 5.2.1 | ED-153 | Process implementation | Partial | S4 | CM plan. |
| 5.2.3 | ED-153 | Configuration control | Partial | S4 | Protected main with reviews. |
| 5.2.x | ED-153 | Further CM objectives (placeholder) | Partial | S4 | Status accounting and release records. |
| 5.4.13 | ED-153 | Verification of retrieval and release process | Partial | S4 | Tagged, reproducible releases. |
| 3.0.12 | ED-153 | Software modifications | Partial | S3 | Per-change impact analysis template. |
| 3.0.15 | ED-153 | All on-line aspects of SW operational changes | Partial | S3 | Documented and tested rollback. |
| 4.4.1 | ED-153 | Process implementation | Partial | S4 | Operations plan. |
| 4.5.1 | ED-153 | Process implementation | Partial | S4 | Maintenance plan. |
| 4.5.2 | ED-153 | SWAL allocation confirmation | Non-compliant | S3 | Impact analysis per release. |
| 4.5.3 | ED-153 | SWAL satisfaction | Non-compliant | S3 | Release evidence pack. |
| 5.3.x | ED-153 | Quality assurance (placeholder) | Non-compliant | S3 | QA role, plan and audits. |
| 5.8.x | ED-153 | Problem resolution (placeholder) | Partial | S4 | Log all known limitations as issues. |
| 6.1.x | ED-153 | Management (6.1.5 cited) | Partial | S4 | Project management records. |
| 6.2.x | ED-153 | Infrastructure (placeholder) | Partial | S4 | Infrastructure definition. |
| 6.3.x | ED-153 | Improvement (6.3.2 cited) | Partial | S4 | Improvement records. |
| 6.4.x | ED-153 | Training (placeholder) | Non-compliant | S3 | Training and competence records. |
| 7.x DE | ED-153 | Development environment | Partial | S4 | Environment under CM, incl. AI agent configuration. |

### W9 Requirements, verification and validation (Wave 3)

**Deliverables**

- Reviewed and approved SRS covering the inherited layer engine; traceability widened from 56 requirements.
- Dead-code review (remove /api/route); isolation argument per first-level component.
- Integration tests at every component boundary; feed-integrity and outage tests.
- Architecture review record; verification report; validation with operational users; joint reviews; user guide.

**Evidence:** Review records, test reports, validation minutes.

Closes 18 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| 3.0.2 | ED-153 | Requirements correctness and completeness | Partial | S3 | Review and approve the SRS; derive safety requirements. |
| 3.0.3 | ED-153 | Requirements traceability assurance | Partial | S3 | Trace or trim the inherited layer engine. |
| 3.0.4 | ED-153 | Unintended functions | Partial | S3 | Deactivated-code review; remove /api/route. |
| 3.0.14 | ED-153 | Independence (of components) | Partial | S3 | Isolation argument per first-level component. |
| 4.3.1 | ED-153 | System requirements analysis | Partial | S4 | System requirements spec. |
| 4.3.4 | ED-153 | SW requirements analysis | Partial | S4 | Reviewed SRS covering the layer engine. |
| 4.3.7 | ED-153 | SW integration | Partial | S4 | Integration test plan per component boundary. |
| 4.3.14 | ED-153 | Rationale for design choices (esp. real-time) | Partial | S4 | Design decision records. |
| 3.4.2 | ED-153 | Verification | Partial | S3 | Verify safety requirements. |
| 5.4.3 | ED-153 | Verification of software requirements | Partial | S4 | Independent review of functional tests. |
| 5.4.4 | ED-153 | Integration verification | Partial | S4 | Interface tests for every component boundary. |
| 5.4.5 | ED-153 | Verification of SW architectural design | Partial | S4 | Architecture review record. |
| 5.4.9 | ED-153 | Data verification | Partial | S4 | Feed integrity and outage tests. |
| 5.4.12 | ED-153 | Verification of verification process results | Partial | S4 | Verification report. |
| 3.4.1 | ED-153 | Validation | Non-compliant | S2 | Validate GEV-SAF with users. |
| 5.5.x | ED-153 | Validation (placeholder) | Non-compliant | S3 | Validation with operational users. |
| 5.6.x | ED-153 | Joint review (placeholder) | Non-compliant | S3 | Review minutes with the customer. |
| 4.4.3 | ED-153 | User support | Partial | S4 | User guide and support route. |

### W10 Safety case and release evidence (Wave 4)

**Deliverables**

- Software safety assessment report with a GSN-style argument (direct and back-up).
- Software safety folder; assessment report and distribution record per release; independent audit.

**Evidence:** Issued safety folder and independent audit report.

Closes 7 findings:

| ID | Lens | Requirement | Status | Severity | Fix |
|---|---|---|---|---|---|
| 3.0.10 | ED-153 | SWAL assurance | Non-compliant | S2 | Direct and back-up arguments in the SSAR. |
| 3.0.17 | ED-153 | Argument that SWAL objectives are met | Non-compliant | S2 | GSN-style argument in the SSAR. |
| 3.4.4 | ED-153 | Documented outputs as proof requirements are met | Partial | S3 | Safety assessment report. |
| 3.5.1 | ED-153 | Document process results | Partial | S4 | Assessment report per release. |
| 3.5.3 | ED-153 | Documentation dissemination | Partial | S4 | Distribution record. |
| 5.7.2–5.7.4 | ED-153 | Audit (numbers only) | Partial | S4 | Independent audit. |
| 8 | ED-153 | Safety Folder | Partial | S3 | Software Safety Folder / SSAR. |

Out of scope at SWAL 3 but addressed anyway: **7.x Tool qualification**, covered by the AI-use policy in W8.

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
