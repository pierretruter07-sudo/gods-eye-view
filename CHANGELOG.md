# Changelog

All notable changes to the Digital Dynamics Group fork. Upstream history
before the fork (base `ce671ce`, 2026-09-24) is preserved in git.

## [Unreleased] – audit readiness (2026-10-14)

### Added
- **Street cameras.** A new layer restores the public traffic cameras from
  the original God's Eye View: up to about 2,300 cameras (per-network caps) from Live Traffic NSW,
  TfL London, Fintraffic, DriveBC, Open Calgary and Ontario 511 (with a free developer key). Clicking one
  opens an intel card with its live still (refreshed every 10 s), location,
  network and licence, and shows the still as a panel in the 3D city that can
  be adjusted, saved and reset. Director place cards show the nearest
  camera's still. Courtesy-only networks are off by default; live video,
  the licence-plate-reader map, sample-video "pilot" cameras and invented
  fallback cameras are not used. The relay is rate-limited and stores no
  frames.
- **ISO/IEC 42001 audit ring.** AUDIT now checks God's Eye View against a
  third standard, the AI management system (clauses 4–10 and Annex A, 65
  items), on an outer ring. Baseline: 24%, not met, 8 must-fix. The
  readiness rail, must-fix list, impact statements, tour, narrated
  timeline, evidence drawer and ledger all carry the third lens.
  Remediation plan v0.4 adds workstreams W11–W13.
- **Place intel at Director stops.** Airport and city stops now open a
  four-card view instead of an empty screen:
  - **Live traffic:** aircraft within 50 km; on ground, arriving and
    departing; busiest operators; emergency squawks; military nearby.
  - **Weather:** the METAR from NOAA AWC, with the runway into the wind.
  - **Latest incidents nearby:** earthquakes, fire hotspots, cyclones and
    squawk alerts.
  - **Around the location:** ships, satellites overhead, local time,
    elevation and runways.
  All values are from feeds; a missing layer is named. Adds the
  `/api/metar` proxy (cached 10 minutes, last good report for 2 hours).
- AUDIT playback: the narrated card now sits in the right-hand column,
  clear of the orbit. A live data line runs from the card to the timeline
  stop it explains.
- **Director look-ahead.** The next stop is chosen on arrival at the
  current one, and its aircraft load during the whole dwell instead of the
  4 s flight. The loaded aircraft are drawn the moment the camera
  arrives. An airport with no aircraft is skipped rather than shown
  empty. The background loop that warmed every stop has been removed. The airport overlay fades in and out, and each aircraft label
  fades in as its data arrives.
- **Satellite orbit rings.** They now close exactly: the drift from orbit
  precession and drag over one period is spread around the ring. The part
  of a ring behind the Earth is hidden.
- **AUDIT view, round 3.**
  - Every item now says what it means for God's Eye View: the feeds,
    services or people it touches and what would go wrong. Must-fix items
    have their own wording.
  - Play on the timeline is narrated. Each stop explains what the wave
    fixes, which gaps it closes, how readiness moves, and what that
    unlocks next.
  - Entering AUDIT is quicker. The code and data are fetched in advance
    (on hover, or after start-up), the morph overlaps the flight, and
    shaders compile during the flight.
- **Performance pass (wave 3).**
  - Aircraft, ships and satellites redraw at their data pace (80–200 ms)
    instead of 60 fps.
  - Feed polling pauses while the tab is hidden or AUDIT is open, then
    catches up once.
  - Hashed assets are cached for a year, and the page always revalidates.
  - The Cesium script no longer blocks the first paint, and Google tiles
    are preconnected.
  - The 3D tile cache is sized to the device.
  - The last quality steps coarsen 3D tile detail.
  - FXAA runs only when MSAA is off, and the viewer starts at 2× MSAA.
  - GEV-PRF-007…010 and GEV-AUD-011…012 are traced.
- **AUDIT view, round 2.**
  - Cleaner layout: a three-column grid with no overlaps, smaller type,
    and a left rail of collapsible sections (Readiness, Must fix grouped by
    standard, Layers, Key & sources). Detail appears only on selection,
    with folding sections.
  - Progress timeline: Baseline → Waves 1–4 → Sign-off, with play. The
    orbit recolours, pins settle as gaps close, and the dials and must-fix
    list update. Measured stops come from recorded re-audits; projected
    stops are labelled as such everywhere.
  - A cinematic guided tour (13 steps). The camera flies around the
    orbit, rotating, zooming, tilting and focusing while hint chips name
    each movement. The rest of the orbit and screen dims around the
    subject, and a hands-on "Now you try" step follows.
  - **Reset view** in the top bar.
  - Requirements GEV-AUD-008…010 with tests (13 audit tests).
- Evidence ledger: each finding now records its planned `target` and
  `targetFull`. Re-ratings name their audit. Host-dependent items are
  listed under `pending`. A re-audit recorder lives in the CrossCheck kit.
  Remediation plan v0.3.
- **AUDIT view (CrossCheck).** An AUDIT button on the main panel flies the
  camera out to the whole Earth, fades the live globe and lays the
  CrossCheck orbit exactly over it. Inner ring: 115 ED-153 objectives
  (SWAL 3). Outer ring: 345 OWASP ASVS 5.0 requirements (L2). Must-fix gaps
  are raised pins; other layers stay at 15% until switched on.
  - Same navigation as the globe (Cesium's camera drives the overlay).
  - Guided tour (11 steps) behind a "First time here?" prompt.
  - Evidence drawer: pipeline, baseline vs latest audit, progress and
    readiness journey, then waves, workstreams and per-finding history,
    read from `docs/evidence/ledger.json`.
  - Requirements GEV-AUD-001…007 with 10 unit tests.
  - three.js r160 vendored under `vendor/three/` (MIT).
- Remediation plan v0.1 (approved) and v0.2 with the readiness journey;
  evidence ledger and frozen baseline branch `baseline/crosscheck-2026-10-14`.
- Requirements baseline (GEV-SRS 0.1, 56 requirements) and a verification
  plan with a traceability matrix.
- Configuration index, known limitations, demo runbook and architecture
  docs. Data-source licence register with commercial-use flags.
- Build identity stamp (`<sha> · <date>`) on the welcome card and in
  `window.__godsEyeView.build`.
- Import-graph audit tool (`scripts/audit/import-graph.mjs`): 0 orphan files.
- Tests:
  - HTML-injection regression tests for every HUD and result surface.
  - The regional flight fallback chain.
  - Attribution coverage.
  - Node runtime policy.

### Changed
- Director: aircraft at the destination load during the camera flight; the
  arrival refresh is skipped when that preload already covered the place.
- 3D models are pre-warmed after startup; globe tile cache raised to 300
  so revisited stops draw instantly.
- Horizon haze hides the imagery mosaic seam towards the horizon and lowers
  far-field tile requests. Director stops use steeper camera angles.
- Removed `preserveDrawingBuffer` (a per-frame buffer copy nothing needed).
- Earthquake zones no longer draw an orange ground glow.
- Intel HUD: type reference photo with class-outline fallback; card anchors
  are measured on resize instead of every frame.
- Removed 518 unreachable inherited source files, 277 tests and 68 MB of
  media. The clean shell is the only UI.
- Welcome card describes the Director as an automated narrator.
- Setup doctor accepts Node 24.13 (hosted runtime) with a warning, and no
  longer lists removed providers.
- Keyless terrain requests are limited to 6 in parallel to avoid HTTP 429
  bursts.
- CI: removed the Windows/Pinokio job, and the format and boundary gates
  were brought back in line with the trimmed tree.

### Removed
- Voice control, CCTV, traffic, transit, radio, launches, provider-settings
  panel, Pinokio launcher and the other inherited features the dashboard
  never showed.

## 2026-10-14 – intel layer and polish
- Constellation HUD: up to four glass cards with hairline leader lines and a
  data pulse.
- Analyst actions open real result panels:
  - satellite passes, downlink windows and conjunction screening;
  - Esri archive imagery;
  - drafted messages (sending simulated).
- Triage queue, watchlist and areas of interest. FEED / SIMULATED
  provenance on every value.
- Welcome card with a 10 s countdown into the Director. Native-resolution
  rendering with an adaptive quality ladder.
- Director:
  - follow-cam on click;
  - naval, state-vessel and military-aircraft stops;
  - planet-scale stops turn the globe.
- Ship and satellite visuals and ocean water. Regional flight fallback chain
  with stale-while-revalidate. Flight pre-warming for Director stops.

## 2026-10-13 – Director and Exercise mode
- Director tour mode with live event detection: emergency squawks and
  M4.5+ earthquakes, then a varied rotation.
- Clean glass shell: top bar, Layers panel, opens on the whole planet.
- Exercise mode:
  - fictional theatre;
  - planning-package generator;
  - 2D-canvas launch cinematic over a fictional airfield.
