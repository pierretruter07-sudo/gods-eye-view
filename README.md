# God's Eye View

A real-time, browser-based common operating picture built on public data.
A photorealistic CesiumJS globe shows live aircraft, military aircraft, ships,
satellites, earthquakes, active fires, tropical cyclones, military
installations and submarine cables. An automated **Director** tours the planet
and narrates notable events. An **intel HUD** turns any asset into an analyst
view with real derived data and clearly labelled simulated context.

Developed by **Digital Dynamics Group**. This is a fork of
[bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view)
(MIT, © 2026 Bilawal Sidhu). Fork base: upstream commit `ce671ce`
(2026-09-24). See [Configuration index](docs/CONFIGURATION-INDEX.md).

> **Status:** demonstration build. It is not certified for operational use.
> See [Known limitations](docs/KNOWN-LIMITATIONS.md).

---

## What it does

| Capability | Summary |
|---|---|
| **Live layers** | Flights, military aircraft, AIS vessels, satellites, earthquakes, NASA FIRMS fires, NOAA cyclones, OSM military installations, submarine cables. |
| **Director** | Hands-free tour. It interrupts for emergency squawks (7500/7700/7600) and M4.5+ quakes. Otherwise it rotates through airports, military aircraft, naval/state vessels, satellites and cities, with spoken commentary. It starts automatically 10 s after the welcome card. |
| **Intel HUD** | Click any asset (or let the Director pick one) to see a "constellation" of up to four cards, a follow camera and analyst actions. Every value is tagged **FEED** (from the live source) or **SIMULATED** (illustrative). |
| **Analyst actions** | Real: satellite pass predictions, downlink windows, conjunction screening, Esri archive imagery, nearby infrastructure. Simulated, and labelled as such: cargo manifests, filed flight plans, drafted messages. |
| **Triage, watchlist, AOI** | A queue of feed-driven alerts, a pinned watchlist, and areas of interest. |
| **Exercise mode** | A separate, fully **fictional** theatre for planning-workflow demos. It reads no live feed. Platforms are generic classes and the final authorisation step is always left open. |

**Ethics guardrails:** no person dossiers. Ownership on real assets is generic
and labelled SIMULATED. Live mode has no kinetic actions.

## Quick start

Requirements: Node.js `>=24.13 <25` or `26.x`, and npm.

```bash
git clone https://github.com/pierretruter07-sudo/gods-eye-view.git
cd gods-eye-view
npm install
npm run doctor        # checks Node, dependencies and which keys are set
npm run dev           # http://localhost:4173
```

No key is required. Without keys the globe uses Esri World Imagery and the
feeds that need no credentials. Copy `.env.example` to `.env` to add keys:

| Key | Unlocks | Exposure |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Photorealistic 3D Tiles, place search | **Client-exposed**: restrict it |
| `CESIUM_ION_TOKEN` | Ion-hosted 3D Tiles, Bing imagery, world terrain | **Client-exposed**: restrict it |
| `AISSTREAM_API_KEY` | Live ships | Server only |
| `FIRMS_MAP_KEY` | Live fires | Server only |
| `OPENSKY_CLIENT_ID` / `_SECRET` | Higher OpenSky allowance | Server only |
| `GOOGLE_MAPS_SERVER_API_KEY` | Separate server key for Places | Server only |

Production build: `npm run build && npm run preview`.

### URL options

| Parameter | Effect |
|---|---|
| `?nointro` | Skip the welcome card and its 10 s countdown. |
| `?demo` | Show the "Simulate 7700" / "Simulate quake" buttons. These are staged events marked SIMULATED. |
| `?restore` | Restore the last camera and layer state instead of starting clean. |
| `?fps` | Show the frame-rate readout (measure on the presentation laptop). |

## Documentation

| Document | Purpose |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Components, data flow, runtime boundaries |
| [Requirements baseline](docs/REQUIREMENTS.md) | Numbered software requirements (SRS seed) |
| [Verification](docs/VERIFICATION.md) | Verification approach and traceability matrix |
| [Configuration index](docs/CONFIGURATION-INDEX.md) | Baseline, environments, build identity |
| [Data sources](DATA_SOURCES.md) | Every feed and dataset, licence and commercial-use flag |
| [Known limitations](docs/KNOWN-LIMITATIONS.md) | What it does not do, and open issues |
| [ED-153 gap analysis](docs/ED-153-GAP-ANALYSIS.md) | SWAL 3 objective-by-objective assessment and remediation plan |
| [ED-153 status (PDF)](docs/ED-153-STATUS.pdf) | Visual status of every feature and all 115 objectives, with the path to SWAL 3 |
| [Demo runbook](docs/DEMO-RUNBOOK.md) | Executive demo script and fallbacks |
| [Security](SECURITY.md) | Secrets model, exposure, reporting |
| [Testing](TESTING.md) | How to run and extend the test suite |
| [Changelog](CHANGELOG.md) | Fork history |
| [OpenSky auth](docs/opensky-auth.md) | Optional OpenSky credential setup |

## Licence

Source code: MIT (see [LICENSE](LICENSE)). Third-party data, imagery and 3D
models keep their own licences. Several are **non-commercial**; see
[DATA_SOURCES.md](DATA_SOURCES.md) before any commercial use.
