# Configuration index

| | |
|---|---|
| Document | GEV-CI |
| Version | 0.1 |
| Date | 2026-10-14 |

## 1. Configuration items

| Item | Identification | Location |
|---|---|---|
| Source code | Git commit SHA on `main` | github.com/pierretruter07-sudo/gods-eye-view |
| Upstream base | `bilawalsidhu/gods-eye-view` commit `ce671ce` (2026-09-24), MIT | Git history |
| Dependencies | `package-lock.json` (134 packages, lockfile v3) | Repository |
| Runtime | Node `>=24.13 <25 \|\| 26.x` (`package.json` `engines`) | Repository |
| Build tooling | Vite 6.4.3, vite-plugin-cesium 1.2.23 | Lockfile |
| Key runtime libraries | CesiumJS 1.138.0, satellite.js 6.0.2, egm96-universal 1.1.1 | Lockfile |
| Bundled data | `src/data/local_data/` (TeleGeography, Natural Earth, SF neighbourhoods) | Repository |
| 3D assets | `public/models/*.glb` (9 files) | Repository |
| Requirements | [REQUIREMENTS.md](REQUIREMENTS.md) (GEV-SRS) | Repository |
| Verification | [VERIFICATION.md](VERIFICATION.md) (GEV-SVP) | Repository |
| CI definition | `.github/workflows/ci.yml` | Repository |
| Secrets | `.env` (git-ignored). Names only in `.env.example`. | Deployment host |

## 2. Build identity

Every build embeds `<short SHA>[-dirty] · <UTC date>`. It is computed by
`server/standalone/vite.config.js` (`buildIdentity`), or taken from
`GEV_BUILD` when a pipeline sets it. It is shown on the welcome card and
exposed as `window.__godsEyeView.build`. A running instance can therefore be
traced to an exact commit. A `-dirty` suffix means the build included
uncommitted changes and is **not** a baseline build.

## 3. Environments

| Environment | Purpose | Source of truth | Notes |
|---|---|---|---|
| GitHub | Baseline and CI | `main` | Branch work merges via `--no-ff` merge commits |
| Replit (hosted demo) | Executive demo | Pulled from GitHub `main` | Runs `vite preview` on port 23876, Node 24.13 |
| Developer machine | Development | Any branch | `npm run dev` on port 4173 |

### Known configuration-management findings

1. **The Replit workspace is not a clean GitHub checkout.** It is synced
   from GitHub, but its own git history consists of Replit auto-checkpoint
   commits. There is no `origin` remote. Its source files match GitHub
   `main`; only `package-lock.json` can differ after `npm install`.
   *Mitigation:* the build stamp identifies the deployed commit.
   *Remediation:* deploy from a CI-built artifact.
2. **Two Replit-only files are not under GitHub control:**
   `.replit-artifact/artifact.toml` and `vite.replit.config.js`.
   *Remediation:* commit them, or document their content here.
3. **There are no release tags yet.** *Remediation:* tag the presentation
   baseline (`v0.2.0-demo`) after final verification.

## 4. Change and problem reporting

| Activity | Mechanism |
|---|---|
| Change control | Feature branch, then verification on Replit (clean clone: test, build, smoke), then merge to `main`, then deploy |
| Problem reports | GitHub Issues (bug template). Security issues via private advisory (see SECURITY.md). |
| Change record | [CHANGELOG.md](../CHANGELOG.md) and commit messages |
| Baseline record | Results log in [VERIFICATION.md §4](VERIFICATION.md#4-results-log) |

## 5. Branch history (fork)

| Branch | Content | Status |
|---|---|---|
| `main` | Director, intel HUD, Exercise mode, shell | Baseline |
| `cleanup/remove-inherited` | Removed 518 unreachable inherited files and their tests | Merged (`ef9f8ca`) |
| `audit/readiness` | Docs, CI-gate fixes, security tests, build stamp | In verification |
