# Third-party notices

God's Eye View ships with third-party software, data and assets. Each keeps
its own licence. The full resolved dependency inventory is in
`package-lock.json` (134 packages).

## Runtime libraries (bundled into the browser build)

| Package | Licence |
|---|---|
| CesiumJS (`cesium`, `@cesium/engine`, `@cesium/widgets`, `@cesium/wasm-splats`) | Apache-2.0 |
| `satellite.js` | MIT |
| `egm96-universal` | MIT |
| `dompurify` (via Cesium) | MPL-2.0 OR Apache-2.0 |
| `pako` (via Cesium) | MIT AND Zlib |
| `tslib` | 0BSD |
| `draco3d`, `protobufjs`, `long`, `meshoptimizer`, `ktx-parse`, `lerc` (via Cesium) | Apache-2.0 / BSD-3-Clause / MIT |
| All other transitive runtime packages | MIT, ISC or BSD |

Licence summary across all 134 resolved packages:
- MIT 110
- Apache-2.0 9
- ISC 9
- BSD-3-Clause 3
- MPL-2.0 OR Apache-2.0 1
- MIT AND Zlib 1
- 0BSD 1

None is copyleft-only. The MPL-2.0 option of `dompurify` can be avoided by
electing Apache-2.0.

## Upstream project

This repository is a fork of
[bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view),
MIT licence, © 2026 Bilawal Sidhu. The original copyright notice is kept in
[LICENSE](LICENSE).

## Data, imagery and 3D models

See [DATA_SOURCES.md](DATA_SOURCES.md) for every data source, its licence and
its commercial-use flag. See [public/models/README.md](public/models/README.md)
for the CC BY 4.0 credits of the nine 3D models.
