# Verification plan and traceability

| | |
|---|---|
| Document | GEV-SVP |
| Version | 0.1 |
| Date | 2026-10-14 |
| Requirements | [GEV-SRS 0.1](REQUIREMENTS.md) |

## 1. Approach

| Activity | Tool / method | When |
|---|---|---|
| Unit and integration tests | `npm test` (Node test runner, 1,000+ tests) | Every change. CI on push to `main`. |
| Production build | `npm run build` | Every change. CI. |
| Smoke test | Headless Chromium loads the built app for 25 s. Pass = zero console/page errors and all 9 layers registered. | Before every deploy |
| Formatting and package boundaries | `npm run format:check`, `npm run check:boundaries` | CI |
| Structural coverage (orphan code) | `node scripts/audit/import-graph.mjs` (0 orphans, 0 dangling imports) | CI, every push |
| Traceability | `node scripts/audit/trace-check.mjs`: every requirement traced, every cited file and test title exists | CI, every push, and in `npm test` |
| Inspection | Review against this matrix | Each baseline |
| Demonstration | [Demo runbook](DEMO-RUNBOOK.md) walkthrough on the hosted build | Before each presentation |

**Independence:** tests and code are currently written by the same team
(including AI-assisted authoring). The build/test/smoke run is executed in a
separate environment (Replit) from a clean clone. Independent review of the
requirements and tests is **not yet in place**. It is an open audit item.

**Pass criteria:**
- 100% of tests pass.
- The build succeeds.
- The smoke test passes.
- 0 orphan files.
- Every requirement has at least one verification entry below.

## 2. Traceability matrix

Paths are relative to the repository root. Test names are quoted from the
`test('…')` title.

| Requirement | Implementation | Verification evidence |
|---|---|---|
| GEV-SYS-001 | `index.html`, `src/main.js` | D: smoke test (headless Chromium) |
| GEV-SYS-002 | `src/mapStartup.js`, `src/maps/defaultSources.js` | T: `src/mapStartup.test.mjs` "no credentials skip photoreal loading and preserve keyless startup", "failed direct and ion requests preserve the keyless OSM fallback" |
| GEV-SYS-003 | `src/startClean.js` | I |
| GEV-SYS-004 | `src/main.js`, `src/standalone/errors.js` | I |
| GEV-LAY-001 | `src/app/constructCatalog.js` | T: `src/app/constructCatalog.test.mjs` "catalogs construct exactly the shipped layers…" |
| GEV-LAY-002 | `src/shell/index.js`, `src/tour/config.js` `TOUR_LAYERS` | D: smoke test reports layer ids |
| GEV-LAY-003 | `src/data/dataCredits.js` | T: `src/data/dataCredits.test.mjs` "every shipped live source and bundled asset has an attribution entry" |
| GEV-LAY-004 | `src/layers/firms/`, `src/layers/vessels/` | I |
| GEV-SRV-001 | `server/providers/local.js` | T: `src/tooling/previewServing.test.mjs` "every data provider serves both the dev and the built-preview server" |
| GEV-SRV-002 | `server/standalone/api-not-found.js` | T: `src/tooling/previewServing.test.mjs` "real dev and built-preview servers serve provider JSON and terminate unknown APIs" |
| GEV-SRV-003 | `server/providers/terrain.js`, `server/providers/aircraft/enrichment.js`, `server/providers/space/celestrak.js` | T: as GEV-SRV-002 (400 cases) |
| GEV-SRV-004 | `server/providers/aircraft/opensky.js` `fetchRegionalPayload` | T: `src/tooling/regionalFallback.test.mjs` (3 tests) |
| GEV-SRV-005 | `build/vite.js` | T: `src/tooling/viteBuild.test.mjs` "explicit build inputs preserve browser-only defines, plugin order and loopback protections" |
| GEV-SEC-001 | `build/vite.js` `define` | T: `viteBuild.test.mjs` (same), "build helper does not discover environment values…" |
| GEV-SEC-002 | `build/vite.js` `server.fs.deny` | T: `viteBuild.test.mjs` (same) |
| GEV-SEC-003 | `build/vite.js` `server.headers` | T: `viteBuild.test.mjs` (same) |
| GEV-SEC-004 | `src/intel/markup.js` `esc` | T: `src/intel/markup.test.mjs` (3 tests) |
| GEV-SEC-005 | `scripts/dev-fresh.sh`, `scripts/setup-doctor.mjs` | T: `src/toolProjectRoot.test.mjs` "launcher reads the selected project keys…", "doctor inspects the selected project dependencies and dotenv without disclosing values" |
| GEV-DIR-001 | `src/tour/events.js` | T: `src/tour/events.test.mjs` "emergency aircraft rank 7500, 7700, 7600 and ignore ordinary codes", "squawk codes are four octal digits or null" |
| GEV-DIR-002 | `src/tour/events.js` | T: `events.test.mjs` "aircraft come before quakes; quakes rank by size then recency", "small, old and positionless quakes are ignored" |
| GEV-DIR-003 | `src/tour/planner.js` | T: `src/tour/planner.test.mjs` "a new incident always comes first…", "an emergency squawk interrupts and jumps the queue" |
| GEV-DIR-004 | `src/tour/planner.js`, `src/tour/config.js` `TOUR_ROTATION` | T: `planner.test.mjs` "slots with nothing to show are skipped; ships must be moving", "military aircraft get their own stop, from feed values" |
| GEV-DIR-005 | `src/tour/planner.js` | T: `planner.test.mjs` "naval / state vessels are preferred, even when slow" |
| GEV-DIR-006 | `src/tour/planner.js` | T: `planner.test.mjs` "recent incidents are revisited after the cooldown, introduced as recent"; `events.test.mjs` "events already shown are not repeated" |
| GEV-DIR-007 | `src/tour/lines.js` | T: `events.test.mjs` "spoken lines use only feed values and flag simulated events"; `planner.test.mjs` "vessel lines use feed values only" |
| GEV-DIR-008 | `src/shell/welcome.js` | D |
| GEV-DIR-009 | `src/tour/controller.js` | D |
| GEV-DIR-010 | `src/shell/index.js` `onFocus`, `src/intel/index.js` `showFocus` | D |
| GEV-DIR-011 | `src/tour/queue.js`, `src/tour/controller.js`, `src/shell/flightPrefetch.js` `stage` | T: `src/tour/queue.test.mjs` "the next stop is planned on arrival and its data loads a whole dwell ahead" "an airport with no aircraft is skipped instead of shown empty" "a slow source is waited for only briefly; a fresh incident jumps the queue"; `src/shell/shellPolicies.test.mjs` "staged aircraft are counted near the destination only" |
| GEV-DIR-012 | `src/airports/overlay.js` `fadeIn`, `fadeOut` | D: Director run on the deployed app, airport stops |
| GEV-INT-001 | `src/intel/hud.js` | T: `src/intel/hud.test.mjs` "every kind gets at most four cards, deterministic" |
| GEV-INT-002 | `src/intel/hud.js`, `src/intel/enrichment.js` | T: `hud.test.mjs` "feed values stay feed; illustrative rows are flagged"; `src/intel/intel.test.mjs` "feed and simulated content are kept apart" |
| GEV-INT-003 | `src/intel/hud.js` | T: `hud.test.mjs` "ownership is generic, never an invented company" |
| GEV-INT-004 | `src/intel/enrichment.js` | T: `intel.test.mjs` "missing operator becomes a simulated link, never a feed one" |
| GEV-INT-005 | `src/intel/objects.js` `buildTriage` | T: `intel.test.mjs` "triage is driven by feed fields only" |
| GEV-INT-006 | `src/tour/simulate.js`, `src/intel/*` | T: `intel.test.mjs` "a staged demo event is never presented as feed data"; `hud.test.mjs` "staged demo objects are entirely simulated" |
| GEV-INT-007 | `src/intel/hud.js` | T: `hud.test.mjs` "orbit numbers are real physics" |
| GEV-INT-008 | `src/intel/actions.js` | T: `src/intel/actions.test.mjs` "every HUD action has a runner, and results render" |
| GEV-INT-009 | `src/intel/actions.js` | T: `actions.test.mjs` "drafted messages carry live values only", "simulated documents are deterministic and flagged" |
| GEV-INT-010 | `src/intel/actions.js` `screenConjunctions` | T: `actions.test.mjs` "conjunction screen finds the closest sampled approach" |
| GEV-INT-011 | `src/intel/objects.js` | T: `intel.test.mjs` "nearby uses real geometry and excludes self", "nearestHit picks the closest point within radius" |
| GEV-INT-012 | `src/intel/` (no person model exists) | I |
| GEV-INT-013 | `src/intel/assetTypes.js`, `src/intel/referenceImages.js`, `src/intel/markup.js` | T: `src/intel/assetTypes.test.mjs` "aircraft resolve by ICAO designator…", "vessels resolve by AIS family or naval hull prefix…", "the photo sits on a feed card, labelled as a type reference with credit" |
| GEV-INT-014 | `src/intel/silhouettes.js`, `src/intel/assetTypes.js` | T: `assetTypes.test.mjs` "every catalogue entry has a drawable silhouette", unlisted-type assertions |
| GEV-INT-015 | `src/intel/place.js`, `src/intel/index.js` `showFocus`, `server/providers/metar.js` | T: `src/intel/place.test.mjs` "an airport stop shows live traffic, weather, incidents and surroundings" "missing feeds say so instead of inventing figures"; `src/data/metarProxy.test.mjs` "stations are validated, cached for ten minutes and served stale on failure" |
| GEV-EXE-001 | `src/exercise/mode.js` | I |
| GEV-EXE-002 | `src/exercise/package.js` | T: `src/exercise/package.test.mjs` "platforms stay generic classes, never real types" |
| GEV-EXE-003 | `src/exercise/package.js` | T: `package.test.mjs` "authorisation is a checklist with a final command step left open" |
| GEV-EXE-004 | `src/exercise/package.js` | T: `package.test.mjs` "the same scenario and seed produce the same package" |
| GEV-EXE-005 | `src/exercise/package.js` | T: `package.test.mjs` "timeline ends at time on target then egress, naming the fictional target" |
| GEV-PRF-001 | `src/shell/qualityPolicy.js` | T: `src/shell/shellPolicies.test.mjs` "quality ladder holds native resolution and never drops below CSS pixels" |
| GEV-PRF-002 | `src/shell/qualityPolicy.js` | T: `shellPolicies.test.mjs` "one slow window does not drop quality; sustained slowness does; recovery needs headroom" |
| GEV-PRF-003 | `src/shell/idleSpinPolicy.js` | T: `src/intel/intel.test.mjs` "idle spin only when idle, zoomed out and unblocked" |
| GEV-PRF-004 | `src/shell/flightPrefetchPolicy.js` | T: `shellPolicies.test.mjs` "flight refresh on arrival: new place, stale data, not from space" |
| GEV-PRF-005 | `src/shell/flightPrefetch.js` `preload`, `src/layers/flights/controller.js` `setQueryAnchor` | D: `scripts/bench/director-stops.mjs` (`flightsFreshAtArrival`) |
| GEV-PRF-006 | `src/shell/index.js` `MODEL_URLS` | T: `shellPolicies.test.mjs` "the model warm list matches the shipped glTF files exactly" |
| GEV-PRF-007 | `src/renderGovernor.js` `holdRenderCadence`, `src/layers/*/lifecycle.js` | T: `src/renderGovernor.test.mjs` "a cadence hold keeps render-on-demand and requests frames at the fastest cadence" |
| GEV-PRF-008 | `src/data/lifecycle.js` `pausePolling`, `src/shell/index.js` | T: `src/data/pollPause.test.mjs` "paused polling skips periodic updates and catches up once on resume" |
| GEV-PRF-009 | `build/cacheHeaders.js`, `build/vite.js` | T: `src/tooling/cacheHeaders.test.mjs` "hashed assets are cached for a year, the page always revalidates, APIs are left alone" "injected classic scripts are deferred; module scripts and other tags are untouched" |
| GEV-PRF-010 | `src/maps/google3d.js` `tileCacheBudget`, `src/shell/qualityPolicy.js` | T: `src/maps/google3dBudget.test.mjs` "the 3D tile cache is sized to the device memory"; `src/shell/shellPolicies.test.mjs` "quality ladder holds native resolution and never drops below CSS pixels" |
| GEV-CM-001 | whole tree | A: `scripts/audit/import-graph.mjs` |
| GEV-CM-002 | `.github/workflows/ci.yml` | I |
| GEV-CM-003 | `package-lock.json` | I |
| GEV-AUD-001 | `src/audit/model.js` `rollup`, `src/audit/data/assessment.json` | T: `src/audit/audit.test.mjs` "the audit snapshot rolls up to the ledger baseline readiness and verdicts" |
| GEV-AUD-002 | `src/audit/plain.js` | T: `src/audit/audit.test.mjs` "every must-fix item has a plain-English card, and no card is stale" |
| GEV-AUD-003 | `src/audit/model.js` `LAYERS`, `nodeOpacity` | T: `src/audit/audit.test.mjs` "layers start dark: only must-fix items show at full strength" "every item sits once on its ring, with the must-fix pins raised" |
| GEV-AUD-004 | `src/audit/cameraMath.js`, `src/audit/runtime.js` | T: `src/audit/audit.test.mjs` "orbit-local axes are right-handed and fixed to the Earth" "the audit pose looks down on the orbit from above the ring plane" "the overlay camera copies Cesium’s camera in Earth radii" |
| GEV-AUD-005 | `src/audit/evidenceModel.js`, `src/audit/evidence.js` | T: `src/audit/audit.test.mjs` "the evidence view reads the ledger top down: progress and journey" |
| GEV-AUD-006 | `src/audit/model.js` `linkedIds` | T: `src/audit/audit.test.mjs` "linked items come from the shared evidence themes" |
| GEV-AUD-007 | `src/audit/runtime.js` `enter`, `exit` | D: browser run, enter → tour → select → zoom → evidence → exit; globe, primitives and camera restored, 0 page errors |
| GEV-AUD-008 | `src/audit/progress.js`, `src/audit/cockpit.js` `setStop` | T: `src/audit/audit.test.mjs` "a recorded re-audit becomes a measured stop and later stops build on it" |
| GEV-AUD-009 | `src/audit/progress.js`, `docs/evidence/ledger.json` | T: `src/audit/audit.test.mjs` "projected stops reproduce the plan’s readiness journey, wave by wave" |
| GEV-AUD-010 | `src/audit/cameraMath.js` `interpolateRig`, `src/audit/runtime.js` `flyRig` | T: `src/audit/audit.test.mjs` "the tour camera rig reproduces the home framing and keeps its target in view" |
| GEV-AUD-011 | `src/audit/impact.js`, `src/audit/cockpit.js` `setDetail` | T: `src/audit/audit.test.mjs` "every item says how it affects God’s Eye View; must-fix items in their own words" |
| GEV-AUD-012 | `src/audit/progress.js` `stopStory`, `src/audit/runtime.js` `playStep` | T: `src/audit/audit.test.mjs` "the narrated playback explains each stop: what it fixes, what it closes, what it unlocks" |

## 3. Coverage of code by requirements

The fork's own modules are fully traced: `src/tour`, `src/intel`,
`src/shell`, `src/audit`, `src/exercise`, and the server fallback chain. The inherited
layer engine (`src/layers`, `src/data`, `src/maps`, ~45k lines) is covered by
about 1,000 inherited unit tests. These tests are **not yet traced** to
requirements. Raising that to full bidirectional traceability is the main
gap for an ED-153 SWAL 3 case.

## 4. Results log

| Date | Commit | Tests | Build | Smoke | Orphans | Environment |
|---|---|---|---|---|---|---|
| 2026-10-14 | `4e0be74` (main) | 1,097 / 1,097 pass | Pass | AUDIT: button → orbit → "First time here?" prompt, 0 console or page errors | 0 | Replit clean sync (564 tracked files match). |
| 2026-10-14 | `7780b09` (main) | 1,086 / 1,086 pass | Pass | 0 page errors, 9 layers (deployed to Replit) | 0 | Replit clean clone. GitHub CI green on Node 24.14 and 26. |
| 2026-10-14 | `68a9d04` | 1,085 / 1,085 pass | Pass (chunk-size warnings) | 0 console errors over a 6-stop Director run | 0 | Replit clean clone, Node 24.13. Format and boundary gates failed (fixed in `6d50816`). |
| 2026-10-14 | `60191cb` | 1,070 / 1,070 pass | Pass (2 chunk-size warnings) | 0 errors, 9 layers | 0 | Replit clean clone, Node 24.13 |
