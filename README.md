# CrossCheck

CrossCheck lets a company plug in any piece of software and find out, before
it ships, where it falls short of the standards the company runs on, and
what it would take to pass. It reads the code, asks for the facts code
cannot show, rates every item of every chosen standard with the evidence it
rests on, and turns the gaps into a remediation plan that a team or a coding
agent can act on.

God's Eye View, its first worked example, is in `examples/gods-eye-view/`.

## Run it

- **On its own:** `npm start` (Node 22 or later, no
  dependencies), then open `http://localhost:5175/`.
- **From the command line:** `node tools/assess-dir.mjs <folder>
  [--standards asvs5,nist-ssdf] [--facts facts.json] [--out report-folder]`.

## How it works

1. **Intake.** A public GitHub link (fetched only through GitHub's zipball
   API) or an uploaded `.zip` (up to 100 MB). The archive is read in memory
   with size and zip-bomb limits. Only the evidence is kept: file paths, line
   numbers and short, redacted notes. The code itself is discarded.
2. **Evidence.** About 40 named checks (`engine/signals.js`): tests and CI,
   lock files and dependency updates, SBOM and release signing, secrets in
   code, security headers, input validation, dangerous calls, weak
   cryptography, authentication, logging, and the records a reviewer expects
   (requirements, architecture, threat model, hazard log, verification,
   runbook, incident procedure, privacy notes, AI documentation). Every
   finding cites the file and line it relies on. Comments, quoted sentences
   and pattern definitions are never counted as evidence.
3. **Facts.** Questions about what the code cannot show
   (`engine/facts.js`): purpose, owner, hosting, criticality, and whether
   processes such as backups, patching, MFA for administrators, change
   control and incident response exist. Answers are declarations: an item
   that rests on one is rated "Largely" at most until a reviewer sees the
   record.
4. **Rating** (`engine/assess.js`), by fixed rules:
   - Compliant only on direct proof in the code.
   - Largely on a declaration or an indicative check.
   - Partial when the inputs are mixed.
   - Non-compliant when nothing passes.
   - Unrated (facts needed, or a reviewer) when nothing is known.

   A standard with unrated items stays "incomplete". CrossCheck never fills a
   gap by guessing.
5. **AI rating (optional).** An open-source model rates the items rules
   cannot (`engine/ai.js`, `server/ai-client.js`). A rating is kept only when
   every evidence id it cites exists. A model never rates an item Compliant
   and never overrides a rule-based rating, and every rating it gives is
   marked AI-rated.
6. **Remediation plan** (`engine/plan.js`). Each open item is traced to the
   fix that would close it. One fix often closes items in several standards.
   The fixes fall into four waves:
   1. Must-fix.
   2. Non-compliant.
   3. Conditions.
   4. Facts and review.

   After each wave the plan shows the readiness each standard would reach,
   marked *projected*. Each fix has a work package for a team or a coding
   agent, and the whole plan exports as Markdown or JSON.

## Standards library

| Standard | Lens | Items | Text licence |
|---|---|---|---|
| OWASP ASVS 5.0 (levels 1–3) | Application security | 345 | CC BY-SA 4.0 (attributed) |
| NIST SP 800-218 SSDF 1.1 | Secure development | 19 practices | Free (NIST) |
| ISO/IEC 27001:2022 | Information security management | 23 clauses + 93 Annex A controls | Paid (ISO): numbers and paraphrased titles |
| Australian ISM + Essential Eight | Government security | 8 strategies + 21 ISM topics | Free (ASD) |
| EUROCAE ED-153 (SWAL 1–4) | Safety (air navigation software) | 115 objectives | Paid (EUROCAE): numbers and paraphrased titles |
| MIL-STD-882E | Defence system safety | 25 tasks + 5 software-safety items | Free (US DoD) |
| ISO/IEC 42001 | AI management (when AI is used) | 65 | Paid (ISO): numbers and paraphrased titles |

The catalogues are built by `node tools/build-catalogues.mjs`. A
test fails if the committed files drift from a fresh build. Organisation-wide
and physical controls (for example most of ISO 27001's people and physical
controls) are listed but excluded: they belong to the organisation's
certification audit, not to the software. ISM items are grouped at topic
level with CrossCheck IDs, to be mapped to the control numbers of the ISM
release the customer is assessed against.

## Settings (names only; values in the server's environment)

| Setting | What it does |
|---|---|
| `CROSSCHECK_GITHUB_TOKEN` | Lets intake fetch private repositories (read-only contents permission is enough). |
| `CROSSCHECK_AI_URL` | Base URL of an OpenAI-compatible endpoint, e.g. Ollama `http://localhost:11434/v1`. |
| `CROSSCHECK_AI_MODEL` | The model's name on that endpoint. |
| `CROSSCHECK_AI_KEY` | Optional bearer key (hosted routers). |

AI rating is off unless the URL and model are set. The decision on 20 Oct
2026 was to use the most capable free, open-source model. On BenchLM's
open-weight ranking of 19 Oct 2026, the top model with an OSI-approved
licence was Xiaomi's MiMo-V2.6-Pro (MIT). Any OpenAI-compatible host of an
open model works. A model you host keeps the evidence in house.

## The rule for this folder

Nothing in `crosscheck/` imports or reads God's Eye View code. A unit test
(`engine/scoring.test.mjs`) fails if it does. God's Eye View may import from
here; never the other way round.

## Layout

| Folder | What it holds |
|---|---|
| `engine/` | Pure JavaScript, no dependencies:<ul><li>scoring (the AUDIT view's engine)</li><li>evidence signals</li><li>facts</li><li>rating</li><li>plan</li><li>AI validation</li><li>snapshots</li></ul> |
| `catalogues/` | The seven standards, as built by `tools/build-catalogues.mjs` |
| `server/` | The HTTP API (`handler.js`), intake (GitHub, zip), the AI client, the standalone server |
| `app/` | The CrossCheck page (Assess, Report, Plan, Standards, Worked example) |
| `tools/` | Catalogue builder, command-line assessment, standalone export |
| `kit/` | The original assessment kit behind the God's Eye View audit (see `kit/KIT-README.md`) |
| `examples/gods-eye-view/` | The God's Eye View assessment, reviewed by hand |

## Limits, plainly

- Code evidence shows that a control exists. It does not show that every
  detail of a requirement is met: an indicative check is rated "Largely" at
  best.
- Many items in management and safety standards cannot be seen in code at
  all. They are rated from the intake answers or left to a reviewer, and the
  verdict says so.
- Rating is by rules plus an optional model. CrossCheck's report is
  evidence for a reviewer, not a certificate.
