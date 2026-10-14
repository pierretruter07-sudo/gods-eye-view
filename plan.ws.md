## 5. Workstreams

### W1 Web hardening (Wave 1)
**Deliverables:**
- Security headers on every response: HSTS, `nosniff`, `Referrer-Policy`, and a CSP with `script-src`.
- Inline HTML templates moved so the CSP can drop `unsafe-inline`.
- Debug handle (`window.__godsEyeView`, `?fps`) gated out of production builds.

**Evidence:** header tests in the preview-serving suite, and a CSP report captured in a browser.

{{W1}}

### W2 Abuse resistance and availability (Wave 1)
**Deliverables:**
- Rate limiting on by default for every cost-bearing proxy, with global caps.
- Client IP taken from the platform's forwarded header only when the request comes through the known proxy hop.
- Documented heavy endpoints and resource budgets: frame time, memory, latency.

**Evidence:** limiter tests, plus a load test against the deployed app.

{{W2}}

### W3 Supply chain and secrets (Wave 1)
**Deliverables:**
- `npm audit` and Dependabot in CI, with CI failing on any High or Critical finding.
- CycloneDX SBOM generated for each release.
- Patch time limits written into SECURITY.md.
- A COTS dossier for each component:
  - CesiumJS
  - satellite.js
  - Node
  - browsers
  - Replit
  - each data feed
- Browser keys restricted by HTTP referrer and API (owner action in the Google and Cesium consoles).
- Secrets moved to a managed store with rotation.

**Evidence:** CI logs, the SBOM file, COTS dossiers, and screenshots of the console restrictions.

{{W3}}

### W4 Logging and monitoring (Wave 1, shipping in Wave 2)
**Deliverables:**
- Structured JSON logs with UTC timestamps and request IDs.
- Untrusted values encoded before logging.
- Security events logged: rate-limit hits and validation rejects.
- Log inventory.
- Logs forwarded to a separate store with alerting.
- Feed-health telemetry mapped to the SWAL monitoring objective.

**Evidence:** logger tests, the log inventory, and an alert fired in a test.

{{W4}}

### W5 Access control (Wave 2)
**Deliverables:**
- Sign-in through an external identity provider (OIDC).
- Three roles: viewer, operator, admin.
- Server-side checks on every function: the paid proxies need operator; Exercise mode needs an explicit role.
- Session timeout and logout.
- Authorization model documented.

**Evidence:**
- an access-control test matrix (role × endpoint);
- a CrossCheck assessment of the new V6/V7/V9/V10 rows.

{{W5}}

### W6 Data and validation rules (Wave 1)
**Deliverables:**
- **Input validation specification for each API endpoint:** types, ranges, lengths and combined-field rules.
- **Data classification:**
  - public;
  - aggregated-sensitive (military tracks combined into one picture);
  - simulated.

  Each class has handling rules for caching, export and retention.

**Evidence:** both documents, with each validation rule traced to an existing test.

{{W6}}

### W7 Safety analysis (Wave 3, needs customer input)
**Deliverables:**
- **Concept of operations:** who uses it, where, and the advisory-only boundary.
- **Functional hazard assessment:** failure modes per component, their effects on the operator, and justified likelihood.
- **SWAL allocation** per failure, using the ED-153 severity × likelihood matrix.
- **Preliminary system safety assessment.**
- **Safety requirements** (the GEV-SAF tier) traced into the SRS.

**Default assumption until the customer confirms:** God's Eye View is an advisory situational-awareness display in an operations centre. It takes no control actions, and operators cross-check it against authoritative systems.

{{W7}}

### W8 Safety plan, process and configuration management (Waves 2–3)
**Deliverables:**
- **Software safety assessment plan:** approach, rigour per SWAL, and I/R/D classification. A named reviewer signs it off.
- **Development plan**, including an AI-assistance policy: no tool credit; every AI change reviewed by a human.
- **Configuration management:**
  - CM plan with protected `main`, required reviews and tagged releases;
  - CI-built release artifact with a build stamp;
  - rollback procedure, tested.
- **Change control:** change-impact template and requirement change control through issues.
- **Release and support:** QA role and audit schedule, problem-report process (known limitations logged as issues), operations and maintenance plans.
- **Organisation:** training and competence records.

{{W8}}

### W9 Requirements, verification and validation (Wave 3)
**Deliverables:**
- **Requirements:**
  - reviewed and approved SRS covering the inherited layer engine;
  - full traceability (the existing trace check widened from 56 requirements);
  - dead-code review, with `/api/route` removed;
  - isolation argument per first-level component.
- **Verification:**
  - integration tests at every component boundary;
  - feed-integrity and outage tests;
  - architecture review record;
  - verification report.
- **Validation:** with operational users, through joint reviews with the customer; plus a user guide.

{{W9}}

### W10 Safety case and release evidence (Wave 4)
**Deliverables:**
- Software safety assessment report with a GSN-style argument, direct and back-up.
- Software safety folder.
- Assessment report and distribution record for each release.
- Independent audit.

{{W10}}

Out of scope at SWAL 3, but addressed anyway: **7.x Tool qualification**. The AI-use policy in W8 covers it.

