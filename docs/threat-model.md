# Threat Model — God's Eye View (GEV)

## 1. Assets

| Asset | Sensitivity |
|---|---|
| API proxy keys (METAR, Overpass, AIS, etc.) | High — leakage enables quota abuse |
| Disk cache files (JSON from third-party feeds) | Medium — tampering could serve stale/false data |
| Client browser session | Medium — XSS could hijack viewport |
| Server process integrity | High — compromise could exfiltrate keys or SSRF |
| Third-party feed URLs / endpoints | Medium — interception could inject false telemetry |

## 2. Entry Points

| Entry Point | Description |
|---|---|
| `/api/*` HTTP routes | Public, unauthenticated server-side proxy endpoints |
| Static asset serving | Vite-built JS/CSS/HTML served to the browser |
| Third-party data feeds | Outbound HTTP(S) fetches to ADS-B, AIS, Overpass, METAR, FIRMS, CCTV |
| Disk cache (read/write) | Filesystem paths derived from query-string values |
| Build pipeline (CI) | npm, Vite, GitHub Actions — supply-chain surface |

## 3. STRIDE Threat Analysis

### Spoofing
| Threat | Control |
|---|---|
| Attacker serves forged feed data by intercepting HTTP connections | All external endpoints use HTTPS; SHA-256 cache-key hashing prevents path collisions |
| Cache poisoning via crafted cache-key filenames | Cache keys are hashed with SHA-256 before becoming filesystem paths; directory is restricted |

### Tampering
| Threat | Control |
|---|---|
| Malicious CCTV frame URL injected through dataset | `normalizeCalgaryImageUrl` and similar pinning functions enforce HTTPS and origin allowlists |
| XSS via raw HTML sinks consuming user-controlled data | `innerHTML` replaced with `textContent` / `DOMParser`; `esc()` used for dynamic HTML generation |
| Dependency confusion / supply-chain attack | `npm ci` with lockfile; `npm audit` at `--audit-level=critical` in CI |

### Repudiation
| Threat | Control |
|---|---|
| No audit trail for API calls | Server logs all proxy requests (method, path, rate-limit outcome) |

### Information Disclosure
| Threat | Control |
|---|---|
| API keys leaked in client bundle | Keys are server-side only; Vite build never exposes `process.env` secrets to the browser |
| Sensitive feed data cached unencrypted on disk | Cache directory should be outside the web root and have restricted OS permissions |

### Denial of Service
| Threat | Control |
|---|---|
| Flood of requests to `/api/*` exhausting upstream quotas | Per-IP rate limiting (`allow()` / `clientKey()`) on every proxy handler |
| Oversized Overpass / terrain responses filling disk | `capMap()` limits in-memory maps; disk paths are hashed (fixed length) |

### Elevation of Privilege
| Threat | Control |
|---|---|
| Path traversal via cache-key to read arbitrary files | Cache keys are SHA-256 hashed before use as filenames; no raw user input reaches `fs` calls |
| SSRF through proxy endpoints | Proxy targets are hardcoded constants, not user-supplied URLs |

## 4. Transport Security

* All outbound third-party fetch calls use `https://` endpoints.
* The server does not expose a public HTTPS listener directly; TLS termination is expected at the reverse proxy / CDN layer, which must set `Strict-Transport-Security` (HSTS).

## 5. Static Analysis

Semgrep runs in CI on every pull request and push to `main` (see `.github/workflows/ci.yml`). Findings are triaged before merge.

## 6. Out of Scope

* Authentication / authorisation (the app is currently public-read-only).
* Physical security of hosting infrastructure.
