# Milky Way sky box

Six cube-map faces (`stars_px.jpg` … `stars_mz.jpg`, 2048 × 2048 each), used
as the scene's sky (`src/visuals/starfield.js`). Built by
`scripts/sky/build-starfield.py`:

```sh
python3 scripts/sky/build-starfield.py <path>/d3-celestial/data/stars.14.json public/sky 2048
```

## What is real and what is modelled

- **Stars (real).** All 118,216 stars of the XHIP extended Hipparcos
  compilation down to magnitude 14, at their catalogue positions, sized by
  magnitude and coloured by B-V colour index. XHIP: Anderson E., Francis C.
  (2012), *XHIP: An Extended Hipparcos Compilation*, CDS VizieR catalogue
  V/137D. This research has made use of the VizieR catalogue access tool,
  CDS, Strasbourg, France.
- **Star data file.** `data/stars.14.json` from d3-celestial by Olaf Frohn
  (BSD 3-Clause licence, reproduced below). The JSON is not stored in this
  repository; only the rendered images are.
- **Milky Way glow (modelled).** The diffuse band, the bulge towards
  Sagittarius and the dust of the Great Rift are a model in galactic
  coordinates with procedural noise, not a photograph. The Large and Small
  Magellanic Clouds and the Andromeda galaxy are soft glows at their real
  positions.

Frame: Cesium's sky-box axes (equatorial; +X towards the March equinox, +Z
towards the north celestial pole). Each face is stored upside down because
Cesium flips cube faces on upload.

## d3-celestial licence

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
