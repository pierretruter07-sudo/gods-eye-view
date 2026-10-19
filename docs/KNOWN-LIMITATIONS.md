# Known limitations

Status at 2026-10-14. Items are ordered by how likely they are to come up in a
demonstration or an audit.

## Data and coverage

| # | Limitation | Impact | Mitigation / plan |
|---|---|---|---|
| L1 | Every live feed is a free public service with rate limits and no service-level agreement. | Layers can thin out or pause, especially when many viewers share one server. | Server caching, stale-while-revalidate, a three-source regional flight fallback, and Director pre-warming. Commercial use needs licensed feeds. |
| L2 | Four sources are **non-commercial only**: OpenSky, airplanes.live, adsb.fi, TeleGeography. | Blocks any paid deployment as configured. | Flagged for legal review ([DATA_SOURCES.md](../DATA_SOURCES.md)). Replace with licensed ADS-B and cable data before a commercial pilot. |
| L3 | Ships appear only with an `AISSTREAM_API_KEY`. Fires appear only with a `FIRMS_MAP_KEY`. | Without keys those layers are empty. | Confirm both keys on the hosted demo before presenting (`npm run doctor`). |
| L4 | AIS coverage is terrestrial: dense near coasts, sparse mid-ocean. Military aircraft are only those broadcasting ADS-B. | The picture is incomplete by nature. | State this up front in the demo. |
| L5 | The free keyless terrain host (terrain.reearth.land) returns HTTP 429 under bursts. | Some terrain tiles load late. Console shows 429 errors. | Requests are throttled to 6 in parallel. Configure a Cesium ion token for world terrain. |
| L7 | Measured on the hosted demo (2026-10-14): airplanes.live answers HTTP 403 to the Replit server, adsb.lol rate-limits with HTTP 429, and anonymous OpenSky requests time out. | Aircraft at a new stop can take 5–17 s to appear. | Server caching and stale data cover most gaps. OpenSky credentials, or a licensed ADS-B feed, fix it properly. |
| L8 | Street cameras are stills from public traffic networks, not live video. Most publish no camera facing, and the panel position in the city is an estimate until adjusted. Camera addresses can change without notice. Ontario 511 now needs a free developer key and stays off without one. | A camera can show a placeholder card or sit slightly off its real view. | The card names the network and refresh time; Adjust, Save and Reset correct a panel; a placeholder says why there is no frame. |
| L6 | Cyclone advisories cover the Atlantic and the east/central Pacific (NOAA) only. | No western Pacific or Indian Ocean storms. | Add JTWC/BoM feeds. |

## Functional scope

| # | Limitation | Notes |
|---|---|---|
| F1 | The Director's commentary is **rule-based** (template lines filled with feed values) and spoken with the browser's speech engine. There is no LLM in the loop yet. | The planned LLM commentator ("HENRI") is not integrated. See the readiness report roadmap. |
| F2 | Speech needs a user click first (browser autoplay policy). | If the countdown runs out without a click, the Director may run with captions only. Click "Start now" in the demo. |
| F3 | Analyst actions marked SIMULATED (manifests, filed flight plans, message sending) produce illustrative content only. | By design. Clearly labelled. |
| F4 | No user accounts, persistence, sharing or audit log of operator actions. | The watchlist and areas of interest live in browser memory only. |
| F5 | The place-routing endpoint (`/api/route`) is still served but no screen uses it. | Deactivated functionality. Remove or adopt before a code freeze. |
| F6 | Exercise mode is a single fictional scenario. | Demo of planning workflow only. |

## Platform and performance

| # | Limitation | Notes |
|---|---|---|
| P1 | Verified only on desktop Chromium-based browsers. | Firefox, Safari and mobile are not verified. |
| P2 | Needs a WebGL 2 GPU. Integrated graphics run at reduced quality. | The adaptive quality ladder steps down automatically. |
| P3 | Large bundles: the geoid model is 2.8 MB and the region outlines 2.0 MB (both lazy-loaded). | First load on slow networks takes several seconds. |

## Assurance

| # | Limitation | Notes |
|---|---|---|
| A1 | Requirements were reverse-engineered from the implementation (GEV-SRS 0.1). They do not come from a safety assessment. | See [REQUIREMENTS.md](REQUIREMENTS.md). |
| A2 | About 45k lines of inherited layer code are tested but not traced to requirements. | Main gap for ED-153 SWAL 3. |
| A3 | Verification is not yet independent of development. | See [VERIFICATION.md](VERIFICATION.md). |
| A4 | The hosted demo is not a clean GitHub checkout, and two Replit config files are outside version control. | See [CONFIGURATION-INDEX.md](CONFIGURATION-INDEX.md). |
| A5 | The system is not intended or certified for operational air-traffic, maritime or defence decision-making. | Demonstration only. |
