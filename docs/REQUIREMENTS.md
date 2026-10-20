# Software requirements baseline

| | |
|---|---|
| Document | GEV-SRS |
| Version | 0.1 (draft baseline) |
| Date | 2026-10-14 |
| Configuration | `main` at the commit that merges this file (see [Configuration index](CONFIGURATION-INDEX.md)) |
| Owner | Digital Dynamics Group |

These requirements were reverse-engineered from the implemented system to
establish a first baseline. They are not yet derived from a system safety
assessment. Each requirement has a unique ID, one verification method and a
trace in [VERIFICATION.md](VERIFICATION.md).

**Verification methods:**
- **T**: automated test.
- **A**: analysis (tooling or review).
- **I**: inspection of code or configuration.
- **D**: demonstration on the running system.

## 1. System (SYS)

| ID | Requirement | V |
|---|---|---|
| GEV-SYS-001 | The system shall run as a single-page application in a current desktop Chromium-based browser with WebGL 2, with no plug-in. (Firefox and Safari: not yet verified.) | D |
| GEV-SYS-002 | The system shall start and display a globe with no credentials configured, using keyless imagery and terrain. | T |
| GEV-SYS-003 | Unless `?restore` is present, every launch shall start at the whole-globe view with the default layer set, discarding the stored camera and layer state. | I |
| GEV-SYS-004 | On an initialisation failure the loading screen shall show the error message instead of a blank page. | I |

## 2. Data layers (LAY)

| ID | Requirement | V |
|---|---|---|
| GEV-LAY-001 | The layer catalog shall construct exactly these layers: flights, military, ais-live-vessels, satellites, earthquakes, local-firms, weather-cyclones, military-installations, telegeography-submarine-cables, cctv (street cameras). | T |
| GEV-LAY-002 | At start the system shall enable flights, military, earthquakes, satellites and ais-live-vessels. | D |
| GEV-LAY-003 | Each third-party data source in use shall be credited in the in-app data attribution panel. | T |
| GEV-LAY-004 | A layer whose provider needs a missing key shall stay empty and report that a key is required. It shall not show fabricated data. | I |
| GEV-LAY-005 | The street-camera layer shall show only cameras the server registered from configured public networks. Networks published under an open licence shall be on by default and courtesy-only networks off; no invented or sample cameras shall be shown. | T |
| GEV-LAY-006 | Selecting a street camera shall show its live still as a panel in the 3D scene, which the operator can adjust, save and reset. | D |

## 3. Server proxies (SRV)

| ID | Requirement | V |
|---|---|---|
| GEV-SRV-001 | Every data provider shall be served identically by the development and the built-preview server. | T |
| GEV-SRV-002 | A request to an unknown `/api` route shall return HTTP 404 with a JSON body and `Cache-Control: no-store`. | T |
| GEV-SRV-003 | Malformed parameters to the terrain, aircraft-type and TLE proxies shall be rejected with HTTP 400. | T |
| GEV-SRV-004 | Regional flight requests shall try adsb.lol, then airplanes.live, then adsb.fi. A source that fails shall be put on cooldown and skipped by the following requests. | T |
| GEV-SRV-005 | The development server shall bind to `localhost` by default and accept only loopback and `.local` host headers unless explicitly bound to all interfaces. | T |
| GEV-SRV-006 | The camera relay shall fetch frames only from server-registered camera addresses, with a timeout and a size cap on every fetch and a per-client rate limit, and shall never write a frame to disk. | T |

## 4. Security (SEC)

| ID | Requirement | V |
|---|---|---|
| GEV-SEC-001 | Only `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` shall be compiled into the browser bundle. All other credentials shall stay server-side. | T |
| GEV-SEC-002 | The server shall refuse to serve `.env*`, certificate, `.git` and launcher environment files. | T |
| GEV-SEC-003 | Pages shall be served with `X-Frame-Options: DENY` and `frame-ancestors 'none'`. | T |
| GEV-SEC-004 | Text received from any feed (callsigns, vessel names, destinations, place names) shall render as inert text in every HTML surface. | T |
| GEV-SEC-005 | Launch scripts shall not print credential values. | T |

## 5. Director (DIR)

| ID | Requirement | V |
|---|---|---|
| GEV-DIR-001 | The Director shall detect aircraft squawking 7500, 7700 or 7600, rank them in that order, and ignore other codes. | T |
| GEV-DIR-002 | The Director shall detect earthquakes of magnitude ≥ 4.5 and no older than 3 h, ranked by magnitude then recency. Aircraft emergencies come before earthquakes. | T |
| GEV-DIR-003 | A new incident shall interrupt the tour and be shown next. | T |
| GEV-DIR-004 | Between alerts the Director shall rotate military aircraft → busy airport → military airfield → satellite → vessel → military aircraft → busy airport → military airfield → satellite → planet view, skipping slots with nothing to show. Military aircraft shall be chosen by interest (named types such as Black Hawk, P-8, E-3, KC-135 first) and not repeated within 30 min. | T |
| GEV-DIR-005 | Vessel stops shall prefer naval/state vessels (≥ 1 kn). Otherwise they shall use moving vessels (≥ 8 kn). | T |
| GEV-DIR-006 | The Director shall show at most one alert (new or revisited) every 10 min; later alerts wait their turn. A shown incident shall not repeat until 6 min have passed, and shall then be introduced as recent. | T |
| GEV-DIR-007 | Spoken and on-screen Director lines shall contain only feed values. Simulated events shall be announced as simulated. | T |
| GEV-DIR-008 | The welcome card shall present the platform's five key components in picture tiles with one short sentence each: live data sources, orbit-to-street levels, asset detail, the AI Director and real-time alerts. The Director shall start automatically 30 s after the welcome card appears. `?nointro` shall skip the card. | T |
| GEV-DIR-009 | At planet-scale views (≥ 5,000 km range) the globe shall keep turning. | D |
| GEV-DIR-010 | The focused asset shall open in the intel HUD in a reduced "touring" action set. | D |
| GEV-DIR-011 | The Director shall choose its next stop on arrival at the current one and load that stop's aircraft during the dwell. The loaded aircraft shall be drawn on arrival until the live layer's own records arrive. It shall not arrive at an airport with no aircraft loaded; such an airport is skipped. A new incident still comes first. | T |
| GEV-DIR-012 | The airport overlay shall fade in on arrival and out on departure, and each aircraft label shall fade in when its data arrives. | D |
| GEV-DIR-013 | On its first run after the dashboard opens, the Director shall descend in order: geostationary belt → ISS → an airliner at 35,000–43,000 ft → a helicopter at or below 3,000 ft (else a light aircraft at or below 5,000 ft) → the nearest ship under way → an ADS-B airport surface vehicle (a wheeled vehicle; never an aircraft) → the nearest street camera (one street camera only) → the night side: the camera region where it is dark now and nearest 21:30 local solar time, seen from 2,400 km with its city lights → one of that city's street cameras in night vision. When it is daytime in every other region, the night steps shall be skipped, never simulated. It shall then return to the normal rotation; later starts shall skip the descent. | T |
| GEV-DIR-014 | The descent shall stay over the camera region nearest local early afternoon (solar time). Every subject shall be a live record, and a step with nothing live shall be skipped, never simulated. A step whose source has not loaded shall wait at most 8 s. The descent shall have priority over incidents: incidents that arrive during it shall be shown as soon as it ends. | T |
| GEV-DIR-015 | During the opening descent a checklist at the side of the screen shall list the eight levels (geostationary orbit to street cameras, then the city at night), mark each as it is reached with its live value, mark levels with nothing live as skipped, and fade away when the descent ends. | T |
| GEV-DIR-016 | Street cameras switched on by the opening descent shall be switched off again when it ends. Ground-level descent stops without a published ground height shall be aimed at sampled terrain. | D |
| GEV-DIR-017 | While dwelling at a stop, the Director shall start loading the 3D map tiles for the stop it already knows comes next (the queued stop, or the descent's next step), once the current stop's tiles are in or after 4 s. An empty airport shall be replaced during the dwell so its replacement is loaded ahead too. A fresh real-time alert shall not wait for this: it replaces the queued stop and is flown to at once. Planet-scale views (over 1,000 km) are not warmed. Before leaving for a warmed stop, the Director shall keep orbiting until that stop's tiles have loaded, for at most 5 s; an alert does not wait. While the Director runs, 3D tiles shall not be skipped because the camera is moving. | T |
| GEV-DIR-018 | At least one stop in every five shall be in space (a satellite), even when other rotation slots fall back or an alert comes between. Space stops shall cycle geostationary satellites, crewed stations (the ISS first) and navigation satellites (GPS, Galileo, GLONASS), and a geostationary satellite shall be framed far enough back to show the Earth. | T |
| GEV-DIR-019 | At a stop, the Director shall render the scene in a thermal look (FLIR, white-hot) for military aircraft, military airfields and naval or state ships, in a night-vision look (NVG) where the sun is below the horizon at the stop, and in the normal look otherwise, and shall show the view mode on screen while a mode is on: a badge on the Director's caption and under the asset title ("VIEW MODE · THERMAL (FLIR)", "VIEW MODE · NIGHT VISION (NVG)", "VIEW MODE · NIGHT SIDE") with a few words on why it looks so. The descent's night city shall be shown as the night side and its night street in night vision. Space and planet-scale views (over 600 km), the descent's GEO and ISS steps and street-camera stops shall keep the normal look. Flights between stops and the dashboard after the Director exits shall use the normal look. The looks are visual only. | T |
| GEV-DIR-020 | At a space stop the Director shall draw the satellite's orbit ring (one period from its orbit elements, or a ring from a typical inclination when none are loaded), the geostationary belt for geostationary satellites and the descent's GEO step, and the satellite's coverage footprint on the Earth (the ground that sees it above the horizon, matching the coverage card's footprint radius, with a dashed inner ring where it is at 10° elevation or more; standard coverage geometry) with a faint cone to its edge. They shall fade in on arrival and be removed on departure and when the Director stops. The footprint shall not flicker: its fill is rebuilt only when the satellite has moved 0.5°, and the old fill stays on screen until the new one is ready. | T |
| GEV-DIR-021 | The opening descent's street step shall prefer a camera with live video within 25 km of the region's centre over a nearer still, and Des Moines (Iowa DOT live video) shall be one of the descent regions. | T |
| GEV-DIR-023 | Director camera moves shall be smooth: flight time shall grow with distance (4 s up to 7 s for jumps between the street and high orbit); a stop centred on a satellite in high orbit shall be orbited around the satellite, never globe-spun around a ground point; and a moving subject (satellite, aircraft) shall be re-aimed at its latest live position just before the flight. | T |

## 6. Intel HUD (INT)

| ID | Requirement | V |
|---|---|---|
| GEV-INT-001 | An asset shall show at most four information cards, deterministic for the same input. | T |
| GEV-INT-002 | Each card and row shall be labelled FEED or SIMULATED according to its origin. Feed values shall never be labelled simulated. | T |
| GEV-INT-003 | Ownership of real assets shall be a generic category labelled SIMULATED, never a named company. | T |
| GEV-INT-004 | A missing operator shall appear as a simulated link, never as a feed value. | T |
| GEV-INT-005 | The triage queue shall rank using feed fields only. | T |
| GEV-INT-006 | Staged demo objects shall be entirely simulated and never presented as feed data. | T |
| GEV-INT-007 | Derived orbital values (period, footprint, regime) shall follow standard orbital mechanics. | T |
| GEV-INT-008 | Every analyst action offered shall have an implementation that returns a result panel. | T |
| GEV-INT-009 | Drafted messages shall contain only live values. Sending shall be simulated and labelled so. | T |
| GEV-INT-010 | Conjunction screening shall report the closest sampled approaches from the loaded catalogue. | T |
| GEV-INT-011 | "Nearby" lists shall use great-circle distance and exclude the asset itself. | T |
| GEV-INT-012 | The system shall hold no dossiers on natural persons. | I |
| GEV-INT-013 | An asset whose type is identified from feed values (ICAO type designator, AIS ship family or naval hull prefix, satellite name) shall show a type reference image, labelled as a type reference (never this airframe or hull), with the photo's author and licence. | T |
| GEV-INT-014 | When no free-licensed photo exists, the lookup fails, or the type is not in the catalogue, a class outline shall be shown instead. | T |
| GEV-INT-015 | When the Director stops at an airport or city, the intel view shall show the place itself. It shall cover live traffic counts and phases, the current METAR, the latest incidents nearby (earthquakes, fire hotspots, cyclones, emergency squawks) and what else is around. Every value shall come from a feed or be computed from one; a missing feed or layer shall be named as such. | T |
| GEV-INT-016 | Opening a street camera shall show its live still, refreshed every 10 seconds, with its location, network, licence and what is around it. Every value shall come from the camera catalog or be computed from it; no simulated value shall be shown on a camera. | T |
| GEV-INT-017 | When the street-camera layer is on, a Director place card shall show the nearest camera within 10 km with its live still. | T |
| GEV-INT-018 | An ADS-B airport surface vehicle (emitter category C1 or C2) shall open as a vehicle with feed values only: no simulated rows and no aircraft actions. | T |
| GEV-INT-019 | Each analyst action and an "Object" button shall open a sheet in a drawer at the side of the screen, so the focused asset stays in view. A sheet shall show the object's type and key, its data lineage, properties, linked objects and a timeline. Every value shall be tagged FEED or SIM, no person shall be named, and ownership shall stay generic. | T |
| GEV-INT-020 | The track-history sheet shall list positions observed this session as FEED, and any path reconstructed from the current track and speed as SIM, never as recorded positions. | T |
| GEV-INT-021 | ADS-B airport surface vehicles shall be drawn as wheeled vehicles on the ground, with no aircraft 3D model. | T |
| GEV-INT-022 | Every fixed on-screen panel shall be assigned to one zone of the screen map (top bar, title, left column, right column, button bar, caption, credits, centre). Each side column shall have one owner at a time, by the priority in docs/UI-LAYOUT.md. Panels shall not overlap each other or run off screen at 1920×1080, 1440×900, 1280×720, 1024×768, 820×1180 or 390×844. | T |
| GEV-INT-023 | A camera that publishes video (TfL JamCams' short MP4 clips) shall play it, looping, in its card and in the city panel, labelled "VIDEO CLIP". Card refreshes shall not restart playback. Stills-only networks shall stay labelled "LIVE STILL". An "Expand view" action shall open the camera's view in a wide drawer, about half the screen. | T |
| GEV-INT-024 | No asset card shall be hidden to make room for another panel on screens wider than 900 px. The descent checklist sits in a band under the top bar, and when the drawer takes the right column all four cards stack in the left column. | T |
| GEV-INT-025 | Leader lines from a focused asset to its cards shall run only horizontally and vertically (rounded corners allowed), each in its own lane, so lines never cross or run on top of one another beyond the first few pixels. | T |
| GEV-INT-026 | A camera that publishes a live stream (HLS, MPEG-TS or fragmented MP4) shall play it live in its card and in the Expand view, labelled "LIVE VIDEO", relayed through the server so the browser never contacts the agency directly. If the stream fails, the card shall fall back to the camera's live still, labelled "LIVE STILL". | T |
| GEV-INT-027 | Iowa DOT traffic cameras shall be loaded from its public feature service (CC BY 4.0, credited "Iowa Department of Transportation"), with live video only from Iowa DOT video hosts and stills only from its snapshot host. | T |
| GEV-INT-028 | The asset view's cards shall slide in from their own side of the screen, one after another, when it opens, and slide out when it closes; the sheets drawer shall slide out as it closes. Reduced-motion settings shall turn the movement off. | D |

## 7. Exercise mode (EXE)

| ID | Requirement | V |
|---|---|---|
| GEV-EXE-001 | Exercise mode shall disconnect the live layers and read no live feed. | I |
| GEV-EXE-002 | Exercise platforms shall be generic classes, never real platform types. | T |
| GEV-EXE-003 | The authorisation checklist shall leave the final command step open. | T |
| GEV-EXE-004 | The same scenario and seed shall produce the same package. | T |
| GEV-EXE-005 | The timeline shall name only the fictional target. | T |

## 8. Performance (PRF)

| ID | Requirement | V |
|---|---|---|
| GEV-PRF-001 | Adaptive quality shall start at native resolution (DPR ≤ 2) and never render below CSS-pixel resolution. | T |
| GEV-PRF-002 | Quality shall drop only on sustained slow frames and recover only with headroom. | T |
| GEV-PRF-003 | The idle globe spin shall run only when idle, zoomed out and not blocked by a focus or tour. | T |
| GEV-PRF-004 | On arrival at a place, flights shall refresh only for a new place or stale data, and never from space. | T |
| GEV-PRF-005 | When the Director departs for a stop within regional range, aircraft for the destination shall be requested during the camera flight. | D |
| GEV-PRF-006 | All shipped 3D models shall be pre-warmed at low priority after startup. | T |
| GEV-PRF-007 | A layer whose picture changes only every N ms shall be redrawn at that pace (render on demand plus a timer), not at the display rate, unless something needs continuous frames. | T |
| GEV-PRF-008 | Live feeds shall not be polled while the tab is hidden or the AUDIT view covers the globe; each layer shall catch up once when visible again. | T |
| GEV-PRF-009 | Content-hashed build output shall be cached by browsers for a year and the page shall always revalidate; the Cesium runtime script shall not block the first paint. | T |
| GEV-PRF-010 | The 3D tile cache shall be sized to the device's memory, and the adaptive-quality ladder's last steps shall coarsen 3D tile detail. | T |

## 9. Configuration management (CM)

| ID | Requirement | V |
|---|---|---|
| GEV-CM-001 | Every non-test source file shall be reachable from a shipped entry point (no orphan code). | A |
| GEV-CM-002 | Continuous integration shall run setup checks, formatting, package boundaries, unit tests and a production build on Node 24 and 26 for every push to `main`. | I |
| GEV-CM-003 | All dependencies shall be pinned by `package-lock.json`. | I |

## 10. Compliance audit view (AUD)

| ID | Requirement | V |
|---|---|---|
| GEV-AUD-001 | The AUDIT view shall show the CrossCheck assessment of this software, and its readiness and verdicts shall match the evidence ledger's latest audit. | T |
| GEV-AUD-002 | Every must-fix (blocking) item shall carry a plain-English card: what the gap is, why it matters, and the fix. | T |
| GEV-AUD-003 | On entry only must-fix items shall show at full strength; every other layer shall stay at 15% until the viewer switches it on. | T |
| GEV-AUD-004 | The orbit shall be drawn in the Earth's frame and its camera copied from the globe camera each frame, so the orbit sits exactly on the Earth and keeps the globe's pan, rotate, zoom and focus controls. | T |
| GEV-AUD-005 | The evidence drawer shall read the ledger top down: pipeline, baseline against latest audit, progress and readiness journey first, then waves, workstreams and each finding's dated history. | T |
| GEV-AUD-006 | Links between safety and security items shall come only from the shared evidence themes. | T |
| GEV-AUD-007 | Entering and leaving the AUDIT view shall restore the globe, its layers and the viewer's camera exactly as they were. | D |
| GEV-AUD-008 | The AUDIT view shall step from the baseline audit through each wave to sign-off. Stops backed by a recorded audit shall be shown as measured; all others shall be labelled projected wherever their figures appear. | T |
| GEV-AUD-009 | Projected stops shall reproduce the remediation plan's readiness journey and end states exactly. | T |
| GEV-AUD-010 | Guided-tour, focus and Reset view camera moves shall keep their subject on the view axis throughout, and any input on the globe shall hand the camera back to the user. | T |
| GEV-AUD-011 | Every item shall say how it affects God’s Eye View (which feeds, services or people, and what would go wrong); every must-fix item in its own words. | T |
| GEV-AUD-012 | Playing the timeline shall explain each stop in turn: what the wave fixes, which gaps it closes, how readiness moves, and what it makes possible next. | T |
| GEV-AUD-013 | The AUDIT view shall show ISO/IEC 42001 as a third ring with its own readiness, verdict, must-fix list, impact statements and journey, rolled up with the same rules as the evidence ledger at every timeline stop. | T |
| GEV-AUD-014 | CrossCheck shall live in its own folder (`crosscheck/`) that imports nothing from God's Eye View, so it can be copied into its own project. Its scoring engine shall be the one used by the AUDIT view, and shall reproduce the God's Eye View baseline (safety 38%, security 62%, AI 24%, 28 must-fix). | T |

## 11. World visuals (VIS)

| ID | Requirement | V |
|---|---|---|
| GEV-VIS-001 | At planet and regional scale (camera above about 600 km, full above 2,000 km) the globe shall show the live day/night line from the real Sun position (wall clock), with a soft terminator and NASA Black Marble city lights on the night side. It shall never tint city or street-level views. The night-lights source shall be credited and listed with its licence. `?daynight=0` shall switch it off. | T |
| GEV-VIS-002 | Aircraft and ships near the camera (and the Director's subject first) shall show a short trail through positions the feed reported this session, fading with age (3 min for aircraft, 10 min for ships), capped at 40 trails and hidden above 2,500 km camera height. Trails shall never extend beyond the newest reported fix. `?trails=0` shall switch them off. | T |
| GEV-VIS-003 | When the Director shows an earthquake, rings shall expand from the epicentre three times, then settle into one ring and a marker until the Director moves on. The ring size is a display scale (30 km at M5, doubling per magnitude, 15–400 km), not a measured shaking area. `?quakerings=0` shall switch them off. | T |
