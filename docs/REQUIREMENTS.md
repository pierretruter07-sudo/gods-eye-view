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

## 9. Configuration management (CM)

| ID | Requirement | V |
|---|---|---|
| GEV-CM-001 | Every non-test source file shall be reachable from a shipped entry point (no orphan code). | A |
| GEV-CM-002 | Continuous integration shall run setup checks, formatting, package boundaries, unit tests and a production build on Node 24 and 26 for every push to `main`. | I |
| GEV-CM-003 | All dependencies shall be pinned by `package-lock.json`. | I |
