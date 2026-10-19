# Data sources, licences and commercial-use flags

The MIT licence covers **source code only**. Every feed, dataset, imagery
service and 3D model below keeps its own terms. In-app attribution lives in
`src/data/dataCredits.js` and is shown in the globe's "Data attribution" panel.
Keep it intact.

**Commercial-use flag**
- ✅ = permitted with attribution.
- ⚠️ = permitted, but conditions or paid terms apply.
- ⛔ = **non-commercial only**. Remove it or obtain a licence before any paid
  deployment.

> **Legal review required (status as of 2026-10-14):** four sources are ⛔
> and are retained for the demonstration at the owner's direction. They are
> OpenSky, airplanes.live, adsb.fi and TeleGeography. Any commercial pilot
> must replace or license them first. Terms change, so re-check every source
> before contract.

## Live feeds (fetched at runtime, not stored)

| Layer / use | Provider | Endpoint (server proxy) | Licence / terms | Flag |
|---|---|---|---|---|
| Flights (global) | OpenSky Network | `/api/opensky` | Non-commercial research/education. Commercial use needs an agreement with OpenSky. | ⛔ |
| Flights (regional), military aircraft, traces | adsb.lol | `/api/adsblol/*`, `/api/opensky` fallback | ODbL 1.0: attribution and share-alike on the data | ✅ |
| Flights (regional fallback) | airplanes.live | `/api/opensky` fallback chain | Personal / non-commercial API terms | ⛔ |
| Flights (regional fallback) | adsb.fi | `/api/opensky` fallback chain | Personal / non-commercial open-data terms | ⛔ |
| Aircraft type, registration, route | adsbdb | `/api/adsbdb/*` | Free API. Route data © David J Taylor & Jim Mason: no copying into other databases. | ⚠️ |
| Vessels (AIS) | AISStream.io | `/api/ais-live` (server websocket) | Free API key, under the AISStream terms of service | ⚠️ |
| Satellites (TLE) | CelesTrak | `/api/celestrak/*` | Free public data, credit Dr T.S. Kelso | ✅ |
| Earthquakes | USGS | browser, direct | U.S. public domain | ✅ |
| Active fires | NASA FIRMS | `/api/firms` | NASA open data. Acknowledgement requested. Needs a free key. | ✅ |
| Tropical cyclones | NOAA NHC / CPHC | `/api/cyclones` | U.S. public domain | ✅ |
| Airport weather (METAR) | NOAA Aviation Weather Center data API | `/api/metar` | U.S. public domain | ✅ |
| Military installations | OpenStreetMap via Overpass | `/api/military-installations`, `/api/overpass` | ODbL 1.0. Public Overpass servers have fair-use limits. | ✅ |
| Place search | Photon (Komoot), Nominatim | `/api/geocode` | ODbL data. Nominatim's usage policy limits it to light use. | ⚠️ |
| Place context (optional) | Google Places | `/api/google/*` | Google Maps Platform terms. Metered. | ⚠️ |
| Street cameras (NSW) | Live Traffic NSW (Transport for NSW) | `/api/cctv/*` | CC BY 4.0, attribution required | ✅ |
| Street cameras (London) | TfL Open Data (JamCams) | `/api/cctv/*` | TfL Open Data terms, attribution required ("Powered by TfL Open Data") | ✅ |
| Street cameras (Finland) | Fintraffic / Digitraffic weathercams | `/api/cctv/*` | CC BY 4.0, attribution required | ✅ |
| Street cameras (British Columbia) | DriveBC | `/api/cctv/*` | Open Government Licence – British Columbia | ✅ |
| Street cameras (Calgary) | Open Calgary | `/api/cctv/*` | Open Government Licence – City of Calgary | ✅ |
| Street cameras (Ontario) | Ontario 511 | `/api/cctv/*` | Open Government Licence – Ontario | ✅ |
| Street cameras, off by default | City of Austin, Caltrans, TxDOT, City of Tallinn, Transpordiamet (Tarktee), Stadt Warendorf | `/api/cctv/*` | Public data published without a stated reuse licence ("courtesy"). Off unless `CCTV_<NAME>_ENABLED=1`. | ⚠️ |

## Imagery, terrain and 3D

| Use | Provider | Terms | Flag |
|---|---|---|---|
| Default basemap | Esri World Imagery | Esri terms. Attribution required. Commercial use may need an ArcGIS licence. | ⚠️ |
| Fallback basemap | OpenStreetMap tiles | OSMF tile usage policy (light use only) | ⚠️ |
| Photorealistic 3D (optional) | Google Map Tiles API | Google Maps Platform terms. Metered. Attribution required. | ⚠️ |
| Ion stacks (optional) | Cesium ion | Plan terms. The Community plan is non-commercial; commercial use needs a paid plan. | ⚠️ |
| Keyless terrain | Mapterhorn via terrain.reearth.land; EGM2008 / EGM96 geoid | CC BY 4.0; NGA public | ✅ |
| Analyst "archive imagery" action | Esri World Imagery tiles | As above | ⚠️ |

## Bundled datasets (in this repository)

| Dataset | Path | Licence | Flag |
|---|---|---|---|
| Submarine cables | `src/data/local_data/telegeography_submarine_cables/` | **CC BY-NC-SA 3.0** © TeleGeography | ⛔ |
| Natural Earth physical regions | `src/data/local_data/natural_earth/` | Public domain | ✅ |
| San Francisco neighbourhoods | `src/data/local_data/neighborhoods/` | PDDL 1.0 (DataSF) | ✅ |
| Director airport and stop list | `src/tour/config.js` | Coordinates from OurAirports (public domain) | ✅ |

## Type reference images

| Use | Provider | Terms | Flag |
|---|---|---|---|
| HUD "type reference" photo (aircraft, vessel and satellite **types**, never the individual airframe) | Wikipedia lead image via the MediaWiki API, served from Wikimedia Commons. Only free-licensed images are requested (`pilicense=free`). | Each image keeps its own free licence (public domain, CC BY, CC BY-SA). Author and licence are shown under the photo. | ✅ with attribution |
| Class outlines (fallback) | Original line art in `src/intel/silhouettes.js` | MIT, part of this code base | ✅ |

The catalogue in `src/intel/assetTypes.js` maps ICAO type designators, AIS
ship families and satellite names to types. Nothing is bundled: two small API
calls resolve the catalogue, and thumbnails load only for assets shown.

## 3D models

Nine glTF models under `public/models/` are from Sketchfab creators under
**CC BY 4.0** and have been modified. Per-file credits are in
[`public/models/README.md`](public/models/README.md). ✅ with attribution.

## Simulated content

Values the app marks **SIMULATED** are produced locally and deterministically
(`src/intel/enrichment.js`, `src/intel/actions.js`, `src/tour/simulate.js`,
`src/exercise/`). They come from no data source. They must never be presented
as real.

## Street cameras: what the app does with them

- **Sources.** Only cameras the server registered from the networks above are
  shown; the browser cannot hand the relay an address. Open-licence networks
  are on by default; courtesy-only networks are off. Live video (DelDOT), the
  licence-plate-reader (ALPR) map and the inherited sample-video "pilot" pack
  are not used.
- **Frames.** Stills are fetched at request time, relayed as served and never
  written to disk. Nothing in the app blurs, enhances, recognises or classifies
  what is in a frame: no face, plate or object detection, and no recording.
  Frames can show people, vehicles and number plates.
- **When there is no frame.** The relay serves a placeholder card that says
  "CCTV FEED PLACEHOLDER" and why. A Google Street View still is used only if
  `CCTV_STREETVIEW_FALLBACK=1` and a server Google key are set.
- **Placement.** Cameras are grounded at runtime. No precomputed heights from
  Google Photorealistic 3D Tiles are stored, because Google's Map Tiles terms
  forbid storing tile content.
- **Limits.** `/api/cctv` is rate-limited per client (600 a minute by
  default, `CCTV_RATE_LIMIT_PER_MIN`).
