# Architecture

God's Eye View is a single-page browser application (CesiumJS + vanilla ES
modules, built by Vite). A thin Node middleware layer runs inside the Vite dev
or preview server. It brokers every request that needs a secret or a CORS
bypass. There is no database and no user accounts. Nothing is persisted
server-side except short-lived disk caches for Overpass and installations.

```
Browser                                              Node (Vite server)
┌────────────────────────────────────────────┐       ┌──────────────────────────────┐
│ src/main.js → standalone/application.js    │       │ server/standalone/vite.config│
│   app/ scene → controls → data → tools     │ /api/*│   providers/local.js         │
│   ├─ layers/ (9 live layers)  ◄────────────┼───────┼─► opensky / adsb.lol chain   │
│   ├─ shell/  (UI, quality, welcome, spin)  │       │   celestrak, firms, cyclones │
│   ├─ tour/   (Director)                    │       │   ais-live (websocket)       │
│   ├─ intel/  (HUD, actions, triage)        │       │   overpass, installations    │
│   └─ exercise/ (fictional theatre)         │       │   geocode, google places     │
│ renderGovernor, worldOverlay               │       │   terrain heights, adsbdb    │
└────────────────────────────────────────────┘       │ api-not-found (JSON 404)     │
                                                     └──────────────────────────────┘
```

## Startup sequence

1. `startClean.js` clears the URL hash and stored layer state (unless
   `?restore` is set). Every launch therefore starts at the whole-globe view.
2. `createApplication` runs four phases:
   - **scene**: the Cesium viewer, terrain and imagery stack (`src/maps`).
   - **controls**: fly to the globe.
   - **data**: build the layer catalog (`app/constructCatalog.js`,
     `APPLICATION_LAYER_IDS`) and register it with the data manager.
   - **tools**: render governor, visibility suspension, then `installShell`.
3. `installShell` (`src/shell/index.js`):
   - Applies adaptive quality and the water effect.
   - Enables the default layers in stages.
   - Pre-warms flight data for every Director stop.
   - Shows the welcome card, then starts the Director after 10 s.

## Components

| Module | Responsibility | Key files |
|---|---|---|
| `src/app`, `src/standalone` | Composition root: viewer, catalog, lifetimes | `application.js`, `constructCatalog.js` |
| `src/layers` | One module per live layer: fetch policy, records, rendering, cards | `flights/`, `vessels/`, `satellites/`, `earthquakes/`, … |
| `src/data` | Shared models: classification, satellite passes, geoid, tracking camera, credits | `satellitePass.js`, `dataCredits.js` |
| `src/maps` | Imagery and terrain stacks, keyless fallbacks | `defaultSources.js`, `terrain.js` |
| `src/shell` | Top bar, Layers panel, quality ladder, idle spin, welcome card, flight prefetch | `index.js`, `qualityPolicy.js` |
| `src/tour` | **Director**: event detection, stop planning, camera, narration lines, speech | `events.js`, `planner.js`, `controller.js`, `lines.js` |
| `src/intel` | **Intel HUD**: object model, triage, constellation cards, analyst actions | `objects.js`, `hud.js`, `actions.js`, `index.js` |
| `src/exercise` | Fictional exercise theatre and planning panel | `mode.js`, `package.js`, `scenario.js` |
| `server/providers` | Same-origin proxies, caching, rate limits, upstream fallbacks | `local.js`, `aircraft/opensky.js` |

## Data integrity model (FEED vs SIMULATED)

- Every intel object carries `simulated: boolean`.
- Every HUD row carries a provenance tag:
  - **FEED**: copied from the live record.
  - **DERIVED**: computed from feed values, such as orbital period or distance.
  - **SIMULATED**: deterministic illustrative content seeded from the object
    key.
- Tests enforce this (`src/intel/*.test.mjs`):
  - Triage reads only feed fields.
  - Ownership on real assets is never an invented company.
  - Staged demo events are never presented as feed data.
- Exercise mode disconnects the live layers and reads no feed.

## Performance controls

- **Render governor** (`src/renderGovernor.js`): the scene renders on demand.
  Animations and tracking hold continuous rendering only while active.
- **Quality ladder** (`src/shell/qualityPolicy.js`): native DPR, capped at 2,
  with MSAA 4/2/1, then 0.85×, then 1×. It steps down only on sustained slow
  frames and recovers with headroom.
- **Satellite propagation** is round-robin sliced per frame
  (`layers/satellites/rendering.js`).
- **Flight data** is pre-warmed for Director stops, with stale-while-revalidate
  on the server.

## Trust boundaries

| Boundary | Control |
|---|---|
| Browser ↔ server | Same-origin `/api/*`. Unknown routes return a JSON 404 (`api-not-found.js`). The server binds to localhost by default. |
| Server ↔ upstream | Fixed upstream hosts per provider, response size caps, timeouts, cooldowns, input validation (`server/providers/common`). |
| Secrets | Only `GOOGLE_MAPS_API_KEY` and `CESIUM_ION_TOKEN` reach the bundle (`build/vite.js` `define`). All other keys stay server-side. |
| Rendering | The HUD uses DOM/SVG built from escaped strings. Card HTML uses a `textContent`-equivalent escape (`src/intel/markup.js`). |

## Build and runtime

- Vite 6 and `vite-plugin-cesium`. Output goes to `dist/`.
- `npm run preview` serves `dist/` with the same provider middleware.
- Node `>=24.13 <25 || 26.x`. The hosted demo runs on Replit (Node 24.13).
