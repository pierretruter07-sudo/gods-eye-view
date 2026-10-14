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
| GEV-LAY-001 | The layer catalog shall construct exactly these layers: flights, military, ais-live-vessels, satellites, earthquakes, local-firms, weather-cyclones, military-installations, telegeography-submarine-cables. | T |
| GEV-LAY-002 | At start the system shall enable flights, military, earthquakes, satellites and ais-live-vessels. | D |
| GEV-LAY-003 | Each third-party data source in use shall be credited in the in-app data attribution panel. | T |
| GEV-LAY-004 | A layer whose provider needs a missing key shall stay empty and report that a key is required. It shall not show fabricated data. | I |

## 3. Server proxies (SRV)

| ID | Requirement | V |
|---|---|---|
| GEV-SRV-001 | Every data provider shall be served identically by the development and the built-preview server. | T |
| GEV-SRV-002 | A request to an unknown `/api` route shall return HTTP 404 with a JSON body and `Cache-Control: no-store`. | T |
| GEV-SRV-003 | Malformed parameters to the terrain, aircraft-type and TLE proxies shall be rejected with HTTP 400. | T |
| GEV-SRV-004 | Regional flight requests shall try adsb.lol, then airplanes.live, then adsb.fi. A source that fails shall be put on cooldown and skipped by the following requests. | T |
| GEV-SRV-005 | The development server shall bind to `localhost` by default and accept only loopback and `.local` host headers unless explicitly bound to all interfaces. | T |

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
| GEV-DIR-004 | Between incidents the Director shall rotate recent → airport → military → vessel → satellite → recent → city, skipping slots with nothing to show. | T |
| GEV-DIR-005 | Vessel stops shall prefer naval/state vessels (≥ 1 kn). Otherwise they shall use moving vessels (≥ 8 kn). | T |
| GEV-DIR-006 | A shown incident shall not repeat until 6 min have passed, and shall then be introduced as recent. | T |
| GEV-DIR-007 | Spoken and on-screen Director lines shall contain only feed values. Simulated events shall be announced as simulated. | T |
| GEV-DIR-008 | The Director shall start automatically 10 s after the welcome card appears. `?nointro` shall skip the card. | D |
| GEV-DIR-009 | At planet-scale views (≥ 5,000 km range) the globe shall keep turning. | D |
| GEV-DIR-010 | The focused asset shall open in the intel HUD in a reduced "touring" action set. | D |
| GEV-DIR-011 | The Director shall choose its next stop on arrival at the current one and load that stop's aircraft during the dwell. It shall not arrive at an airport with no aircraft loaded; such an airport is skipped. A new incident still comes first. | T |
| GEV-DIR-012 | The airport overlay shall fade in on arrival and out on departure, and each aircraft label shall fade in when its data arrives. | D |

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
