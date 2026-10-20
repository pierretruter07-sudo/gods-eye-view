# CrossCheck

CrossCheck lets a company plug in a piece of software and find out, before
it ships, where it falls short of the standards the company runs on, and
what it would take to pass. It produces a gap report and a remediation
plan, and optionally a re-audit loop with an evidence pack.

CrossCheck is developed inside the God's Eye View repository, in this
folder, and will be copied into its own private repository and Replit
project once finished. God's Eye View is its first worked example: the
AUDIT view in God's Eye View reads CrossCheck's results and scores with
CrossCheck's engine.

## The rule for this folder

Nothing in `crosscheck/` imports or reads God's Eye View code. A unit test
(`engine/scoring.test.mjs`) fails if it does. God's Eye View may import from
here; never the other way round. Tools may write into a repository they
audit when that repository is passed to them as an argument.

## Layout

| Folder | What it holds |
|---|---|
| `engine/` | The scoring engine: status and severity names, verdict rules, readiness per standard. Pure JavaScript, no imports. |
| `kit/` | The assessment kit: standard catalogues (ED-153, OWASP ASVS 5.0, ISO/IEC 42001), the God's Eye View ratings, and the ledger, export, re-audit and plan-PDF tools. See `kit/KIT-README.md`. |
| `examples/gods-eye-view/` | The God's Eye View assessment as a worked example (`assessment.json`), used by the engine's tests. |

## Roadmap

1. Secure the kit in this folder, with the no-imports rule (done).
2. A standalone CrossCheck page in this project.
3. Plug in any code (a GitHub link or an uploaded zip), gather evidence
   automatically, and rate it with an open-source AI model that cites its
   evidence.
4. A remediation plan for any codebase, with work packages for a team or a
   coding agent.
5. Four more standards: NIST SSDF, Australian ISM and Essential Eight,
   ISO/IEC 27001:2022, MIL-STD-882E.
6. Lift out into its own private repository and Replit project.

## Copyright

ED-153 (EUROCAE) and ISO/IEC 42001 (ISO/IEC) are copyrighted: CrossCheck
stores clause numbers and paraphrased titles only. OWASP ASVS text keeps its
CC BY-SA 4.0 attribution.
