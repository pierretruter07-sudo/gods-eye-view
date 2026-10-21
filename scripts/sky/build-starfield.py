#!/usr/bin/env python3
"""Build the Milky Way sky box (six cube-map faces) for God's Eye View.

Stars are real: every star in the XHIP extended Hipparcos compilation down to
magnitude 14 (Anderson & Francis 2012, CDS VizieR V/137D), as distributed in
d3-celestial's `data/stars.14.json` (BSD-3-Clause, Olaf Frohn). Each star is
placed at its catalogue position, sized and brightened by its magnitude and
coloured by its B-V colour index.

The Milky Way's diffuse glow is modelled, not photographed: a disk and bulge
in galactic coordinates with dust lanes along the Great Rift, plus the two
Magellanic Clouds and the Andromeda galaxy at their real positions.

Faces are in Cesium's sky-box frame (equatorial axes: +X towards the March
equinox, +Z towards the north celestial pole). Texels are laid out in WebGL
cube-map order and then stored upside down, because Cesium flips each face
vertically when it uploads the cube map (checked by rendering marker dots in
Cesium and comparing with their projected positions, 21 Oct).

Usage:
  python3 scripts/sky/build-starfield.py <stars.14.json> <out-dir> [size]
"""

import json
import math
import sys

import numpy as np
from PIL import Image

FACES = ("px", "mx", "py", "my", "pz", "mz")


def face_directions(face, size):
    """Unit view directions for every texel of one cube face (WebGL order)."""
    c = (np.arange(size, dtype=np.float64) + 0.5) / size * 2.0 - 1.0
    sc, tc = np.meshgrid(c, c)  # sc across (columns), tc down (rows)
    one = np.ones_like(sc)
    if face == "px":
        x, y, z = one, -tc, -sc
    elif face == "mx":
        x, y, z = -one, -tc, sc
    elif face == "py":
        x, y, z = sc, one, tc
    elif face == "my":
        x, y, z = sc, -one, -tc
    elif face == "pz":
        x, y, z = sc, -tc, one
    else:  # mz
        x, y, z = -sc, -tc, -one
    n = np.sqrt(x * x + y * y + z * z)
    return x / n, y / n, z / n


def project(face, x, y, z, size):
    """Texel column/row of directions on a face; NaN when not on that face."""
    if face == "px":
        ma, sc, tc = x, -z, -y
    elif face == "mx":
        ma, sc, tc = -x, z, -y
    elif face == "py":
        ma, sc, tc = y, x, z
    elif face == "my":
        ma, sc, tc = -y, x, -z
    elif face == "pz":
        ma, sc, tc = z, x, -y
    else:
        ma, sc, tc = -z, -x, -y
    ok = ma > 1e-6
    with np.errstate(divide="ignore", invalid="ignore"):
        col = (sc / ma + 1.0) / 2.0 * size - 0.5
        row = (tc / ma + 1.0) / 2.0 * size - 0.5
    # Keep stars slightly past the edge so splats continue across seams.
    pad = 6
    ok &= (col > -pad) & (col < size + pad) & (row > -pad) & (row < size + pad)
    return np.where(ok, col, np.nan), np.where(ok, row, np.nan)


# Equatorial (J2000) to galactic rotation (IAU 1958, as in Hipparcos).
EQ_TO_GAL = np.array(
    [
        [-0.0548755604, -0.8734370902, -0.4838350155],
        [0.4941094279, -0.4448296300, 0.7469822445],
        [-0.8676661490, -0.1980763734, 0.4559837762],
    ]
)


def hash3(ix, iy, iz):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float64) / 65535.0


def value_noise(x, y, z):
    xi, yi, zi = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - xi, y - yi, z - zi
    xi, yi, zi = xi.astype(np.int64), yi.astype(np.int64), zi.astype(np.int64)
    u = fx * fx * (3 - 2 * fx)
    v = fy * fy * (3 - 2 * fy)
    w = fz * fz * (3 - 2 * fz)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                weight = (u if dx else 1 - u) * (v if dy else 1 - v) * (w if dz else 1 - w)
                out = out + weight * hash3(xi + dx, yi + dy, zi + dz)
    return out


def fbm(x, y, z, octaves=6, base=6.0):
    total, amp, freq, norm = 0.0, 1.0, base, 0.0
    for _ in range(octaves):
        total = total + amp * value_noise(x * freq, y * freq, z * freq)
        norm += amp
        amp *= 0.55
        freq *= 2.03
    return total / norm


def wrap180(deg):
    return (deg + 180.0) % 360.0 - 180.0


def radec_vec(ra_deg, dec_deg):
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])


def blob(x, y, z, ra, dec, radius_deg):
    c = radec_vec(ra, dec)
    d = np.degrees(np.arccos(np.clip(x * c[0] + y * c[1] + z * c[2], -1, 1)))
    return np.exp(-((d / radius_deg) ** 2))


def milky_way(x, y, z):
    """Linear RGB of the diffuse sky glow for directions (x, y, z)."""
    g = np.tensordot(EQ_TO_GAL, np.stack([x, y, z]), axes=1)
    l = np.degrees(np.arctan2(g[1], g[0]))
    b = np.degrees(np.arcsin(np.clip(g[2], -1, 1)))
    lw = wrap180(l)
    n1 = fbm(x, y, z, 6, 5.0)
    n2 = fbm(x + 13.1, y - 7.7, z + 3.3, 6, 11.0)
    # Disk: thicker and brighter towards the centre (Sagittarius).
    thickness = 5.0 + 7.0 * np.exp(-((lw / 55.0) ** 2))
    along = 0.30 + 0.70 * np.exp(-((lw / 70.0) ** 2))
    disk = along * np.exp(-np.abs(b + 0.4) / thickness)
    bulge = 1.1 * np.exp(-((lw / 9.0) ** 2 + ((b + 1.5) / 7.5) ** 2))
    # Star clouds: mottled, brighter in clumps.
    clumps = np.clip(n1, 0, 1) ** 1.6
    glow = (disk + bulge) * (0.25 + 1.6 * clumps)
    # Dust: the Great Rift (Cygnus to Sagittarius) and patchy lanes near the
    # plane, broken up by noise so no edge is drawn as a line.
    patch = np.clip((n2 - 0.38) / 0.35, 0, 1)
    patch = patch * patch * (3 - 2 * patch)
    rift_band = np.exp(-(((b - (1.8 + 1.4 * np.sin(np.radians(lw * 2.5)))) / 3.2) ** 2))
    rift_span = np.exp(-(((lw - 30.0) / 50.0) ** 2))
    lanes = np.exp(-((b / 2.8) ** 2)) * 0.45
    dust = np.clip((rift_band * rift_span * 0.85 + lanes) * patch, 0, 0.85)
    glow = glow * (1.0 - dust)
    # Magellanic Clouds and Andromeda, at their real positions.
    lmc = 0.55 * blob(x, y, z, 80.89, -69.76, 4.5) * (0.6 + 0.8 * n1)
    smc = 0.30 * blob(x, y, z, 13.19, -72.83, 2.2) * (0.6 + 0.8 * n1)
    m31 = 0.25 * blob(x, y, z, 10.68, 41.27, 1.1)
    warm = np.exp(-((lw / 30.0) ** 2))
    r = glow * (0.86 + 0.14 * warm) + (lmc + smc + m31) * 0.85
    gch = glow * (0.86 + 0.04 * warm) + (lmc + smc + m31) * 0.85
    bl = glow * (0.98 - 0.14 * warm) + (lmc + smc + m31) * 0.95
    scale = 0.09
    return np.stack([r, gch, bl], axis=-1) * scale


def bv_to_rgb(bv):
    """B-V colour index to a normalised linear RGB (Ballesteros temperature)."""
    bv = np.clip(bv, -0.4, 2.0)
    t = 4600.0 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62))
    t = t / 100.0
    r = np.where(t <= 66, 255.0, 329.7 * np.maximum(t - 60, 1e-3) ** -0.1332)
    g = np.where(t <= 66, 99.47 * np.log(np.maximum(t, 1)) - 161.12, 288.12 * np.maximum(t - 60, 1e-3) ** -0.0755)
    b = np.where(t >= 66, 255.0, np.where(t <= 19, 0.0, 138.52 * np.log(np.maximum(t - 10, 1)) - 305.04))
    rgb = np.clip(np.stack([r, g, b], axis=-1), 0, 255) / 255.0
    rgb = rgb ** 2.2
    # Desaturate a little: stars look nearly white to the eye.
    return 0.55 * rgb / rgb.max(axis=-1, keepdims=True) + 0.45


def load_stars(path):
    data = json.load(open(path))
    lon, lat, mag, bv = [], [], [], []
    for f in data["features"]:
        p = f["properties"]
        try:
            m = float(p["mag"])
        except (TypeError, ValueError):
            continue
        try:
            c = float(p.get("bv"))
        except (TypeError, ValueError):
            c = 0.6
        lo, la = f["geometry"]["coordinates"]
        lon.append(lo)
        lat.append(la)
        mag.append(m)
        bv.append(c)
    ra = np.radians(np.mod(np.array(lon), 360.0))
    dec = np.radians(np.array(lat))
    x = np.cos(dec) * np.cos(ra)
    y = np.cos(dec) * np.sin(ra)
    z = np.sin(dec)
    return x, y, z, np.array(mag), np.array(bv)


def splat(img, col, row, flux, rgb, sigma, radius):
    size = img.shape[0]
    offs = np.arange(-radius, radius + 1)
    ci = np.floor(col).astype(np.int64)
    ri = np.floor(row).astype(np.int64)
    for dy in offs:
        for dx in offs:
            cc = ci + dx
            rr = ri + dy
            ok = (cc >= 0) & (cc < size) & (rr >= 0) & (rr < size)
            if not ok.any():
                continue
            # Texel (cc, rr) is centred on (cc, rr) in the col/row frame.
            d2 = (cc - col) ** 2 + (rr - row) ** 2
            sg = sigma[ok]
            w = np.exp(-d2[ok] / (2 * sg * sg)) / (2 * math.pi * sg * sg)
            contrib = (flux[ok] * w)[:, None] * rgb[ok]
            np.add.at(img, (rr[ok], cc[ok]), contrib)


def build(stars_path, out_dir, size=2048):
    sx, sy, sz, mag, bv = load_stars(stars_path)
    rgb = bv_to_rgb(bv)
    # Flux relative to a magnitude-0 star, then a perceptual curve.
    flux = 10 ** (-0.4 * (mag - 0.0))
    for face in FACES:
        x, y, z = face_directions(face, size)
        img = milky_way(x, y, z).astype(np.float64)
        col, row = project(face, sx, sy, sz, size)
        on = ~np.isnan(col)
        c, r, f, k, m = col[on], row[on], flux[on], rgb[on], mag[on]
        # Faint stars: point-like; bright stars: wider cores and a halo.
        groups = [
            (m >= 6.0, 0.55, 1),
            ((m >= 3.0) & (m < 6.0), 0.75, 2),
            ((m >= 1.0) & (m < 3.0), 1.0, 4),
            (m < 1.0, 1.3, 6),
        ]
        stars = np.zeros_like(img)
        for sel, sg, rad in groups:
            if sel.any():
                splat(stars, c[sel], r[sel], f[sel] * 9.0, k[sel], np.full(sel.sum(), sg), rad)
        halo = m < 2.0
        if halo.any():
            splat(stars, c[halo], r[halo], f[halo] * 1.2, k[halo], np.full(halo.sum(), 3.2), 9)
        # Compress the huge range of star brightness (mag -1.5 to 14).
        lum = stars.max(axis=-1, keepdims=True)
        compressed = np.where(lum > 0, stars / np.maximum(lum, 1e-12) * (1 - np.exp(-lum * 1.6)) ** 0.8, 0)
        out = img + compressed
        srgb = np.clip(out, 0, 1) ** (1 / 2.2)
        texels = np.flipud((srgb * 255 + 0.5).astype(np.uint8))
        Image.fromarray(texels).save(
            f"{out_dir}/stars_{face}.jpg", quality=90, optimize=True, progressive=True
        )
        print(face, "stars on face:", int(on.sum()))


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2048)
