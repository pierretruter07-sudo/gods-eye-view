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
