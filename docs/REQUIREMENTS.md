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
| GEV-SRV-007 | The military aircraft relay shall cache a good response for 30 s, share one upstream call among concurrent requests, time out upstream after 10 s, back off after a 429, 5xx, timeout or network error, serve the last good response during a failure only while it is under 10 minutes old, and keep it on disk across restarts. | T |
| GEV-SRV-008 | The worldwide OpenSky call shall be shared by concurrent requests, and a 5xx or authentication failure shall serve the last good snapshot (marked stale) with a cooldown instead of the error. The call shall be given 20 s (the snapshot is several megabytes), and a timeout shall cool down for 30 s only, not the 5 minutes used for an unreachable host. | T |
| GEV-SRV-009 | Large JSON responses under `/api` shall be sent gzip-compressed to clients that accept it. | T |
| GEV-SRV-010 | After the mapped-installations upstream fails, no new upstream attempt shall be made for 2 minutes, and a 503 shall carry `Retry-After`. | I |

## 4. Security (SEC)

| ID | Requirement | V |
|---|---|---|
| GEV-SEC-001 | Only `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` shall be compiled into the browser bundle. All other credentials shall stay server-side. | T |
| GEV-SEC-002 | The server shall refuse to serve `.env*`, certificate, `.git` and launcher environment files. | T |
| GEV-SEC-003 | Pages shall be served with `X-Frame-Options: DENY` and `frame-ancestors 'none'`. | T |
| GEV-SEC-004 | Text received from any feed (callsigns, vessel names, destinations, place names) shall render as inert text in every HTML surface. | T |
| GEV-SEC-005 | Launch scripts shall not print credential values. | T |
| GEV-SEC-007 | The camera media relay shall follow redirects only within the registered camera's origin, serve only image, video, HLS and MJPEG content types with `X-Content-Type-Options: nosniff`, and the frame endpoint shall answer 404 for unregistered camera IDs and ignore client-supplied pose. Track, enrichment, terrain and METAR proxies shall be rate-limited per client with bounded caches, and CelesTrak groups shall be allow-listed. | T |
| GEV-SEC-006 | The paid Google Places proxies shall be rate-limited per client by default (30 requests a minute unless configured), cap the text query at 120 characters and time out upstream calls; behind a trusted proxy (`TRUST_PROXY=1`) limits shall key on the forwarded client address. | T |

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
| GEV-DIR-013 | On its first run after the dashboard opens, the Director shall descend in order: geostationary belt → ISS → an airliner at 35,000–43,000 ft → a helicopter at or below 3,000 ft (else a light aircraft at or below 5,000 ft) → the nearest ship under way → an ADS-B airport surface vehicle (a wheeled vehicle; never an aircraft) → the nearest street camera (one street camera only) → the night side: the camera region where it is dark now and nearest 21:30 local solar time, seen with the whole planet in view (18,000 km, straight down) and its city lights → one of that city's street cameras in night vision. When it is daytime in every other region, the night steps shall be skipped, never simulated. It shall then return to the normal rotation; later starts shall skip the descent. | T |
| GEV-DIR-014 | The descent shall stay over the camera region nearest local early afternoon (solar time). Every subject shall be a live record, and a step with nothing live shall be skipped, never simulated. A step whose source has not loaded shall wait at most 8 s. The descent shall have priority over incidents: incidents that arrive during it shall be shown as soon as it ends. | T |
| GEV-DIR-015 | During the opening descent a checklist at the side of the screen shall list the eight levels (geostationary orbit to street cameras, then the city at night), mark each as it is reached with its live value, mark levels with nothing live as skipped, and fade away when the descent ends. | T |
| GEV-DIR-016 | Street cameras switched on by the opening descent shall be switched off again when it ends. Ground-level descent stops without a published ground height shall be aimed at sampled terrain. | D |
| GEV-DIR-017 | While dwelling at a stop, the Director shall start loading the 3D map tiles for the stop it already knows comes next (the queued stop, or the descent's next step), once the current stop's tiles are in or after 4 s. An empty airport shall be replaced during the dwell so its replacement is loaded ahead too. A fresh real-time alert shall not wait for this: it replaces the queued stop and is flown to at once. Planet-scale views (over 1,000 km) are not warmed. Before leaving for a warmed stop, the Director shall keep orbiting until that stop's tiles have loaded, for at most 5 s; an alert does not wait. While the Director runs, 3D tiles shall not be skipped because the camera is moving. | T |
| GEV-DIR-018 | About one stop in five shall be in space (a satellite), and never fewer than one in six, even when other rotation slots fall back or an alert comes between. Space stops shall cycle geostationary satellites, crewed stations (the ISS first) and navigation satellites (GPS, Galileo, GLONASS), and a geostationary satellite shall be framed far enough back to show the Earth. | T |
| GEV-DIR-019 | At a stop, the Director shall render the scene in a thermal look (FLIR, white-hot) for military aircraft, military airfields and naval or state ships, in a night-vision look (NVG) where the sun is below the horizon at the stop, and in the normal look otherwise, and shall show the view mode on screen while a mode is on: a badge on the Director's caption and under the asset title ("VIEW MODE · THERMAL (FLIR)", "VIEW MODE · NIGHT VISION (NVG)", "VIEW MODE · NIGHT SIDE") with a few words on why it looks so. The descent's night city shall be shown as the night side and its night street in night vision. Space and planet-scale views (over 600 km), the descent's GEO and ISS steps and street-camera stops shall keep the normal look. Flights between stops and the dashboard after the Director exits shall use the normal look. The looks are visual only. | T |
| GEV-DIR-020 | At a space stop the Director shall draw the satellite's orbit ring (one period from its orbit elements, or a ring from a typical inclination when none are loaded), the geostationary belt for geostationary satellites and the descent's GEO step, and the satellite's coverage footprint on the Earth (the ground that sees it above the horizon, matching the coverage card's footprint radius, with a dashed inner ring where it is at 10° elevation or more; standard coverage geometry) with a faint cone to its edge. They shall fade in on arrival and be removed on departure and when the Director stops. The footprint shall not flicker: its fill is rebuilt only when the satellite has moved 0.5°, and the old fill stays on screen until the new one is ready. | T |
| GEV-DIR-021 | The opening descent's street step shall prefer a camera with live video within 25 km of the region's centre over a nearer still, and Des Moines (Iowa DOT live video) shall be one of the descent regions. | T |
| GEV-DIR-023 | Director camera moves shall be smooth: flight time shall grow with distance (4 s up to 7 s for jumps between the street and high orbit); a stop centred on a satellite in high orbit shall be orbited around the satellite, never globe-spun around a ground point; and a moving subject (satellite, aircraft) shall be re-aimed at its latest live position just before the flight. | T |
| GEV-DIR-024 | Between normal stops (after the opening descent), the Director shall zoom out until the whole planet is in view, pause with the globe turning, then zoom in to the next subject, about 10 s in all; a camera already high enough to see the planet, or a planet-scale destination, shall fly there directly. Asset stops shall be framed half again closer than the 20 Oct framings, looking 12° to 16° below the horizon so the top of the shot shows sky, and the dwell orbit shall turn at 2° per second. | T |
| GEV-DIR-025 | During the opening descent the Director shall speak a scripted introduction at each level: what the level shows and where its data comes from (orbital data, ADS-B, AIS, public cameras, NASA night imagery), which values are live (feed) and which are estimated (simulated), and what the platform does with them. Every number spoken shall come from the stop's live record, and no step shall be named by number. | T |
| GEV-DIR-026 | The Director shall keep a moving subject centred: the camera shall follow the aircraft's drawn position (or a satellite's propagated position) through the flight in and the whole dwell, an aircraft alert shall be framed at the aircraft's altitude, and aircraft at or below 1,500 m shall be framed closer than the usual view. A subject the live layer is not drawing shall get the Director's own icon at its reported position. | T |
| GEV-DIR-027 | Satellite stops shall keep the Earth as the hero of the shot: at GEO and MEO the whole Earth disc shall be in frame below the satellite. Coverage shall be shown as a faint beam with a sweeping scan, and orbit rings shall be closed exactly so the line never breaks. | T |
| GEV-DIR-028 | The night city shall prefer a city with live street video when it is dark there, so the night street shows moving video when available. | T |
| GEV-DIR-029 | The opening descent's first view shall show the geostationary belt as a tilted ring around the Earth (viewed about 22° off the equatorial plane), not edge-on as a flat line. | T |
| GEV-DIR-030 | The Director shall load the next stop's 3D tiles for the view the camera will actually arrive at: the heading it arrives with, and for a moving aircraft the position it will have on arrival. A fresh alert that comes in during a dwell shall be queued (and its tiles loaded) before the camera leaves. While the Director runs, the edges of the view shall not be held at reduced detail because the camera is moving. | T |
| GEV-DIR-032 | Stopping the Director (Stop, Esc, any camera input) or a Director error shall always hand the camera back: no flight, orbit or narration shall continue afterwards, and a restart shall plan its next stop afresh. Stops closer than 300 km shall be flown to directly, without the zoom out to the whole planet. Staged (simulated) aircraft shall never be counted as live traffic in a stop's narration. | T |
| GEV-DIR-033 | The Director shall end each hop above its subject (three times the framing range) and hold there, creeping in, until the view's 3D tiles have loaded or six seconds pass, then glide to the framing; it shall not begin narrating a stop until the arrival view has loaded (at most 4 s, 2.5 s for an alert). Google 3D tiles shall be allowed up to 48 parallel requests. | T |
| GEV-DIR-031 | An alert shall be marked on the globe by one frosted glass sphere that grows from the event, starting fully opaque and fading to nothing as it reaches full size, then repeats. No other rings, labels or markers shall be drawn for it by default. | T |

## 6. Intel HUD (INT)

| ID | Requirement | V |
|---|---|---|
| GEV-INT-001 | An asset shall show at most four information sections, deterministic for the same input, presented in two sheets at the bottom left and bottom right of the screen. | T |
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

## 7. Exercise mode (EXE): removed

The fictional Exercise theatre (GEV-EXE-001 to 005) and the staged-event
demo buttons were removed on 21 Oct 2026 for the final version (Pierre: the
Director and manual navigation are the product). No requirement in this
section remains.

## 8. Performance (PRF)

| ID | Requirement | V |
|---|---|---|
| GEV-PRF-001 | Adaptive quality shall always render at native resolution (DPR ≤ 2). On sustained slow frames it shall shed, in order, the bloom effect, multisample anti-aliasing and 3D tile detail. | T |
| GEV-PRF-002 | Quality shall drop only on sustained slow frames and recover only with headroom. | T |
| GEV-PRF-003 | The idle globe spin shall run only when idle, zoomed out and not blocked by a focus or tour. | T |
| GEV-PRF-004 | On arrival at a place, flights shall refresh only for a new place or stale data, and never from space. | T |
| GEV-PRF-005 | When the Director departs for a stop within regional range, aircraft for the destination shall be requested during the camera flight. | D |
| GEV-PRF-006 | All shipped 3D models shall be pre-warmed at low priority after startup. | T |
| GEV-PRF-007 | A layer whose picture changes only every N ms shall be redrawn at that pace (render on demand plus a timer), not at the display rate, unless something needs continuous frames. | T |
| GEV-PRF-008 | Live feeds shall not be polled while the tab is hidden; each layer shall catch up once when visible again. | T |
| GEV-PRF-009 | Content-hashed build output shall be cached by browsers for a year and the page shall always revalidate; the Cesium runtime script shall not block the first paint. | T |
| GEV-PRF-010 | The 3D tile cache shall be sized to the device's memory, and the adaptive-quality ladder's last steps shall coarsen 3D tile detail. | T |

## 9. Configuration management (CM)

| ID | Requirement | V |
|---|---|---|
| GEV-CM-001 | Every non-test source file shall be reachable from a shipped entry point (no orphan code). | A |
| GEV-CM-002 | Continuous integration shall run setup checks, formatting, package boundaries, unit tests and a production build on Node 24 and 26 for every push to `main`. | I |
| GEV-CM-003 | All dependencies shall be pinned by `package-lock.json`. | I |

## 10. Compliance audit view (AUD)

Removed 22 Oct 2026. The AUDIT view and the CrossCheck engine moved to DDG Greenlight, a separate product; God's Eye View is assessed by it as any other codebase. IDs GEV-AUD-001 to 021 are retired and not reused.

## 11. World visuals (VIS)

| ID | Requirement | V |
|---|---|---|
| GEV-VIS-001 | At planet and regional scale (camera above about 600 km, full above 2,000 km) the globe shall show the live day/night line from the real Sun position (wall clock), with a soft terminator and NASA Black Marble city lights on the night side. This planet-scale layer shall never tint city or street-level views (the city's own night side is GEV-VIS-009). The night-lights source shall be credited and listed with its licence. `?daynight=0` shall switch it off. | T |
| GEV-VIS-002 | Aircraft and ships near the camera (and the Director's subject first) shall show a short trail through positions the feed reported this session, fading with age (3 min for aircraft, 10 min for ships), capped at 40 trails and hidden above 2,500 km camera height. Trails shall never extend beyond the newest reported fix. `?trails=0` shall switch them off. | T |
| GEV-VIS-004 | The scene shall render with high dynamic range and a neutral tone map, a gentle bloom on the brightest light only, and a contrast-adaptive sharpening pass instead of FXAA. Each can be switched off from the URL (`?hdr=0`, `?bloom=0`, `?sharpen=0`). | T |
| GEV-VIS-005 | Aircraft icons shall be drawn from a raster close to their on-screen size in device pixels (never magnified more than 10%), and the camera, ship, satellite and Director icons shall be rasterised for 2× and 3× screens. | T |
| GEV-VIS-006 | The aircraft the Director or analyst focuses on shall be shown as its 3D model, first in line for a model slot, at least 96 px on screen, with its own materials lit by the sun and sky rather than the fleet's flat tint. | I |
| GEV-VIS-007 | Mouse navigation shall pivot on the Earth's centre: a left drag turns the globe about its centre so the ground follows the cursor (north up), a right drag turns the heading about the line from the centre through the camera and zooms, the wheel and trackpad pinch zoom straight towards or away from the centre and never below the 3D city, and only a middle or Shift drag pans. Touch gestures and following a tracked aircraft keep Cesium's own controls. | T |
| GEV-VIS-008 | The scene shall be lit by the Sun's real direction for the current time (wall clock), so the sky turns dusky at sunset and dark at night. Buildings and terrain in the 3D city shall cast soft real-time shadows when the camera is low (on below 6 km, off above 8 km) and the Sun is at least 2° up there; the quality ladder shall drop shadows before any other effect, and `?shadows=0` shall turn them off. | T, D |
| GEV-VIS-009 | The 3D city shall show a true night side: shaded by the Sun's real elevation at each point, with a warm golden hour, a blue dusk and a dark night lit only where NASA's night-lights image shows city lights. Thermal and night-vision looks shall see the unshaded picture. `?nightcity=0` shall turn it off. | T, D |
| GEV-VIS-010 | The sky shall be a high-resolution Milky Way built from a real star catalogue (positions, brightness and colour), with the diffuse glow labelled as modelled in its provenance notes and credited in the data attributions. `?stars=0` shall keep Cesium's default sky. | T, D |
| GEV-VIS-003 | When the Director shows an earthquake, rings shall expand from the epicentre three times, then settle into one ring and a marker until the Director moves on. The ring size is a display scale (30 km at M5, doubling per magnitude, 15–400 km), not a measured shaking area. `?quakerings=0` shall switch them off. | T |
