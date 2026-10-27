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
| GEV-LAY-005 | `server/providers/cctv/catalog.js` `enabledLivePacks`, `src/layers/cctv/lifecycle.js` | T: `src/intel/camera.test.mjs` "open-licence camera networks are on by default; courtesy-only ones are off" |
| GEV-LAY-006 | `src/layers/cctv/projection.js`, `src/layers/cctv/calibration.js`, `src/intel/index.js` camera actions | D: select a camera on the deployed app; show, adjust, save and reset its panel |
| GEV-SRV-001 | `server/providers/local.js` | T: `src/tooling/previewServing.test.mjs` "every data provider serves both the dev and the built-preview server" |
| GEV-SRV-002 | `server/standalone/api-not-found.js` | T: `src/tooling/previewServing.test.mjs` "real dev and built-preview servers serve provider JSON and terminate unknown APIs" |
| GEV-SRV-003 | `server/providers/terrain.js`, `server/providers/aircraft/enrichment.js`, `server/providers/space/celestrak.js` | T: as GEV-SRV-002 (400 cases) |
| GEV-SRV-004 | `server/providers/aircraft/opensky.js` `fetchRegionalPayload` | T: `src/tooling/regionalFallback.test.mjs` (3 tests) |
| GEV-SRV-005 | `build/vite.js` | T: `src/tooling/viteBuild.test.mjs` "explicit build inputs preserve browser-only defines, plugin order and loopback protections" |
| GEV-SRV-006 | `server/providers/cctv.js`, `server/providers/cctv/media.js` | T: `src/data/cctvProxy.test.mjs` "CCTV upstream frame fetch supplies a bounded abort signal" "CCTV upstream frame fetch rejects a declared oversize body without draining it" |
| GEV-SRV-007 | `server/providers/aircraft/adsb-lol.js` `createAdsbLolMilHandler` | T: `src/tooling/adsbLolMil.test.mjs` (cache, shared call, back-off and stale, 10-minute stale limit, non-retryable relay) |
| GEV-SRV-008 | `server/providers/aircraft/opensky.js` `_openskyWorldInFlight`, stale-on-error branch | T: `src/tooling/openskyWorld.test.mjs` "OpenSky: the worldwide snapshot gets time to arrive, and a timeout retries soon" "OpenSky: concurrent misses share one world call; a later 5xx serves the last good snapshot" |
| GEV-SRV-009 | `server/providers/common/compress.js`; `server/providers/local.js` | T: `src/tooling/apiCompression.test.mjs` |
| GEV-SRV-010 | `server/providers/military-installations.js` `MILITARY_INSTALLATION_FAILURE_COOLDOWN_MS` | I: code inspection |
| GEV-SEC-001 | `build/vite.js` `define` | T: `viteBuild.test.mjs` (same), "build helper does not discover environment values…" |
| GEV-SEC-002 | `build/vite.js` `server.fs.deny` | T: `viteBuild.test.mjs` (same) |
| GEV-SEC-003 | `build/vite.js` `server.headers` | T: `viteBuild.test.mjs` (same) |
| GEV-SEC-004 | `src/intel/markup.js` `esc` | T: `src/intel/markup.test.mjs` (3 tests) |
| GEV-SEC-007 | `server/providers/cctv/media.js` `isRelayableMediaType`, `fetchCctvMediaUpstream`, `proxyMediaResponse`; `server/providers/cctv.js` `CCTV_CAMERA_ID_MAX`; `server/providers/common/rate-limit.js` `makeFanOutRateLimiter`, `capMap`; `server/providers/space/celestrak.js` `CELESTRAK_GROUPS` | T: `src/tooling/cctvRelayHardening.test.mjs` "only media types are relayed", "an HTML upstream is answered with 502 and never piped", "the media relay refuses a redirect off the camera host", "fan-out proxies share a bounded per-client limiter", "CelesTrak groups are the ones the satellite layer uses" |
| GEV-SEC-006 | `server/providers/common/rate-limit.js` `makeOptInRateLimiter`, `clientKey`; `server/providers/places/google.js` | T: `src/tooling/wave1Safety.test.mjs` "the Google Places limiter is on by default and only env can disable it", "rate-limit keys use the forwarded address only when TRUST_PROXY=1" |
| GEV-SEC-008 | `server/providers/places/google.js`; `server/providers/vessels/ais-live.js`; `build/vite.js` `PAGE_HEADERS`; `scripts/preview-smoke.mjs`; `.github/workflows/ci.yml` | T: `src/tooling/wave3Polish.test.mjs` "server errors reach the client as fixed strings", "page headers carry a CSP that cannot break Cesium, on the preview server too" |
| GEV-SEC-005 | `scripts/dev-fresh.sh`, `scripts/setup-doctor.mjs` | T: `src/toolProjectRoot.test.mjs` "launcher reads the selected project keys…", "doctor inspects the selected project dependencies and dotenv without disclosing values" |
| GEV-DIR-001 | `src/tour/events.js` | T: `src/tour/events.test.mjs` "emergency aircraft rank 7500, 7700, 7600 and ignore ordinary codes", "squawk codes are four octal digits or null" |
| GEV-DIR-002 | `src/tour/events.js` | T: `events.test.mjs` "aircraft come before quakes; quakes rank by size then recency", "small, old and positionless quakes are ignored" |
| GEV-DIR-003 | `src/tour/planner.js` | T: `src/tour/planner.test.mjs` "a new incident always comes first…", "an emergency squawk interrupts and jumps the queue" |
| GEV-DIR-004 | `src/tour/planner.js`, `src/tour/config.js` `TOUR_ROTATION`, `MILITARY_TYPES`, `TOUR_BASES` | T: `planner.test.mjs` "slots with nothing to show are skipped; ships must be moving", "military aircraft get their own stop, from feed values", "military stops favour named types like a Black Hawk, and do not repeat", "military airfields are stops with live traffic counts", `planner.test.mjs` "military stops fall back to military airframes in the flights feed" |
| GEV-DIR-005 | `src/tour/planner.js` | T: `planner.test.mjs` "naval / state vessels are preferred, even when slow" |
| GEV-DIR-006 | `src/tour/planner.js` `alertAllowed` | T: `planner.test.mjs` "at most one alert every ten minutes; later alerts wait their turn", "recent incidents are revisited after the cooldown, introduced as recent"; `events.test.mjs` "events already shown are not repeated" |
| GEV-DIR-007 | `src/tour/lines.js` | T: `events.test.mjs` "spoken lines use only feed values and flag simulated events"; `planner.test.mjs` "vessel lines use feed values only", `planner.test.mjs` "placeholder AIS destinations are not read out" |
| GEV-DIR-008 | `src/shell/welcome.js` `WELCOME_TILES`, `WELCOME_SECONDS` | T: `src/shell/welcome.test.mjs` "the welcome card shows the five key components for 30 s" |
| GEV-DIR-034 | `src/shell/intro.js` `shouldPlayIntro`, `mountIntro`, `INTRO_SOURCES`; `src/shell/bootProgress.js` `stageFor`, `advance`, `mountBootProgress` | T: `src/shell/intro.test.mjs` "the DDG intro plays once per session and ?nointro or reduced motion skip it", "hands over to the progress bar after 3.4 s"; `src/shell/bootProgress.test.mjs` "each boot status line maps to a rising share of the bar", "the bar eases to the stage, creeps a little, never passes the ceiling and never goes back" |
| GEV-DIR-009 | `src/tour/controller.js` | D |
| GEV-DIR-010 | `src/shell/index.js` `onFocus`, `src/intel/index.js` `showFocus` | D |
| GEV-DIR-011 | `src/tour/queue.js`, `src/tour/controller.js`, `src/shell/flightPrefetch.js` `stage` | T: `src/tour/queue.test.mjs` "the next stop is planned on arrival and its data loads a whole dwell ahead" "an airport with no aircraft is skipped instead of shown empty" "a slow source is waited for only briefly; a fresh incident jumps the queue"; `src/shell/shellPolicies.test.mjs` "staged aircraft are counted near the destination only" |
| GEV-DIR-012 | `src/airports/overlay.js` `fadeIn`, `fadeOut` | D: Director run on the deployed app, airport stops |
| GEV-DIR-013 | `src/tour/descent.js` `createDescentPlanner`, `src/tour/controller.js` `takeNext` | T: `src/tour/descent.test.mjs` "the descent steps down from GEO to street level, then ends" "fallbacks: a light aircraft for the helicopter; never an aircraft for the vehicle" "the descent ends on the night side: a city at night, then one of its streets in night vision" |
| GEV-DIR-014 | `src/tour/descent.js` `pickDescentRegion`, `src/tour/controller.js` `nextDescentStop` | T: `src/tour/descent.test.mjs` "the descent region is the one nearest early afternoon, solar time" "a step with nothing live is skipped, never faked" "a step waits while its source is still loading, and can be skipped" |
| GEV-DIR-015 | `src/tour/descent.js` `DESCENT_LEVELS`, `levelStates`, `descentDetail`; `src/tour/descentChecklist.js` | T: `src/tour/descent.test.mjs` "the checklist levels cover every step, and outcomes track shown and skipped"; D: harness run 19 Oct (ticks, skipped, fade-out) |
| GEV-DIR-016 | `src/tour/controller.js` `wrapDescent`, `groundHeightAt` | D: harness run 19 Oct (cameras off after the last descent stop) |
| GEV-DIR-017 | `src/tour/tileWarmer.js` `createTileWarmer`; `src/tour/controller.js` `aheadDescent`, `upcomingView`, `stopLabel` | T: `src/tour/tileWarmer.test.mjs` "warming aims Cesium’s preload camera at the next stop and opens its pass" "after arrival it waits for this stop’s tiles, then warms the next; the log records it" "if this stop’s tiles are slow, the next is warmed anyway after a few seconds" "if the queued stop changes during the dwell, warming follows it" "before leaving, the Director waits for the warmed stop's tiles, at most a few seconds; an alert does not wait" "while the Director runs, tiles are not skipped for camera movement; restored on exit"; `src/tour/queue.test.mjs` "a slow source is waited for only briefly; a fresh incident jumps the queue" "an empty airport is replaced during the dwell, so the replacement loads ahead too"; D: `window.__gevTour.tileLog()` on the deployed app (Google tiles), `?tilewarm=0` to compare |
| GEV-DIR-018 | `src/tour/planner.js` `pick`, `satellite`; `src/tour/config.js` `TOUR_SPACE`; `src/tour/lines.js` `satelliteLine` | T: `src/tour/planner.test.mjs` "about one stop in five is in space (never fewer than one in six), cycling GEO, stations and navigation satellites" |
| GEV-DIR-019 | `src/tour/sensors.js` `sensorFor`, `solarElevationDeg`; `src/tour/config.js` `DIRECTOR_SENSORS`; `src/tour/sensorLook.js` `createSensorLook`, `showSensorTag`; `src/tour/controller.js` `loop`, `exit` | T: `src/tour/sensors.test.mjs` "solar elevation: high at local noon, below the horizon at local midnight" "thermal for military aircraft, airfields and naval ships; night vision where the sun is down" "never a sensor look for space, planet-scale views, the descent’s GEO and ISS steps, or street cameras"; D: harness screenshots (thermal and night-vision stops) |
| GEV-DIR-020 | `src/tour/spaceOverlay.js` `swapFill` (no-flicker fill); `src/tour/spaceGeometry.js` `coverageAngle`, `circleAround`, `geoBelt`, `fallbackRing`; `src/tour/spaceOverlay.js` `createSpaceOverlay`; `src/tour/controller.js` (arrive/depart/exit) | T: `src/tour/spaceGeometry.test.mjs` "coverage footprints follow standard geometry (ISS about 2,200 km to the horizon; GEO about 81°)" "the footprint edge is a closed circle at the coverage radius" "the GEO belt sits on the equator at 35,786 km; a fallback orbit ring passes through the satellite"; D: harness run 20 Oct (GEO step, ISS step, satellite stop screenshots); Replit check of the fill rebuild cadence |
| GEV-DIR-021 | `src/tour/descent.js` `street`; `src/tour/config.js` `DESCENT_REGIONS`, `DESCENT_RULES.streetVideoRadiusKm`; `src/tour/lines.js` `streetLine` | T: `src/tour/descent.test.mjs` "the street step prefers a camera with live video near the centre over a nearer still" |
| GEV-DIR-023 | `src/tour/flight.js` `flightSeconds`, `spinsGlobe`; `src/tour/controller.js` `flyTo`, `startOrbit`, `refreshTarget` | T: `src/tour/flight.test.mjs` "longer camera jumps take longer, up to the longest flight time" "a high-orbit satellite is orbited, never globe-spun (no jump to the ground on arrival)" |
| GEV-DIR-024 | `src/tour/flight.js` `planHop`, `midpoint`; `src/tour/config.js` `TOUR_HOP`, `STOP_CAMERA`, `TOUR_TIMING.orbitDegPerS`; `src/tour/controller.js` `hopTo` | T: `src/tour/flight.test.mjs` "between normal stops the camera zooms out to the whole planet, pauses, and zooms in: about 10 s" "assets are framed 50% closer, from a low angle that shows a band of sky" "the hop is one continuous move: it starts and ends exactly on the two framings and zooms evenly"; D: harness camera trace 20 Oct (94 km to 18,000 km to 3 km, continuous) |
| GEV-DIR-025 | `src/tour/introScript.js` `introLine`, `clockWords`; `src/tour/descent.js` `next` | T: `src/tour/descent.test.mjs` "the introduction script covers every descent level and speaks only live values" "the descent steps down from GEO to street level, then ends" |
| GEV-DIR-026 | `src/tour/controller.js` `subjectTracker`, `startOrbit`, `hopTo`, `showStandIn`; `src/tour/flight.js` `smoothToward`; `src/tour/planner.js` `aircraftCamera` | T: `src/tour/flight.test.mjs` "the camera eases onto a moving subject without lag building up, and jumps to a new one"; `src/tour/planner.test.mjs` "a helicopter low over the ground is framed close; an emergency aircraft is framed at its altitude" |
| GEV-DIR-027 | `src/tour/config.js` `STOP_CAMERA`; `src/tour/spaceOverlay.js` beam and scan ring; `src/tour/spaceGeometry.js` `closeRing` | T: `src/tour/flight.test.mjs` "satellite stops keep the whole Earth in frame below a high satellite"; `src/tour/spaceGeometry.test.mjs` "an orbit ring is closed exactly, so the line has no break where its ends meet" |
| GEV-DIR-028 | `src/tour/descent.js` `pickNightRegion`; `src/tour/config.js` `DESCENT_RULES.videoBonusH` | T: `src/tour/descent.test.mjs` "the night city prefers a city with live street video when it is dark there" |
| GEV-DIR-029 | `src/tour/descent.js` geo step; `src/tour/config.js` `DESCENT_CAMERA.geo.tiltDeg` | T: `src/tour/descent.test.mjs` "the opening GEO view looks at the belt from off the equator, so it is a tilted ring, not a flat line" |
| GEV-DIR-030 | `src/tour/tileWarmer.js` `warm` (headingDeg, locate), `holdDetail`; `src/tour/flight.js` `arrivalHeadingDeg`, `leadPosition`; `src/tour/queue.js` `preferFresh`; `src/tour/controller.js` `upcomingView`, `hopTo` | T: `src/tour/tileWarmer.test.mjs` "the warm aims with the arrival heading, and follows a moving subject every second", "while the Director runs, the edges of the view are not kept coarse (foveated detail off); restored on exit"; `src/tour/flight.test.mjs` "tiles are warmed for the arrival pose: hops land north-up, direct flights keep the heading", "a moving aircraft is warmed where it will be on arrival, not where it was queued"; `src/tour/queue.test.mjs` "a fresh alert takes the queued slot during the dwell, so its tiles load before the camera leaves" |
| GEV-DIR-032 | `src/tour/controller.js` `teardown`, abort checks in `loop`, `flyTo`, `hopTo`; `src/tour/queue.js` `reset`; `src/tour/flight.js` `planHop` (`TOUR_HOP.directBelowKm`); `src/tour/planner.js` `pick` | T: `src/tour/queue.test.mjs` "a stopped tour forgets its queued stop, so a restart plans afresh"; `src/tour/flight.test.mjs` "nearby stops glide straight across instead of zooming out to the planet"; `src/tour/planner.test.mjs` "staged (simulated) aircraft are never counted as live traffic at a stop"; I: controller abort paths by inspection (no controller unit tests yet) |
| GEV-DIR-033 | `src/tour/controller.js` `hopTo` (hop, hold, glide), `loop` load gate; `src/tour/flight.js` `arrivalRangeM`; `src/tour/tileWarmer.js` `loadWatch`, `waitLoaded`; `src/maps/google3d.js` `allowParallelGoogleTiles` | T: `src/tour/flight.test.mjs` "the arrival is held above the subject while its tiles load, then glides in"; `src/tour/tileWarmer.test.mjs` "the Director waits for the arrival view to load before talking, at most a few seconds"; `src/maps/google3dBudget.test.mjs` "Google tiles may load many requests in parallel (HTTP/2), so warm-up and the view share"; D: `__gevTour.arrivalLog()` on the live site |
| GEV-DIR-031 | `src/tour/pulseGraphics.js` `pulseFrame`, `frostedSphereSprite`; `src/tour/controller.js` `showMarker`; `src/visuals/flags.js` | T: `src/tour/pulseGraphics.test.mjs` "the alert is one sphere that starts fully opaque and fades to nothing as it grows"; `src/visuals/visuals.test.mjs` "each world visual can be switched off from the URL; quake rings only on request" |
| GEV-INT-001 | `src/intel/hud.js`; `src/intel/index.js` `assignParts` | T: `src/intel/hud.test.mjs` "every kind gets at most four cards, deterministic"; I: UI overlap harness (two sheets, six screen sizes) |
| GEV-INT-002 | `src/intel/hud.js`, `src/intel/enrichment.js` | T: `hud.test.mjs` "feed values stay feed; illustrative rows are flagged"; `src/intel/intel.test.mjs` "feed and simulated content are kept apart" |
| GEV-INT-003 | `src/intel/hud.js` | T: `hud.test.mjs` "ownership is generic, never an invented company" |
| GEV-INT-004 | `src/intel/enrichment.js` | T: `intel.test.mjs` "missing operator becomes a simulated link, never a feed one" |
| GEV-INT-005 | `src/intel/objects.js` `buildTriage` | T: `intel.test.mjs` "triage is driven by feed fields only" |
| GEV-INT-006 | `src/intel/*` | T: `intel.test.mjs` "a staged demo event is never presented as feed data"; `hud.test.mjs` "staged demo objects are entirely simulated" |
| GEV-INT-007 | `src/intel/hud.js` | T: `hud.test.mjs` "orbit numbers are real physics" |
| GEV-INT-008 | `src/intel/actions.js` | T: `src/intel/actions.test.mjs` "every HUD action has a runner, and results render" |
| GEV-INT-009 | `src/intel/actions.js` | T: `actions.test.mjs` "drafted messages carry live values only", "simulated documents are deterministic and flagged" |
| GEV-INT-010 | `src/intel/actions.js` `screenConjunctions` | T: `actions.test.mjs` "conjunction screen finds the closest sampled approach" |
| GEV-INT-011 | `src/intel/objects.js` | T: `intel.test.mjs` "nearby uses real geometry and excludes self", "nearestHit picks the closest point within radius" |
| GEV-INT-012 | `src/intel/` (no person model exists) | I |
| GEV-INT-013 | `src/intel/assetTypes.js`, `src/intel/referenceImages.js`, `src/intel/markup.js` | T: `src/intel/assetTypes.test.mjs` "aircraft resolve by ICAO designator…", "vessels resolve by AIS family or naval hull prefix…", "the photo sits on a feed card, labelled as a type reference with credit" |
| GEV-INT-014 | `src/intel/silhouettes.js`, `src/intel/assetTypes.js` | T: `assetTypes.test.mjs` "every catalogue entry has a drawable silhouette", unlisted-type assertions |
| GEV-INT-015 | `src/intel/place.js`, `src/intel/index.js` `showFocus`, `server/providers/metar.js` | T: `src/intel/place.test.mjs` "an airport stop shows live traffic, weather, incidents and surroundings" "missing feeds say so instead of inventing figures"; `src/data/metarProxy.test.mjs` "stations are validated, cached for ten minutes and served stale on failure" |
| GEV-INT-016 | `src/intel/camera.js`, `src/intel/index.js` | T: `src/intel/camera.test.mjs` "a street camera opens as an all-feed card set with its live still" "a camera facing is shown only when the source published it with confidence" |
| GEV-INT-017 | `src/intel/place.js`, `src/intel/index.js` `nearestCamera` | T: `src/intel/camera.test.mjs` "a Director place card shows the nearest camera still when one is within reach" |
| GEV-INT-018 | `src/intel/hud.js` `surfaceVehicleHud` | T: `src/intel/hud.test.mjs` "an airport surface vehicle shows feed values only, never aircraft rows" |
| GEV-INT-019 | `src/intel/sheets.js`, `src/intel/markup.js` `sheetDrawer`, `src/intel/index.js` `openSheet` | T: `src/intel/sheets.test.mjs` "an object opens with a typed identity, a stable id and a lineage from its feed" "properties keep feed values as feed and flag platform fields as simulated" "linked objects are feed labels or openable nearby assets, never people" "the timeline is newest first, with simulated events flagged" "the drawer shows identity, lineage, tabs and escapes feed strings" "an airport surface vehicle is typed as one, with no flight events" |
| GEV-INT-020 | `src/intel/sheets.js` `trackHistory` | T: `src/intel/sheets.test.mjs` "track history: observed positions are feed; the reconstructed path is simulated" |
| GEV-INT-021 | `src/data/aircraftClass.js` `classifyAircraft`, `src/data/aircraftIcons.js` `vehicle`, `src/layers/flights/rendering.js` | T: `src/data/aircraftClass.test.mjs` "ADS-B surface vehicles (C1/C2) classify as wheeled vehicles, whatever the type code" |
| GEV-INT-022 | `src/shell/layout.js`, `src/ui/styles/shell.css` (Screen map), `docs/UI-LAYOUT.md` | T: `src/shell/layout.test.mjs` "every fixed overlay in the style sheets is on the screen map" "the viewer’s own panels win a column; the asset cards give way to anything" "the bottom reserve stacks credits, then caption, so neither covers the other"; D: overlap check, 6 sizes × 14 states, 19 Oct (84/84 clear after fixes) |
| GEV-INT-023 | `server/providers/cctv/sources.js` (TfL `videoUrl`), `src/layers/cctv/controls.js` `mediaUrl`, `src/intel/camera.js`, `src/intel/actions.js` `liveview`, `src/intel/index.js` `mountVideos` | T: `src/intel/camera.test.mjs` "a camera that publishes video shows a looping clip, labelled as a clip, with an Expand view"; D: harness 19 Oct (clip plays in card, city panel and large view; no restart on refresh) |
| GEV-INT-024 | `src/shell/layout.js` (band), `src/intel/index.js` `placeCards`, `src/ui/styles/shell.css` | T: `src/shell/layout.test.mjs` "the descent band pushes the asset view down instead of hiding cards"; D: overlap check with the hidden-card rule, 19 Oct |
| GEV-INT-025 | `src/intel/leaderRoute.js` `assignLanes`, `orthogonalPath`; `src/intel/index.js` `updateLeaders` | T: `src/intel/leaderRoute.test.mjs` "leader lines run only horizontally and vertically (corners rounded)" "each leader gets its own lane, nearer cards on the outer lane, so they never cross" |
| GEV-INT-026 | `server/providers/cctv/stream.js` `parseHlsMap`, `parseHlsMedia`, `createHlsPuller` (`getInit`); `server/providers/cctv.js` media route; `src/layers/cctv/videoPlayback.js`; `src/intel/index.js` `mountVideos`; `src/intel/camera.js`; `src/intel/actions.js` `liveview` | T: `src/data/cctvHlsStream.test.mjs` "fragmented-MP4 streams (Iowa DOT) relay with their init segment; MP4 without a map still fails closed"; `src/intel/camera.test.mjs` "a camera with a live stream plays live video, labelled LIVE VIDEO, with the still as its fallback" |
| GEV-INT-027 | `server/providers/cctv/sources.js` `iowaCameraToSource`, `loadIowaSourcesFromOpenData`; `server/providers/cctv/catalog.js` (`iowa` pack); `src/data/dataCredits.js` | T: `src/data/cctvIowa.test.mjs` "Iowa DOT cameras register as live HLS video with the snapshot as fallback, credited CC BY 4.0" "Iowa rows without video are stills; foreign hosts and bad positions are refused" |
| GEV-INT-028 | `src/intel/index.js` `enterHud`, `leaveHud`, `openDrawer`, `closeDrawer`; `src/ui/styles/shell.css` (asset view and sheet animations) | D: harness overlap check after the animations settle (laptop and tablet); Replit visual check |
| GEV-INT-029 | `src/shell/welcome.js`; `src/intel/markup.js` `sheetDrawer`; `src/intel/index.js` sheet keydown, `setTriage`; `src/tour/ui.js` `createTourUi` | T: `src/tooling/wave3Polish.test.mjs` "sheet tabs follow the ARIA tabs pattern", "the welcome dialog traps focus and the Director announces with roles" |
| GEV-PRF-001 | `src/shell/qualityPolicy.js`, `src/shell/quality.js` | T: `src/shell/shellPolicies.test.mjs` "quality ladder always keeps native resolution; it sheds shadows, then bloom, then MSAA, then tile detail" |
| GEV-PRF-002 | `src/shell/qualityPolicy.js` | T: `shellPolicies.test.mjs` "one slow window does not drop quality; sustained slowness does; recovery needs headroom" |
| GEV-PRF-003 | `src/shell/idleSpinPolicy.js`; `src/shell/idleSpin.js` `hasNavigated` | T: `src/intel/intel.test.mjs` "idle spin only when idle, zoomed out and unblocked"; `src/shell/navigation.test.mjs` "the globe never turns on its own once the user has moved the camera" |
| GEV-PRF-004 | `src/shell/flightPrefetchPolicy.js` | T: `shellPolicies.test.mjs` "flight refresh on arrival: new place, stale data, not from space" |
| GEV-PRF-005 | `src/shell/flightPrefetch.js` `preload`, `src/layers/flights/controller.js` `setQueryAnchor` | D: `scripts/bench/director-stops.mjs` (`flightsFreshAtArrival`) |
| GEV-PRF-006 | `src/shell/index.js` `MODEL_URLS` | T: `shellPolicies.test.mjs` "the model warm list matches the shipped glTF files exactly" |
| GEV-PRF-007 | `src/renderGovernor.js` `holdRenderCadence`, `src/layers/*/lifecycle.js` | T: `src/renderGovernor.test.mjs` "a cadence hold keeps render-on-demand and requests frames at the fastest cadence" |
| GEV-PRF-008 | `src/data/lifecycle.js` `pausePolling`, `src/shell/index.js` | T: `src/data/pollPause.test.mjs` "paused polling skips periodic updates and catches up once on resume" |
| GEV-PRF-009 | `build/cacheHeaders.js`, `build/vite.js` | T: `src/tooling/cacheHeaders.test.mjs` "hashed assets are cached for a year, the page always revalidates, APIs are left alone" "injected classic scripts are deferred; module scripts and other tags are untouched" |
| GEV-PRF-010 | `src/maps/google3d.js` `tileCacheBudget`, `src/shell/qualityPolicy.js` | T: `src/maps/google3dBudget.test.mjs` "the 3D tile cache is sized to the device memory"; `src/shell/shellPolicies.test.mjs` "quality ladder always keeps native resolution; it sheds shadows, then bloom, then MSAA, then tile detail" |
| GEV-PRF-011 | `src/shell/qualityPolicy.js` `startLevel`; `src/shell/quality.js`; `src/maps/google3d.js` `withinStartupBudget`, `TILESET_STARTUP_TIMEOUT_MS`; `src/shell/index.js` `warmModels` | T: `src/tooling/wave3Polish.test.mjs` "low-end devices start without bloom at native resolution", "a tileset route that never answers is skipped after the budget, and a late tileset is destroyed", "models are pre-warmed with prefetch hints, and dead styles are gone" |
| GEV-CM-001 | whole tree | A: `scripts/audit/import-graph.mjs` |
| GEV-CM-002 | `.github/workflows/ci.yml` | I |
| GEV-CM-003 | `package-lock.json` | I |
| GEV-VIS-001 | `src/visuals/dayNight.js` `createDayNight`, `subsolarPoint`, `nightFade`; `src/data/dataCredits.js`; `DATA_SOURCES.md` | T: `src/visuals/visuals.test.mjs` "the day/night line follows the real Sun" "day/night shows at planet and regional scale only, never at city or street level" "each world visual can be switched off from the URL"; `src/data/dataCredits.test.mjs` "every shipped live source and bundled asset has an attribution entry"; D: harness screenshots 20 Oct (stub night-lights image; GIBS not reachable from the harness) |
| GEV-VIS-002 | `src/visuals/trails.js` `createTrailStore`, `pickTrails`, `createTrails` | T: `src/visuals/visuals.test.mjs` "trails use only observed fixes, fade with age and drop when old" "tails are drawn for the focused asset and the nearest ones only, capped" |
| GEV-VIS-004 | `src/shell/graphics.js` `installGraphics`, `graphicsFlags`; `src/shell/index.js` | T: `src/shell/graphics.test.mjs` "the scene look: HDR with a neutral tone map, gentle bloom, sharpening instead of FXAA", "each effect can be switched off from the URL for comparison" |
| GEV-VIS-005 | `src/data/aircraftIcons.js` `iconTierPx`; `src/layers/flights/rendering.js`, `src/layers/military/rendering.js` fleet tick; `src/layers/cctv/policy.js` `CAMERA_ICON`; `src/layers/vessels/rendering.js` `shipIcon`; `src/intel/subjectVisual.js` | T: `src/shell/graphics.test.mjs` "icons are drawn from the raster closest to their size on screen, never magnified" |
| GEV-VIS-006 | `src/layers/flights/rendering.js`, `src/layers/military/rendering.js` `setFocusModel`, `_applyModelLook`; `src/shell/index.js` `onFocus` | I: harness render of the focused 787 (own materials, 96 px minimum) |
| GEV-VIS-007 | `src/shell/navigation.js` `cesiumEventMapping`, `configureCesiumNavigation`, `navKeyAction`, `isTypingTarget`, `panFrame`, `turnAbout`, `tiltAbout`, `zoomToward`, `keyFrame`, `installNavigation`; `src/shell/index.js` | T: `src/shell/navigation.test.mjs` "standard mouse navigation: left drag rotates, right/middle drag pans, wheel zooms", "keys: arrows and WASD pan, Q/E turn, R/F tilt, +/- zoom; never in a text field or with Ctrl", "panning slides over the ground: same height, tilt and heading, from street to orbit", "Q/E turn and R/F tilt about the point at the screen centre, within the tilt limits", "+/- zoom towards the screen-centre point, smoothly, never into it or out past the limit", "held keys combine in one frame; nothing moves without a key", "a navigation key stops the Director, cancels any flight and moves the camera; typing in a field does not"; I: mouse feel on the live site (grabbed point under the cursor, turn and tilt about the cursor, wheel towards the cursor) |
| GEV-VIS-008 | `src/visuals/sun.js` `createSun`, `wantShadows`, `shadowBias`, `sunColor`; `src/shell/qualityPolicy.js` (shadows rung); `src/shell/quality.js` | T: `src/visuals/sunNightStars.test.mjs` "the scene is lit by the real Sun: noon over the subsolar point, night on the far side" "shadows only for close views in daylight, and never on the quality ladder’s lower rungs" "the Sun module drives the scene light, the sky and the shadows, and restores them" "no shadows at night, and the Sun disc hides once the viewer clock has drifted"; `src/shell/shellPolicies.test.mjs` "quality ladder always keeps native resolution; it sheds shadows, then bloom, then MSAA, then tile detail"; D: harness city renders 21 Oct (day, golden hour; shadow acne fixed by the depth bias) |
| GEV-VIS-009 | `src/visuals/nightTiles.js` `createNightTiles`, `NIGHT_SHADER`, `nightAmount`; `src/tour/sensorLook.js` (`gev:sensor` event) | T: `src/visuals/sunNightStars.test.mjs` "the city darkens through twilight to night by the Sun’s height there" "every 3D tileset gets the night shading; thermal and night vision see the raw picture"; D: harness city renders 21 Oct (dusk, lit-city night, unlit night; night-lights orientation checked with a synthetic city at 40.7° N and its mirror at 40.7° S) |
| GEV-VIS-010 | `src/visuals/starfield.js` `createStarfield`; `scripts/sky/build-starfield.py`; `public/sky/` and its README; `src/data/dataCredits.js` (`xhip-stars`); `DATA_SOURCES.md` | T: `src/visuals/sunNightStars.test.mjs` "the Milky Way sky box replaces the default once all six faces load, and keeps it on failure"; `src/data/dataCredits.test.mjs` "every shipped live source and bundled asset has an attribution entry"; D: harness 21 Oct: marker dots rendered through Cesium's sky box land on their projected positions (within 5 px) on all six faces; Betelgeuse, Rigel and Bellatrix render on their projected pixels |
| GEV-VIS-003 | `src/visuals/quakeRings.js` `ringRadiusKm`, `ringFrame`, `createQuakeRings`; `src/visuals/index.js` `onFocus` | T: `src/visuals/visuals.test.mjs` "quake rings grow with magnitude, pulse a few times, then settle" |

## 3. Coverage of code by requirements

The fork’s own modules are fully traced: `src/tour`, `src/intel`, `src/visuals`,
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
