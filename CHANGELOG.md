# Changelog

All notable changes to the Digital Dynamics Group fork. Upstream history
before the fork (base `ce671ce`, 2026-09-24) is preserved in git.

## [Unreleased] – audit readiness (2026-10-14)

### Added
- **CrossCheck, a product of its own (Phases 2 to 6).** Open `/crosscheck/`:
  - Plug in any codebase (a GitHub link or a zip) and answer what code
    cannot show.
  - Choose from seven standards. Four are new: NIST SSDF, Australian ISM and
    Essential Eight, ISO/IEC 27001:2022 and MIL-STD-882E.
  - Get a verdict per standard and every item rated with the file and line
    it rests on.
  - Get a remediation plan in four waves, with projected readiness and a
    work package per fix for a team or a coding agent.
  - Optional rating by an open-source model, kept only when it cites real
    evidence.
  - CrossCheck also runs on its own (`node crosscheck/server/standalone.mjs`)
    and exports to a separate project
    (`node crosscheck/tools/export-standalone.mjs <folder>`).
- **A tilted GEO ring to open the tour.** The first view of the opening
  descent now looks at the Earth from about 22° off the equator, so the
  geostationary belt shows as a tilted ring rather than a flat line.
- **The Director keeps moving subjects centred.** The camera follows an
  aircraft's drawn icon (and a satellite's live orbit position) through the
  flight in and the whole dwell, instead of circling where it was. Aircraft
  alerts are framed at the aircraft's altitude, and helicopters and other
  low flyers are framed closer. A subject the live layer is not drawing
  (such as an airport vehicle) gets the Director's own icon.
- **Earth as the hero at satellite stops.** GEO and MEO stops now keep the
  whole Earth in frame just below the satellite. Coverage is a faint glass
  beam with a slow scan sweeping down it and across the footprint, in place
  of the cone of lines.
- **Live video at night.** The night city prefers Des Moines (live Iowa DOT
  video) whenever it is dark there.

### Fixed
- Night vision no longer floods the screen with bright green. It is used
  only up close (30 km or nearer) and never on an alert. The look is now a
  dark scene where edges and bright surfaces stand out.
- Orbit rings no longer break or show a second, offset line: the Director's
  ring is closed exactly and the layer's rings are re-baked every 10
  minutes. The focused aircraft's tail now ends exactly at its icon.
- The sea no longer looks white and frothy up close (the animated wave
  effect is off).
- The street camera's panel in the city no longer flashes black every
  second while it waits for a picture.
- Aircraft and ship icons are half the size on the zoomed-out globe.
- Text drawn in the 3D view (alert labels, footprint and airport labels) is
  sharper.

- **A spoken introduction.** Through the opening descent the Director now
  explains each level: what it shows, where the data comes from, what is
  live and what is simulated, and what the platform does with it. The night
  city is now shown with the whole planet in view.
- **The whole planet between stops.** After the opening descent, the
  Director zooms out until the entire Earth is in view, pauses with the
  globe turning, then zooms in to the next subject (about 10 s). Asset
  stops are framed 65% closer, and the dwell orbit turns more slowly.
- **The night side in the opening descent.** After the street camera, the
  Director flies to a camera city where it is dark, from 2,400 km with its
  city lights, then down to one of its streets in night vision. A view-mode
  badge on the caption says which mode is on and why (night vision,
  thermal, night side).
- **Fixed: the night side flickered in Director mode.** The satellite
  coverage fill was rebuilt every second and vanished while rebuilding; it
  now rebuilds only when the satellite moves, keeping the old fill until the
  new one is ready.
- **CrossCheck gets its own folder (Phase 1).** The assessment kit
  (standard catalogues, ratings, ledger, re-audit and plan tools) now lives
  in `crosscheck/` with portable paths, and CrossCheck's scoring engine
  moved there from the AUDIT view, which now uses it. A test keeps the
  folder free of God's Eye View imports, so it can be copied into its own
  project later.
- **Smoother Director camera.** Jumps between the street and orbit now
  take up to 7 s and ease, high-orbit satellite stops orbit the satellite
  (they used to jump to a ground point on arrival), and moving subjects are
  re-aimed at their live position just before the flight.
- **Panels slide.** The asset cards slide in from their own side one after
  another and slide out when the view closes; the sheets drawer slides out.
- **Google tiles before arrival, harder.** The Director now keeps orbiting
  for up to 5 s until the next stop's tiles are in before it leaves (alerts
  never wait), and tiles are no longer skipped because the camera is moving.
- **Thermal and night-vision looks.** At military stops the Director
  switches to a white-hot thermal look, and on the night side to night
  vision, tagged "SENSOR · FLIR" or "SENSOR · NVG". Space, wide views and
  street cameras stay in the normal look.
- **Orbit rings and coverage footprints.** At space stops the satellite's
  orbit ring glows, the geostationary belt is drawn for GEO stops, and the
  satellite's coverage footprint is drawn on the Earth below (solid edge:
  horizon; dashed: 10° above it).
- **Day/night, trails and quake rings.** A live day/night line with NASA
  city lights at planet scale, glowing trails behind aircraft and ships
  from positions seen this session, and expanding rings at earthquakes.
  Switches: `?daynight=0`, `?trails=0`, `?quakerings=0`.
- **Live street video.** Iowa DOT's traffic cameras (CC BY 4.0) are added,
  and about 700 of them stream live video, which now plays live in the
  camera card and the Expand view (labelled LIVE VIDEO), relayed through
  the server. If a stream fails the card falls back to the live still. Des
  Moines joins the descent regions, and the descent's street step prefers
  a live-video camera.
- **Welcome card: 30 s and the five key components.** The card now stays
  for 30 s, and its tiles show Live data, Orbit to street, Every asset in
  depth, AI Director and Real-time alerts (cameras fold into Orbit to
  street).
- **Space in every five stops.** The Director visits a satellite at least
  once in every five stops, cycling geostationary satellites, crewed
  stations and GPS, Galileo and GLONASS satellites. GEO satellites are
  framed from 9,000 km back so the Earth shows behind them.
- **Orthogonal leader lines.** Lines from the asset to its cards run only
  horizontally and vertically, with rounded corners and a lane each.
- **Google tiles load before the camera arrives.** The Director knows its
  next stop while it dwells at this one, and now starts loading that
  place's 3D map tiles a few seconds early. A genuine real-time alert still
  goes straight there. `window.__gevTour.tileLog()` shows, per stop, whether
  it was warmed and how long its tiles took; `?tilewarm=0` turns it off.
- **One street camera ends the descent.** The opening descent now finishes
  on the nearest street camera instead of visiting three.
- **Camera video and a bigger view.** London's TfL cameras now play their
  published video clips (about 10 s, refreshed every few minutes) in the
  card and the city panel, labelled "VIDEO CLIP"; stills-only networks stay
  labelled "LIVE STILL". "Expand view" opens a camera in a wide drawer.
- **All four asset cards stay on screen.** The descent checklist moved to a
  strip under the top bar, and with the drawer open the four cards stack in
  the left column instead of two hiding.
- **Defence tour.** After the opening descent the Director tours military
  aircraft (named types such as Black Hawks, P-8s, E-3s and tankers first),
  the world's busiest airports and well-known military airfields, with ships
  and satellites in between. Alerts show at most once every 10 minutes.
- **Descent checklist.** A side checklist lists the seven levels from
  geostationary orbit to street cameras and ticks them off live, then fades.
- **Welcome card.** Five picture tiles with one short sentence each replace
  the paragraphs.
- **Ground vehicles drawn as vehicles.** Airport ADS-B vehicles now show as
  wheeled vehicles on the ground (no aircraft model), and the descent never
  substitutes an aircraft for the vehicle step. Street cameras the descent
  turned on are turned off when it ends.
- **Analyst sheets.** The action buttons under a focused asset now open
  sheets in a drawer on the right, so the asset stays in view. Each asset
  opens as an object: type and key, a data-lineage strip, properties, linked
  objects (nearby assets open on click) and a timeline, plus one tab per
  action. New sheets: track history (aircraft, vessels), port calls, orbit
  elements (computed from the orbit data), exposure estimate, and camera
  network health and nearby incidents. Every value is tagged FEED or SIM,
  tables copy as CSV, and the drawer follows the Director from stop to stop.
- **Director opening descent.** The first Director run after the dashboard
  opens steps down from the geostationary belt to the ISS, an airliner near
  40,000 ft, a low-level helicopter, a ship, an airport ground vehicle and a
  live street camera, then turns slowly at street level past nearby cameras before
  the normal tour starts. It stays over whichever camera city (Sydney, London,
  Helsinki, Vancouver, Calgary or Toronto) is in daylight. Every subject is
  live; a step with nothing live is skipped. Alerts that arrive during the
  descent wait until it ends, then show first.
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
